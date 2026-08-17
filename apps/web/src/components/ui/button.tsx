import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * shadcn/ui Button, written against this product's tokens.
 *
 * Variants are deliberately few. §3 requires a single clear primary action per
 * screen, so a large variant menu would invite exactly the redundant UI the
 * brief forbids.
 *
 * There is no solid `--color-gold` fill variant: gold cannot carry body-size
 * text at AA in either direction (see src/lib/contrast.test.ts). The
 * achievement variant uses the light-gold fill with navy text (6.01:1).
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-secondary',
        /** Reserved for achievement / recommended actions — keep gold scarce. */
        achievement: 'bg-accent text-accent-foreground hover:brightness-105',
        outline: 'border border-input bg-transparent text-foreground hover:bg-card',
        ghost: 'text-foreground hover:bg-card',
        destructive: 'bg-destructive text-destructive-foreground hover:brightness-110',
      },
      size: {
        sm: 'h-9 px-3',
        md: 'h-10 px-4',
        lg: 'h-11 px-6 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';

  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
