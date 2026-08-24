'use client';

import { useAppRouter } from '@/lib/use-app-router';
import { useTranslations } from 'next-intl';
import { createContext, useContext, useEffect, type ReactNode } from 'react';

import type { EntityProfileView } from '@tamkeen/types';

import { ErrorState, LoadingState } from '@/components/states';
import { PreferenceProvider } from './preference-provider';
import { HOME_FOR_ROLE } from './portal-routes';
import { ApiError, authApi, entityApi, type CurrentUser } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * Session and organisation for every page of the entity portal (D-065).
 *
 * A sibling of `PortalProvider` rather than a branch inside it. The learner
 * provider loads `dashboardApi.get()` — the *journey* dashboard — for every page
 * beneath it, and derives the navigation from that journey. An entity has no
 * journey: no assessment, no path, no certificates. Sharing the provider would
 * mean an entity account fetching a dashboard describing a product they do not
 * use, to render a nav computed from a state they can never be in.
 *
 * **The redirect below is a courtesy, not a control.** The API is the authority
 * and refuses cross-portal reads regardless of what the browser renders
 * (D-062); this only saves a mis-routed user from staring at a wall of 403s.
 */

export interface EntityValue {
  user: CurrentUser;
  /** Null for a super-admin, who has no organisation of their own. */
  entity: EntityProfileView | null;
  refresh: () => void;
}

const EntityContext = createContext<EntityValue | null>(null);

export function useEntity(): EntityValue {
  const value = useContext(EntityContext);

  if (!value) {
    throw new Error('useEntity must be used inside EntityProvider');
  }

  return value;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function EntityProvider({ children }: { children: ReactNode }) {
  const router = useAppRouter();
  const t = useTranslations('portal');

  const session = useApiQuery(() => authApi.me(), []);
  const entity = useApiQuery(() => entityApi.profile(), []);

  const unauthorized = isUnauthorized(session.error) || isUnauthorized(entity.error);
  /*
   * Anyone who typed /entity and does not work here. Sent to their own portal
   * rather than shown a permission error, which tells them nothing they can act
   * on.
   *
   * A super-admin *may* call the entity API — §4C.5 gives them oversight of
   * every organisation's courses, and the scope resolver returns them an
   * unfiltered read (D-075). What they may not usefully do is sit inside these
   * screens, which are shaped around one organisation and would show them an
   * empty profile and a nameless dashboard. Their oversight has its own pages.
   */
  const wrongPortal =
    session.data !== undefined && session.data.role !== 'ENTITY'
      ? HOME_FOR_ROLE[session.data.role]
      : null;

  useEffect(() => {
    if (unauthorized) {
      router.replace('/login');
    } else if (wrongPortal) {
      router.replace(wrongPortal);
    }
  }, [unauthorized, wrongPortal, router]);

  /*
   * `isInitialLoad`, not `isLoading`: a *refetch* must not unmount the page.
   *
   * `refreshSession` is called after a preference is saved, and gating on
   * `isLoading` swapped the whole portal for a loading state while that
   * request was in flight — which unmounted the screen and destroyed the
   * confirmation the person had just earned, so a successful save looked like
   * nothing had happened. The same defect shipped in Phase 4 behind `DataView`
   * and was fixed in `useApiQuery`; these three providers were the remaining
   * callers still reading the old flag.
   */
  if (session.isInitialLoad || entity.isInitialLoad || unauthorized || wrongPortal) {
    /* A redirect is in flight in the last two cases; showing the loading state
       rather than an error avoids a flash of "something went wrong" on what is
       simply the wrong address. */
    return (
      <div className="p-6">
        <LoadingState label={t('loadingLabel')} />
      </div>
    );
  }

  if (session.error || entity.error || !session.data) {
    return (
      <div className="p-6">
        <ErrorState
          onRetry={() => {
            session.refetch();
            entity.refetch();
          }}
        />
      </div>
    );
  }

  return (
    <EntityContext.Provider
      value={{
        user: session.data,
        entity: entity.data ?? null,
        refresh: entity.refetch,
      }}
    >
      {/* The person's digits choice, applied to everything below (§4.12). */}
      <PreferenceProvider numberFormat={session.data.numberFormat}>{children}</PreferenceProvider>
    </EntityContext.Provider>
  );
}
