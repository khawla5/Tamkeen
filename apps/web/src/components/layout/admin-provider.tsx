'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createContext, useContext, useEffect, type ReactNode } from 'react';

import { ErrorState, LoadingState } from '@/components/states';
import { PreferenceProvider } from './preference-provider';
import { ApiError, authApi, type CurrentUser } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * Session for every page of the super-admin portal (§4C, D-075).
 *
 * The third sibling of `PortalProvider` and `EntityProvider`, and the simplest:
 * a learner's provider loads their journey and derives the navigation from it,
 * an entity's loads its organisation, and an administrator has neither. There is
 * nothing to load beyond who they are, so this provider exists for the two
 * things all three share — resolving the session once for the whole subtree, and
 * correcting a caller who does not belong here.
 *
 * **The redirect is a courtesy, not a control.** The API refuses every admin
 * route to every other role and audits the attempt (D-062); this only saves a
 * mis-routed user from a wall of permission errors they cannot act on.
 */

export interface AdminValue {
  user: CurrentUser;
}

const AdminContext = createContext<AdminValue | null>(null);

export function useAdmin(): AdminValue {
  const value = useContext(AdminContext);

  if (!value) {
    throw new Error('useAdmin must be used inside AdminProvider');
  }

  return value;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const t = useTranslations('portal');

  const session = useApiQuery(() => authApi.me(), []);

  const unauthorized = isUnauthorized(session.error);
  const role = session.data?.role;
  /*
   * Both other roles are sent to their own portal rather than shown a permission
   * error. D-067 is the reason this is written as an exhaustive mapping rather
   * than a single "not an admin" branch: the entity portal once returned a
   * mis-routed employee while the learner portal left a mis-routed entity on a
   * retry button that could never succeed, because only half the rule had been
   * implemented. Every role that is not this portal's goes somewhere real.
   */
  const elsewhere = role === 'EMPLOYEE' ? '/' : role === 'ENTITY' ? '/entity' : null;

  useEffect(() => {
    if (unauthorized) {
      router.replace('/login');
    } else if (elsewhere) {
      router.replace(elsewhere);
    }
  }, [unauthorized, elsewhere, router]);

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
  if (session.isInitialLoad || unauthorized || elsewhere) {
    /* A redirect is in flight in the last two cases; the loading state avoids a
       flash of "something went wrong" on what is simply the wrong address. */
    return (
      <div className="p-6">
        <LoadingState label={t('loadingLabel')} />
      </div>
    );
  }

  if (session.error || !session.data) {
    return (
      <div className="p-6">
        <ErrorState onRetry={() => session.refetch()} />
      </div>
    );
  }

  return (
    <AdminContext.Provider value={{ user: session.data }}>
      {/* The person's digits choice, applied to everything below (§4.12). */}
      <PreferenceProvider numberFormat={session.data.numberFormat}>{children}</PreferenceProvider>
    </AdminContext.Provider>
  );
}
