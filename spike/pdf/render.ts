import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import puppeteer, { type Browser } from 'puppeteer';
import QRCode from 'qrcode';

import { embeddedFontCss } from './fonts';
import {
  VERIFICATION_URL_FOR_SPIKE,
  arabicShapingSample,
  certificateSample,
  englishCvSample,
  mixedScriptSample,
} from './samples';

/**
 * Renders the four spike documents to PDF through headless Chromium (D-013).
 *
 * Two things here are load-bearing for Phase 3 and are the reason this is a
 * spike rather than a first draft of the real renderer:
 *
 *   1. **`document.fonts.ready`.** `page.pdf()` does not wait for webfonts.
 *      Without this await the render is a race: usually correct on a warm
 *      machine, and silently fallback-shaped on a slow one. A certificate that
 *      is wrong one time in fifty is worse than one that is always wrong.
 *   2. **Font embedding is verified, not assumed.** Every produced PDF is
 *      scanned for an embedded IBM Plex Sans Arabic subset. A PDF that renders
 *      correctly on this machine but carries no font would look right here and
 *      like tofu on the ministry's viewer.
 */

const OUT_DIR = process.env.PDF_SPIKE_OUT ?? join(tmpdir(), 'tamkeen-pdf-spike');

/* Shaped exactly like the real thing will be: 32 CSPRNG bytes, base64url
   (common/secure-token.ts `generateToken`). Fixed here so the QR is stable. */
const VERIFICATION_ID = 'k7Qz2Xr9TfLmA4vN8bYcJ1sWdEpHgU6oRt3iZnQxKvM';

interface Sample {
  name: string;
  html: string;
  landscape: boolean;
}

async function renderPdf(browser: Browser, sample: Sample): Promise<Buffer> {
  const page = await browser.newPage();

  try {
    await page.setContent(sample.html, { waitUntil: 'load' });

    /* The whole reason the spike exists. See the class comment. */
    await page.evaluateHandle('document.fonts.ready');

    const bytes = await page.pdf({
      printBackground: true,
      /* The samples declare their own @page size; honouring it keeps the
         certificate's mm-based layout exact instead of re-fitting it. */
      preferCSSPageSize: true,
      landscape: sample.landscape,
    });

    return Buffer.from(bytes);
  } finally {
    await page.close();
  }
}

/** Is an IBM Plex Sans Arabic subset actually embedded in these bytes? */
function fontReport(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  const names = new Set(
    [...raw.matchAll(/\/BaseFont\s*\/([A-Za-z0-9+\-_]+)/g)].map((match) => match[1] ?? ''),
  );
  const embedded = /\/FontFile[23]?\s/.test(raw);
  const plex = [...names].filter((name) => /Plex/i.test(name));

  return `${embedded ? 'embedded' : 'NOT EMBEDDED'} · ${
    plex.length > 0 ? plex.join(', ') : [...names].join(', ') || 'no /BaseFont found'
  }`;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const verificationUrl = VERIFICATION_URL_FOR_SPIKE(VERIFICATION_ID);

  /* SVG rather than a PNG data URI: the QR is vector in the PDF, so it stays
     crisp at any print size and scans off paper as well as off a screen. */
  const qrSvg = await QRCode.toString(verificationUrl, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#222E42', light: '#FFFFFF' },
  });

  const samples: Sample[] = [
    { name: 'a-arabic-shaping', html: arabicShapingSample(), landscape: false },
    { name: 'b-mixed-script', html: mixedScriptSample(), landscape: false },
    { name: 'c-english-cv', html: englishCvSample(), landscape: false },
    {
      name: 'd-certificate-qr',
      html: certificateSample({ qrSvg, verificationId: VERIFICATION_ID, verificationUrl }),
      landscape: true,
    },
  ];

  const fonts = embeddedFontCss();
  console.log(`Fonts inlined: ${(fonts.totalBytes / 1024).toFixed(0)} KB across 4 weights`);
  console.log(`QR encodes:    ${verificationUrl}`);
  console.log(`Output:        ${OUT_DIR}\n`);

  const browser = await puppeteer.launch({
    /* Same flags a container needs, so the spike proves the deployed shape. */
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });

  try {
    console.log(`Chromium:      ${await browser.version()}\n`);

    for (const sample of samples) {
      const pdf = await renderPdf(browser, sample);
      const path = join(OUT_DIR, `${sample.name}.pdf`);
      writeFileSync(path, pdf);

      /* Also keep the HTML: when a PDF looks wrong, the first question is
         always whether the browser or the PDF stage broke it. */
      writeFileSync(join(OUT_DIR, `${sample.name}.html`), sample.html, 'utf8');

      console.log(
        `${sample.name.padEnd(20)} ${(pdf.byteLength / 1024).toFixed(0).padStart(5)} KB  ` +
          `fonts: ${fontReport(readFileSync(path))}`,
      );
    }
  } finally {
    await browser.close();
  }

  console.log('\nRendered. Rasterise with spike/pdf/rasterize.py to inspect visually.');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
