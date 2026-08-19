import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The typeface, embedded rather than referenced.
 *
 * PDFs render in the **API**, which has no `next/font` and no access to the web
 * app's static pipeline, so the mechanism D-023 chose for the browser does not
 * carry over. The rule that does carry over is the reason behind it: a render
 * must never depend on reaching a third party, and a government system must not
 * disclose anything to one. So the woff2 files are read off disk and inlined as
 * base64 `data:` URIs in the HTML handed to Chromium.
 *
 * This is not a nicety. Chromium in a container has no Arabic system font at
 * all: an unembedded face falls back to tofu, or — worse and harder to notice —
 * to a face that draws Arabic without shaping it, producing disconnected
 * letters that look like a rendering bug rather than a missing font.
 *
 * The "complete" IBM Plex Sans Arabic files carry Arabic **and** Latin in one
 * file per weight, which is what makes the English CV (D-050) and the Western
 * digits of D-018 render in the same typeface as the Arabic instead of falling
 * through to whatever the host happens to have.
 */

/** Phase 3 will copy these into the API's own assets; the spike reads them in place. */
const FONT_DIR = join(__dirname, '..', '..', 'apps', 'web', 'src', 'fonts');

export const FONT_FAMILY = 'IBM Plex Sans Arabic';

const WEIGHTS = [
  { file: 'IBMPlexSansArabic-Regular.woff2', weight: 400 },
  { file: 'IBMPlexSansArabic-Medium.woff2', weight: 500 },
  { file: 'IBMPlexSansArabic-SemiBold.woff2', weight: 600 },
  { file: 'IBMPlexSansArabic-Bold.woff2', weight: 700 },
] as const;

export interface EmbeddedFonts {
  css: string;
  totalBytes: number;
}

export function embeddedFontCss(): EmbeddedFonts {
  let totalBytes = 0;

  const faces = WEIGHTS.map(({ file, weight }) => {
    const bytes = readFileSync(join(FONT_DIR, file));
    totalBytes += bytes.byteLength;

    return `@font-face {
  font-family: '${FONT_FAMILY}';
  font-style: normal;
  font-weight: ${weight};
  font-display: block;
  src: url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2');
}`;
  });

  return { css: faces.join('\n'), totalBytes };
}
