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

  // ---- Auth (0.5) ----
  JWT_SECRET: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(1).optional(),
  REGISTRATION_MODE: z.enum(['restricted', 'admin-only']).default('restricted'),
  ALLOWED_EMAIL_DOMAINS: csv.default('ministry.gov.example'),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  AUTH_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  AUTH_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),

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

  // The real Moodle client does not exist until Phase 2; refuse to pretend.
  if (parsed.data.MOODLE_MODE === 'real' && parsed.data.MOODLE_BASE_URL.length === 0) {
    throw new Error(
      'Invalid environment configuration:\n  - MOODLE_BASE_URL is required when MOODLE_MODE=real',
    );
  }

  return parsed.data;
}
