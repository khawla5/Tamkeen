import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Card, on Platforms Code's card anatomy (D-069, TAM-118): white surface,
 * neutral-300 hairline, the system's card radius (8 — `--radius-card`), and
 * header / content spacing from the system.
 *
 * `variant="selected"` is the one treatment pages had been hand-rolling —
 * the primary edge that marks a recommended path, the chosen course, the
 * next-up stop, the unlocked certificate. It is an *edge*, never a fill: the
 * card's content keeps its text colours, and the word beside it (a «موصى به»
 * tag, a status) carries the meaning, never the colour alone (WCAG 1.4.1).
 *
 * `edge` is the notice card — a 4px start-edge in a status colour, for the
 * admin's readiness and warning panels. Status, not accent; the copy inside
 * says what the colour means.
 */
const cardVariants = cva('rounded-card border bg-card text-card-foreground', {
  variants: {
    variant: {
      default: 'border-border',
      selected: 'border-2 border-primary-600',
    },
    edge: {
      none: '',
      primary: 'border-s-4 border-s-primary-600',
      info: 'border-s-4 border-s-info',
      success: 'border-s-4 border-s-success',
      warning: 'border-s-4 border-s-warning',
      danger: 'border-s-4 border-s-danger',
    },
  },
  defaultVariants: {
    variant: 'default',
    edge: 'none',
  },
});

export interface CardProps extends ComponentProps<'div'>, VariantProps<typeof cardVariants> {}

export function Card({ className, variant, edge, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant, edge }), className)} {...props} />;
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 p-6 pb-3', className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 className={cn('text-lg font-semibold text-foreground', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('p-6 pt-3', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-center gap-3 p-6 pt-0', className)} {...props} />;
}

export { cardVariants };
