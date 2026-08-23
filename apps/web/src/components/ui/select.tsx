import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * A native select on the Platforms Code field anatomy — the same edge, height,
 * radius, focus ring and error treatment as Input, with the browser's own
 * list behind it (keyboard, screen reader and mobile pickers for free). The
 * chevron is decorative and sits on the end edge, so it mirrors in RTL.
 */
export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        className={cn(
          'flex h-9 w-full appearance-none rounded-[4px] border border-neutral-400 bg-card ps-3 pe-9 py-1 text-base text-foreground md:text-sm',
          'hover:border-neutral-700 active:border-neutral-900',
          'outline-none focus-visible:border-primary-600 focus-visible:ring-[3px] focus-visible:ring-primary-600/50',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/30',
          'invalid:text-neutral-500',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-neutral-500"
      />
    </div>
  );
}
