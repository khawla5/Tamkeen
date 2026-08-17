'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A minimal data-fetching hook, shaped to feed `DataView` directly.
 *
 * Deliberately in-house rather than a query library. What §2B actually requires
 * is that every data view has loading, error and empty states, and `DataView`
 * already enforces that — the missing piece was a hook whose return value plugs
 * into it. Some forty lines does that; a caching layer, background refetching
 * and query invalidation are capabilities Phase 1 has no use for, and an
 * unused dependency in a government system is a dependency to review, patch and
 * justify. Swapping in TanStack Query later is a change behind this signature.
 *
 * What it does handle, because getting these wrong causes real bugs:
 *  - **Stale responses.** A request in flight when the inputs change must not
 *    overwrite the newer result. Each run carries a token; only the latest wins.
 *  - **Unmounted updates.** The same token stops a resolved promise setting
 *    state on a component that has gone.
 */

export interface ApiQuery<T> {
  data: T | undefined;
  isLoading: boolean;
  error: unknown;
  /** Re-runs the request — wired to `ErrorState`'s retry. */
  refetch: () => void;
}

export function useApiQuery<T>(
  fetcher: () => Promise<T>,
  /** Values that, when changed, should re-run the request. */
  deps: readonly unknown[] = [],
): ApiQuery<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  /* Held in a ref so changing the fetcher identity on every render — which is
     normal for an inline arrow — does not restart the request. */
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const runId = useRef(0);

  useEffect(() => {
    const id = ++runId.current;
    setIsLoading(true);
    setError(undefined);

    fetcherRef
      .current()
      .then((result) => {
        if (runId.current !== id) return;
        setData(result);
        setError(undefined);
      })
      .catch((caught: unknown) => {
        if (runId.current !== id) return;
        /* Keep the previous data: a failed refetch should show an error, not
           silently blank a view that was working a moment ago. */
        setError(caught);
      })
      .finally(() => {
        if (runId.current !== id) return;
        setIsLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken, ...deps]);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  return { data, isLoading, error, refetch };
}

export interface ApiMutation<TArgs extends unknown[], TResult> {
  run: (...args: TArgs) => Promise<TResult | undefined>;
  isPending: boolean;
  error: unknown;
  reset: () => void;
}

/**
 * The write counterpart.
 *
 * `run` resolves to `undefined` on failure rather than rejecting, so callers do
 * not need a try/catch around every submit; the error is in `error` for display.
 * Callers that must branch on success check the resolved value.
 */
export function useApiMutation<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
): ApiMutation<TArgs, TResult> {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<unknown>(undefined);

  const actionRef = useRef(action);
  actionRef.current = action;

  const run = useCallback(async (...args: TArgs): Promise<TResult | undefined> => {
    setIsPending(true);
    setError(undefined);

    try {
      return await actionRef.current(...args);
    } catch (caught) {
      setError(caught);
      return undefined;
    } finally {
      setIsPending(false);
    }
  }, []);

  const reset = useCallback(() => setError(undefined), []);

  return { run, isPending, error, reset };
}
