import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Button, on Platforms Code's button model (D-069): each variant is a
 * default → hovered → pressed triple from the system's button tokens, so a
 * button here looks and behaves like one on any other government platform.
 *
 * Variants are deliberately few. §3 requires a single clear primary action per
 * screen, so a large variant menu would invite exactly the redundant UI the
 * brief forbids. There is no achievement/gold variant: the product uses one
 * accent, and a "recommended" action is simply the primary one.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        /** Platforms Code "primary": 600 → 700 → 900. */
        primary:
          'bg-primary-600 text-primary-foreground hover:bg-primary-700 active:bg-primary-900',
        /** Platforms Code "neutral": the quiet secondary action. */
        secondary:
          'border border-border bg-neutral-100 text-foreground hover:bg-neutral-100 active:bg-neutral-200',
        outline:
          'border border-input bg-transparent text-foreground hover:bg-card active:bg-neutral-100',
        ghost: 'text-foreground hover:bg-neutral-100 active:bg-neutral-200',
        /** Platforms Code "danger primary": danger-600 → danger → danger-900. */
        destructive:
          'bg-danger-600 text-destructive-foreground hover:bg-danger active:bg-danger-900',
        /** Platforms Code "on-color": a white button on a dark or primary surface. */
        onColor: 'bg-surface text-foreground hover:bg-surface/80 active:bg-surface/60',
        /** The quiet companion to onColor: white outline on the same ground. */
        outlineOnColor:
          'border border-surface/50 bg-transparent text-surface hover:bg-surface/10 active:bg-surface/20',
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-9 px-4',
        lg: 'h-10 px-6',
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
