import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * TAM-124: one content width, owned by `PortalPage` — الرئيسية is the
 * reference. Pages had drifted across 2xl/3xl/4xl/6xl, each floating in its
 * own strip of whitespace. The width now lives in exactly one place, with an
 * explicit `width="narrow"` opt-in for single-column flows; a page declaring
 * its own container is the drift this test exists to stop.
 *
 * The one sanctioned exception is `PAGE_MAX_WIDTH` imported from PortalPage —
 * the path-build page's fixed counter bar sits outside the flow and shares the
 * constant rather than a second literal.
 */
const PORTAL_DIR = join(__dirname, '..', 'app', '(portal)');

function pageFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return pageFiles(path);
    }
    return name.endsWith('.tsx') && !name.includes('.test.') ? [path] : [];
  });
}

describe('the page-width standard (TAM-124)', () => {
  it('no portal page declares its own max-w container', () => {
    const offenders = pageFiles(PORTAL_DIR).filter((file) =>
      /max-w-/.test(readFileSync(file, 'utf-8')),
    );

    expect(offenders).toEqual([]);
  });
});
