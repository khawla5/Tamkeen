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
  /**
   * The Moodle role granted on enrolment. Configurable, not hardcoded: 5 is the
   * stock id for Student, but role ids are per-instance and we do not control
   * the ministry's Moodle. A hardcoded 5 that turned out to be something else
   * there would enrol every learner with the wrong permissions — a latent
   * production bug for the sake of one constant.
   */
  MOODLE_STUDENT_ROLE_ID: z.coerce.number().int().positive().default(5),
  /**
   * The role an entity is enrolled with to author its own course (D-060).
   * Moodle's stock `editingteacher` is 3, and the same per-instance caveat
   * applies as for the student role — more sharply, in fact, since getting a
   * teaching role wrong hands an outside organisation capabilities nobody
   * intended.
   */
  MOODLE_TEACHER_ROLE_ID: z.coerce.number().int().positive().default(3),
  /**
   * Where courses an entity creates are filed (D-060).
   *
   * `core_course_create_courses` requires a category and every instance numbers
   * them differently, so defaulting to 1 would put ministry courses under
   * whatever that instance happens to call category one. Required in real mode.
   */
  MOODLE_COURSE_CATEGORY_ID: z.coerce.number().int().positive().default(1),
  /** Per-call ceiling. Moodle answered in 60–256 ms in the spike; 10s is a
   *  generous outage detector, not a normal-operation budget. */
  MOODLE_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  /**
   * Shared with the `local_tamkeensso` plugin, which verifies the handoff
   * signature with it (D-044). Server-side only, never sent to a browser.
   * Minimum length is enforced at mint time as well, so a short secret cannot
   * quietly make the signature decorative.
   */
  MOODLE_SSO_SECRET: z.string().default(''),
  /**
   * Handoff lifetime. The URL reaches the browser, so this is the window in
   * which anyone who reads it — from history, a referrer header, a shared
   * screen — could become that learner. Seconds, deliberately.
   */
  MOODLE_SSO_TTL_SECONDS: z.coerce.number().int().positive().max(300).default(60),
  /**
   * The certificate's signature block (§4C.7, D-073).
   *
   * Empty by default and deliberately so: the ministry has not supplied a
   * signatory, and printing an invented one on a credential would be worse than
   * printing none. The slot holds its position either way (D-051).
   */
  CERT_SIGNATORY_NAME: z.string().max(120).default(''),
  CERT_SIGNATORY_TITLE: z.string().max(160).default(''),
  CERT_ISSUING_BODY: z.string().max(160).default('الجهة المصدرة: وزارة الداخلية'),
  PASS_THRESHOLD: z.coerce.number().min(0).max(100).default(70),
  /**
   * Path membership rules for a course (TAM-132): how many paths one course
   * may belong to, how many distinct RIASEC letters those paths may span, and
   * whether an entity's membership needs admin approval before learners see it
   * ('off' auto-approves — the state until Phase 5's queue exists).
   */
  COURSE_MAX_PATHS: z.coerce.number().int().min(1).max(12).default(3),
  COURSE_MAX_RIASEC_LETTERS: z.coerce.number().int().min(1).max(6).default(2),
  PATH_MEMBERSHIP_APPROVAL: z.enum(['off', 'on']).default('off'),
  COMPLETION_SYNC_INTERVAL_MINUTES: z.coerce.number().int().positive().default(5),
  /**
   * Whether the background sync scheduler runs. Off in tests regardless, since a
   * repeatable job firing mid-suite would write underneath assertions and read
   * as flakiness rather than as a scheduler.
   * Not z.coerce.boolean(): that treats the string "false" as true.
   */
  SYNC_SCHEDULER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  // ---- Certificates (Phase 3) ----
  CERT_VERIFICATION_BASE_URL: z.string().url().default('http://localhost:3000/verify'),
  /**
   * Where rendered certificate PDFs are written. The bytes are produced once at
   * issue time and never re-rendered — a credential has to stay the artefact it
   * was — so this directory holds the only copy and belongs in the backup set.
   * Rows store a path *relative* to it, so moving the root does not rewrite them.
   * Object storage is a Phase 7 concern.
   */
  CERT_STORAGE_DIR: z.string().default('./.storage/certificates'),
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

  /* A real LMS needs both an address and a credential. Starting without the
     token would produce an integration that boots cleanly and then fails every
     single call with `invalidtoken` — a slow, confusing failure in place of an
     immediate, obvious one. */
  if (parsed.data.MOODLE_MODE === 'real' && parsed.data.MOODLE_BASE_URL.length === 0) {
    throw new Error(
      'Invalid environment configuration:\n  - MOODLE_BASE_URL is required when MOODLE_MODE=real',
    );
  }

  if (parsed.data.MOODLE_MODE === 'real' && parsed.data.MOODLE_WS_TOKEN.length === 0) {
    throw new Error(
      'Invalid environment configuration:\n  - MOODLE_WS_TOKEN is required when MOODLE_MODE=real',
    );
  }

  return parsed.data;
}
