'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

/**
 * A modal for the admin portal.
 *
 * `<dialog>` rather than a hand-rolled overlay, because the browser then owns
 * the three things a hand-rolled one gets wrong: focus is trapped inside while
 * it is open, Escape closes it, and the rest of the page becomes inert to
 * assistive technology. Doing that manually is how a modal ends up keyboard-
 * inaccessible — the exact WCAG 2.1 AA failure §2B rules out.
 *
 * `showModal()` is called from an effect rather than rendering `open`: the
 * `open` attribute produces a *non-modal* dialog with none of the above.
 *
 * **`m-auto` is load-bearing.** The UA stylesheet centres a modal `<dialog>`
 * with `margin: auto`, and Tailwind's preflight resets every margin to 0 — so
 * without it the dialog pins itself to the block-start inline-start corner,
 * which in an RTL page is the TOP RIGHT of the viewport. Every admin modal
 * (manage account, manage path, create path) opened there. The learner portal's
 * confirm dialog carries the same comment for the same reason; the admin one
 * was written later and never got the fix.
 *
 * **The body scrolls, the frame does not.** A dialog holding a path's whole
 * course list is taller than a laptop viewport, and a `<dialog>` that overflows
 * takes its actions off-screen with it — including the cancel button. Height is
 * capped and the middle scrolls, so the title and the decisions stay put.
 */
export function AdminDialog({
  title,
  description,
  onClose,
  children,
  footer,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = useTranslations('actions');
  const ref = useRef<HTMLDialogElement>(null);
  /* Unique per instance: admin dialogs nest (a picker opened from a manage
     panel), and a hardcoded id would give the page two elements with the same
     one — leaving a screen reader to announce the wrong dialog's title. */
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    /* jsdom implements <dialog> without showModal in some versions; falling back
       keeps the component testable without pretending it is modal in a browser. */
    dialog?.showModal?.();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      /* Escape fires `cancel` then `close`; both route through onClose so the
         parent's state cannot drift out of step with the browser's. */
      onCancel={onClose}
      className="m-auto max-h-[min(88dvh,48rem)] w-[min(40rem,92vw)] overflow-hidden rounded-card border border-border bg-card p-0 text-foreground backdrop:bg-neutral-900/50"
    >
      {/* `max-h-[inherit]` hands the dialog's cap down to the flex column, which
          is what lets the middle section — and only the middle section — scroll. */}
      <form method="dialog" className="flex max-h-[inherit] flex-col">
        <div className="border-b border-border px-6 py-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
          {children}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border px-6 py-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          {footer}
        </div>
      </form>
    </dialog>
  );
}
