/**
 * WCAG 2.1 relative-luminance and contrast-ratio maths.
 *
 * Exists so the brand palette's accessibility is a *computed, tested* property
 * rather than an assumption. WCAG 2.1 AA is a government obligation (§2B DoD 5),
 * and the failure mode it guards against is subtle: gold on white looks fine to
 * a designer and still fails for body text.
 *
 * Thresholds (WCAG 1.4.3 / 1.4.11):
 *   4.5:1  normal body text
 *   3.0:1  large text (>= 18.66px bold, or >= 24px)
 *   3.0:1  non-text UI components: borders, focus indicators, icons
 */

export const AA_NORMAL_TEXT = 4.5;
export const AA_LARGE_TEXT = 3;
export const AA_NON_TEXT = 3;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function parseHex(hex: string): Rgb {
  const cleaned = hex.trim().replace(/^#/, '');

  const expanded =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((char) => char + char)
          .join('')
      : cleaned;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    throw new Error(`Not a hex colour: ${hex}`);
  }

  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
}

/** WCAG relative luminance. */
export function relativeLuminance(color: Rgb | string): number {
  const { r, g, b } = typeof color === 'string' ? parseHex(color) : color;

  const channel = (value: number): number => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two colours, 1..21. Order-independent. */
export function contrastRatio(a: Rgb | string, b: Rgb | string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);

  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsAA(
  foreground: Rgb | string,
  background: Rgb | string,
  level: 'normal' | 'large' | 'non-text' = 'normal',
): boolean {
  const required =
    level === 'normal' ? AA_NORMAL_TEXT : level === 'large' ? AA_LARGE_TEXT : AA_NON_TEXT;

  return contrastRatio(foreground, background) >= required;
}
