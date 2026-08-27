import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import type {
  AdminInviteResult,
  AdminRegistrationPolicyView,
  AdminUserDetail,
  AdminUserPage,
  AdminUserRow,
  UserRole,
} from '@tamkeen/types';

import { AuditAction, type AuditReasonCode } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { SessionService } from '../auth/session.service';
import { hashPassword } from '../common/password';
import { generateToken, hashToken } from '../common/secure-token';
import { AppConfigService } from '../config/app-config.module';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { refuseRoleChange, refuseStatusChange, type AccountChangeFacts } from './account-changes';
import type { AdminUserQueryDto, CreateAdminUserDto } from './admin.dto';

/**
 * §4C.2 — managing employees and entity accounts.
 *
 * **No password ever reaches an administrator.** An account is created with a
 * hash of 32 random bytes that nothing retains, and an invitation is emailed;
 * the person sets their own password from the link. That is not ceremony — a
 * provisioning flow that shows the admin a password produces a credential two
 * people know, transmitted through whatever channel the admin then uses to pass
 * it on, and in a ministry that channel is usually a chat message. The seed
 * script's "generated password, shown once" exists because a terminal has no
 * mailbox to send to; a web portal does.
 *
 * **Administrative provisioning bypasses the registration policy, on purpose.**
 * D-017's domain and employee-id gate governs *self*-registration; the whole
 * point of `admin-only` mode is that an administrator is the gate. It also has
 * to: an entity contact is by definition not at a ministry address, and could
 * never be provisioned otherwise. Uniqueness of the email and employee id is
 * still enforced, by the database.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly sessions: SessionService,
  ) {}

  /** §4C.2's list, filtered and paged. */
  async list(query: AdminUserQueryDto): Promise<AdminUserPage> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const where = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.unverified ? { emailVerifiedAt: null } : {}),
      ...(query.q
        ? {
            /* Name, email and employee id together: an administrator searching
               for a person has whichever one the caller on the phone gave them,
               and asking them to pick a field first is a worse screen. */
            OR: [
              { fullName: { contains: query.q, mode: 'insensitive' as const } },
              { email: { contains: query.q, mode: 'insensitive' as const } },
              { employeeId: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: USER_ROW_SELECT,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { rows: rows.map(toRow), total, page, pageSize };
  }

  /**
   * One account, with enough of its journey to answer "is anything stuck".
   *
   * A summary rather than a copy of the learner's own screens: the Holland Code
   * without the six scores, progress without the course list, a certificate
   * count rather than the certificates. Reproducing the journey here would mean
   * two implementations of what "complete" means, and the admin's question is
   * narrower than the learner's.
   */
  async get(userId: string): Promise<AdminUserDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...USER_ROW_SELECT,
        createdAt: true,
        moodleUserId: true,
        assessmentResults: {
          orderBy: { completedAt: 'desc' },
          select: { code: true, completedAt: true },
        },
        userPath: {
          select: {
            status: true,
            confirmedAt: true,
            path: { select: { name: true } },
            courses: { select: { status: true } },
          },
        },
        _count: { select: { certificates: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND');
    }

    const [activeSessions, passed] = await Promise.all([
      this.prisma.session.count({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      }),
      /* Passed, not merely completed (D-054). The two diverge exactly when a
         learner is stuck, which is what this screen exists to reveal. */
      this.prisma.completion.count({ where: { userId, passed: true } }),
    ]);

    const newest = user.assessmentResults[0];

    return {
      ...toRow(user),
      createdAt: user.createdAt.toISOString(),
      hasLmsAccount: user.moodleUserId !== null,
      assessment: newest
        ? {
            code: newest.code,
            completedAt: newest.completedAt.toISOString(),
            /* Retakes append (D-033). Showing the count makes a retake visible
               without exposing the superseded codes, which are the person's
               history and not an administrator's business. */
            attempts: user.assessmentResults.length,
          }
        : null,
      path: user.userPath
        ? {
            name: user.userPath.path.name,
            status: user.userPath.status,
            confirmedAt: user.userPath.confirmedAt?.toISOString() ?? null,
            coursesChosen: user.userPath.courses.length,
            coursesPassed: passed,
          }
        : null,
      certificateCount: user._count.certificates,
      activeSessions,
    };
  }

  /**
   * Provisions an account and emails its invitation (§4C.2).
   *
   * The whole thing is one transaction *except* the email. A failed send must
   * not roll back a created account — the invitation can be re-sent, but a
   * half-created user with a consumed employee id cannot be re-created — so the
   * send happens after the commit and its failure surfaces as its own problem.
   */
  async create(dto: CreateAdminUserDto, actorId: string, ipAddress: string | null) {
    if (dto.role === 'ENTITY' && !dto.entityId) {
      throw new BadRequestException('ENTITY_REQUIRED');
    }
    if (dto.role !== 'ENTITY' && dto.entityId) {
      throw new BadRequestException('ENTITY_NOT_ALLOWED');
    }

    if (dto.entityId) {
      const entity = await this.prisma.entity.findUnique({
        where: { id: dto.entityId },
        select: { id: true },
      });

      if (!entity) {
        throw new NotFoundException('ENTITY_NOT_FOUND');
      }
    }

    const email = dto.email.toLowerCase();

    const clash = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { employeeId: dto.employeeId }] },
      select: { email: true },
    });

    if (clash) {
      /*
       * Which field clashed is told to the administrator, unlike at
       * registration where it would be an account-existence oracle for an
       * anonymous caller. An administrator may already see every account on the
       * previous screen, so withholding it would only make the form unusable.
       */
      throw new ConflictException(
        clash.email === email ? 'EMAIL_ALREADY_REGISTERED' : 'EMPLOYEE_ID_ALREADY_REGISTERED',
      );
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        /*
         * A hash of random bytes nobody keeps. The account cannot be signed into
         * until the invitation is redeemed, and there is no moment at which a
         * usable password exists outside the invited person's own head.
         */
        passwordHash: await hashPassword(randomBytes(32).toString('base64url')),
        fullName: dto.fullName,
        employeeId: dto.employeeId,
        department: dto.department,
        role: dto.role,
        entityId: dto.entityId ?? null,
        /* Unverified: redeeming the invitation is what proves the address, and
           `resetPassword` marks it verified at that moment. */
        emailVerifiedAt: null,
      },
      select: USER_ROW_SELECT,
    });

    await this.audit.record({
      action: AuditAction.ADMIN_USER_CREATED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'user',
      targetId: user.id,
      /* The role, not the address: §2 keeps PII out of audit payloads, and the
         target id resolves to the person for anyone entitled to look. */
      detail: { role: dto.role },
    });

    const invitation = await this.sendInvitation(user.id, email, dto.fullName, dto.role);

    return { user: toRow(user), ...invitation } satisfies AdminInviteResult;
  }

  /**
   * Re-sends an invitation (§4C.2).
   *
   * Refused once the account has been used, rather than silently succeeding: an
   * "invitation" to somebody who already signed in is a password reset, and it
   * should be requested as one so the audit trail says what happened.
   */
  async reinvite(userId: string, actorId: string, ipAddress: string | null) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ...USER_ROW_SELECT, emailVerifiedAt: true },
    });

    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND');
    }

    if (user.emailVerifiedAt) {
      throw new ConflictException('ACCOUNT_ALREADY_ACTIVE');
    }

    const invitation = await this.sendInvitation(user.id, user.email, user.fullName, user.role);

    await this.audit.record({
      action: AuditAction.ADMIN_USER_INVITED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'user',
      targetId: user.id,
    });

    return { user: toRow(user), ...invitation } satisfies AdminInviteResult;
  }

  /** Suspends or reactivates an account (§4C.2). */
  async setStatus(
    userId: string,
    status: 'ACTIVE' | 'SUSPENDED',
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminUserRow> {
    const facts = await this.gatherFacts(userId, actorId);
    const refusal = refuseStatusChange(facts, status);

    if (refusal) {
      await this.recordRefusal(AuditAction.ADMIN_USER_STATUS_CHANGED, refusal.reason, {
        actorId,
        targetId: userId,
        ipAddress,
      });
      throw new ConflictException(refusal.code);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status },
      select: USER_ROW_SELECT,
    });

    if (status === 'SUSPENDED') {
      /*
       * `SessionService.resolve` already refuses a suspended owner's session on
       * every request, so this is not what makes the suspension take effect.
       * What it prevents is the *reactivation*: without revoking, restoring an
       * account would silently hand back every session that was live when it was
       * suspended — including the one that may have been the reason for
       * suspending it.
       */
      await this.sessions.revokeAllForUser(userId);
    }

    await this.audit.record({
      action: AuditAction.ADMIN_USER_STATUS_CHANGED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'user',
      targetId: userId,
      detail: { status },
    });

    return toRow(updated);
  }

  /** Changes an account's role, and the organisation an entity account acts for. */
  async setRole(
    userId: string,
    role: UserRole,
    entityId: string | null,
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminUserRow> {
    const facts = await this.gatherFacts(userId, actorId);
    const refusal = refuseRoleChange(facts, role, entityId);

    if (refusal) {
      await this.recordRefusal(AuditAction.ADMIN_USER_ROLE_CHANGED, refusal.reason, {
        actorId,
        targetId: userId,
        ipAddress,
      });
      throw new ConflictException(refusal.code);
    }

    if (entityId) {
      const entity = await this.prisma.entity.findUnique({
        where: { id: entityId },
        select: { id: true },
      });

      if (!entity) {
        throw new NotFoundException('ENTITY_NOT_FOUND');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role, entityId },
      select: USER_ROW_SELECT,
    });

    /*
     * A role change is an access change, so the sessions go. Losing a role
     * mid-session would otherwise leave the person holding a session resolved
     * against their old role until it expired, which for a demotion is exactly
     * the window that matters.
     */
    await this.sessions.revokeAllForUser(userId);

    await this.audit.record({
      action: AuditAction.ADMIN_USER_ROLE_CHANGED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'user',
      targetId: userId,
      detail: { from: facts.currentRole, to: role },
    });

    return toRow(updated);
  }

  /**
   * The registration rules in force (D-017), read-only until §4C.6.
   *
   * Shown on the user screen because that is where the question is asked — an
   * administrator looking at "why can this person not register themselves" needs
   * the answer beside the list, not behind a different menu item.
   */
  registrationPolicy(): AdminRegistrationPolicyView {
    return {
      mode: this.config.get('REGISTRATION_MODE'),
      allowedEmailDomains: [...this.config.get('ALLOWED_EMAIL_DOMAINS')],
      employeeIdPattern: this.config.get('EMPLOYEE_ID_PATTERN'),
      passwordMinLength: this.config.get('PASSWORD_MIN_LENGTH'),
    };
  }

  /**
   * Issues a single-use token and emails the invitation.
   *
   * A `PASSWORD_RESET` token rather than a third token type: it does precisely
   * the same job — let somebody set a password the server has never seen — and
   * is redeemed by the same endpoint and the same page. Only the wording of the
   * email differs, because "someone requested a password reset" arriving at an
   * address that has never had an account here reads as phishing.
   */
  private async sendInvitation(
    userId: string,
    email: string,
    fullName: string,
    role: UserRole,
  ): Promise<{ invitationSentTo: string; invitationExpiresAt: string }> {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + this.config.get('PASSWORD_RESET_TTL_MINUTES') * 60_000);

    /* Any outstanding invitation is consumed first, so re-inviting invalidates
       the previous link rather than leaving two live ones. */
    await this.prisma.authToken.updateMany({
      where: { userId, type: 'PASSWORD_RESET', consumedAt: null },
      data: { consumedAt: new Date() },
    });

    await this.prisma.authToken.create({
      data: { userId, type: 'PASSWORD_RESET', tokenHash: hashToken(token), expiresAt },
    });

    await this.email.sendInvitation(email, fullName, token, { isEntity: role === 'ENTITY' });

    return { invitationSentTo: email, invitationExpiresAt: expiresAt.toISOString() };
  }

  /** The database facts the pure guards decide over. */
  private async gatherFacts(userId: string, actorId: string): Promise<AccountChangeFacts> {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!target) {
      throw new NotFoundException('USER_NOT_FOUND');
    }

    const [otherActiveAdmins, results, path, certificates] = await Promise.all([
      /* "Another active admin exists" rather than "how many admins" — the count
         is not the question, and asking it this way is correct whether there are
         two administrators or two hundred. */
      this.prisma.user.count({
        where: { role: 'SUPER_ADMIN', status: 'ACTIVE', id: { not: userId } },
      }),
      this.prisma.assessmentResult.count({ where: { userId } }),
      this.prisma.userPath.count({ where: { userId } }),
      this.prisma.certificate.count({ where: { userId } }),
    ]);

    return {
      targetId: target.id,
      actorId,
      currentRole: target.role,
      isOnlyActiveAdmin: target.role === 'SUPER_ADMIN' && otherActiveAdmins === 0,
      holdsJourneyData: results + path + certificates > 0,
    };
  }

  private async recordRefusal(
    action: (typeof AuditAction)[keyof typeof AuditAction],
    reason: AuditReasonCode,
    context: { actorId: string; targetId: string; ipAddress: string | null },
  ): Promise<void> {
    await this.audit.record({
      action,
      outcome: 'FAILURE',
      actorUserId: context.actorId,
      ipAddress: context.ipAddress,
      targetType: 'user',
      targetId: context.targetId,
      reason,
    });
  }
}

/** The columns behind `AdminUserRow`, shared so the list and detail agree. */
const USER_ROW_SELECT = {
  id: true,
  email: true,
  fullName: true,
  employeeId: true,
  department: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  entity: { select: { id: true, name: true } },
} as const;

function toRow(user: {
  id: string;
  email: string;
  fullName: string;
  employeeId: string;
  department: string;
  role: UserRole;
  status: 'ACTIVE' | 'SUSPENDED';
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  entity: { id: string; name: string } | null;
}): AdminUserRow {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    employeeId: user.employeeId,
    department: user.department,
    role: user.role,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    entity: user.entity,
  };
}
