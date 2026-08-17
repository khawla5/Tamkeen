import { AuditReason } from '../audit/audit.actions';
import { checkRegistrationPolicy, type RegistrationPolicyConfig } from './registration-policy';

/**
 * The restricted-registration gate is the rule that keeps this from being an
 * open sign-up (D-017), so it is tested exhaustively — including the ways it
 * could accidentally become permissive.
 */
const config: RegistrationPolicyConfig = {
  mode: 'restricted',
  allowedDomains: ['ministry.gov.example', 'other.gov.example'],
  employeeIdPattern: '^[A-Za-z0-9][A-Za-z0-9-]{3,19}$',
  passwordMinLength: 12,
};

const validCandidate = {
  email: 'ahmad@ministry.gov.example',
  employeeId: 'EMP-12345',
  password: 'a-sufficiently-long-password',
};

describe('checkRegistrationPolicy', () => {
  it('accepts a ministry address with a well-formed employee id', () => {
    expect(checkRegistrationPolicy(validCandidate, config)).toBeNull();
  });

  it('accepts any configured domain, not just the first', () => {
    expect(
      checkRegistrationPolicy({ ...validCandidate, email: 'sara@other.gov.example' }, config),
    ).toBeNull();
  });

  describe('admin-only mode', () => {
    it('refuses self-registration outright, even for a perfect applicant', () => {
      const rejection = checkRegistrationPolicy(validCandidate, {
        ...config,
        mode: 'admin-only',
      });

      expect(rejection?.reason).toBe(AuditReason.SELF_REGISTRATION_DISABLED);
    });
  });

  describe('domain gate', () => {
    it('rejects an outside domain', () => {
      const rejection = checkRegistrationPolicy(
        { ...validCandidate, email: 'ahmad@gmail.com' },
        config,
      );

      expect(rejection?.reason).toBe(AuditReason.DOMAIN_NOT_ALLOWED);
    });

    it('rejects a lookalike subdomain', () => {
      /* evil.example pretending to be a subdomain of the ministry. */
      const rejection = checkRegistrationPolicy(
        { ...validCandidate, email: 'ahmad@ministry.gov.example.evil.example' },
        config,
      );

      expect(rejection?.reason).toBe(AuditReason.DOMAIN_NOT_ALLOWED);
    });

    it('fails CLOSED when the allow-list is empty', () => {
      /* An empty list must not silently mean "any domain" — that would turn
         restricted mode into the open sign-up D-017 forbids. */
      const rejection = checkRegistrationPolicy(validCandidate, {
        ...config,
        allowedDomains: [],
      });

      expect(rejection?.reason).toBe(AuditReason.DOMAIN_NOT_ALLOWED);
    });

    it('rejects a domain that is merely a PREFIX of an allowed one', () => {
      /*
       * Regression test. When the allow-list arrived as a raw string instead of
       * an array, `.includes()` performed substring matching, so `ministry.gov`
       * satisfied a gate configured for `ministry.gov.example` — an
       * authentication bypass. Membership must be exact.
       */
      const rejection = checkRegistrationPolicy(
        { ...validCandidate, email: 'attacker@ministry.gov' },
        config,
      );

      expect(rejection?.reason).toBe(AuditReason.DOMAIN_NOT_ALLOWED);
    });

    it('rejects a domain that merely CONTAINS an allowed one', () => {
      const rejection = checkRegistrationPolicy(
        { ...validCandidate, email: 'attacker@not-ministry.gov.example.co' },
        config,
      );

      expect(rejection?.reason).toBe(AuditReason.DOMAIN_NOT_ALLOWED);
    });

    it('rejects an address with no domain part', () => {
      const rejection = checkRegistrationPolicy(
        { ...validCandidate, email: 'not-an-address' },
        config,
      );

      expect(rejection?.reason).toBe(AuditReason.DOMAIN_NOT_ALLOWED);
    });

    it('matches the domain case-insensitively', () => {
      expect(
        checkRegistrationPolicy({ ...validCandidate, email: 'ahmad@MINISTRY.GOV.EXAMPLE' }, config),
      ).toBeNull();
    });
  });

  describe('employee id gate', () => {
    it.each(['', 'ab', 'EMP 12345', 'EMP_12345', '-EMP123', 'x'.repeat(30)])(
      'rejects the malformed id %p',
      (employeeId) => {
        const rejection = checkRegistrationPolicy({ ...validCandidate, employeeId }, config);

        expect(rejection?.reason).toBe(AuditReason.EMPLOYEE_ID_INVALID);
      },
    );

    it('fails CLOSED when the configured pattern is not a valid regex', () => {
      /* An operator typo must not let everyone through. */
      const rejection = checkRegistrationPolicy(validCandidate, {
        ...config,
        employeeIdPattern: '([unclosed',
      });

      expect(rejection?.reason).toBe(AuditReason.EMPLOYEE_ID_INVALID);
    });
  });

  describe('password length', () => {
    it('rejects a password below the configured minimum', () => {
      const rejection = checkRegistrationPolicy({ ...validCandidate, password: 'short' }, config);

      expect(rejection?.message).toBe('PASSWORD_TOO_SHORT');
    });

    it('accepts a password exactly at the minimum', () => {
      expect(
        checkRegistrationPolicy({ ...validCandidate, password: 'x'.repeat(12) }, config),
      ).toBeNull();
    });
  });

  describe('evaluation order', () => {
    it('reports the mode before anything else', () => {
      const rejection = checkRegistrationPolicy(
        { email: 'x@gmail.com', employeeId: 'bad', password: 'short' },
        { ...config, mode: 'admin-only' },
      );

      expect(rejection?.reason).toBe(AuditReason.SELF_REGISTRATION_DISABLED);
    });
  });
});
