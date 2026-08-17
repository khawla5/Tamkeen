import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm',
        'placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        /* Errors are marked with aria-invalid, so the styling follows the
           accessibility attribute rather than a separate prop that could
           disagree with it. */
        'aria-[invalid=true]:border-destructive',
        className,
      )}
      {...props}
    />
  );
}
