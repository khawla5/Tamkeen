'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

import { startNavigation } from '@/components/layout/navigation-progress';

/**
 * `useRouter`, with the navigation loader wired in. Every programmatic
 * `push`/`replace` in the app goes through this so the top bar starts for it
 * exactly as it does for a link click — one loader, no exceptions (D-093).
 * `refresh`/`back`/`forward` pass straight through.
 */
export function useAppRouter(): ReturnType<typeof useRouter> {
  const router = useRouter();

  return useMemo(
    () => ({
      ...router,
      push: (...args: Parameters<typeof router.push>) => {
        startNavigation();
        router.push(...args);
      },
      replace: (...args: Parameters<typeof router.replace>) => {
        startNavigation();
        router.replace(...args);
      },
    }),
    [router],
  );
}
