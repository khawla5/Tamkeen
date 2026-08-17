import { describe, expect, it } from 'vitest';

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

describe('Arabic message catalog', () => {
  it('is not empty', () => {
    expect(leaves.length).toBeGreaterThan(0);
  });

  it('has no empty or whitespace-only strings', () => {
    const blank = leaves.filter((leaf) => leaf.value.trim().length === 0);

    expect(blank.map((leaf) => leaf.path)).toEqual([]);
  });

  it('contains no untranslated English copy', () => {
    const withLatin = leaves.filter((leaf) => LATIN_LETTERS.test(withoutPlaceholders(leaf.value)));

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
