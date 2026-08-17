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
      'gold-light': BRAND.goldLight,
      cream: BRAND.cream,
      surface: BRAND.surface,
      muted: BRAND.muted,
      danger: FUNCTIONAL.danger,
      success: FUNCTIONAL.success,
    };

    for (const [name, hex] of Object.entries(expected)) {
      expect(declared.get(name), `--color-${name} missing or changed in globals.css`).toBe(
        hex.toLowerCase(),
      );
    }
  });

  it('declares exactly the seven brand colours plus the two functional ones', () => {
    expect(Object.keys(BRAND)).toHaveLength(7);
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

describe('gold is constrained to non-text and large-text roles', () => {
  it('gold as a border or focus ring clears the 3:1 non-text threshold', () => {
    expect(contrastRatio(BRAND.gold, BRAND.surface)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(contrastRatio(BRAND.gold, BRAND.cream)).toBeGreaterThanOrEqual(AA_NON_TEXT);
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
