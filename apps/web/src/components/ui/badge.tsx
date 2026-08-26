import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Tag, on Platforms Code's tag anatomy (D-069, TAM-118): a small pill whose
 * fill is the status colour's `-50` tint and whose text and hairline are the
 * status colour itself. The word inside carries the meaning; the colour only
 * repeats it (WCAG 1.4.1).
 *
 * Status tones: `neutral` for a list of equal-weight labels, `primary` for
 * the one thing that matters (recommendation, the current stage), `success` /
 * `warning` / `danger` / `info` for outcomes and states.
 *
 * The older names stay as aliases so the eleven call sites keep working:
 * `soft` → `neutral`, `dark` → the inverse chip on light grounds, `onColor` →
 * the white outline on a primary or dark surface.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-5 whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral: 'border-neutral-300 bg-neutral-100 text-neutral-700',
        primary: 'border-primary-600 bg-primary-50 text-primary-800',
        success: 'border-success bg-success-50 text-success',
        warning: 'border-warning bg-warning-50 text-warning',
        danger: 'border-danger bg-danger-50 text-danger',
        info: 'border-info bg-info-50 text-info',
        /** Inverse chip on a light ground — a count, a version. */
        dark: 'border-neutral-800 bg-neutral-800 text-white',
        /** On a primary or dark surface: a white outline chip. */
        onColor: 'border-surface/50 bg-transparent text-surface',
        /** @deprecated alias of `neutral`. */
        soft: 'border-neutral-300 bg-neutral-100 text-neutral-700',
      },
    },
    defaultVariants: {
      variant: 'primary',
    },
  },
);

export interface BadgeProps extends ComponentProps<'span'>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/** The DGA name for the same thing. */
export const Tag = Badge;

export { badgeVariants };
