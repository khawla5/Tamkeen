import { ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { BrandCorner } from '@/components/brand/brand-corner';

/*
 * The frame every authentication page sits in, shaped the way a government
 * sign-in page is shaped (Absher, Nafath, the DGA's own examples): a slim
 * header naming the owner, one centred card with the ministry emblem over the
 * form, a footer strip — and nothing else competing with the page's single
 * action. §4.1's "single-column, centred" holds; Platforms Code supplies the
 * tokens (D-069).
 *
 * The background is a quiet geometric lattice drawn in the lightest primary
 * tint — decoration, `aria-hidden`, and below the AA threshold on purpose so
 * it never reads as content.
 */

function Lattice() {
  return (
    <svg aria-hidden="true" className="absolute inset-0 size-full text-primary-100" fill="none">
      <defs>
        <pattern id="auth-lattice" width="64" height="64" patternUnits="userSpaceOnUse">
          <path d="M32 2 62 32 32 62 2 32Z" stroke="currentColor" strokeWidth="1.25" />
          <circle cx="32" cy="32" r="2.5" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#auth-lattice)" />
    </svg>
  );
}

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = useTranslations('app');
  const tLanding = useTranslations('landing');
  const tAuth = useTranslations('auth');

  return (
    <div className="relative flex min-h-dvh flex-col">
      {/* No background colour here: `body` already paints it, and painting it
          again here would sit in front of the page-wide watermark and hide it
          completely. */}
      <Lattice />

      <header className="relative border-b border-border bg-surface/90 backdrop-blur">
        {/* Owner lockup, pinned to the page's true top-right corner rather
            than laid out in this row — the same fixed corner every page of
            the site shares now. Nested inside `<header>` rather than beside
            it: `position: fixed` places it the same either way, and this
            keeps the ministry's name inside the page's one banner landmark,
            where assistive tech expects to find it. */}
        <BrandCorner />

        <div className="mx-auto flex h-20 max-w-6xl items-center px-4 sm:px-6">
          {/* The visible exit. The wordmark in the corner links home too,
              but a convention is not a signpost. The arrow points toward the
              end edge — where the link sits and where the page leads away
              to. */}
          <Link
            href="/landing"
            aria-label={tAuth('backToLanding')}
            className="ms-auto flex items-center gap-1.5 text-sm font-medium text-primary-700 underline-offset-4 hover:underline"
          >
            {/* On a phone the label would wrap into the logo. The arrow
                carries the link, the aria-label carries the name. */}
            <span className="hidden sm:inline">{tAuth('backToLanding')}</span>
            <ArrowLeft aria-hidden="true" className="size-5 sm:size-4" />
          </Link>
        </div>
      </header>

      <main className="relative flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md animate-in fade-in duration-200 motion-reduce:animate-none">
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
            <div className="flex flex-col items-center text-center">
              {/* Decorative here: the header already names the ministry, and
                  the h1 below names the page — a second accessible name would
                  be announced twice. */}
              <Image
                src="/brand/MOI.svg"
                alt=""
                width={88}
                height={88}
                priority
                unoptimized
                className="size-22"
              />
              {/* Exactly one h1: it names the page's purpose. */}
              <h1 className="mt-5 text-2xl font-bold text-foreground">{title}</h1>
              {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
            </div>

            <div className="mt-6 flex flex-col gap-4">{children}</div>

            {footer ? (
              <div className="mt-6 border-t border-border pt-4 text-center text-sm text-muted-foreground">
                {footer}
              </div>
            ) : null}
          </div>
        </div>
      </main>

      <footer className="relative border-t border-border bg-surface/90">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>
            {t('ministry')} · {tLanding('footerDirectorate')}
          </span>
          <span>{tLanding('footerClassification')}</span>
        </div>
      </footer>
    </div>
  );
}
