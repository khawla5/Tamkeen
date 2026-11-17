'use client';

import { usePathname } from 'next/navigation';
import { useAppRouter } from '@/lib/use-app-router';
import { useTranslations } from 'next-intl';
import { createContext, useContext, useEffect, type ReactNode } from 'react';

import type { DashboardView } from '@tamkeen/types';

import { LandingView } from '@/components/landing/landing-view';
import { ErrorState, LoadingState } from '@/components/states';
import { PreferenceProvider } from './preference-provider';
import { HOME_FOR_ROLE } from './portal-routes';
import {
  ApiError,
  authApi,
  dashboardApi,
  notificationsApi,
  type CurrentUser,
} from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * Session and journey state for every authenticated page.
 *
 * Loaded once here rather than per page, because the navigation itself depends
 * on it (§4.2 hides My Path before a path exists) and a page that fetched its
 * own copy would render a nav that disagreed with its content for a moment.
 *
 * It also owns the unauthenticated redirect. The API is fail-closed and returns
 * 401; without somewhere central to catch that, every page would need the same
 * three lines and one of them would eventually be missed — leaving a signed-out
 * user staring at a permanent error state instead of the sign-in form.
 */

export interface PortalValue {
  user: CurrentUser;
  dashboard: DashboardView;
  /**
   * Certificates issued since the learner last opened their gallery (§2).
   *
   * Lives here rather than in the gallery because the *navigation* is what
   * shows it — a learner has to learn a certificate arrived without already
   * being on the page that would tell them.
   */
  unreadCertificates: number;
  /** Re-reads the dashboard, e.g. after confirming a path changes the nav. */
  refresh: () => void;
  /**
   * Re-reads the session.
   *
   * Distinct from `refresh`, which re-reads the *journey*. §4.12 changes the
   * person's digits preference, which lives on the session — refetching the
   * dashboard would leave the new choice unapplied until a reload.
   */
  refreshSession: () => void;
  /** Re-reads the indicator after the gallery marks certificates seen. */
  refreshNotifications: () => void;
}

const PortalContext = createContext<PortalValue | null>(null);

export function usePortal(): PortalValue {
  const value = useContext(PortalContext);

  if (!value) {
    throw new Error('usePortal must be used inside PortalProvider');
  }

  return value;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function PortalProvider({ children }: { children: ReactNode }) {
  const router = useAppRouter();
  const pathname = usePathname();
  const t = useTranslations('portal');

  const session = useApiQuery(() => authApi.me(), []);
  const dashboard = useApiQuery(() => dashboardApi.get(), []);
  /* Not part of the gate below: a failed indicator lookup must not stop the
     portal rendering. §2 calls this a *light* indicator — its absence costs a
     learner nothing, and blocking every authenticated page on it would trade a
     dot for the whole product. */
  const notifications = useApiQuery(() => notificationsApi.unread(), []);

  const unauthorized = isUnauthorized(session.error) || isUnauthorized(dashboard.error);

  /*
   * `/` is the one portal path a signed-out visitor is allowed to land on: it
   * is also the public front page (`LandingView`, identical to `/landing`).
   * Every other portal path still bounces to `/login` on a 401 — this does
   * not loosen auth anywhere else, it only changes what an unauthenticated
   * root request renders instead of redirecting.
   */
  const isPublicRoot = pathname === '/';
  const shouldRedirect = unauthorized && !isPublicRoot;

  /*
   * An entity or an admin who reached a learner page — by typing it, or by a
   * bookmark from before their account changed. `EntityProvider` already sends
   * a mis-routed employee the other way; this is the return half, and without
   * it the journey dashboard answers 403 rather than 401, so nothing above
   * treats it as a session problem and the page settles on an error card whose
   * retry can never succeed.
   *
   * The signed-out visitor is unaffected: this reads `session.data`, which only
   * exists once someone is signed in, so `/` still renders the public landing
   * page for everyone else.
   */
  const wrongPortal =
    session.data !== undefined && session.data.role !== 'EMPLOYEE'
      ? HOME_FOR_ROLE[session.data.role]
      : null;

  /*
   * The catalogue does not exist for an employee the ministry has not put on a
   * path (D-071, restated for D-134): the sidebar hides it, and a typed or
   * bookmarked /courses URL must agree with the sidebar, or the nav lies. The
   * dashboard's one card already says what is happening instead. The courses API
   * itself stays open — reading catalogue data leaks nothing, and it returns
   * only what is placed in a published path — so this is a navigation rule,
   * enforced where navigation state already lives.
   */
  const coursesGated =
    dashboard.data?.state === 'NO_PATH' &&
    (pathname === '/courses' || pathname.startsWith('/courses/'));

  useEffect(() => {
    if (shouldRedirect) {
      router.replace('/login');
    } else if (wrongPortal) {
      router.replace(wrongPortal);
    } else if (coursesGated) {
      router.replace('/');
    }
  }, [shouldRedirect, wrongPortal, coursesGated, router]);

  if (unauthorized && isPublicRoot) {
    return <LandingView />;
  }

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
  if (
    session.isInitialLoad ||
    dashboard.isInitialLoad ||
    shouldRedirect ||
    wrongPortal ||
    coursesGated
  ) {
    /* The redirect is in flight during `shouldRedirect`; showing the loading
       state rather than an error avoids a flash of "something went wrong" on
       what is simply an expired session. */
    return (
      <div className="p-6">
        <LoadingState label={t('loadingLabel')} />
      </div>
    );
  }

  if (session.error || dashboard.error || !session.data || !dashboard.data) {
    return (
      <div className="p-6">
        <ErrorState
          onRetry={() => {
            session.refetch();
            dashboard.refetch();
          }}
        />
      </div>
    );
  }

  return (
    <PortalContext.Provider
      value={{
        user: session.data,
        dashboard: dashboard.data,
        unreadCertificates: notifications.data?.certificates ?? 0,
        refresh: dashboard.refetch,
        refreshSession: session.refetch,
        refreshNotifications: notifications.refetch,
      }}
    >
      {/* The person's digits choice, applied to everything below (§4.12). */}
      <PreferenceProvider numberFormat={session.data.numberFormat}>{children}</PreferenceProvider>
    </PortalContext.Provider>
  );
}
