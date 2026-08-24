import { useTranslations } from 'next-intl';

import { Logo } from '@/components/brand/logo';
import { MinistryEmblem } from '@/components/brand/ministry-emblem';
import type { ReactNode } from 'react';

import { STEADY_STATE_NAV, type NavItem } from './nav-items';
import { SidebarNav } from './sidebar-nav';
import { UserMenu } from './user-menu';

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
  children: ReactNode;
}

/**
 * The application frame: navigation rail, page header, content region.
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
  children,
}: AppShellProps) {
  const t = useTranslations('app');
  const tA11y = useTranslations('a11y');

  return (
    <div className="relative flex min-h-dvh flex-col md:flex-row">
      {/*
        First focusable element on the page — WCAG 2.4.1 bypass blocks.
        `start-3` (logical) rather than `left-3`, and anchored to the relative
        wrapper above so it lands predictably on the reading-start edge in RTL.
      */}
      <a
        href="#main-content"
        className="sr-only-focusable absolute top-3 start-3 z-50 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        {tA11y('skipToContent')}
      </a>

      {/* Navigation rail: vertical from md up, horizontal strip below. */}
      <aside className="flex flex-col bg-neutral-900 md:w-64 md:shrink-0">
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="inline-flex items-center gap-2 rounded-lg bg-surface px-2 py-1">
            <MinistryEmblem height={32} />
            <span aria-hidden="true" className="h-6 w-px bg-border" />
            <Logo height={28} />
          </span>
          <span className="sr-only">{t('name')}</span>
        </div>

        <nav aria-label={tA11y('primaryNav')} className="px-3 pb-4">
          <div className="hidden md:block">
            <SidebarNav items={items} indicators={indicators} />
          </div>
          <div className="md:hidden">
            <SidebarNav items={items} indicators={indicators} orientation="horizontal" />
          </div>
        </nav>

        {user ? (
          /* The footer names who is signed in and nothing more — the action
             lives in the header's user menu (D-096), so there is exactly one
             sign-out. Outside the navigation landmark so a screen reader does
             not announce it as a destination. */
          <div className="mt-auto border-t border-surface/10 px-4 py-3">
            <span className="block truncate text-sm text-surface/85">{user.fullName}</span>
          </div>
        ) : null}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-6 py-3">
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <div className="flex items-center gap-3">
            {action}
            {user?.department && user.employeeId ? (
              /* The identity line, in the chrome rather than on a page (D-096):
                 department and employee number, on every screen. The name is
                 in the sidebar footer and the menu; repeating it here would be
                 the redundancy §3 forbids. */
              <p className="hidden text-sm text-muted-foreground md:block">
                {user.department}
                <span aria-hidden="true"> · </span>
                {t('employeeIdLabel')}{' '}
                <span dir="ltr" className="font-medium text-foreground">
                  {user.employeeId}
                </span>
              </p>
            ) : null}
            {user ? <UserMenu user={user} profileHref={profileHref} /> : null}
          </div>
        </header>

        <main id="main-content" className="min-w-0 flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
