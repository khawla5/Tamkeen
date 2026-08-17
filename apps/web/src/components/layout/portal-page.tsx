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
   * Flow pages (assessment, results, path build) are not destinations, so they
   * render without the navigation rail — §4 keeps them out of the nav, and
   * showing the rail beside a step-by-step flow invites abandoning it midway.
   */
  chrome?: 'nav' | 'bare';
  children: ReactNode;
}

/** The frame every authenticated page uses, with the nav gated by §4.2. */
export function PortalPage({ title, action, chrome = 'nav', children }: PortalPageProps) {
  const { dashboard } = usePortal();

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
    <AppShell title={title} action={action} items={navForState(dashboard.state)}>
      {children}
    </AppShell>
  );
}
