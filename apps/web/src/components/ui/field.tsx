import { AlertCircle } from 'lucide-react';
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
    <div className="flex flex-col gap-2">
      {/*
        The required marker is a SIBLING of the label, not a child of it.
        Nested inside, its text becomes part of the label — an e2e test caught
        the accessible name coming through as "كلمة المرور*", which a screen
        reader reads out as a spurious "star". `aria-hidden` on the span does not
        prevent that, because the label's text content is what gets used.
        The requirement itself is conveyed by the input's `required` attribute.
      */}
      {/* Platforms Code puts the required mark BEFORE the label text. */}
      <div className="flex items-center gap-1 text-sm leading-5 font-semibold">
        {required ? (
          <span aria-hidden="true" className="text-danger">
            *
          </span>
        ) : null}
        <label htmlFor={id} className="text-foreground">
          {label}
        </label>
      </div>

      {children({
        id,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy,
        required,
      })}

      {hint ? (
        <p id={hintId} className="text-sm leading-5 text-neutral-500">
          {hint}
        </p>
      ) : null}

      {error ? (
        /* Announced when it appears, so a screen-reader user learns why the
           submission failed without hunting for the message. */
        <p
          id={errorId}
          role="alert"
          className={cn('flex items-center gap-2 text-sm leading-5 text-danger')}
        >
          <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
