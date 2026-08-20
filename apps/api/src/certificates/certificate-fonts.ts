import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The Arabic typeface, embedded in the HTML handed to Chromium.
 *
 * **Why the API keeps its own copy of the woff2 files.** D-023 committed them to
 * `apps/web` and loads them with `next/font/local`; neither half of that
 * carries over here. PDFs render inside the API, which has no Next build step,
 * and the API is deployed on its own — a runtime read across into
 * `apps/web/src/fonts` would resolve on a developer's machine and be a missing
 * path in a container. So the files are duplicated (~292 KB) on purpose, and
 * the OFL licence travels with them as it must.
 *
 * **Why embedding rather than a stylesheet link.** D-023's reasons hold exactly:
 * a render must not depend on reaching a third party, and a government system
 * must not disclose its users to one. There is a third reason that applies only
 * here — a container has no Arabic system font at all, so an unembedded face
 * does not fall back gracefully. It falls back to tofu, or worse to a face that
 * draws Arabic without shaping it, which looks like a rendering bug rather than
 * a missing font and would ship a certificate with disconnected letters.
 *
 * The "complete" files carry Arabic *and* Latin per weight, which is what lets
 * the English CV (D-050) and the Western digits of D-018 render in the same
 * typeface instead of falling through to whatever the host happens to have.
 */

export const CERTIFICATE_FONT_FAMILY = 'IBM Plex Sans Arabic';

/** Resolved from `__dirname` so it is correct under both ts-jest and dist. */
const FONT_DIR = join(__dirname, 'assets', 'fonts');

const WEIGHTS = [
  { file: 'IBMPlexSansArabic-Regular.woff2', weight: 400 },
  { file: 'IBMPlexSansArabic-Medium.woff2', weight: 500 },
  { file: 'IBMPlexSansArabic-SemiBold.woff2', weight: 600 },
  { file: 'IBMPlexSansArabic-Bold.woff2', weight: 700 },
] as const;

/* Read once. Re-reading 292 KB and base64-encoding it on every render would be
   pure waste in a job that issues certificates in batches. */
let cached: string | null = null;

export function fontFaceCss(): string {
  if (cached !== null) {
    return cached;
  }

  cached = WEIGHTS.map(({ file, weight }) => {
    const bytes = readFileSync(join(FONT_DIR, file));

    return `@font-face{font-family:'${CERTIFICATE_FONT_FAMILY}';font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${bytes.toString(
      'base64',
    )}) format('woff2');}`;
  }).join('\n');

  return cached;
}

/** Test seam — lets a suite prove the cache is populated rather than assume it. */
export function clearFontCache(): void {
  cached = null;
}
