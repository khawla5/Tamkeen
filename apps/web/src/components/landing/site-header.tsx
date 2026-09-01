'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { useState } from 'react';

import { BrandCorner } from '@/components/brand/brand-corner';
import { Button } from '@/components/ui/button';
import { TodayDate } from './today-date';

/**
 * Public marketing header — deliberately separate from `AppShell` (§4's
 * six-item portal rail), which requires an authenticated session. This is the
 * only header an unauthenticated visitor ever sees.
 *
 * Two actions only: sign in (existing employees) and create an account
 * (§3 — a single clear primary action, "create account", plus one quiet
 * secondary link). Both auth labels are reused from the `auth` namespace
 * rather than duplicated here, so the header and the auth pages never say
 * something different for the same action.
 */
export function SiteHeader() {
  const tAuth = useTranslations('auth');
  const tA11y = useTranslations('a11y');
  const [open, setOpen] = useState(false);

  return (
    /* Not "/" — that path is the authenticated dashboard
       (`app/(portal)/page.tsx`). This page lives at `/landing` precisely so
       the two never collide. */
    <header className="sticky top-0 z-40 min-h-20 border-b border-border bg-background/95 backdrop-blur">
      {/* Owner lockup, pinned to the page's true top-right corner — the
          same fixed corner every page of the site shares now. */}
      <BrandCorner />

      {/* The date and the sign-in/create-account controls, one fixed group
          at the page's true top-left corner — flush against each other
          (plain flex `gap`), not reserved-apart from a separately fixed
          date the way an earlier version of this had it. Each child still
          carries its own breakpoint (`TodayDate` from `md`, the nav from
          `sm`, the mobile toggle below `sm`), so the group's own visible
          width simply narrows on a smaller screen rather than needing a
          second layout. */}
      <div className="pointer-events-none fixed top-0 end-0 z-50 flex h-20 items-center px-4 sm:px-6">
        <div className="pointer-events-auto flex items-center gap-6">
          <TodayDate />

          {/* Only from `md`, matching `TodayDate`'s own breakpoint — below
              that there is no date on this side to separate from the nav. */}
          <span aria-hidden="true" className="hidden h-6 w-px bg-border md:block" />

          <nav aria-label={tA11y('primaryNav')} className="hidden items-center gap-6 sm:flex">
            <Link
              href="/login"
              className="text-sm font-medium text-foreground hover:text-neutral-700"
            >
              {tAuth('signInLink')}
            </Link>
            <Button asChild size="sm">
              <Link href="/register">{tAuth('registerLink')}</Link>
            </Button>
          </nav>

          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-md text-foreground sm:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? (
              <X aria-hidden="true" className="size-5" />
            ) : (
              <Menu aria-hidden="true" className="size-5" />
            )}
            <span className="sr-only">{tA11y('primaryNav')}</span>
          </button>
        </div>
      </div>

      {/* Reserves the 80px band the two fixed corner groups visually
          occupy, so the mobile panel below opens under them rather than
          behind them. */}
      <div className="h-20" />

      {open && (
        <nav
          id="mobile-nav"
          aria-label={tA11y('primaryNav')}
          className="border-t border-border sm:hidden"
        >
          <div className="flex flex-col gap-3 px-4 py-4">
            <Link
              href="/login"
              className="text-sm font-medium text-foreground"
              onClick={() => setOpen(false)}
            >
              {tAuth('signInLink')}
            </Link>
            <Button asChild size="sm" className="w-full">
              <Link href="/register" onClick={() => setOpen(false)}>
                {tAuth('registerLink')}
              </Link>
            </Button>
          </div>
        </nav>
      )}
    </header>
  );
}
