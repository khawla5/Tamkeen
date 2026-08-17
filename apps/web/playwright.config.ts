import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end harness (§2B: at least one e2e happy path per phase's
 * user-visible flow).
 *
 * These tests drive a real browser against the built web app and the built API,
 * with a real PostgreSQL and a real SMTP sink. Nothing is stubbed — the
 * verification token is read out of the mail server, the way a user would read
 * their inbox, which is the only way to prove the full loop actually closes.
 *
 * Prerequisites (both handled by CI, and by `npm run e2e` locally):
 *   - docker compose up   → PostgreSQL + Mailpit
 *   - both apps built     → webServer below starts them
 */
const IS_CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  /* Vitest owns src/**; Playwright owns e2e/**. No overlap, so neither runner
     ever tries to execute the other's tests. */
  fullyParallel: false,
  forbidOnly: IS_CI,
  retries: IS_CI ? 1 : 0,
  workers: 1,
  reporter: IS_CI ? [['github'], ['list']] : [['list']],

  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://localhost:3000',
    /* Diagnostics only on failure — a passing run should leave no artefacts. */
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'ar',
    timezoneId: 'Asia/Riyadh',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: 'npm run start --workspace @tamkeen/api',
      cwd: '../..',
      url: 'http://localhost:4000/api/health',
      reuseExistingServer: !IS_CI,
      timeout: 120_000,
      env: {
        /* NODE_ENV is deliberately inherited, not overridden: if someone runs
           this against a production configuration, validateEnv should refuse to
           boot over RATE_LIMIT_ENABLED below rather than be quietly bypassed. */
        /*
         * The auth endpoints are deliberately limited to 5/minute, which a
         * browser test plus a retry would trip. Rate limiting has dedicated
         * integration coverage (auth.e2e-spec.ts asserts the 429), so disabling
         * it here removes a flake without losing the assertion. validateEnv
         * refuses this in production, so it cannot leak into a real deployment.
         */
        RATE_LIMIT_ENABLED: 'false',
        /* Mailpit, so the test can read the verification email. */
        SMTP_HOST: 'localhost',
        SMTP_PORT: '1025',
      },
    },
    {
      command: 'npm run start --workspace @tamkeen/web',
      cwd: '../..',
      url: 'http://localhost:3000/login',
      reuseExistingServer: !IS_CI,
      timeout: 120_000,
    },
  ],
});
