import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Placeholder block for loading states.
 *
 * `aria-hidden` because the skeleton is decorative: the surrounding
 * LoadingState owns the single announcement, so screen readers hear
 * "جارٍ التحميل" once rather than a stream of empty boxes.
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted/20', className)}
      {...props}
    />
  );
}
