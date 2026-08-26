import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Multi-line counterpart to `Input`: the same Platforms Code field anatomy
 * (radius 4, neutral-400 edge that darkens on hover, the primary focus ring,
 * error by `aria-invalid`) at multi-line height (TAM-118).
 */
export function Textarea({ className, rows = 4, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      rows={rows}
      className={cn(
        'flex min-h-9 w-full rounded-[4px] border border-neutral-400 bg-card px-3 py-2 text-base text-foreground md:text-sm',
        'placeholder:text-neutral-500 hover:border-neutral-700 active:border-neutral-900',
        'outline-none focus-visible:border-primary-600 focus-visible:ring-[3px] focus-visible:ring-primary-600/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/30',
        className,
      )}
      {...props}
    />
  );
}
