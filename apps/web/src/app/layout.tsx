import type { Metadata } from 'next';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';

import { DEFAULT_LOCALE } from '@tamkeen/types';

import './globals.css';

/**
 * Arabic-first is architecture, not styling (D-001): `lang` and `dir` are set on
 * the root element from day one, and the primary typeface is Arabic-designed.
 */
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'swap',
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
