'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createContext, useContext, useEffect, type ReactNode } from 'react';

import type { DashboardView } from '@tamkeen/types';

import { ErrorState, LoadingState } from '@/components/states';
import { ApiError, authApi, dashboardApi, type CurrentUser } from '@/lib/api-client';
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
  /** Re-reads the dashboard, e.g. after confirming a path changes the nav. */
  refresh: () => void;
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
  const t = useTranslations('portal');

  const session = useApiQuery(() => authApi.me(), []);
  const dashboard = useApiQuery(() => dashboardApi.get(), []);

  const unauthorized = isUnauthorized(session.error) || isUnauthorized(dashboard.error);

  useEffect(() => {
    if (unauthorized) {
      router.replace('/login');
    }
  }, [unauthorized, router]);

  if (session.isLoading || dashboard.isLoading || unauthorized) {
    /* The redirect is in flight during `unauthorized`; showing the loading state
       rather than an error avoids a flash of "something went wrong" on what is
       simply an expired session. */
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
        refresh: dashboard.refetch,
      }}
    >
      {children}
    </PortalContext.Provider>
  );
}
