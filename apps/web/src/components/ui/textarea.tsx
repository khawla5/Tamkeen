import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/** Multi-line counterpart to `Input`, styled and wired identically. */
export function Textarea({ className, rows = 4, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      rows={rows}
      className={cn(
        'flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm',
        'placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        'aria-[invalid=true]:border-destructive',
        className,
      )}
      {...props}
    />
  );
}
