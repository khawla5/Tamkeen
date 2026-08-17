import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface FieldProps {
  id: string;
  label: string;
  /** Rendered as an error and wired to the input via aria-describedby. */
  error?: string;
  hint?: string;
  required?: boolean;
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
    required: boolean;
  }) => ReactNode;
}

/**
 * A labelled form field.
 *
 * The render-prop shape exists so the label/error/description wiring cannot be
 * forgotten: an input rendered through `Field` always receives its `id`,
 * `aria-invalid` and `aria-describedby`. WCAG 2.1 AA requires labelled inputs
 * (§2B DoD 5), and hand-wiring `aria-describedby` on every form is exactly the
 * kind of detail that gets missed.
 */
export function Field({ id, label, error, hint, required = false, children }: FieldProps) {
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint ? `${id}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required ? (
          <span aria-hidden="true" className="ms-1 text-destructive">
            *
          </span>
        ) : null}
      </label>

      {children({
        id,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy,
        required,
      })}

      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}

      {error ? (
        /* Announced when it appears, so a screen-reader user learns why the
           submission failed without hunting for the message. */
        <p id={errorId} role="alert" className={cn('text-xs font-medium text-destructive')}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
