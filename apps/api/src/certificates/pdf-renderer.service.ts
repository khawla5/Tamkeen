import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Browser } from 'puppeteer';

/**
 * HTML → PDF through headless Chromium (D-013), shared by certificates and the
 * CV.
 *
 * Chosen over a PDF library because Arabic needs *shaping*, not just glyphs:
 * every letter takes a different form by position and lam-alef is a mandatory
 * ligature. A browser already does that correctly, and reimplementing it is not
 * a thing to attempt for a government credential. The spike on
 * `phase-3-arabic-pdf-spike` proved the four cases this has to survive before
 * anything was built on top.
 *
 * The browser is launched **once and reused**. A launch costs the better part of
 * a second, and the completion sync issues certificates in batches; paying that
 * per certificate would make a slow job much slower for nothing.
 */
@Injectable()
export class PdfRendererService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfRendererService.name);
  private browser: Browser | null = null;
  /** Concurrent first calls must not each launch a browser. */
  private launching: Promise<Browser> | null = null;

  async render(html: string, options: { landscape: boolean }): Promise<Buffer> {
    const browser = await this.browserInstance();
    const page = await browser.newPage();

    try {
      await page.setContent(html, { waitUntil: 'load' });

      /* `page.pdf()` does not wait for webfonts. Without this the render is a
         race — usually correct on a warm machine, and silently fallback-shaped
         on a slow one. A certificate that is wrong one time in fifty is worse
         than one that is always wrong, because nobody finds it. */
      await page.evaluateHandle('document.fonts.ready');

      const bytes = await page.pdf({
        printBackground: true,
        /* The templates declare their own @page size in mm; honouring it keeps
           the layout exact rather than re-fitting it to a named format. */
        preferCSSPageSize: true,
        landscape: options.landscape,
      });

      return Buffer.from(bytes);
    } finally {
      await page.close();
    }
  }

  private async browserInstance(): Promise<Browser> {
    if (this.browser !== null && this.browser.connected) {
      return this.browser;
    }

    /* Reachable when Chromium has crashed or been killed underneath us. Dropping
       the handle and relaunching turns a permanent failure into one bad render. */
    if (this.browser !== null) {
      this.logger.warn('Chromium is no longer connected — relaunching');
      this.browser = null;
    }

    this.launching ??= loadPuppeteer()
      .then((puppeteer) =>
        puppeteer.launch({
          args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
        }),
      )
      .then((browser) => {
        this.browser = browser;
        this.launching = null;
        return browser;
      })
      .catch((error: unknown) => {
        this.launching = null;
        throw error;
      });

    return this.launching;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.browser !== null) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

/**
 * Loads Puppeteer at first use rather than at module load.
 *
 * Puppeteer 25 ships **ESM only** while the API compiles to CommonJS, so the
 * import is deliberately deferred to the one place that needs it. Two things
 * fall out, and both are the point:
 *
 *   - **Unit tests stop dragging in Chromium.** A static import made every
 *     suite that transitively reached `CompletionSyncService` parse an ESM
 *     bundle under Jest's CommonJS runtime and fail on `export *`. Nothing in a
 *     unit test renders a PDF, so nothing in a unit test should be loading a
 *     browser automation library.
 *   - **The cost is paid once, when a certificate is first issued**, instead of
 *     on every API boot including the ones that never render anything.
 *
 * At runtime this compiles to a lazy `require`, which needs Node's `require(esm)`
 * support — hence the Node 24 pin in `.nvmrc`.
 */
async function loadPuppeteer(): Promise<typeof import('puppeteer').default> {
  const loaded = await import('puppeteer');

  /* Interop: `require(esm)` yields the namespace, and which of the two shapes
     arrives depends on how the module was loaded. Both are valid here. */
  return loaded.default ?? (loaded as unknown as typeof import('puppeteer').default);
}
