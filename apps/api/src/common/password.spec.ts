import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  /* argon2id is memory-hard by design, so each call is deliberately slow. */
  jest.setTimeout(20_000);

  it('produces an argon2id hash, not a bare digest', () => {
    return hashPassword('correct horse battery staple').then((hash) => {
      expect(hash.startsWith('$argon2id$')).toBe(true);
    });
  });

  it('never stores the plaintext anywhere in the hash', async () => {
    const secret = 'MinistryPassword!2026';

    expect(await hashPassword(secret)).not.toContain(secret);
  });

  it('salts, so the same password hashes differently every time', async () => {
    const [first, second] = await Promise.all([hashPassword('same'), hashPassword('same')]);

    expect(first).not.toBe(second);
  });

  it('verifies a correct password', async () => {
    const hash = await hashPassword('correct horse');

    expect(await verifyPassword(hash, 'correct horse')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse');

    expect(await verifyPassword(hash, 'wrong horse')).toBe(false);
  });

  it('is case sensitive', async () => {
    const hash = await hashPassword('CaseSensitive');

    expect(await verifyPassword(hash, 'casesensitive')).toBe(false);
  });

  it('treats a corrupt hash as a wrong password rather than throwing', async () => {
    /* A malformed row must read as "wrong password", never as a server error
       that distinguishes this account from any other. */
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
    expect(await verifyPassword('', 'anything')).toBe(false);
  });

  it('handles long and non-Latin passwords', async () => {
    const arabic = 'كلمة-مرور-قوية-جدا-٢٠٢٦';
    const long = 'x'.repeat(256);

    expect(await verifyPassword(await hashPassword(arabic), arabic)).toBe(true);
    expect(await verifyPassword(await hashPassword(long), long)).toBe(true);
  });
});
