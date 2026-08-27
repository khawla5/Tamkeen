import { describe, expect, it } from 'vitest';

import { AUDIT_TARGET_TYPES, AuditAction, AuditReason, SETTING_KEYS } from '@tamkeen/types';

import messages from '../../messages/ar.json';

/**
 * Guards the Arabic-first rule mechanically. "Arabic is the default and primary
 * language" is easy to state and easy to erode one hardcoded English label at a
 * time; this test fails the build the first time that happens in the catalog.
 */

type Leaf = { path: string; value: string };

function flatten(node: unknown, prefix = ''): Leaf[] {
  if (typeof node === 'string') {
    return [{ path: prefix, value: node }];
  }

  if (node !== null && typeof node === 'object') {
    return Object.entries(node).flatMap(([key, child]) =>
      flatten(child, prefix ? `${prefix}.${key}` : key),
    );
  }

  return [];
}

const leaves = flatten(messages);

/* ICU placeholders such as {count} are Latin by necessity — strip them before
   checking for stray English copy. */
const withoutPlaceholders = (value: string) => value.replace(/\{[^}]*\}/g, '');

const ARABIC_SCRIPT = /[؀-ۿ]/;
const LATIN_LETTERS = /[A-Za-z]/;

/**
 * The places Latin letters and bare digits are correct in Arabic copy.
 *
 * §4C.6's settings screen names *literal configuration values* — the string an
 * administrator must actually type into the field. `REGISTRATION_MODE` accepts
 * `restricted` or `admin-only`; `NUMBER_FORMAT` accepts `western` or `arabic`.
 * Translating those into Arabic would produce a hint that tells the reader to
 * enter something the validator rejects, which is worse than a Latin word in an
 * Arabic sentence.
 *
 * The same goes for the bounds in a validation message: "between 0 and 100" is
 * describing the field's accepted range, not formatting a quantity, so it has no
 * ICU placeholder to come from.
 *
 * §4.12's digits options are the third case, and the clearest: "أرقام عربية
 * (0123)" has to *show* the digits it names, or the choice between the two is
 * meaningless to the person making it. Those digits are specimens, not
 * quantities — there is nothing for the formatting layer to format.
 *
 * Deliberately narrow — three patterns, not a general escape hatch — so the rule
 * still holds everywhere else a learner can see.
 */
const LITERAL_VALUE_PATHS = [
  /^admin\.settingHint\./,
  /^admin\.settingOption\.NUMBER_FORMAT\./,
  /^errors\.SETTING_INVALID_/,
  /^profile\.digits(Western|Arabic)$/,
];

const carriesLiteralValues = (path: string) =>
  LITERAL_VALUE_PATHS.some((pattern) => pattern.test(path));

describe('Arabic message catalog', () => {
  it('is not empty', () => {
    expect(leaves.length).toBeGreaterThan(0);
  });

  it('has no empty or whitespace-only strings', () => {
    const blank = leaves.filter((leaf) => leaf.value.trim().length === 0);

    expect(blank.map((leaf) => leaf.path)).toEqual([]);
  });

  it('contains no untranslated English copy', () => {
    const withLatin = leaves.filter(
      (leaf) =>
        !carriesLiteralValues(leaf.path) && LATIN_LETTERS.test(withoutPlaceholders(leaf.value)),
    );

    expect(withLatin.map((leaf) => `${leaf.path}: ${leaf.value}`)).toEqual([]);
  });

  it('has Arabic script in every string that carries words', () => {
    const wordless = leaves.filter((leaf) => {
      const stripped = withoutPlaceholders(leaf.value);
      /* Values that are pure punctuation or digits (e.g. a range like "5–10")
         legitimately carry no letters. */
      const hasLetters = /\p{L}/u.test(stripped);
      return hasLetters && !ARABIC_SCRIPT.test(stripped);
    });

    expect(wordless.map((leaf) => leaf.path)).toEqual([]);
  });

  it('contains no hardcoded digits — numbers must come from the formatting layer', () => {
    /*
     * Regression guard. The password hint originally read "١٢ حرفًا على الأقل",
     * hardcoding Arabic-Indic digits into a catalog string while D-018 sets
     * Western digits as the default — so the app contradicted its own locale
     * setting, and the digit switch could never reach that number. Digits belong
     * in an ICU placeholder, formatted by the shared layer.
     */
    const withDigits = leaves.filter(
      (leaf) =>
        !carriesLiteralValues(leaf.path) && /[0-9٠-٩]/.test(withoutPlaceholders(leaf.value)),
    );

    expect(withDigits.map((leaf) => `${leaf.path}: ${leaf.value}`)).toEqual([]);
  });

  it('has balanced ICU placeholder braces', () => {
    const unbalanced = leaves.filter((leaf) => {
      const opens = (leaf.value.match(/\{/g) ?? []).length;
      const closes = (leaf.value.match(/\}/g) ?? []).length;
      return opens !== closes;
    });

    expect(unbalanced.map((leaf) => leaf.path)).toEqual([]);
  });

  it('provides the loading, empty and error strings every data view needs (§2B DoD 4)', () => {
    const paths = new Set(leaves.map((leaf) => leaf.path));

    for (const required of [
      'states.loading',
      'states.emptyTitle',
      'states.emptyBody',
      'states.errorTitle',
      'states.errorBody',
      'actions.retry',
    ]) {
      expect(paths, `missing ${required}`).toContain(required);
    }
  });
});

