'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { useState } from 'react';

import { Logo } from '@/components/brand/logo';
import { MinistryEmblem } from '@/components/brand/ministry-emblem';
import { Button } from '@/components/ui/button';

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
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        {/*
          Not "/" — that path is the authenticated dashboard
          (`app/(portal)/page.tsx`). This page lives at `/landing` precisely
          so the two never collide.
        */}
        {/* Owner before product: the ministry emblem leads, the platform follows. */}
        <div className="flex items-center gap-3">
          <MinistryEmblem height={60} priority />
          <span aria-hidden="true" className="h-10 w-px bg-border" />
          <Link href="/landing" className="flex items-center">
            <Logo height={46} priority />
          </Link>
        </div>

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
