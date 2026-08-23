import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Eyebrow / tag label (Platforms Code, D-069). `primary` is a bordered chip —
 * the primary edge with display text, so the text colour never depends on the
 * accent; `dark` sits on light grounds; `soft` is the neutral chip for lists
 * of equal-weight items, which keeps the primary chip meaningful.
 */
const badgeVariants = cva('inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold', {
  variants: {
    variant: {
      primary: 'border border-primary-600 text-foreground',
      dark: 'bg-neutral-800 text-white',
      /** On a primary/dark ground: a white outline chip. */
      onColor: 'border border-surface/50 text-surface',
      soft: 'border border-border bg-card text-neutral-700',
    },
  },
  defaultVariants: {
    variant: 'primary',
  },
});

export interface BadgeProps extends ComponentProps<'span'>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
