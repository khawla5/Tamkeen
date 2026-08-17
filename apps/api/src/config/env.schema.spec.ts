import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  it('applies the Arabic-first defaults when nothing is set (D-001, D-018)', () => {
    const env = validateEnv({});

    expect(env.DEFAULT_LOCALE).toBe('ar');
    expect(env.NUMBER_FORMAT).toBe('western');
  });

  it('defaults MOODLE_MODE to mock so Phase 0 never reaches a real LMS', () => {
    expect(validateEnv({}).MOODLE_MODE).toBe('mock');
  });

  it('rejects an unknown number format instead of silently falling back', () => {
    expect(() => validateEnv({ NUMBER_FORMAT: 'roman' })).toThrow(/NUMBER_FORMAT/);
  });

  it('rejects MOODLE_MODE=real without a base URL (no real client until Phase 2)', () => {
    expect(() => validateEnv({ MOODLE_MODE: 'real' })).toThrow(/MOODLE_BASE_URL/);
  });

  it('parses ALLOWED_EMAIL_DOMAINS into a normalised list (D-017)', () => {
    const env = validateEnv({ ALLOWED_EMAIL_DOMAINS: 'Ministry.GOV.example, other.gov.example ' });

    expect(env.ALLOWED_EMAIL_DOMAINS).toEqual(['ministry.gov.example', 'other.gov.example']);
  });

  it('coerces numeric settings from their string environment form', () => {
    const env = validateEnv({ API_PORT: '4100', PASS_THRESHOLD: '80' });

    expect(env.API_PORT).toBe(4100);
    expect(env.PASS_THRESHOLD).toBe(80);
  });

  it('rejects a pass threshold outside 0-100', () => {
    expect(() => validateEnv({ PASS_THRESHOLD: '140' })).toThrow(/PASS_THRESHOLD/);
  });
});
