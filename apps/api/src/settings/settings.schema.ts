import { z } from 'zod';

import { SETTING_KEYS, type SettingEditor, type SettingKey } from '@tamkeen/types';

import { envSchema, type Env } from '../config/env.schema';

/**
 * The typed half of §4C.6's knobs (D-072).
 *
 * **The key list itself now lives in `@tamkeen/types`** (TAM-135) and is
 * re-exported here so every existing importer is unaffected. It moved because
 * the admin screen renders one row per key and looks its Arabic label up by
 * key — with the list API-only, a key added without copy reached the ministry as
 * the raw `admin.setting.CERT_SIGNATORY_NAME`, and no test on either side could
 * have caught it. The web catalogue is now asserted against the shared list.
 *
 * What stays here is everything that depends on the environment schema: the
 * value types, the parser, and how each key is edited.
 */
export { SETTING_KEYS, type SettingKey };

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
 * The Zod field behind a key, with any `.default()` wrapper removed.
 *
 * Every setting has a default — that is what makes an absent row mean "the
 * environment's value" — so the interesting shape is always one level in.
 */
function fieldFor(key: SettingKey): z.ZodTypeAny {
  const field = envSchema.shape[key] as z.ZodTypeAny;

  return field instanceof z.ZodDefault ? (field._def.innerType as z.ZodTypeAny) : field;
}

/**
 * Parses a stored string against the same schema the environment uses.
 *
 * The row is text, because a key-value table cannot be typed by a column. This
 * is what replaces that typing: a value that reaches a consumer has been through
 * exactly the validation `NUMBER_FORMAT=western` in a `.env` file would have
 * been. Throws on anything else — the caller decides whether that is a refused
 * write or a fallback on read.
 */
export function parseSetting<K extends SettingKey>(key: K, raw: string): SettingValues[K] {
  /* `envSchema` is a ZodObject, so a single key's schema is reachable through
     its shape — no second definition to keep in step with the first. */
  const field = envSchema.shape[key];

  return field.parse(raw) as SettingValues[K];
}

/**
 * How the administrator's screen should render this knob (TAM-135).
 *
 * **Read off the validating schema, never declared beside it.** A setting whose
 * schema is an enum is a dropdown, and the options *are* the enum's members —
 * so the screen cannot offer a value the server would refuse, which is what a
 * hand-written option list eventually does. A numeric schema is a numeric field,
 * so the input that only accepts digits is the same rule that would reject
 * anything else on save.
 *
 * This replaced two free-text boxes the ministry had to know the vocabulary for:
 * `REGISTRATION_MODE` was typed as `restricted` or `admin-only` from memory, and
 * the sync interval accepted letters until the save came back refused.
 */
export function settingEditor(key: SettingKey): { editor: SettingEditor; options: string[] } {
  const field = fieldFor(key);

  if (field instanceof z.ZodEnum) {
    return { editor: 'select', options: [...(field.options as readonly string[])] };
  }

  if (field instanceof z.ZodNumber) {
    return { editor: 'number', options: [] };
  }

  return { editor: 'text', options: [] };
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
