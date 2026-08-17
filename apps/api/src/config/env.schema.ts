import { z } from 'zod';

import { NUMBER_FORMATS } from '@tamkeen/types';

/**
 * Config via environment (CLAUDE.md §2A / §2B) — validated once, at boot.
 *
 * The app must refuse to start on a malformed or missing required variable
 * rather than fail mysteriously later. Variables belonging to later phases are
 * optional here and become required as their module lands.
 */
const csv = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.length > 0),
  )
  .pipe(z.array(z.string()));

export const envSchema = z.object({
  // ---- App ----
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:4000'),
  API_PORT: z.coerce.number().int().positive().default(4000),

  // ---- Locale (D-018) ----
  DEFAULT_LOCALE: z.literal('ar').default('ar'),
  NUMBER_FORMAT: z.enum(NUMBER_FORMATS).default('western'),

  // ---- Data stores ----
  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),

  // ---- Auth ----
  /* No JWT_SECRET or SESSION_SECRET: sessions are opaque 256-bit random tokens
     stored as hashes (D-028), so there is nothing to sign or encrypt. Dead
     config invites someone to "use" it later in a way nobody designed. */
  /** Sliding session lifetime. 12h ≈ one working day, so a shared desk does not
   *  stay signed in overnight. */
  SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(720),
  /** D-017: restricted self-registration, or admin-provisioned only. */
  REGISTRATION_MODE: z.enum(['restricted', 'admin-only']).default('restricted'),
  ALLOWED_EMAIL_DOMAINS: csv.default('ministry.gov.example'),
  /** Shape of a ministry employee number. Configurable because only the ministry
   *  knows its real format; the default is permissive but not empty. */
  EMPLOYEE_ID_PATTERN: z.string().default('^[A-Za-z0-9][A-Za-z0-9-]{3,19}$'),
  /* Global per-IP request ceiling. The stricter limits on individual auth
     endpoints are static in the controller: they are security floors, not knobs
     an operator should be able to loosen from a config file. */
  API_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  API_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(120),
  /**
   * Escape hatch for integration tests, which make hundreds of requests from one
   * address and would otherwise trip the deliberately strict auth limits.
   * `validateEnv` refuses to let this be false in production — the whole point of
   * the limits is that they cannot be switched off where they matter.
   * Not z.coerce.boolean(): that treats the string "false" as true.
   */
  RATE_LIMIT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  AUTH_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
  /** Failed sign-ins against one account before it locks. */
  AUTH_MAX_FAILED_ATTEMPTS: z.coerce.number().int().positive().default(5),
  /** Minimum password length. NIST SP 800-63B favours length over composition
   *  rules, so there is deliberately no "must contain a symbol" requirement. */
  PASSWORD_MIN_LENGTH: z.coerce.number().int().min(8).default(12),
  EMAIL_VERIFICATION_TTL_MINUTES: z.coerce.number().int().positive().default(1440),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(60),

  // ---- Email ----
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  SMTP_FROM: z.string().default('Tamkeen <no-reply@ministry.gov.example>'),

  // ---- Moodle (0.6 mock, Phase 2 real) ----
  MOODLE_MODE: z.enum(['mock', 'real']).default('mock'),
  MOODLE_BASE_URL: z.string().default(''),
  MOODLE_WS_TOKEN: z.string().default(''),
  PASS_THRESHOLD: z.coerce.number().min(0).max(100).default(70),
  COMPLETION_SYNC_INTERVAL_MINUTES: z.coerce.number().int().positive().default(5),

  // ---- Certificates (Phase 3) ----
  CERT_VERIFICATION_BASE_URL: z.string().url().default('http://localhost:3000/verify'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  if (parsed.data.NODE_ENV === 'production' && !parsed.data.RATE_LIMIT_ENABLED) {
    throw new Error(
      'Invalid environment configuration:\n  - RATE_LIMIT_ENABLED must not be false when NODE_ENV=production',
    );
  }

  // The real Moodle client does not exist until Phase 2; refuse to pretend.
  if (parsed.data.MOODLE_MODE === 'real' && parsed.data.MOODLE_BASE_URL.length === 0) {
    throw new Error(
      'Invalid environment configuration:\n  - MOODLE_BASE_URL is required when MOODLE_MODE=real',
    );
  }

  return parsed.data;
}
