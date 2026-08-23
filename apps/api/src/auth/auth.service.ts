import { Injectable, UnauthorizedException } from '@nestjs/common';

import { AuditAction, AuditReason } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../config/app-config.module';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from '../common/password';
import { expiryFromNow, generateToken, hashToken } from '../common/secure-token';
import type { LoginDto, RegisterDto } from './auth.dto';
import { checkRegistrationPolicy, rejectionToException } from './registration-policy';
import { SessionService, type SessionContext } from './session.service';

/**
 * A dummy argon2 hash, verified against when no user exists.
 *
 * Without this, "unknown email" returns in ~1ms while "wrong password" takes the
 * ~50ms of an argon2 verification — a timing oracle that reveals which
 * ministry addresses are registered. The value is a real hash of a random
 * string, so verification does the same work it would for a live account.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZXNhbHQ$JJ1kZ5xBqDPGZJZ2Q9y3nJ4WgVYq5xEwXQ5cGqZ8kPo';

export interface LoginResult {
  token: string;
  user: { id: string; email: string; fullName: string; role: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Registers an applicant, subject to the D-017 gate.
   *
   * **Enumeration resistance:** the response is identical whether or not the
   * email is already registered. An attacker must not be able to use this
   * endpoint to discover which ministry addresses hold accounts. The real
   * account holder is not spammed either — a duplicate attempt simply does
   * nothing, and is recorded in the audit log where a security reviewer can see
   * the pattern.
   */
  async register(dto: RegisterDto, context: SessionContext): Promise<void> {
    const rejection = checkRegistrationPolicy(dto, {
      mode: this.config.get('REGISTRATION_MODE'),
      allowedDomains: this.config.get('ALLOWED_EMAIL_DOMAINS'),
      employeeIdPattern: this.config.get('EMPLOYEE_ID_PATTERN'),
      passwordMinLength: this.config.get('PASSWORD_MIN_LENGTH'),
    });

    if (rejection) {
      await this.audit.record({
        action: AuditAction.AUTH_REGISTRATION_REJECTED,
        outcome: 'FAILURE',
        ipAddress: context.ipAddress,
        reason: rejection.reason,
      });
      throw rejectionToException(rejection);
    }

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { employeeId: dto.employeeId }] },
      select: { id: true, email: true },
    });

    if (existing) {
      await this.audit.record({
        action: AuditAction.AUTH_REGISTRATION_REJECTED,
        outcome: 'FAILURE',
        ipAddress: context.ipAddress,
        targetType: 'User',
        targetId: existing.id,
        reason:
          existing.email === dto.email
            ? AuditReason.EMAIL_ALREADY_REGISTERED
            : AuditReason.EMPLOYEE_ID_ALREADY_REGISTERED,
      });
      /* Return as though it succeeded — see the enumeration note above. */
      return;
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await hashPassword(dto.password),
        fullName: dto.fullName,
        employeeId: dto.employeeId,
        department: dto.department,
        /* Self-registration always yields an EMPLOYEE. Elevating a role is an
           administrative act (Phase 5), never something a registrant can ask
           for — which is why the DTO has no role field at all. */
        role: 'EMPLOYEE',
      },
      select: { id: true, email: true },
    });

    await this.audit.record({
      action: AuditAction.AUTH_REGISTERED,
      outcome: 'SUCCESS',
      actorUserId: user.id,
      ipAddress: context.ipAddress,
      targetType: 'User',
      targetId: user.id,
    });

    await this.issueVerificationEmail(user.id, user.email);
  }

  /** Creates a fresh verification token and emails it. */
  async issueVerificationEmail(userId: string, email: string): Promise<void> {
    const token = generateToken();

    /* Invalidate outstanding verification tokens: only the newest link should
       work, so a forwarded older email cannot be used. */
    await this.prisma.authToken.updateMany({
      where: { userId, type: 'EMAIL_VERIFICATION', consumedAt: null },
      data: { consumedAt: new Date() },
    });

    await this.prisma.authToken.create({
      data: {
        userId,
        type: 'EMAIL_VERIFICATION',
        tokenHash: hashToken(token),
        expiresAt: expiryFromNow(this.config.get('EMAIL_VERIFICATION_TTL_MINUTES')),
      },
    });

    await this.email.sendEmailVerification(email, token);
  }

  /**
   * Resends verification. Responds identically for unknown and already-verified
   * addresses, for the same enumeration reason as registration.
   */
  async resendVerification(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, emailVerifiedAt: true, status: true },
    });

    if (!user || user.emailVerifiedAt || user.status !== 'ACTIVE') {
      return;
    }

    await this.issueVerificationEmail(user.id, user.email);
  }

  async verifyEmail(rawToken: string, context: SessionContext): Promise<void> {
    const token = await this.prisma.authToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      select: { id: true, userId: true, type: true, expiresAt: true, consumedAt: true },
    });

    const invalid =
      !token ||
      token.type !== 'EMAIL_VERIFICATION' ||
      token.consumedAt !== null ||
      token.expiresAt <= new Date();

    if (invalid) {
      await this.audit.record({
        action: AuditAction.AUTH_EMAIL_VERIFIED,
        outcome: 'FAILURE',
        actorUserId: token?.userId ?? null,
        ipAddress: context.ipAddress,
        reason: !token
          ? AuditReason.TOKEN_INVALID
          : token.consumedAt
            ? AuditReason.TOKEN_ALREADY_USED
            : AuditReason.TOKEN_EXPIRED,
      });
      throw new UnauthorizedException('TOKEN_INVALID');
    }

    /* Consume and verify together: a token must not survive its own use, and
       a crash between the two must not leave a reusable token. */
    await this.prisma.$transaction([
      this.prisma.authToken.update({
        where: { id: token.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.updateMany({
        where: { id: token.userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      action: AuditAction.AUTH_EMAIL_VERIFIED,
      outcome: 'SUCCESS',
      actorUserId: token.userId,
      ipAddress: context.ipAddress,
      targetType: 'User',
      targetId: token.userId,
    });
  }

  /**
   * Signs a user in.
   *
   * Every failure path returns the same `INVALID_CREDENTIALS` error, so the
   * response never distinguishes "no such account" from "wrong password" from
   * "not yet verified". The specific reason goes to the audit log, where it is
   * useful to an administrator and invisible to an attacker.
   *
   * The one exception is a locked account, which returns ACCOUNT_LOCKED: the
   * user genuinely needs to know why waiting will help, and an attacker who has
   * triggered a lockout already knows the account exists.
   */
  async login(dto: LoginDto, context: SessionContext): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        passwordHash: true,
        emailVerifiedAt: true,
        failedLoginAttempts: true,
        lockedUntil: true,
      },
    });

    if (!user) {
      /* Equalise timing against a real verification — see DUMMY_HASH. */
      await verifyPassword(DUMMY_HASH, dto.password);
      await this.recordLoginFailure(null, context, AuditReason.UNKNOWN_EMAIL);
      throw new UnauthorizedException('INVALID_CREDENTIALS');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.recordLoginFailure(user.id, context, AuditReason.ACCOUNT_LOCKED);
      throw new UnauthorizedException('ACCOUNT_LOCKED');
    }

    const passwordValid = await verifyPassword(user.passwordHash, dto.password);

    if (!passwordValid) {
      await this.registerFailedAttempt(user.id, user.failedLoginAttempts, context);
      throw new UnauthorizedException('INVALID_CREDENTIALS');
    }

    if (user.status !== 'ACTIVE') {
      await this.recordLoginFailure(user.id, context, AuditReason.ACCOUNT_SUSPENDED);
      throw new UnauthorizedException('INVALID_CREDENTIALS');
    }

    if (!user.emailVerifiedAt) {
      await this.recordLoginFailure(user.id, context, AuditReason.EMAIL_NOT_VERIFIED);
      /* Distinct code so the UI can offer "resend verification" — the password
         was correct, so this reveals nothing the caller did not already know. */
      throw new UnauthorizedException('EMAIL_NOT_VERIFIED');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const token = await this.sessions.create(user.id, context);

    await this.audit.record({
      action: AuditAction.AUTH_LOGIN_SUCCEEDED,
      outcome: 'SUCCESS',
      actorUserId: user.id,
      ipAddress: context.ipAddress,
    });

    return {
      token,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
    };
  }

  async logout(sessionId: string, userId: string, context: SessionContext): Promise<void> {
    await this.sessions.revoke(sessionId);

    await this.audit.record({
      action: AuditAction.AUTH_LOGGED_OUT,
      outcome: 'SUCCESS',
      actorUserId: userId,
      ipAddress: context.ipAddress,
    });
  }

  /**
   * Starts a password reset. Always succeeds from the caller's point of view,
   * whether or not the address exists — otherwise this endpoint becomes an
   * account-existence oracle.
   */
  async requestPasswordReset(email: string, context: SessionContext): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, status: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      return;
    }

    const token = generateToken();

    await this.prisma.authToken.updateMany({
      where: { userId: user.id, type: 'PASSWORD_RESET', consumedAt: null },
      data: { consumedAt: new Date() },
    });

    await this.prisma.authToken.create({
      data: {
        userId: user.id,
        type: 'PASSWORD_RESET',
        tokenHash: hashToken(token),
        expiresAt: expiryFromNow(this.config.get('PASSWORD_RESET_TTL_MINUTES')),
      },
    });

    await this.email.sendPasswordReset(user.email, token);

    await this.audit.record({
      action: AuditAction.AUTH_PASSWORD_RESET_REQUESTED,
      outcome: 'SUCCESS',
      actorUserId: user.id,
      ipAddress: context.ipAddress,
    });
  }

  /**
   * Completes a password reset.
   *
   * Revokes every existing session afterwards: if an attacker knew the old
   * password and holds a session, resetting must actually evict them. It also
   * clears any lockout, since the legitimate owner has just proven control of
   * the mailbox.
   */
  async resetPassword(
    rawToken: string,
    newPassword: string,
    context: SessionContext,
  ): Promise<void> {
    if (newPassword.length < this.config.get('PASSWORD_MIN_LENGTH')) {
      throw new UnauthorizedException('PASSWORD_TOO_SHORT');
    }

    const token = await this.prisma.authToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      select: {
        id: true,
        userId: true,
        type: true,
        expiresAt: true,
        consumedAt: true,
        user: { select: { emailVerifiedAt: true } },
      },
    });

    const invalid =
      !token ||
      token.type !== 'PASSWORD_RESET' ||
      token.consumedAt !== null ||
      token.expiresAt <= new Date();

    if (invalid) {
      await this.audit.record({
        action: AuditAction.AUTH_PASSWORD_RESET_COMPLETED,
        outcome: 'FAILURE',
        actorUserId: token?.userId ?? null,
        ipAddress: context.ipAddress,
        reason: !token
          ? AuditReason.TOKEN_INVALID
          : token.consumedAt
            ? AuditReason.TOKEN_ALREADY_USED
            : AuditReason.TOKEN_EXPIRED,
      });
      throw new UnauthorizedException('TOKEN_INVALID');
    }

    const existing = token.user;
    const passwordHash = await hashPassword(newPassword);

    await this.prisma.$transaction([
      this.prisma.authToken.update({
        where: { id: token.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: token.userId },
        data: {
          passwordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
          /*
           * Redeeming a token that was emailed to an address proves control of
           * that address — which is exactly what verification asserts, so an
           * unverified account is verified here rather than left in a state it
           * can no longer leave.
           *
           * Without this there is a dead end reachable today: register, never
           * verify, use "forgot password", set a new password, and still be
           * refused at sign-in with EMAIL_NOT_VERIFIED — having just proved the
           * mailbox is yours. It is also what makes §4C.2's invitation work,
           * since an invited account has never verified anything.
           *
           * `??` and not an overwrite: the original verification timestamp is
           * when the address was first proven, and a later reset must not
           * rewrite that piece of history.
           */
          emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
        },
      }),
    ]);

    await this.sessions.revokeAllForUser(token.userId);

    await this.audit.record({
      action: AuditAction.AUTH_PASSWORD_RESET_COMPLETED,
      outcome: 'SUCCESS',
      actorUserId: token.userId,
      ipAddress: context.ipAddress,
      targetType: 'User',
      targetId: token.userId,
    });
  }

  /** Increments the failure counter and locks the account at the threshold. */
  private async registerFailedAttempt(
    userId: string,
    currentAttempts: number,
    context: SessionContext,
  ): Promise<void> {
    const attempts = currentAttempts + 1;
    const threshold = this.config.get('AUTH_MAX_FAILED_ATTEMPTS');
    const shouldLock = attempts >= threshold;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: shouldLock ? expiryFromNow(this.config.get('AUTH_LOCKOUT_MINUTES')) : null,
      },
    });

    await this.recordLoginFailure(userId, context, AuditReason.BAD_PASSWORD);

    if (shouldLock) {
      await this.audit.record({
        action: AuditAction.AUTH_ACCOUNT_LOCKED,
        outcome: 'FAILURE',
        actorUserId: userId,
        ipAddress: context.ipAddress,
        targetType: 'User',
        targetId: userId,
        detail: { attempts },
      });
    }
  }

  private async recordLoginFailure(
    userId: string | null,
    context: SessionContext,
    reason: Parameters<AuditService['record']>[0]['reason'],
  ): Promise<void> {
    await this.audit.record({
      action: AuditAction.AUTH_LOGIN_FAILED,
      outcome: 'FAILURE',
      actorUserId: userId,
      ipAddress: context.ipAddress,
      reason,
    });
  }
}
