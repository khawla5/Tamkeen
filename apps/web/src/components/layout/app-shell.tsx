import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Logo } from '@/components/brand/logo';
import { MinistryEmblem } from '@/components/brand/ministry-emblem';
import { Button } from '@/components/ui/button';
import { useSignOut } from '@/lib/use-sign-out';
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
  /** Who is signed in — named in the sidebar footer beside the way out (TAM-112). */
  user?: { fullName: string };
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
  children,
}: AppShellProps) {
  const t = useTranslations('app');
  const tA11y = useTranslations('a11y');
  const tProfile = useTranslations('profile');
  const { signOut, isPending } = useSignOut();

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
          /* The footer, not a seventh nav item: who is signed in and the way
             out, reachable from every page. Outside the navigation landmark so
             a screen reader does not announce it as a destination. */
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-surface/10 px-4 py-3">
            <span className="truncate text-sm text-surface/85">{user.fullName}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => void signOut()}
              className="shrink-0 text-surface/85 hover:bg-surface/10 hover:text-surface"
            >
              <LogOut aria-hidden="true" />
              {isPending ? tProfile('signingOut') : tProfile('signOut')}
            </Button>
          </div>
        ) : null}
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
