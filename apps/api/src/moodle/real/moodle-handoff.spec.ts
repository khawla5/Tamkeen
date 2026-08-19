import { createHmac } from 'node:crypto';

import { mintHandoffToken, verifyHandoffToken, MAX_HANDOFF_TTL_SECONDS } from './moodle-handoff';

/**
 * The handoff token is the one place in the system where a URL grants a login.
 * Every property asserted here is load-bearing, and the failure each prevents is
 * named — because "it looked signed" is exactly how this kind of thing ships
 * broken.
 */

const SECRET = 'a-secret-that-is-at-least-32-chars-long';
const OTHER_SECRET = 'a-different-secret-also-32-chars-min!!!';

describe('mintHandoffToken', () => {
  it('produces a payload.signature pair', () => {
    const token = mintHandoffToken({ moodleUserId: 4, moodleCourseId: 2 }, SECRET, 60);

    expect(token.split('.')).toHaveLength(2);
  });

  it('binds the token to one user and one course', () => {
    /* A token that named only the user would be a login to all of Moodle. */
    const token = mintHandoffToken({ moodleUserId: 4, moodleCourseId: 2 }, SECRET, 60);
    const claims = verifyHandoffToken(token, SECRET);

    expect(claims).toMatchObject({ moodleUserId: 4, moodleCourseId: 2 });
  });

  it('carries no personal data', () => {
    /* The URL lands in browser history, referrer headers and screenshots. It
       says which account, not who. */
    const token = mintHandoffToken({ moodleUserId: 4, moodleCourseId: 2 }, SECRET, 60);
    const payload = Buffer.from(token.split('.')[0]!, 'base64url').toString('utf8');

    expect(Object.keys(JSON.parse(payload)).sort()).toEqual([
      'expiresAt',
      'moodleCourseId',
      'moodleUserId',
      'nonce',
    ]);
  });

  it('gives every token a distinct nonce, so each is single-use', () => {
    const first = verifyHandoffToken(
      mintHandoffToken({ moodleUserId: 4, moodleCourseId: 2 }, SECRET, 60),
      SECRET,
    );
    const second = verifyHandoffToken(
      mintHandoffToken({ moodleUserId: 4, moodleCourseId: 2 }, SECRET, 60),
      SECRET,
    );

    expect(second!.nonce).not.toBe(first!.nonce);
  });

  it('refuses a secret too short to make the signature meaningful', () => {
    /* Failing loudly at mint time beats shipping a handoff anyone can forge. */
    expect(() => mintHandoffToken({ moodleUserId: 4, moodleCourseId: 2 }, 'short', 60)).toThrow(
      /32 characters/,
    );
  });

  it('refuses a lifetime long enough to be dangerous', () => {
    /* The TTL is the window in which anyone who reads the URL becomes that
       learner. A configuration mistake must not quietly create an hour of it. */
    expect(() =>
      mintHandoffToken({ moodleUserId: 4, moodleCourseId: 2 }, SECRET, MAX_HANDOFF_TTL_SECONDS + 1),
    ).toThrow(/between 1 and/);

    expect(() => mintHandoffToken({ moodleUserId: 4, moodleCourseId: 2 }, SECRET, 0)).toThrow();
  });
});

describe('verifyHandoffToken', () => {
  it('accepts a freshly minted token', () => {
    const token = mintHandoffToken({ moodleUserId: 4, moodleCourseId: 2 }, SECRET, 60);

    expect(verifyHandoffToken(token, SECRET)).not.toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = mintHandoffToken({ moodleUserId: 4, moodleCourseId: 2 }, OTHER_SECRET, 60);

    expect(verifyHandoffToken(token, SECRET)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    /* The attack this stops: editing the user id to become someone else. */
    const token = mintHandoffToken({ moodleUserId: 4, moodleCourseId: 2 }, SECRET, 60);
    const [, signature] = token.split('.');

    const forged = Buffer.from(
      JSON.stringify({
        moodleUserId: 1,
        moodleCourseId: 2,
        expiresAt: Math.floor(Date.now() / 1000) + 60,
        nonce: 'forged',
      }),
      'utf8',
    ).toString('base64url');

    expect(verifyHandoffToken(`${forged}.${signature!}`, SECRET)).toBeNull();
  });

  it('rejects an unsigned token', () => {
    const payload = Buffer.from(
      JSON.stringify({
        moodleUserId: 1,
        moodleCourseId: 2,
        expiresAt: Math.floor(Date.now() / 1000) + 60,
        nonce: 'x',
      }),
      'utf8',
    ).toString('base64url');

    expect(verifyHandoffToken(payload, SECRET)).toBeNull();
    expect(verifyHandoffToken(`${payload}.`, SECRET)).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = mintHandoffToken(
      { moodleUserId: 4, moodleCourseId: 2 },
      SECRET,
      60,
      new Date('2026-08-19T10:00:00Z'),
    );

    expect(verifyHandoffToken(token, SECRET, new Date('2026-08-19T10:00:59Z'))).not.toBeNull();
    expect(verifyHandoffToken(token, SECRET, new Date('2026-08-19T10:01:01Z'))).toBeNull();
  });

  it('rejects a malformed token rather than throwing', () => {
    /* This value arrives from a URL, so every shape of rubbish reaches it. */
    for (const rubbish of ['', '.', 'a.b.c', 'not-base64.sig', '{}', '...']) {
      expect(verifyHandoffToken(rubbish, SECRET)).toBeNull();
    }
  });

  it('rejects a payload missing required claims', () => {
    const payload = Buffer.from(JSON.stringify({ moodleUserId: 4 }), 'utf8').toString('base64url');
    const signature = createHmac('sha256', SECRET).update(payload).digest('base64url');

    expect(verifyHandoffToken(`${payload}.${signature}`, SECRET)).toBeNull();
  });
});

describe('the wire format the PHP plugin must agree with', () => {
  /*
   * The plugin verifies these tokens in PHP. Two implementations that were only
   * read side by side would drift, so the exact bytes are pinned here: base64url
   * without padding, HMAC-SHA256 over the encoded payload string, and camelCase
   * claim names. If any of that changes, this fails and the plugin must change
   * with it.
   */

  it('signs the encoded payload string, not the raw JSON', () => {
    const token = mintHandoffToken({ moodleUserId: 4, moodleCourseId: 2 }, SECRET, 60);
    const [encoded, signature] = token.split('.') as [string, string];

    const expected = createHmac('sha256', SECRET)
      .update(encoded)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    expect(signature).toBe(expected);
  });

  it('uses unpadded base64url in both halves', () => {
    const token = mintHandoffToken({ moodleUserId: 4, moodleCourseId: 2 }, SECRET, 60);

    expect(token).not.toContain('=');
    expect(token).not.toContain('+');
    expect(token).not.toContain('/');
  });

  it('is safe to place in a query string without escaping surprises', () => {
    const token = mintHandoffToken({ moodleUserId: 4, moodleCourseId: 2 }, SECRET, 60);

    expect(encodeURIComponent(token)).toBe(token);
  });
});
