import { envSchema, type Env } from '../config/env.schema';

/**
 * Which knobs an administrator may change without a deployment (§4C.6, D-072).
 *
 * **The list is short on purpose, and what is missing from it is the point.**
 * Secrets are absent — the Moodle web-services token, the database URL, the SMTP
 * credentials — because a setting readable by the screen that edits it is a
 * setting that appears in a network response. So are the auth rate limits, which
 * §2 makes security floors rather than knobs an operator may loosen; and so are
 * the 5-10 path bounds, which §2 makes a product rule and D-074 keeps in code.
 *
 * Everything here is something the ministry must be able to change while the
 * system is running, and nothing here can be used to weaken it.
 */
export const SETTING_KEYS = [
  /** The grade a learner must reach (D-007). Changed without a release. */
  'PASS_THRESHOLD',
  'COURSE_MAX_PATHS',
  'COURSE_MAX_RIASEC_LETTERS',
  'PATH_MEMBERSHIP_APPROVAL',
  /** How often the LMS is polled (D-042). Re-registers the scheduler on change. */
  'COMPLETION_SYNC_INTERVAL_MINUTES',
  /** D-017's registration gate: the mode, the domains, the employee-id shape. */
  'REGISTRATION_MODE',
  'ALLOWED_EMAIL_DOMAINS',
  'EMPLOYEE_ID_PATTERN',
  /** D-018's single switch point between Western and Arabic-Indic digits. */
  'NUMBER_FORMAT',
  /** Which Moodle we talk to. Not a secret; the token is, and is not here. */
  'MOODLE_BASE_URL',
  /**
   * §4C.7's signature block (D-073).
   *
   * Settings rather than template code, so the ministry can name its signatory
   * without a deployment — and settings rather than a `certificate_templates`
   * table, because three strings do not need a table and issued certificates
   * store their rendered bytes regardless (D-052).
   */
  'CERT_SIGNATORY_NAME',
  'CERT_SIGNATORY_TITLE',
  'CERT_ISSUING_BODY',
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

/**
 * The type each key resolves to — the same type the environment gives it.
 *
 * Derived from `Env` rather than restated, so a setting cannot come back as a
 * different type from the environment variable it overrides. That is the whole
 * bug `AppConfigService` exists to prevent, and re-introducing it one setting at
 * a time would be worse than never having fixed it.
 */
export type SettingValues = { [K in SettingKey]: Env[K] };

/**
 * Parses a stored string against the same schema the environment uses.
 *
 * The row is text, because a key-value table cannot be typed by a column. This
 * is what replaces that typing: a value that reaches a consumer has been through
 * exactly the validation `PASS_THRESHOLD=70` in a `.env` file would have been.
 * Throws on anything else — the caller decides whether that is a refused write
 * or a fallback on read.
 */
export function parseSetting<K extends SettingKey>(key: K, raw: string): SettingValues[K] {
  /* `envSchema` is a ZodObject, so a single key's schema is reachable through
     its shape — no second definition to keep in step with the first. */
  const field = envSchema.shape[key];

  return field.parse(raw) as SettingValues[K];
}

/**
 * How a value is written back into a form field.
 *
 * `ALLOWED_EMAIL_DOMAINS` parses to an array and is stored and edited as the
 * comma-separated string it arrives as, so the round trip has to be explicit
 * rather than `String(value)` — which would render `["a","b"]` as `a,b` by
 * accident today and as something else the day the parser changes.
 */
export function formatSetting(key: SettingKey, value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(',');
  }

  return String(value);
}
