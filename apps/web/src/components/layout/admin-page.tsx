'use client';

import type { ReactNode } from 'react';

import { AppShell } from './app-shell';
import { ADMIN_NAV } from './admin-nav-items';
import { useAdmin } from './admin-provider';

export interface AdminPageProps {
  title: string;
  /** The single primary action for this page, if any (§3). */
  action?: ReactNode;
  children: ReactNode;
}

/** The frame every super-admin page uses (§4C). */
export function AdminPage({ title, action, children }: AdminPageProps) {
  const { user } = useAdmin();

  /* Fixed, like the entity portal's and unlike the learner's: an administrator's
     destinations all exist from the moment the account does. `user` gives the
     admin the same exit every role has — the header's user menu (D-096). */
  return (
    <AppShell title={title} action={action} items={ADMIN_NAV} user={user}>
      {children}
    </AppShell>
  );
}