/**
 * Namespaces that are looked up dynamically, and the constant that supplies the
 * keys.
 *
 * These are the ones a component reads with a computed key — `t(`riasec.${letter}`)`,
 * `t(row.action)` — so a missing entry is invisible until the exact row that
 * needs it renders. Everywhere else next-intl fails loudly at the call site.
 */
const DYNAMIC_NAMESPACES = [
  'admin.auditAction',
  'admin.riasec',
  'admin.courseVisibility',
  'admin.versionStatus',
  'admin.setting',
  'admin.settingHint',
  'admin.settingOption.REGISTRATION_MODE',
  'admin.settingOption.NUMBER_FORMAT',
  'admin.auditReason',
  'admin.auditTargetType',
  'admin.auditDetail',
];

function at(path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => {
    if (node !== null && typeof node === 'object') {
      return (node as Record<string, unknown>)[key];
    }
    return undefined;
  }, messages);
}

describe('dynamically-keyed namespaces', () => {
  /*
   * A guard against one specific, real accident: a *label* added at
   * `admin.auditAction` overwrote the auditAction *namespace* with a
   * seven-character string, and `Object.assign` onto a string produced
   * `{ '0': 'ا', '1': 'ل', … }`. Nothing failed to compile, every other test
   * passed, and every action in the audit trail silently rendered as its raw
   * code — which the fallback made look deliberate.
   */
  it.each(DYNAMIC_NAMESPACES)('%s is an object, not a string', (path) => {
    const node = at(path);

    expect(typeof node).toBe('object');
    expect(Array.isArray(node)).toBe(false);
  });

  it.each(DYNAMIC_NAMESPACES)('%s holds only string values', (path) => {
    const node = at(path) as Record<string, unknown>;

    /* Numeric keys are the signature of a spread string, which is exactly the
       shape the accident above produced. */
    expect(Object.keys(node).some((key) => /^\d+$/.test(key))).toBe(false);

    for (const [key, value] of Object.entries(node)) {
      expect(typeof value, `${path}.${key}`).toBe('string');
    }
  });

  /*
   * Read from the shared constants rather than restated here. A code added in a
   * later phase without copy reaches an administrator as a raw
   * `AUTH_PASSWORD_CHANGED`, which the deliberate fallback makes look
   * intentional — the exact failure this file exists to prevent, and one that
   * had actually happened to three actions and to every reason code before the
   * vocabulary was shared (TAM-137).
   */
  describe('the audit vocabulary is fully translated', () => {
    const actions = at('admin.auditAction') as Record<string, string>;
    const reasons = at('admin.auditReason') as Record<string, string>;
    const targets = at('admin.auditTargetType') as Record<string, string>;

    it.each(Object.values(AuditAction))('action %s has Arabic copy', (code) => {
      expect(actions[code], `admin.auditAction.${code}`).toBeTruthy();
    });

    it.each(Object.values(AuditReason))('reason %s has Arabic copy', (code) => {
      expect(reasons[code], `admin.auditReason.${code}`).toBeTruthy();
    });

    it.each(AUDIT_TARGET_TYPES)('target type %s has Arabic copy', (type) => {
      expect(targets[type], `admin.auditTargetType.${type}`).toBeTruthy();
    });

    it('names no action or reason the code cannot emit', () => {
      /* Copy for a code that no longer exists describes an event nobody can
         cause — harmless on screen, but it is how a filter list grows entries
         that never match anything. */
      const emittable = new Set<string>(Object.values(AuditAction));
      const refusable = new Set<string>(Object.values(AuditReason));

      expect(Object.keys(actions).filter((code) => !emittable.has(code))).toEqual([]);
      expect(Object.keys(reasons).filter((code) => !refusable.has(code))).toEqual([]);
    });
  });
});

/**
 * §4C.6's settings screen renders one row per key and looks its copy up by key,
 * so a key with no entry reaches the ministry as the raw
 * `admin.setting.CERT_SIGNATORY_NAME` — which is exactly what the three
 * certificate keys did until TAM-135. Nothing could catch it while the key list
 * lived only in the API; now that `SETTING_KEYS` is shared, the catalogue is
 * asserted against it and the next such key fails CI instead of shipping.
 */
describe('every system setting has readable Arabic copy', () => {
  const labels = at('admin.setting') as Record<string, string>;
  const hints = at('admin.settingHint') as Record<string, string>;

  it.each(SETTING_KEYS)('%s has a label and a hint', (key) => {
    expect(labels[key], `admin.setting.${key}`).toBeTruthy();
    expect(hints[key], `admin.settingHint.${key}`).toBeTruthy();
  });

  it('names no key that is not a setting', () => {
    /* A label left behind after a key is removed is a smaller problem than a
       missing one, but it is still copy describing a control nobody can reach —
       the pass threshold's label outlived its field for exactly one commit. */
    const readOnly = ['PATH_MIN_COURSES', 'PATH_MAX_COURSES'];
    const known = new Set<string>([
      ...SETTING_KEYS,
      ...readOnly,
      'API_RATE_LIMIT_MAX_REQUESTS',
      'API_RATE_LIMIT_WINDOW_SECONDS',
    ]);

    expect(Object.keys(labels).filter((key) => !known.has(key))).toEqual([]);
  });
});
