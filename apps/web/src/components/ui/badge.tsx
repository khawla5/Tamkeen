import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Eyebrow / tag label. `gold` uses gold for the border/icon only, never as the
 * text colour — at this size (text-xs) gold text falls below the 4.5:1 AA
 * floor for body text (src/lib/contrast.test.ts); a bordered badge is
 * large/non-text so the 3:1 threshold applies to the border and passes.
 */
const badgeVariants = cva('inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold', {
  variants: {
    variant: {
      gold: 'border border-gold text-navy',
      navy: 'bg-navy-soft text-white',
      /** Neutral chip for lists of equal-weight items — keeps gold scarce. */
      soft: 'border border-border bg-surface text-navy-soft',
    },
  },
  defaultVariants: {
    variant: 'gold',
  },
});

export interface BadgeProps extends ComponentProps<'span'>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
