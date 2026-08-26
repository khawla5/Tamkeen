import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AA_NON_TEXT, AA_NORMAL_TEXT, contrastRatio, parseHex } from './contrast';
import { PALETTE } from './tokens';

/**
 * WCAG 2.1 AA is a government obligation, so the palette's accessibility is
 * asserted by computation here rather than trusted to review. Every pairing the
 * design system actually uses is listed; adding a new pairing to the UI without
 * adding it here is the kind of omission a reviewer should catch.
 *
 * The palette is Platforms Code (D-069), without its gold secondary: one accent
 * colour, the primary, carries actions, recommendation and achievement alike.
 * Adopting a national system does not exempt it from measurement.
 */

const GLOBALS_CSS = join(import.meta.dirname, '../app/globals.css');

describe('Platforms Code palette', () => {
  it('mirrors globals.css exactly, so the tests cannot drift from the runtime', () => {
    const css = readFileSync(GLOBALS_CSS, 'utf8');

    const declared = new Map<string, string>();
    for (const match of css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)) {
      declared.set(match[1]!, match[2]!.toLowerCase());
    }

    for (const [name, hex] of Object.entries(PALETTE)) {
      expect(declared.get(name), `--color-${name} missing or changed in globals.css`).toBe(
        hex.toLowerCase(),
      );
    }
  });

  it('no longer declares the retired Tamkeen brand tokens, and no gold at all', () => {
    const css = readFileSync(GLOBALS_CSS, 'utf8');
    expect(css).not.toMatch(/--color-gold/);
    for (const retired of ['navy', 'navy-soft', 'gold-light', 'cream', 'gold-600', 'gold-100']) {
      expect(css, `--color-${retired} should have been removed`).not.toMatch(
        new RegExp(`--color-${retired}:`),
      );
    }
  });

  it('parses every token as a valid hex colour', () => {
    for (const [name, hex] of Object.entries(PALETTE)) {
      expect(() => parseHex(hex), name).not.toThrow();
    }
  });
});

describe('text pairings used by the design system meet AA for body text', () => {
  const bodyPairs: Array<[string, string, string]> = [
    ['display text on white', PALETTE['neutral-800'], PALETTE.surface],
    ['display text on the page ground', PALETTE['neutral-800'], PALETTE['neutral-50']],
    ['paragraph text on white', PALETTE['neutral-700'], PALETTE.surface],
    ['secondary text on white', PALETTE['neutral-500'], PALETTE.surface],
    ['secondary text on the page ground', PALETTE['neutral-500'], PALETTE['neutral-50']],
    ['white on primary (buttons)', PALETTE.surface, PALETTE['primary-600']],
    ['white on primary-700 (hover, nested surfaces)', PALETTE.surface, PALETTE['primary-700']],
    ['primary as link text on white', PALETTE['primary-600'], PALETTE.surface],
    ['white on the dark surface (sidebar, footer)', PALETTE.surface, PALETTE['neutral-900']],
    ['white on the nested dark surface', PALETTE.surface, PALETTE['neutral-800']],
    [
      'primary-800 on the primary-50 tint (recommended badge)',
      PALETTE['primary-800'],
      PALETTE['primary-50'],
    ],
    ['primary-700 as text on white (achievement accents)', PALETTE['primary-700'], PALETTE.surface],
    ['white on primary-900 (pressed button)', PALETTE.surface, PALETTE['primary-900']],
    ['white on primary-deep (hero ground)', PALETTE.surface, PALETTE['primary-deep']],
    [
      'primary-50 body text on primary-deep (hero paragraph)',
      PALETTE['primary-50'],
      PALETTE['primary-deep'],
    ],
    [
      'primary-200 display text on primary-deep (hero title accent)',
      PALETTE['primary-200'],
      PALETTE['primary-deep'],
    ],
    ['white on danger-600 (destructive button default)', PALETTE.surface, PALETTE['danger-600']],
    ['white on danger-900 (destructive button pressed)', PALETTE.surface, PALETTE['danger-900']],
    ['white on danger (destructive button)', PALETTE.surface, PALETTE.danger],
    ['danger on white (error text)', PALETTE.danger, PALETTE.surface],
    ['danger on its fill', PALETTE.danger, PALETTE['danger-50']],
    ['success on white', PALETTE.success, PALETTE.surface],
    ['success on its fill', PALETTE.success, PALETTE['success-50']],
    ['warning on white', PALETTE.warning, PALETTE.surface],
    ['warning on its fill (tag)', PALETTE.warning, PALETTE['warning-50']],
    ['info on white', PALETTE.info, PALETTE.surface],
    ['info on its fill (tag)', PALETTE.info, PALETTE['info-50']],
    ['neutral tag text on neutral-100', PALETTE['neutral-700'], PALETTE['neutral-100']],
    ['table header text on neutral-50', PALETTE['neutral-700'], PALETTE['neutral-50']],
    ['error-state body on the danger fill', PALETTE['neutral-700'], PALETTE['danger-50']],
  ];

  for (const [label, fg, bg] of bodyPairs) {
    it(`${label} clears ${AA_NORMAL_TEXT}:1`, () => {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });
  }
});

describe('non-text pairings meet the 3:1 component threshold', () => {
  it('the recommended border (primary-600) is distinguishable on white and on the page ground', () => {
    expect(contrastRatio(PALETTE['primary-600'], PALETTE.surface)).toBeGreaterThanOrEqual(
      AA_NON_TEXT,
    );
    expect(contrastRatio(PALETTE['primary-600'], PALETTE['neutral-50'])).toBeGreaterThanOrEqual(
      AA_NON_TEXT,
    );
  });

  it('the focus ring (primary) is distinguishable on white', () => {
    expect(contrastRatio(PALETTE['primary-600'], PALETTE.surface)).toBeGreaterThanOrEqual(
      AA_NON_TEXT,
    );
  });

  it('the default border (neutral-300) is a hairline, not a control edge — below 3:1 by design', () => {
    /* Documented, not hidden: neutral-300 is used for card outlines on white,
       which WCAG exempts from 1.4.11 as non-essential decoration. Control
       edges (inputs) use --input, also neutral-300, and rely on the visible
       focus ring and label rather than the border for identification. */
    expect(contrastRatio(PALETTE['neutral-300'], PALETTE.surface)).toBeLessThan(AA_NON_TEXT);
  });
});

describe('contrast maths', () => {
  it('returns 21:1 for black on white and 1:1 for identical colours', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5);
  });

  it('is order-independent', () => {
    expect(contrastRatio(PALETTE['neutral-800'], PALETTE.surface)).toBeCloseTo(
      contrastRatio(PALETTE.surface, PALETTE['neutral-800']),
      10,
    );
  });

  it('expands three-digit hex and rejects nonsense', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 1);
    expect(() => parseHex('teal')).toThrow();
  });
});
