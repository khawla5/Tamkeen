import { ForbiddenException, Injectable } from '@nestjs/common';

import type { AssessmentInstrument } from '@tamkeen/types';

import { AuditReason, type AuditActionCode } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The assessment-assignment gate (D-130/D-132): an employee may only TAKE an
 * instrument the ministry has assigned to them.
 *
 * Read-only shared state in the JourneyModule mould — the assessment and
 * english-assessment services, and the dashboard, all ask it the same
 * question, so the rule has one implementation. Writes (assign/revoke) are
 * administrative and live in the admin module.
 *
 * The gate guards TAKING, never seeing: result reads stay open, because a
 * result already earned must survive any later assignment change.
 */
@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The instruments assigned to this employee, oldest assignment first. */
  async listInstruments(userId: string): Promise<AssessmentInstrument[]> {
    const rows = await this.prisma.assessmentAssignment.findMany({
      where: { userId },
      select: { instrument: true },
      orderBy: { assignedAt: 'asc' },
    });

    return rows.map((row) => row.instrument);
  }

  async isAssigned(userId: string, instrument: AssessmentInstrument): Promise<boolean> {
    const row = await this.prisma.assessmentAssignment.findUnique({
      where: { userId_instrument: { userId, instrument } },
      select: { id: true },
    });

    return row !== null;
  }

  /**
   * Refuses with 403 `ASSESSMENT_NOT_ASSIGNED` unless the instrument is
   * assigned. A submission refusal is audited (someone answered a whole bank
   * they were never offered — a client bug or probing, either worth seeing);
   * a plain read refusal is not, so `audit` is only passed on submit paths.
   */
  async assertAssigned(
    userId: string,
    instrument: AssessmentInstrument,
    audit?: { action: AuditActionCode; ipAddress: string | null },
  ): Promise<void> {
    if (await this.isAssigned(userId, instrument)) {
      return;
    }

    if (audit) {
      await this.audit.record({
        action: audit.action,
        outcome: 'FAILURE',
        actorUserId: userId,
        ipAddress: audit.ipAddress,
        reason: AuditReason.ASSESSMENT_NOT_ASSIGNED,
        detail: { instrument },
      });
    }

    throw new ForbiddenException('ASSESSMENT_NOT_ASSIGNED');
  }
}
