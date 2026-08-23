import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SAUDI_REGIONS } from './saudi-map-paths';
import { SaudiMap } from './saudi-map';

describe('SaudiMap', () => {
  it('draws all thirteen regions and is hidden from assistive technology (decorative)', () => {
    const { container } = render(<SaudiMap />);

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg?.querySelectorAll('path[data-region]')).toHaveLength(13);
    expect(SAUDI_REGIONS).toHaveLength(13);
  });

  it('staggers the reveal so regions appear in sequence, not all at once', () => {
    const { container } = render(<SaudiMap />);

    const delays = [...container.querySelectorAll('g.map-region')].map(
      (g) => (g as HTMLElement).style.animationDelay,
    );
    expect(new Set(delays).size).toBe(13);
  });

  it('names every region in Arabic at its label anchor', () => {
    const { container } = render(<SaudiMap />);

    const labels = [...container.querySelectorAll('text')].map((t) => t.textContent);
    expect(labels).toHaveLength(13);
    expect(labels).toContain('الرياض');
    expect(labels).toContain('المنطقة الشرقية');
    for (const label of labels) expect(label).toMatch(/^[؀-ۿ\s]+$/);
  });

  it('uses only the primary palette — no hardcoded hex, no gold', () => {
    const { container } = render(<SaudiMap />);

    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{6}/i);
    expect(container.innerHTML).not.toMatch(/gold/i);
  });

  it('hover never touches the region fill, so the drift animation keeps running under the pointer', () => {
    /*
     * The drift keyframe animates the group's `fill`. Setting `fill` on hover
     * (on the group or the path) replaces the animated value and freezes the
     * drift for that region; the hover must use transform/stroke/filter only.
     */
    const css = readFileSync(join(import.meta.dirname, '../../app/globals.css'), 'utf8');
    const hoverPath = css.match(/\.map-region:hover path\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(hoverPath).toMatch(/transform:/);
    expect(hoverPath).not.toMatch(/(^|[^-])fill:/);
    expect(css).not.toMatch(/\.map-region:hover\s*\{/);
    expect(css).toMatch(/\.map-region:hover text\s*\{[^}]*fill:/);
  });
});
