import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { STEADY_STATE_NAV, type NavItem } from './nav-items';
import { SidebarNav } from './sidebar-nav';

export interface AppShellProps {
  /** Page heading — every page has exactly one h1. */
  title: string;
  /** The single primary action for this page, if any (§3). */
  action?: ReactNode;
  items?: readonly NavItem[];
  /** Nav keys carrying an unseen-items indicator (§2). */
  indicators?: readonly string[];
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
      <aside className="bg-navy md:w-64 md:shrink-0">
        <div className="flex items-center gap-2 px-4 py-5">
          <span className="text-base font-semibold text-white">{t('name')}</span>
        </div>

        <nav aria-label={tA11y('primaryNav')} className="px-3 pb-4">
          <div className="hidden md:block">
            <SidebarNav items={items} indicators={indicators} />
          </div>
          <div className="md:hidden">
            <SidebarNav items={items} indicators={indicators} orientation="horizontal" />
          </div>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-6 py-4">
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {action}
        </header>

        <main id="main-content" className="min-w-0 flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
