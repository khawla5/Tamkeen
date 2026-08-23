'use client';

import type { ReactNode } from 'react';

import { AppShell } from './app-shell';
import { ADMIN_NAV } from './admin-nav-items';

export interface AdminPageProps {
  title: string;
  /** The single primary action for this page, if any (§3). */
  action?: ReactNode;
  children: ReactNode;
}

/** The frame every super-admin page uses (§4C). */
export function AdminPage({ title, action, children }: AdminPageProps) {
  /* Fixed, like the entity portal's and unlike the learner's: an administrator's
     destinations all exist from the moment the account does. */
  return (
    <AppShell title={title} action={action} items={ADMIN_NAV}>
      {children}
    </AppShell>
  );
}
