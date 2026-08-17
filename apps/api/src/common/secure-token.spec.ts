import { expiryFromNow, generateToken, hashToken, tokensMatch } from './secure-token';

describe('secure tokens', () => {
  describe('generateToken', () => {
    it('produces URL- and cookie-safe output', () => {
      /* base64url: no +, /, or = to be mangled in a link or a Set-Cookie header. */
      expect(generateToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('carries 256 bits of entropy', () => {
      /* 32 bytes -> 43 base64url characters. */
      expect(generateToken()).toHaveLength(43);
    });

    it('never repeats across many draws', () => {
      const tokens = new Set(Array.from({ length: 1000 }, () => generateToken()));

      expect(tokens.size).toBe(1000);
    });
  });

  describe('hashToken', () => {
    it('is deterministic, so a lookup by hash finds the row', () => {
      const token = generateToken();

      expect(hashToken(token)).toBe(hashToken(token));
    });

    it('does not contain the token — the point of storing only the hash', () => {
      const token = generateToken();

      expect(hashToken(token)).not.toContain(token);
    });

    it('produces a 64-character hex SHA-256 digest', () => {
      expect(hashToken('anything')).toMatch(/^[0-9a-f]{64}$/);
    });

    it('gives different digests for different tokens', () => {
      expect(hashToken('a')).not.toBe(hashToken('b'));
    });
  });

  describe('tokensMatch', () => {
    it('matches identical values', () => {
      expect(tokensMatch('abc123', 'abc123')).toBe(true);
    });

    it('rejects different values of equal length', () => {
      expect(tokensMatch('abc123', 'abc124')).toBe(false);
    });

    it('rejects different lengths without throwing', () => {
      /* timingSafeEqual throws on length mismatch, so this must be guarded. */
      expect(tokensMatch('short', 'much-longer-value')).toBe(false);
      expect(tokensMatch('', 'x')).toBe(false);
    });
  });

  describe('expiryFromNow', () => {
    it('returns a future timestamp at the requested offset', () => {
      const before = Date.now();
      const expiry = expiryFromNow(60).getTime();

      expect(expiry).toBeGreaterThanOrEqual(before + 60 * 60_000);
      expect(expiry).toBeLessThan(before + 60 * 60_000 + 5_000);
    });
  });
});
