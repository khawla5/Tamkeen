import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * The seamless-login handoff token (D-044, §5.3/§5.4).
 *
 * Our app is the identity owner, so a learner who is signed in here must reach a
 * Moodle course without meeting a second login. Core Moodle cannot do this: every
 * mechanism it offers mints a session for **the web-service token's own user**,
 * and our token belongs to the integration account rather than to the learner.
 * So `local_tamkeensso` accepts this token instead.
 *
 * Four properties carry the whole security argument, and each exists because
 * removing it opens a specific hole:
 *
 *  1. **HMAC-signed** — otherwise anyone could mint a login for any user id.
 *  2. **Short expiry** — the URL reaches the browser, so it lands in history and
 *     in referrer headers. Its usefulness must expire in seconds, not hours.
 *  3. **Single-use**, enforced by a nonce the plugin records. Expiry alone still
 *     leaves a replay window to whoever sees the URL.
 *  4. **Bound to one user AND one course** — a stolen token then buys entry to
 *     the one course its owner was already entitled to, rather than to Moodle.
 *
 * The token is *not* a bearer credential for Moodle's API and carries no
 * web-services token. It is a capability to start one session, for one person,
 * in one course, within one minute.
 */

/** What the plugin is told, and all it is told. No name, no email — no PII. */
export interface HandoffClaims {
  moodleUserId: number;
  moodleCourseId: number;
  /** Unix seconds. */
  expiresAt: number;
  /** Single-use marker; the plugin rejects a nonce it has already consumed. */
  nonce: string;
}

/** Deliberately not configurable upward without thought: see `assertSaneTtl`. */
export const MAX_HANDOFF_TTL_SECONDS = 300;

export function mintHandoffToken(
  claims: Omit<HandoffClaims, 'nonce' | 'expiresAt'>,
  secret: string,
  ttlSeconds: number,
  now: Date = new Date(),
): string {
  assertSecret(secret);
  assertSaneTtl(ttlSeconds);

  const payload: HandoffClaims = {
    moodleUserId: claims.moodleUserId,
    moodleCourseId: claims.moodleCourseId,
    expiresAt: Math.floor(now.getTime() / 1000) + ttlSeconds,
    nonce: randomBytes(16).toString('hex'),
  };

  const encoded = base64url(Buffer.from(JSON.stringify(payload), 'utf8'));

  return `${encoded}.${sign(encoded, secret)}`;
}

/**
 * Verifies a token exactly as the plugin must.
 *
 * Present on this side so the contract between our TypeScript and the plugin's
 * PHP is asserted by tests rather than by two implementations that were *read*
 * side by side. Replay is not detectable here — that needs the consumed-nonce
 * store, which lives in Moodle where consumption happens.
 */
export function verifyHandoffToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): HandoffClaims | null {
  assertSecret(secret);

  const parts = token.split('.');

  if (parts.length !== 2) {
    return null;
  }

  const [encoded, signature] = parts as [string, string];

  /* Constant-time, so the comparison cannot be used as an oracle to recover a
     valid signature byte by byte. */
  if (!signaturesMatch(sign(encoded, secret), signature)) {
    return null;
  }

  let claims: unknown;

  try {
    claims = JSON.parse(Buffer.from(base64urlDecode(encoded)).toString('utf8'));
  } catch {
    return null;
  }

  if (!isHandoffClaims(claims)) {
    return null;
  }

  if (claims.expiresAt <= Math.floor(now.getTime() / 1000)) {
    return null;
  }

  return claims;
}

function sign(encodedPayload: string, secret: string): string {
  return base64url(createHmac('sha256', secret).update(encodedPayload).digest());
}

function signaturesMatch(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(actual, 'utf8');

  /* timingSafeEqual throws on a length mismatch, which would itself leak the
     length — so the lengths are compared first and the result folded in. */
  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

function base64url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function isHandoffClaims(value: unknown): value is HandoffClaims {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    Number.isInteger(record.moodleUserId) &&
    Number.isInteger(record.moodleCourseId) &&
    Number.isInteger(record.expiresAt) &&
    typeof record.nonce === 'string' &&
    record.nonce.length > 0
  );
}

function assertSecret(secret: string): void {
  /* A short or empty shared secret would make the signature decorative. Failing
     loudly at mint time beats shipping a handoff anyone can forge. */
  if (secret.length < 32) {
    throw new Error('MOODLE_SSO_SECRET must be at least 32 characters');
  }
}

function assertSaneTtl(ttlSeconds: number): void {
  /*
   * The URL is handed to a browser, so its lifetime is the window in which
   * anyone who reads it — from history, a referrer header, a shared screen —
   * can become that learner. Minutes are defensible; hours are not, and a
   * configuration mistake must not quietly create one.
   */
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > MAX_HANDOFF_TTL_SECONDS) {
    throw new Error(`Handoff TTL must be between 1 and ${MAX_HANDOFF_TTL_SECONDS} seconds`);
  }
}
