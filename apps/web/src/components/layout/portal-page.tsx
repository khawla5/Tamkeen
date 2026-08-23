'use client';

import type { ReactNode } from 'react';

import { AppShell } from './app-shell';
import { navForState } from './nav-items';
import { usePortal } from './portal-provider';

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
  children: ReactNode;
}

/** The frame every authenticated page uses, with the nav gated by §4.2. */
export function PortalPage({ title, action, chrome = 'nav', children }: PortalPageProps) {
  const { user, dashboard, unreadCertificates } = usePortal();

  if (chrome === 'bare') {
    return (
      <div className="min-h-dvh">
        <header className="border-b border-border bg-card px-6 py-4">
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        </header>
        <main id="main-content" className="p-6">
          {children}
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
      /* §2: the indicator points at exactly one destination. */
      indicators={unreadCertificates > 0 ? ['certificates'] : undefined}
    >
      {children}
    </AppShell>
  );
}
