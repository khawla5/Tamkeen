'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { useFormat } from '@/i18n/format-provider';

export interface ConfirmPathDialogProps {
  open: boolean;
  pathName: string;
  courseCount: number;
  isPending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The hard commitment gate (§2, §4.5).
 *
 * Built on the native `<dialog>` element rather than a hand-rolled overlay. That
 * is not a preference: `showModal()` gives focus trapping, the inert background,
 * Escape-to-close and `aria-modal` semantics from the platform, all of which are
 * routinely got wrong by hand — and this is the one dialog in the product a user
 * must genuinely understand before agreeing.
 *
 * The wording states plainly that the path *cannot* be changed and that the
 * assessment locks with it (D-015), because "are you sure?" would not.
 */
export function ConfirmPathDialog({
  open,
  pathName,
  courseCount,
  isPending,
  error,
  onConfirm,
  onCancel,
}: ConfirmPathDialogProps) {
  const t = useTranslations('pathBuild');
  const format = useFormat();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-path-title"
      /* Escape must route through the same cancel path as the button, or the
         parent's `open` state and the dialog's disagree. */
      onCancel={(event) => {
        event.preventDefault();
        if (!isPending) onCancel();
      }}
      /* `m-auto` is load-bearing: the UA stylesheet centres a modal <dialog>
         with `margin: auto`, and Tailwind's preflight resets margins to 0 —
         without this the dialog pins itself to the top of the viewport. */
      className="m-auto max-w-lg rounded-card border border-border bg-card p-0 text-foreground backdrop:bg-neutral-900/50"
    >
      <div className="flex flex-col gap-4 p-6">
        <h2 id="confirm-path-title" className="text-lg font-semibold">
          {t('dialogTitle')}
        </h2>

        <p className="text-sm text-muted-foreground">{t('dialogBody')}</p>

        <dl className="flex flex-col gap-1 text-sm">
          <div>{t('dialogPath', { name: pathName })}</div>
          <div>{t('dialogCourses', { count: format.number(courseCount) })}</div>
        </dl>

        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={onConfirm} disabled={isPending}>
            {isPending ? t('confirming') : t('dialogConfirm')}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            {t('dialogCancel')}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
