import { Inject, Injectable, Logger } from '@nestjs/common';

import type { UserRole } from '@tamkeen/types';

import { AuditAction } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { LMS_PORT, type LmsPort } from '../moodle/lms.port';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateProfileDto } from './profile.dto';

export interface ProfileView {
  id: string;
  email: string;
  fullName: string;
  employeeId: string;
  department: string;
  role: UserRole;
  /** Unaffected by this endpoint — carried through so the response still
   *  satisfies the same `CurrentUser` shape `/auth/me` returns (§4.12). */
  numberFormat: string | null;
}

/**
 * §4.12's profile edit: an employee's own name and department, nothing else.
 *
 * A name change also has to reach Moodle — the course player renders the
 * learner's name from Moodle's own record (verified in the Phase 2 pass), so
 * a stale Moodle name would show up right where a learner actually looks. The
 * propagation is best-effort: a failure here must not undo a save that
 * otherwise succeeded, so it is caught, audited, and left for D-036's
 * reconciliation pattern rather than retried inline.
 */
@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(LMS_PORT) private readonly lms: LmsPort,
  ) {}

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
    ipAddress: string | null,
  ): Promise<ProfileView> {
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        email: true,
        fullName: true,
        employeeId: true,
        department: true,
        role: true,
        moodleUserId: true,
        numberFormat: true,
      },
    });

    const nameChanged = dto.fullName !== current.fullName;
    const departmentChanged = dto.department !== current.department;

    if (!nameChanged && !departmentChanged) {
      /* Nothing to do — the "حفظ" button is always clickable, and resubmitting
         unchanged values is a valid no-op, not an error. Neither the database
         nor the audit trail nor the LMS need touching. */
      return {
        id: userId,
        email: current.email,
        fullName: current.fullName,
        employeeId: current.employeeId,
        department: current.department,
        role: current.role,
        numberFormat: current.numberFormat,
      };
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { fullName: dto.fullName, department: dto.department },
    });

    const changed = [
      ...(nameChanged ? ['fullName'] : []),
      ...(departmentChanged ? ['department'] : []),
    ];

    await this.audit.record({
      action: AuditAction.PROFILE_UPDATED,
      outcome: 'SUCCESS',
      actorUserId: userId,
      ipAddress,
      targetType: 'user',
      targetId: userId,
      /* Which fields changed, never their values (§6 PII discipline). */
      detail: { fields: changed.sort().join(',') },
    });

    if (nameChanged && current.moodleUserId !== null) {
      await this.propagateNameToLms(userId, current.moodleUserId, dto.fullName, ipAddress);
    }

    return {
      id: userId,
      email: current.email,
      fullName: dto.fullName,
      employeeId: current.employeeId,
      department: dto.department,
      role: current.role,
      numberFormat: current.numberFormat,
    };
  }

  /**
   * Best-effort by design (§4.12): the save above has already committed, so a
   * failure here is recorded and left alone rather than retried or surfaced to
   * the caller as an error the save did not actually have. A user with no
   * `moodleUserId` never reaches this method — nothing there needs updating.
   */
  private async propagateNameToLms(
    userId: string,
    moodleUserId: number,
    fullName: string,
    ipAddress: string | null,
  ): Promise<void> {
    try {
      await this.lms.updateUser({ lmsUserId: moodleUserId, fullName });
    } catch (error) {
      this.logger.error(
        `Failed to propagate a name change to Moodle for user ${userId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );

      await this.audit.record({
        action: AuditAction.PROFILE_LMS_SYNC_FAILED,
        outcome: 'FAILURE',
        actorUserId: userId,
        ipAddress,
        targetType: 'user',
        targetId: userId,
        /* Distinguishes this from an email-sync failure (§4.12's email flow
           reuses the same action code) without carrying either value. */
        detail: { field: 'fullName' },
      });
    }
  }
}
