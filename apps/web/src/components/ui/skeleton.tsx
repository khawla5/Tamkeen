import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Placeholder block for loading states, on the neutral-200 token (TAM-118) so
 * it reads as "content shape" on both the white card and the neutral-50 page
 * ground, with the system's small radius.
 *
 * `aria-hidden` because the skeleton is decorative: the surrounding
 * LoadingState owns the single announcement, so screen readers hear
 * "جارٍ التحميل" once rather than a stream of empty boxes. The pulse is
 * dropped for readers who asked for reduced motion.
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse rounded-[4px] bg-neutral-200 motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
}
