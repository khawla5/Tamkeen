'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { AppShell, NARROW_MAX_WIDTH, PAGE_MAX_WIDTH } from './app-shell';
import { navForState } from './nav-items';
import { usePortal } from './portal-provider';

/* Re-exported so pages (the path-build counter bar) keep one import site. */
export { PAGE_MAX_WIDTH } from './app-shell';

export interface PortalPageProps {
  title: string;
  /** The single primary action for this page, if any (§3). */
  action?: ReactNode;
  /**
   * Results and path build are not destinations, so they render without the
   * navigation rail — §4 keeps them out of the nav, and they end in a decision
   * that the rail would invite wandering away from. The assessment is the
   * exception (D-094): its audience has a two-item nav (D-071) and a legitimate
   * reason to check their profile, and a session draft means leaving costs
   * nothing — so it keeps the rail.
   */
  chrome?: 'nav' | 'bare';
  /**
   * `narrow` (TAM-124) is for flows that read as a single column by nature —
   * the assessment's one question, the player. Everything else takes the
   * standard width and must not re-wrap itself.
   */
  width?: 'default' | 'narrow';
  children: ReactNode;
}

/** The frame every authenticated page uses, with the nav gated by §4.2. */
export function PortalPage({
  title,
  action,
  chrome = 'nav',
  width = 'default',
  children,
}: PortalPageProps) {
  const { user, dashboard, unreadCertificates } = usePortal();

  if (chrome === 'bare') {
    return (
      <div className="min-h-dvh">
        <header className="border-b border-border bg-card px-6 py-4">
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        </header>
        <main id="main-content" className="p-6">
          <div
            className={cn(
              'mx-auto w-full',
              width === 'narrow' ? NARROW_MAX_WIDTH : PAGE_MAX_WIDTH,
            )}
          >
            {children}
          </div>
        </main>
      </div>
    );
  }

  return (
    <AppShell
      title={title}
      action={action}
      items={navForState(dashboard.state)}
      user={user}
      profileHref="/profile"
      width={width}
      /* §2: the indicator points at exactly one destination. */
      indicators={unreadCertificates > 0 ? ['certificates'] : undefined}
    >
      {children}
    </AppShell>
  );
}
