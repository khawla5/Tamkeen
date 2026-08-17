import { AppConfigService } from './app-config.module';
import { validateEnv } from './env.schema';

/**
 * Regression tests for a real defect: `@nestjs/config`'s ConfigService reads
 * `process.env` in preference to the validated object, so every setting arrived
 * as the raw string rather than its parsed type. The worst consequence was that
 * ALLOWED_EMAIL_DOMAINS became a string, turning the registration domain check
 * into a substring match — an authentication bypass.
 *
 * These assertions pin the *types* coming out of configuration, which is the
 * property that was silently wrong.
 */
describe('AppConfigService', () => {
  function build(overrides: Record<string, string> = {}) {
    return new AppConfigService(
      validateEnv({
        DATABASE_URL: 'postgresql://user:password@localhost:5432/tamkeen',
        ...overrides,
      }),
    );
  }

  it('returns comma-separated lists as arrays, not strings', () => {
    const config = build({ ALLOWED_EMAIL_DOMAINS: 'a.gov.example,b.gov.example' });
    const domains = config.get('ALLOWED_EMAIL_DOMAINS');

    expect(Array.isArray(domains)).toBe(true);
    expect(domains).toEqual(['a.gov.example', 'b.gov.example']);
  });

  it('returns numeric settings as numbers, not strings', () => {
    const config = build({ PASS_THRESHOLD: '80', API_PORT: '4100' });

    expect(config.get('PASS_THRESHOLD')).toBe(80);
    expect(config.get('API_PORT')).toBe(4100);
    expect(typeof config.get('SESSION_TTL_MINUTES')).toBe('number');
  });

  it('returns booleans as booleans — "false" must not be truthy', () => {
    const config = build({ RATE_LIMIT_ENABLED: 'false' });

    expect(config.get('RATE_LIMIT_ENABLED')).toBe(false);
    expect(typeof config.get('RATE_LIMIT_ENABLED')).toBe('boolean');
  });

  it('defaults RATE_LIMIT_ENABLED to true', () => {
    expect(build().get('RATE_LIMIT_ENABLED')).toBe(true);
  });

  it('refuses to let rate limiting be disabled in production', () => {
    expect(() => validateEnv({ NODE_ENV: 'production', RATE_LIMIT_ENABLED: 'false' })).toThrow(
      /RATE_LIMIT_ENABLED/,
    );
  });

  it('reports production correctly', () => {
    expect(build({ NODE_ENV: 'production' }).isProduction).toBe(true);
    expect(build({ NODE_ENV: 'development' }).isProduction).toBe(false);
  });
});
