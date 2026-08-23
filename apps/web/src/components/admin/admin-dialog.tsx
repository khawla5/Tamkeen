'use client';

import { useEffect, useRef, type ReactNode } from 'react';
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

  useEffect(() => {
    const dialog = ref.current;
    /* jsdom implements <dialog> without showModal in some versions; falling back
       keeps the component testable without pretending it is modal in a browser. */
    dialog?.showModal?.();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="admin-dialog-title"
      onClose={onClose}
      /* Escape fires `cancel` then `close`; both route through onClose so the
         parent's state cannot drift out of step with the browser's. */
      onCancel={onClose}
      className="w-[min(32rem,92vw)] rounded-xl border border-border bg-card p-0 text-foreground backdrop:bg-navy/40"
    >
      <form method="dialog" className="contents">
        <div className="flex flex-col gap-4 p-6">
          <div>
            <h2 id="admin-dialog-title" className="text-lg font-semibold">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>

          {children}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('cancel')}
            </Button>
            {footer}
          </div>
        </div>
      </form>
    </dialog>
  );
}
