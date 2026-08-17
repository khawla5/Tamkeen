import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Opaque bearer tokens for sessions, email verification and password reset.
 *
 * The rule everywhere: the raw token is produced once, handed to the user (in a
 * cookie or an email link), and **never stored**. Only its SHA-256 hash goes to
 * the database, so a dump of `sessions` or `auth_tokens` yields nothing an
 * attacker can present.
 *
 * SHA-256 rather than argon2 here, deliberately: these tokens are 256 bits of
 * CSPRNG output, so they have no guessable structure for a slow hash to
 * protect. Password hashing is the opposite case — see common/password.ts.
 */

/** 32 bytes = 256 bits of entropy, base64url so it is URL- and cookie-safe. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Constant-time comparison of two hashes.
 *
 * Database lookups by hash are the normal path; this exists for the cases where
 * two hashes are compared in application code, so the comparison cannot leak
 * information through timing.
 */
export function tokensMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

export function expiryFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}
