import type { Metadata } from 'next';
import localFont from 'next/font/local';

import { DEFAULT_LOCALE } from '@tamkeen/types';

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

export const metadata: Metadata = {
  title: 'منصة التدريب والتطوير المهني',
  description: 'منصة داخلية للتدريب وتطوير المسار المهني لموظفي الوزارة',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={DEFAULT_LOCALE} dir="rtl" className={arabic.variable}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
