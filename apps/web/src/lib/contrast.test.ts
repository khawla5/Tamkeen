import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AA_NON_TEXT, AA_NORMAL_TEXT, contrastRatio, parseHex } from './contrast';
import { BRAND } from './tokens';

/**
 * WCAG 2.1 AA is a government obligation, so the palette's accessibility is
 * asserted by computation here rather than trusted to review. Every pairing the
 * design system actually uses is listed; adding a new pairing to the UI without
 * adding it here is the kind of omission a reviewer should catch.
 */

const GLOBALS_CSS = join(import.meta.dirname, '../app/globals.css');

const FUNCTIONAL = {
  danger: '#A32015',
  success: '#1E6F4E',
} as const;

describe('brand palette', () => {
  it('mirrors globals.css exactly, so the tests cannot drift from the runtime', () => {
    const css = readFileSync(GLOBALS_CSS, 'utf8');

    const declared = new Map<string, string>();
    for (const match of css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)) {
      declared.set(match[1]!, match[2]!.toLowerCase());
    }

    const expected: Record<string, string> = {
      navy: BRAND.navy,
      'navy-soft': BRAND.navySoft,
      gold: BRAND.gold,
      'gold-deep': BRAND.goldDeep,
      'gold-light': BRAND.goldLight,
      'gold-pale': BRAND.goldPale,
      sky: BRAND.sky,
      cream: BRAND.cream,
      surface: BRAND.surface,
      muted: BRAND.muted,
      ink: BRAND.ink,
      danger: FUNCTIONAL.danger,
      success: FUNCTIONAL.success,
    };

    for (const [name, hex] of Object.entries(expected)) {
      expect(declared.get(name), `--color-${name} missing or changed in globals.css`).toBe(
        hex.toLowerCase(),
      );
    }
  });

  it('declares exactly the eleven brand colours plus the two functional ones', () => {
    expect(Object.keys(BRAND)).toHaveLength(11);
  });

  it('parses every token as a valid hex colour', () => {
    for (const [name, hex] of Object.entries(BRAND)) {
      expect(() => parseHex(hex), name).not.toThrow();
    }
  });
});

describe('text pairings used by the design system meet AA for body text', () => {
  const bodyPairs: Array<[string, string, string]> = [
    ['navy on white (card text)', BRAND.navy, BRAND.surface],
    ['navy on cream (page text)', BRAND.navy, BRAND.cream],
    ['navy-soft on white', BRAND.navySoft, BRAND.surface],
    ['navy-soft on cream', BRAND.navySoft, BRAND.cream],
    ['muted on white (secondary text)', BRAND.muted, BRAND.surface],
    ['muted on cream (secondary text)', BRAND.muted, BRAND.cream],
    ['white on navy (primary button, sidebar)', BRAND.surface, BRAND.navy],
    ['white on navy-soft (nested surface)', BRAND.surface, BRAND.navySoft],
    ['navy on light gold (achievement fill)', BRAND.navy, BRAND.goldLight],
    ['navy on sky (badges, quiet fills)', BRAND.navy, BRAND.sky],
    ['navy-soft on sky', BRAND.navySoft, BRAND.sky],
    ['gold-deep on white (the hero eyebrow)', BRAND.goldDeep, BRAND.surface],
    ['gold-deep on pale gold (stakeholder eyebrow)', BRAND.goldDeep, BRAND.goldPale],
    ['muted on pale gold (stakeholder captions)', BRAND.muted, BRAND.goldPale],
    ['navy on pale gold (stakeholder headings)', BRAND.navy, BRAND.goldPale],
    ['white on gold-deep (the academic-partner band)', BRAND.surface, BRAND.goldDeep],
    ['white on ink (the closing section)', BRAND.surface, BRAND.ink],
    ['light gold on ink (the closing section accent)', BRAND.goldLight, BRAND.ink],
    ['light gold on navy (footer column headings)', BRAND.goldLight, BRAND.navy],
    ['white on danger (destructive button)', BRAND.surface, FUNCTIONAL.danger],
    ['danger on white (error text)', FUNCTIONAL.danger, BRAND.surface],
    ['danger on cream (error text)', FUNCTIONAL.danger, BRAND.cream],
    ['success on white', FUNCTIONAL.success, BRAND.surface],
    ['success on cream', FUNCTIONAL.success, BRAND.cream],
  ];

  for (const [label, fg, bg] of bodyPairs) {
    it(`${label} clears ${AA_NORMAL_TEXT}:1`, () => {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });
  }
});

