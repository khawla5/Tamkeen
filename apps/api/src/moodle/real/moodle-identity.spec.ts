import {
  deriveMoodleUsername,
  generateUnusedPassword,
  normaliseEmail,
  splitFullName,
} from './moodle-identity';

/**
 * These are the properties `provisionUser`'s idempotency rests on (D-038).
 * Because we key Moodle accounts on this value rather than on Moodle's email
 * index, a defect here does not fail loudly — it creates a second Moodle account
 * for an employee who already had one, and surfaces later as a unique-constraint
 * violation somewhere unrelated.
 */
describe('deriveMoodleUsername', () => {
  it('is deterministic for the same address', () => {
    expect(deriveMoodleUsername('ahmad.ali@ministry.gov.example')).toBe(
      deriveMoodleUsername('ahmad.ali@ministry.gov.example'),
    );
  });

  it('is stable across processes — no salt, no randomness, no clock', () => {
    /* A real Moodle account keeps its id forever, so the key we resolve it by
       must not depend on process state. Pinning the literal value is the point:
       if the derivation ever changes, every existing account silently becomes
       unreachable and gets duplicated. That must fail here, loudly, not in
       production. */
    expect(deriveMoodleUsername('ahmad.ali@ministry.gov.example')).toBe('ahmad.ali-09c9c24667');
  });

  it('treats case and surrounding whitespace as insignificant', () => {
    const canonical = deriveMoodleUsername('ahmad.ali@ministry.gov.example');

    expect(deriveMoodleUsername('  AHMAD.ALI@Ministry.Gov.Example  ')).toBe(canonical);
  });

  it('does not collide across domains sharing a local part', () => {
    /* The failure this prevents is two employees sharing one Moodle account and
       therefore one set of course records. The digest covers the whole address
       precisely so the local part alone cannot decide identity. */
    expect(deriveMoodleUsername('a.hassan@one.gov.example')).not.toBe(
      deriveMoodleUsername('a.hassan@two.gov.example'),
    );
  });

  it('emits only characters Moodle accepts in a username', () => {
    for (const email of [
      'ahmad.ali@ministry.gov.example',
      "o'brien+tag@ministry.gov.example",
      'محمد@ministry.gov.example',
      '...@ministry.gov.example',
      'UPPER_CASE@ministry.gov.example',
    ]) {
      expect(deriveMoodleUsername(email)).toMatch(/^[a-z0-9][a-z0-9._-]*$/);
    }
  });

  it('still yields a valid, distinct username when the local part sanitises away', () => {
    /* An all-Arabic local part has nothing left after sanitising, so the
       readable prefix cannot carry identity — the digest has to. */
    const first = deriveMoodleUsername('محمد@ministry.gov.example');
    const second = deriveMoodleUsername('أحمد@ministry.gov.example');

    expect(first).toMatch(/^u-[0-9a-f]{10}$/);
    expect(first).not.toBe(second);
  });

  it('stays within Moodle’s username length limit', () => {
    const long = `${'x'.repeat(200)}@ministry.gov.example`;

    expect(deriveMoodleUsername(long).length).toBeLessThanOrEqual(100);
  });
});

describe('normaliseEmail', () => {
  it('gives one definition of “the same address”', () => {
    expect(normaliseEmail('  Ahmad@Ministry.GOV  ')).toBe('ahmad@ministry.gov');
  });
});

describe('splitFullName', () => {
  it('keeps a multi-part Arabic name intact across the two fields', () => {
    expect(splitFullName('عبد الله محمد الحربي')).toEqual({
      firstname: 'عبد',
      lastname: 'الله محمد الحربي',
    });
  });

  it('never returns an empty field — Moodle rejects those', () => {
    for (const input of ['', '   ', 'محمد']) {
      const { firstname, lastname } = splitFullName(input);

      expect(firstname.length).toBeGreaterThan(0);
      expect(lastname.length).toBeGreaterThan(0);
    }
  });

  it('collapses irregular whitespace rather than producing blank parts', () => {
    expect(splitFullName('  سارة   أحمد  ')).toEqual({
      firstname: 'سارة',
      lastname: 'أحمد',
    });
  });
});

describe('generateUnusedPassword', () => {
  it('satisfies Moodle’s default policy, so provisioning cannot fail on it', () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const password = generateUnusedPassword();

      expect(password.length).toBeGreaterThanOrEqual(8);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[^a-zA-Z0-9]/);
    }
  });

  it('differs every call', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateUnusedPassword()));

    expect(seen.size).toBe(50);
  });
});
