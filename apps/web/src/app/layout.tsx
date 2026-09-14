import type { Metadata } from 'next';
import { Suspense } from 'react';
import localFont from 'next/font/local';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';

import { HTML_DIR, HTML_LANG, getFormatContext } from '@/i18n/config';
import { PageWatermark } from '@/components/brand/page-watermark';
import { NavigationProgress } from '@/components/layout/navigation-progress';
import { FormatProvider } from '@/i18n/format-provider';

import './globals.css';

/**
 * Arabic-first is architecture, not styling (D-001): `lang` and `dir` are set on
 * the root element from day one, and the primary typeface is Arabic-designed.
 *
 * The font is self-hosted from `src/fonts` rather than fetched from Google
 * (D-023): the build must not depend on reaching a third party, and employee
 * browsers must not call out to one. These are the "complete" IBM Plex Sans
 * Arabic files, so a single file per weight covers both Arabic glyphs and the
 * Western Arabic numerals that D-018 makes the default.
 */
const arabic = localFont({
  src: [
    { path: '../fonts/IBMPlexSansArabic-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/IBMPlexSansArabic-Medium.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/IBMPlexSansArabic-SemiBold.woff2', weight: '600', style: 'normal' },
    { path: '../fonts/IBMPlexSansArabic-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-arabic',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});

/* Even the document title comes from the catalog — no hardcoded UI strings. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');

  return {
    title: t('name'),
    description: t('description'),
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={HTML_LANG} dir={HTML_DIR} className={arabic.variable}>
      <body className="relative min-h-dvh font-sans antialiased">
        {/* Every screen carries the ministry's mark (auth pages included), not
            just the signed-in app shell — one instance here rather than one
            per layout. */}
        <PageWatermark />
        <NextIntlClientProvider>
          <FormatProvider context={getFormatContext()}>
            {/* useSearchParams inside needs a Suspense boundary or the whole
                tree opts out of static rendering. */}
            <Suspense fallback={null}>
              <NavigationProgress />
            </Suspense>
            {children}
          </FormatProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
