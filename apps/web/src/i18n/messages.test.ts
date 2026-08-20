import { describe, expect, it } from 'vitest';

import english from '../../messages/en.json';
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
 * The only Arabic strings allowed to carry Latin letters, listed by exact path.
 *
 * The advisor is a product name, and the brand writes it glossed in both
 * scripts — "قايد ⁨(Guide)⁩" — so the Latin here is a proper noun, not copy
 * somebody forgot to translate. That is the distinction the guard below exists
 * to police, and an allowlist keyed by path keeps it policing everything else:
 * a new English sentence anywhere in the catalog still fails, and adding one
 * more exception means writing one more line here on purpose.
 *
 * The gloss is wrapped in U+2068/U+2069 (first-strong isolate). Those are not
 * decoration — without them the bidi algorithm is free to drag the parenthesis
 * to the wrong side of the Arabic around it. Do not strip them.
 */
const LATIN_PROPER_NOUNS = new Set([
  'landing.featuresBody',
  'landing.solution2',
  'landing.journey1Step5',
]);

describe('Arabic message catalog', () => {
  /* Guards the allowlist itself: an entry that stops carrying Latin is an entry
     that should be deleted, or the exception quietly stops meaning anything. */
  it('keeps every allowlisted proper-noun path actually carrying Latin', () => {
    for (const path of LATIN_PROPER_NOUNS) {
      const leaf = leaves.find((candidate) => candidate.path === path);

      expect(leaf, `${path} is allowlisted but missing from the catalog`).toBeDefined();
      expect(LATIN_LETTERS.test(leaf!.value), `${path} no longer needs its exception`).toBe(true);
    }
  });

  it('is not empty', () => {
    expect(leaves.length).toBeGreaterThan(0);
  });

  it('has no empty or whitespace-only strings', () => {
    const blank = leaves.filter((leaf) => leaf.value.trim().length === 0);

    expect(blank.map((leaf) => leaf.path)).toEqual([]);
  });

  it('contains no untranslated English copy', () => {
    const withLatin = leaves
      .filter((leaf) => !LATIN_PROPER_NOUNS.has(leaf.path))
      .filter((leaf) => LATIN_LETTERS.test(withoutPlaceholders(leaf.value)));

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
    const withDigits = leaves.filter((leaf) => /[0-9٠-٩]/.test(withoutPlaceholders(leaf.value)));

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
 * The English catalog exists so the language switch has somewhere to switch to
 * (D-041). Two catalogs drift the moment one is edited alone, and the failure
 * is invisible in review: next-intl renders a missing key as the key itself, so
 * an English page quietly shows "landing.gap3Body" where a sentence should be.
 * These are the assertions that make that a build failure instead.
 */
describe('English catalog', () => {
  const englishLeaves = flatten(english);
  const arabicPaths = new Set(leaves.map((leaf) => leaf.path));
  const englishPaths = new Set(englishLeaves.map((leaf) => leaf.path));

  it('covers exactly the same keys as the Arabic catalog', () => {
    const missing = [...arabicPaths].filter((path) => !englishPaths.has(path));
    const extra = [...englishPaths].filter((path) => !arabicPaths.has(path));

    expect(missing, 'untranslated keys').toEqual([]);
    expect(extra, 'keys with no Arabic original').toEqual([]);
  });

  it('has no empty or whitespace-only strings', () => {
    const blank = englishLeaves.filter((leaf) => leaf.value.trim().length === 0);

    expect(blank.map((leaf) => leaf.path)).toEqual([]);
  });

  /*
   * A dropped placeholder is the expensive kind of translation bug: the
   * sentence still reads fine, so nobody notices that the count, the name or
   * the range it was supposed to carry is simply gone from the English page.
   */
  it('carries the same ICU placeholders in every message', () => {
    const placeholders = (value: string) =>
      [...value.matchAll(/\{([^}]*)\}/g)].map((match) => match[1]!.trim()).sort();

    const englishByPath = new Map(englishLeaves.map((leaf) => [leaf.path, leaf.value]));
    const mismatched = leaves
      .filter((leaf) => englishByPath.has(leaf.path))
      .filter(
        (leaf) =>
          placeholders(leaf.value).join() !== placeholders(englishByPath.get(leaf.path)!).join(),
      );

    expect(mismatched.map((leaf) => leaf.path)).toEqual([]);
  });

  /* The mirror of the Arabic-script guard above: an Arabic string left in the
     English catalog is a translation that was never done. */
  it('contains no leftover Arabic script', () => {
    const untranslated = englishLeaves.filter((leaf) => ARABIC_SCRIPT.test(leaf.value));

    expect(untranslated.map((leaf) => leaf.path)).toEqual([]);
  });

  it('contains no hardcoded digits either — numbers come from the formatting layer', () => {
    const withDigits = englishLeaves.filter((leaf) =>
      /[0-9٠-٩]/.test(withoutPlaceholders(leaf.value)),
    );

    expect(withDigits.map((leaf) => `${leaf.path}: ${leaf.value}`)).toEqual([]);
  });
});
