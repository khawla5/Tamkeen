'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createContext, useContext, useEffect, type ReactNode } from 'react';

import type { DashboardView } from '@tamkeen/types';

import { LandingView } from '@/components/landing/landing-view';
import { ErrorState, LoadingState } from '@/components/states';
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
  const router = useRouter();
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

  useEffect(() => {
    if (shouldRedirect) {
      router.replace('/login');
    }
  }, [shouldRedirect, router]);

  if (unauthorized && isPublicRoot) {
    return <LandingView />;
  }

  if (session.isLoading || dashboard.isLoading || shouldRedirect) {
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
        refreshNotifications: notifications.refetch,
      }}
    >
      {children}
    </PortalContext.Provider>
  );
}
