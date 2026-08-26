import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Table, on Platforms Code's table anatomy (D-069, TAM-118): a header row on
 * neutral-50 in semibold 14px, hairline rows, a quiet hover, all inside a
 * card-radius hairline frame that **scrolls on its own** — a wide table must
 * never make the page body scroll horizontally (§2B).
 *
 * Plain elements with the right classes, not a data-grid: every consumer is a
 * small review list (§4B.5, §4C.2) that needs a real `<table>` with `<th
 * scope="col">` for a screen reader, and nothing more. A `<caption>` is
 * required by `Table`'s props — sighted readers get the page title, a screen
 * reader gets the table's — and rendered visually hidden unless asked.
 */
export interface TableProps extends ComponentProps<'table'> {
  /** The table's accessible name, e.g. the list's title. */
  caption: string;
  /** Show the caption rather than keeping it for assistive technology only. */
  captionVisible?: boolean;
  /** Minimum width before the frame scrolls, e.g. `min-w-[42rem]`. */
  minWidthClassName?: string;
  /** Class on the scrolling frame around the table. */
  frameClassName?: string;
}

export function Table({
  caption,
  captionVisible = false,
  minWidthClassName,
  frameClassName,
  className,
  children,
  ...props
}: TableProps) {
  return (
    <div
      className={cn('overflow-x-auto rounded-card border border-border bg-card', frameClassName)}
    >
      <table
        className={cn('w-full border-collapse text-sm', minWidthClassName, className)}
        {...props}
      >
        <caption
          className={cn(
            captionVisible ? 'p-4 text-start text-base font-semibold text-foreground' : 'sr-only',
          )}
        >
          {caption}
        </caption>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('bg-neutral-50', className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('divide-y divide-border', className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('transition-colors hover:bg-neutral-50', className)} {...props} />;
}

/** A column header; always `scope="col"`, always start-aligned in an RTL page. */
export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      scope="col"
      className={cn(
        'px-4 py-3 text-start text-sm font-semibold whitespace-nowrap text-neutral-700',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-4 py-3 text-start text-foreground', className)} {...props} />;
}
