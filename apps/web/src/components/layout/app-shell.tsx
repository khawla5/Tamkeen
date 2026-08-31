import { useTranslations } from 'next-intl';

import { Logo } from '@/components/brand/logo';
import { MinistryEmblem } from '@/components/brand/ministry-emblem';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

import { STEADY_STATE_NAV, type NavItem } from './nav-items';
import { SidebarNav } from './sidebar-nav';
import { UserMenu } from './user-menu';

/**
 * The one content width (TAM-124): الرئيسية is the reference, and every page
 * inherits it from the frame rather than declaring its own. The fixed counter
 * bar on the path-build page sits outside the flow and cannot inherit the
 * wrapper, so it shares this constant instead of a second literal.
 */
export const PAGE_MAX_WIDTH = 'max-w-6xl';

/** The explicit opt-in for genuinely narrow flows — a form, a question. */
export const NARROW_MAX_WIDTH = 'max-w-2xl';

export interface AppShellProps {
  /** Page heading — every page has exactly one h1. */
  title: string;
  /** The single primary action for this page, if any (§3). */
  action?: ReactNode;
  items?: readonly NavItem[];
  /** Nav keys carrying an unseen-items indicator (§2). */
  indicators?: readonly string[];
  /** Who is signed in — named in the sidebar footer; acts through the header's user menu (TAM-112, D-096). */
  user?: { fullName: string; department?: string; employeeId?: string };
  /** The role's own profile route for the user menu; omit where none exists. */
  profileHref?: string;
  /** TAM-124: `narrow` for single-column flows; everything else takes the standard width. */
  width?: 'default' | 'narrow';
  children: ReactNode;
}

/**
 * The application frame, on Platforms Code (TAM-117): a top header bar naming
 * the owner (the same lockup as the landing and auth headers) and carrying the
 * signed-in identity, a light navigation rail with the primary as the active
 * indicator, the page header inside the content column, and the slim footer
 * strip the auth pages already wear. One shell serves all three portals — the
 * entity and admin frames are configurations of it, not copies.
 *
 * RTL correctness comes from the document `dir="rtl"` plus logical properties
 * throughout — no `left`/`right` anywhere. In RTL a flex row lays its first
 * child out on the right, so the rail sits on the reading-start edge without
 * any direction-specific CSS.
 */
export function AppShell({
  title,
  action,
  items = STEADY_STATE_NAV,
  indicators,
  user,
  profileHref,
  width = 'default',
  children,
}: AppShellProps) {
  const t = useTranslations('app');
  const tA11y = useTranslations('a11y');
  const tLanding = useTranslations('landing');

  return (
    <div className="relative flex min-h-dvh flex-col">
      {/*
        First focusable element on the page — WCAG 2.4.1 bypass blocks.
        `start-3` (logical) rather than `left-3`, anchored to the relative
        wrapper so it lands predictably on the reading-start edge in RTL.
      */}
      <a
        href="#main-content"
        data-print="chrome"
        className="sr-only-focusable absolute top-3 start-3 z-50 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        {tA11y('skipToContent')}
      </a>

      {/* The owner's bar: lockup on the start edge, the signed-in identity on
          the end — the same frame the landing and auth pages establish. */}
      <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
        <span className="inline-flex items-center gap-2">
          <MinistryEmblem height={36} />
          <span aria-hidden="true" className="h-7 w-px bg-border" />
          <Logo height={30} />
          <span className="sr-only">{t('name')}</span>
        </span>

        {user ? (
          /* Marked as chrome for print (TAM-149): a printed sheet keeps the
             owner's lockup and the classification, but the signed-in identity
             and the way out of the app are not part of the record. */
          <span data-print="chrome" className="flex items-center gap-3">
            {user.department && user.employeeId ? (
              /* The identity line, in the chrome rather than on a page (D-096). */
              <p className="hidden text-sm text-muted-foreground md:block">
                {user.department}
                <span aria-hidden="true"> · </span>
                {t('employeeIdLabel')}{' '}
                <span dir="ltr" className="font-medium text-foreground">
                  {user.employeeId}
                </span>
              </p>
            ) : null}
            <UserMenu user={user} profileHref={profileHref} />
          </span>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Light navigation rail (TAM-117): Platforms Code applications use a
            light nav with the primary as the active indicator — the dark
            neutral-900 rail was the last of the old brand. */}
        <aside
          data-print="chrome"
          className="flex flex-col border-b border-border bg-card md:w-64 md:shrink-0 md:border-b-0 md:border-e"
        >
          <nav aria-label={tA11y('primaryNav')} className="p-3">
            <div className="hidden md:block">
              <SidebarNav items={items} indicators={indicators} />
            </div>
            <div className="md:hidden">
              <SidebarNav items={items} indicators={indicators} orientation="horizontal" />
            </div>
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <main id="main-content" className="min-w-0 flex-1 p-6">
            <div
              className={cn(
                'mx-auto flex w-full flex-col gap-6',
                width === 'narrow' ? NARROW_MAX_WIDTH : PAGE_MAX_WIDTH,
              )}
            >
              {/* The page header, aligned with the content it heads (§3: at
                  most one primary action beside the title). */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-xl font-semibold text-foreground">{title}</h1>
                {action}
              </div>

              {children}
            </div>
          </main>

          {/* The slim strip every government page ends on — same content as
              the auth footer. */}
          <footer className="border-t border-border bg-card px-4 py-3 sm:px-6">
            <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>
                {t('ministry')} · {tLanding('footerDirectorate')}
              </span>
              <span>{tLanding('footerClassification')}</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
