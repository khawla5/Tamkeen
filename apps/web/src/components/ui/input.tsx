import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        /* Platforms Code form field (D-069): 36px, radius 4, neutral-400 edge
           that darkens on hover and goes near-black when pressed; focus is the
           primary ring. Error styling follows aria-invalid, never a separate
           prop that could disagree with it. */
        'flex h-9 w-full rounded-[4px] border border-neutral-400 bg-card px-3 py-1 text-base text-foreground md:text-sm',
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
