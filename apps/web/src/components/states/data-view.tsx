import type { ReactNode } from 'react';

import { EmptyState, type EmptyStateProps } from './empty-state';
import { ErrorState, type ErrorStateProps } from './error-state';
import { LoadingState, type LoadingStateProps } from './loading-state';

export interface DataViewProps {
  isLoading: boolean;
  /** Truthy for any failure; the value itself is never shown to the user. */
  error?: unknown;
  isEmpty?: boolean;
  onRetry?: () => void;
  loadingProps?: LoadingStateProps;
  emptyProps?: EmptyStateProps;
  errorProps?: Omit<ErrorStateProps, 'onRetry'>;
  children: ReactNode;
}

/**
 * Wraps a data view so that loading, error and empty are handled by
 * construction rather than by remembering to handle them.
 *
 * §2B DoD 4 requires all three on *every* data view. A checklist item gets
 * forgotten under deadline; a component whose happy path is unreachable without
 * passing through the other three does not. Prefer this over hand-rolled
 * `isLoading ? … : …` ladders.
 *
 * Order matters: error outranks empty, because a failed request that returned no
 * rows must not be reported to the user as "nothing here yet".
 */
export function DataView({
  isLoading,
  error,
  isEmpty = false,
  onRetry,
  loadingProps,
  emptyProps,
  errorProps,
  children,
}: DataViewProps) {
  if (isLoading) {
    return <LoadingState {...loadingProps} />;
  }

  if (error) {
    return <ErrorState {...errorProps} onRetry={onRetry} />;
  }

  if (isEmpty) {
    return <EmptyState {...emptyProps} />;
  }

  return <>{children}</>;
}
