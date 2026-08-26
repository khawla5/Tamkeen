import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

import { AuditAction, AuditReason, type AuditReasonCode } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../config/app-config.module';
import { EmailService } from '../email/email.service';
import { LMS_PORT, type LmsPort } from '../moodle/lms.port';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from '../common/password';
import { expiryFromNow, generateToken, hashToken } from '../common/secure-token';
import type { LoginDto, RegisterDto } from './auth.dto';
import {
  checkEmailDomain,
  checkRegistrationPolicy,
  rejectionToException,
} from './registration-policy';
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
  user: {
    id: string;
    email: string;
    fullName: string;
    employeeId: string;
    department: string;
    role: string;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly sessions: SessionService,
    @Inject(LMS_PORT) private readonly lms: LmsPort,
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
        targetType: 'user',
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
      targetType: 'user',
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
      targetType: 'user',
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
        employeeId: true,
        department: true,
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
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        employeeId: user.employeeId,
        department: user.department,
        role: user.role,
      },
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
      targetType: 'user',
      targetId: token.userId,
    });
  }

  /**
   * Changes a signed-in user's own password (§4.12, owed since Phase 1).
   *
   * **The current password is required, and that is the whole security of it.**
   * A session cookie is enough to *be* the user, so without this check anyone
   * who reached an unlocked machine could set a new password and own the account
   * permanently — while the real owner discovers it at the next sign-in. Asking
   * for what they already know costs a legitimate user one field.
   *
   * Every *other* session is revoked afterwards, and this one is kept. Changing
   * a password is what somebody does when they think it has been seen, so the
   * point is to evict whoever else is holding one — and signing the user out of
   * the tab they are looking at, immediately after they proved themselves, would
   * make the safe action feel like a failure.
   */
  async changePassword(
    userId: string,
    sessionId: string,
    currentPassword: string,
    newPassword: string,
    context: SessionContext,
  ): Promise<void> {
    if (newPassword.length < this.config.get('PASSWORD_MIN_LENGTH')) {
      throw new BadRequestException('PASSWORD_TOO_SHORT');
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!(await verifyPassword(user.passwordHash, currentPassword))) {
      await this.audit.record({
        action: AuditAction.AUTH_PASSWORD_CHANGED,
        outcome: 'FAILURE',
        actorUserId: userId,
        ipAddress: context.ipAddress,
        reason: AuditReason.BAD_PASSWORD,
      });

      throw new UnauthorizedException('INVALID_CREDENTIALS');
    }

    if (await verifyPassword(user.passwordHash, newPassword)) {
      /* Refused rather than accepted as a no-op: somebody who believes they have
         changed their password and has not is worse off than somebody told they
         did not. */
      throw new BadRequestException('PASSWORD_UNCHANGED');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword) },
    });

    await this.sessions.revokeAllForUserExcept(userId, sessionId);

    await this.audit.record({
      action: AuditAction.AUTH_PASSWORD_CHANGED,
      outcome: 'SUCCESS',
      actorUserId: userId,
      ipAddress: context.ipAddress,
    });
  }

  /**
   * Asks to move the account to a new address (§4.12).
   *
   * **Nothing changes here.** The address is written to the token, the token is
   * mailed to the address being moved *to*, and `users.email` is untouched until
   * somebody proves they can read that inbox. Anything else — even a
   * `pending_email` column on the user — creates a window where the account
   * points at an address nobody has verified, which is the whole failure this
   * exists to prevent.
   *
   * **The current password is required**, for a stronger reason than the
   * password change: an attacker who can move the address can then use "forgot
   * password" and own the account outright, with the real employee locked out
   * and no longer receiving so much as a notice.
   *
   * **And the ministry-domain gate applies** (D-017 via `checkEmailDomain`).
   * Without it an employee could walk a ministry account to a personal inbox one
   * profile edit at a time, which is the restricted-registration policy defeated
   * through the back door.
   */
  async requestEmailChange(
    userId: string,
    newEmail: string,
    currentPassword: string,
    context: SessionContext,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true, email: true },
    });

    if (!(await verifyPassword(user.passwordHash, currentPassword))) {
      await this.audit.record({
        action: AuditAction.AUTH_EMAIL_CHANGE_REQUESTED,
        outcome: 'FAILURE',
        actorUserId: userId,
        ipAddress: context.ipAddress,
        reason: AuditReason.BAD_PASSWORD,
      });

      throw new UnauthorizedException('INVALID_CREDENTIALS');
    }

    if (newEmail === user.email) {
      throw new BadRequestException('EMAIL_UNCHANGED');
    }

    const rejection = checkEmailDomain(newEmail, this.config.get('ALLOWED_EMAIL_DOMAINS'));

    if (rejection) {
      await this.audit.record({
        action: AuditAction.AUTH_EMAIL_CHANGE_REQUESTED,
        outcome: 'FAILURE',
        actorUserId: userId,
        ipAddress: context.ipAddress,
        reason: rejection.reason,
      });

      throw rejectionToException(rejection);
    }

    /*
     * A taken address is refused silently, exactly as registration does: the
     * caller is authenticated, but answering "that address already has an
     * account" would turn the profile form into the address oracle the
     * registration endpoint refuses to be. The audit entry carries the reason
     * for anyone reviewing.
     */
    const taken = await this.prisma.user.findUnique({
      where: { email: newEmail },
      select: { id: true },
    });

    await this.prisma.authToken.updateMany({
      where: { userId, type: 'EMAIL_CHANGE', consumedAt: null },
      data: { consumedAt: new Date() },
    });

    if (taken) {
      await this.audit.record({
        action: AuditAction.AUTH_EMAIL_CHANGE_REQUESTED,
        outcome: 'FAILURE',
        actorUserId: userId,
        ipAddress: context.ipAddress,
        reason: AuditReason.EMAIL_ALREADY_REGISTERED,
      });

      return;
    }

    const token = generateToken();

    await this.prisma.authToken.create({
      data: {
        userId,
        type: 'EMAIL_CHANGE',
        newEmail,
        tokenHash: hashToken(token),
        expiresAt: expiryFromNow(this.config.get('EMAIL_VERIFICATION_TTL_MINUTES')),
      },
    });

    await this.audit.record({
      action: AuditAction.AUTH_EMAIL_CHANGE_REQUESTED,
      outcome: 'SUCCESS',
      actorUserId: userId,
      ipAddress: context.ipAddress,
    });

    await this.email.sendEmailChange(newEmail, token);
  }

  /**
   * Completes the move, from the link in the new inbox.
   *
   * Public, like every other token redemption: the link may well be opened in
   * the browser where that mailbox is signed in, which is not necessarily the
   * one that asked.
   *
   * **Every session is revoked, including the caller's.** The identifier the
   * person signs in with has just changed, so being asked to sign in again with
   * it is the honest next step — and if the request was not theirs, it ends the
   * attacker's session too.
   */
  async confirmEmailChange(rawToken: string, context: SessionContext): Promise<void> {
    const token = await this.prisma.authToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      select: {
        id: true,
        userId: true,
        type: true,
        newEmail: true,
        expiresAt: true,
        consumedAt: true,
        user: { select: { moodleUserId: true } },
      },
    });

    /*
     * Checked one reason at a time rather than as one boolean, so the type
     * checker can see that a token surviving all four has a `newEmail` — the
     * combined condition was correct and unprovable, and the alternative was a
     * non-null assertion that would keep compiling if a check were ever removed.
     */
    const refuse = async (reason: AuditReasonCode, userId: string | null): Promise<never> => {
      await this.audit.record({
        action: AuditAction.AUTH_EMAIL_CHANGED,
        outcome: 'FAILURE',
        actorUserId: userId,
        ipAddress: context.ipAddress,
        reason,
      });

      throw new UnauthorizedException('TOKEN_INVALID');
    };

    if (!token) {
      return refuse(AuditReason.TOKEN_INVALID, null);
    }
    if (token.consumedAt !== null) {
      return refuse(AuditReason.TOKEN_ALREADY_USED, token.userId);
    }
    if (token.expiresAt <= new Date()) {
      return refuse(AuditReason.TOKEN_EXPIRED, token.userId);
    }
    if (token.type !== 'EMAIL_CHANGE' || token.newEmail === null) {
      /* A verification or reset token presented here. It is valid — for
         something else — so it is refused without being consumed. */
      return refuse(AuditReason.TOKEN_INVALID, token.userId);
    }

    /* Narrowed non-null by the guard above; captured once so the best-effort
       Moodle sync at the end of this method doesn't lean on control-flow
       narrowing surviving several `await`s later. */
    const newEmail = token.newEmail;

    /*
     * Re-checked at redemption, not only at request: the address was free when
     * the link was sent and somebody else may have registered it since. The
     * unique index would refuse anyway — this turns a 500 into an answer the
     * page can explain.
     */
    const taken = await this.prisma.user.findUnique({
      where: { email: token.newEmail },
      select: { id: true },
    });

    if (taken) {
      await this.audit.record({
        action: AuditAction.AUTH_EMAIL_CHANGED,
        outcome: 'FAILURE',
        actorUserId: token.userId,
        ipAddress: context.ipAddress,
        reason: AuditReason.EMAIL_ALREADY_REGISTERED,
      });

      throw new ConflictException('EMAIL_ALREADY_REGISTERED');
    }

    /* Consumed and applied together, so a crash between the two cannot leave a
       token that still works against an address already moved. */
    await this.prisma.$transaction([
      this.prisma.authToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } }),
      this.prisma.user.update({
        where: { id: token.userId },
        /* Verified by this very act — the link only arrives in an inbox the
           person can read, which is the same proof registration asks for. */
        data: { email: token.newEmail, emailVerifiedAt: new Date() },
      }),
    ]);

    await this.sessions.revokeAllForUser(token.userId);

    await this.audit.record({
      action: AuditAction.AUTH_EMAIL_CHANGED,
      outcome: 'SUCCESS',
      actorUserId: token.userId,
      ipAddress: context.ipAddress,
      targetType: 'user',
      targetId: token.userId,
    });

    /* Not-yet-provisioned users (§4.12 ticket): nothing exists in the LMS yet
       to update, and provisioning later picks up whatever email is current by
       then — there is no stale record to leave behind. */
    if (token.user.moodleUserId !== null) {
      await this.propagateEmailToLms(
        token.userId,
        token.user.moodleUserId,
        newEmail,
        context.ipAddress ?? null,
      );
    }
  }

  /** Stores, or clears, the person's digits preference (§4.12, D-018). */
  async setNumberFormat(userId: string, numberFormat: string | null): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { numberFormat } });
  }

  /**
   * Best-effort by design (§4.12, D-036), mirroring `ProfileService`'s name
   * propagation: the address has already moved in our database and every
   * session is already revoked by the time this runs, so a failure here is
   * recorded and left alone rather than retried inline or surfaced to the
   * caller as an error the confirmation did not actually have.
   *
   * **The Moodle username is never re-derived (D-038 addendum).** It was
   * fixed once, at `provisionUser` time, against whatever address was
   * current then — `moodle_user_id` is the durable link, not the username
   * and not the email. This call moves what the LMS displays; it must not,
   * and `LmsPort.updateUser` will not, change what the account is found by.
   */
  private async propagateEmailToLms(
    userId: string,
    moodleUserId: number,
    email: string,
    ipAddress: string | null,
  ): Promise<void> {
    try {
      await this.lms.updateUser({ lmsUserId: moodleUserId, email });
    } catch (error) {
      this.logger.error(
        `Failed to propagate an email change to Moodle for user ${userId}: ${
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
        detail: { field: 'email' },
      });
    }
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
        targetType: 'user',
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
