'use client';

import type { ReactNode } from 'react';

import { AppShell } from './app-shell';
import { useEntity } from './entity-provider';
import { ENTITY_NAV } from './entity-nav-items';

export interface EntityPageProps {
  title: string;
  /** The single primary action for this page, if any (§3). */
  action?: ReactNode;
  children: ReactNode;
}

/** The frame every entity-portal page uses (§4B). */
export function EntityPage({ title, action, children }: EntityPageProps) {
  const { user } = useEntity();
  /*
   * The nav is fixed rather than derived from state, unlike the learner
   * portal's. §4.2 hides My Path until a learner has one, because a
   * destination that does not exist yet is worse than its absence; an entity's
   * four destinations all exist from the moment the account does.
   */
  return (
    <AppShell
      title={title}
      action={action}
      items={ENTITY_NAV}
      user={user}
      profileHref="/entity/profile"
    >
      {children}
    </AppShell>
  );
}