describe('gold-deep is the one gold that may carry small text, and only on white', () => {
  /*
   * The palette swap (D-042) brought a darker gold than the old one, and it
   * changes what is possible: the hero eyebrow is now gold *text* rather than a
   * gold rule beside navy text, because this value clears AA on white.
   */
  it('clears AA for body text on white', () => {
    expect(contrastRatio(BRAND.goldDeep, BRAND.surface)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  /*
   * Asserts a failure on purpose. The page background is a tinted blue, not a
   * near-white, and gold-deep does NOT survive it — so this gold belongs on
   * white surfaces and on the hero's near-white legibility wash, never on the
   * page itself. Without this test that distinction is invisible in review.
   */
  it('does NOT clear AA on the page background, which is why it is white-only', () => {
    expect(contrastRatio(BRAND.goldDeep, BRAND.cream)).toBeLessThan(AA_NORMAL_TEXT);
  });
});

describe('gold is constrained to non-text and large-text roles', () => {
  it('gold as a border or focus ring clears the 3:1 non-text threshold', () => {
    expect(contrastRatio(BRAND.gold, BRAND.surface)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(contrastRatio(BRAND.gold, BRAND.cream)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  /*
   * The page background got darker with the palette swap, and gold's margin
   * over it shrank to 3.03:1 — it still clears the non-text threshold, but only
   * just. Darkening --color-cream any further breaks every gold border on the
   * page, and this is the assertion that would say so.
   */
  it('leaves gold almost no margin on the page background — do not darken it', () => {
    expect(contrastRatio(BRAND.gold, BRAND.cream)).toBeLessThan(3.2);
  });

  /*
   * These assert a *failure* on purpose. They document why the design system
   * forbids gold body text and gold fills behind body text. If a future palette
   * tweak makes gold AA-safe for text, these tests fail and the constraint —
   * and the comments in globals.css — should be revisited deliberately.
   */
  it('gold body text on white does NOT meet AA (hence the restriction)', () => {
    expect(contrastRatio(BRAND.gold, BRAND.surface)).toBeLessThan(AA_NORMAL_TEXT);
  });

  it('neither white nor navy body text on a gold fill meets AA', () => {
    expect(contrastRatio(BRAND.surface, BRAND.gold)).toBeLessThan(AA_NORMAL_TEXT);
    expect(contrastRatio(BRAND.navy, BRAND.gold)).toBeLessThan(AA_NORMAL_TEXT);
  });

  it('light gold is a fill only — it is not legible as text on white', () => {
    expect(contrastRatio(BRAND.goldLight, BRAND.surface)).toBeLessThan(AA_NON_TEXT);
  });

  /*
   * The reference pairs white text on its gold as a `--secondary` role. That
   * pairing is 3.74:1 and this codebase does not adopt it; the assertion
   * records why, so nobody re-introduces it from the reference by hand.
   */
  it('white text on gold is not AA — the reference pairing this project declines', () => {
    expect(contrastRatio(BRAND.surface, BRAND.gold)).toBeLessThan(AA_NORMAL_TEXT);
  });
});

describe('contrast maths', () => {
  it('returns 21:1 for black on white and 1:1 for identical colours', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5);
  });

  it('is order-independent', () => {
    expect(contrastRatio(BRAND.navy, BRAND.surface)).toBeCloseTo(
      contrastRatio(BRAND.surface, BRAND.navy),
      10,
    );
  });

  it('expands three-digit hex and rejects nonsense', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 1);
    expect(() => parseHex('teal')).toThrow();
  });
});
