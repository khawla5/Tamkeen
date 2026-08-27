'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import type { EntityCourseDetail } from '@tamkeen/types';

import { useErrorMessage } from '@/components/auth/use-error-message';
import { Button } from '@/components/ui/button';
import { useFormat } from '@/i18n/format-provider';
import { entityApi } from '@/lib/api-client';

/**
 * Publish and unpublish (§4A's bridge, §2/D-015) — **one** implementation,
 * shared by Manage Course and Course Content (TAM-139), so the two pages cannot
 * disagree about whether a course may be published.
 *
 * Exactly one of the two is offered, never both — §3's context-dependent action
 * rule. Publishing is disabled while blockers remain; the blockers themselves
 * are rendered by the page (`BlockerList`) where there is room to read them, so
 * this component fits the page header's action slot as well as a card.
 */
export function PublishAction({
  course,
  onChanged,
}: {
  course: EntityCourseDetail;
  onChanged: () => void;
}) {
  const t = useTranslations('entity');
  const tActions = useTranslations('actions');
  const translateError = useErrorMessage();
  const format = useFormat();

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ held: number } | null>(null);

  /* Cleared when the course changes underneath, so a stale "withdrawn" message
     cannot sit above a course that has since been re-published. */
  useEffect(() => {
    setOutcome(null);
  }, [course.publication]);

  const isPublished = course.publication === 'PUBLISHED';
  const canPublish = course.publishBlockers.length === 0;

  async function onPublish() {
    setError(null);
    setBusy(true);

    try {
      await entityApi.publish(course.id);
      onChanged();
    } catch (caught) {
      setError(translateError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function onUnpublish() {
    setError(null);
    setBusy(true);

    try {
      const result = await entityApi.unpublish(course.id);
      dialogRef.current?.close();
      setOutcome({ held: result.learnersHolding });
      onChanged();
    } catch (caught) {
      setError(translateError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {isPublished ? (
        <Button variant="outline" onClick={() => dialogRef.current?.showModal()}>
          {t('unpublish')}
        </Button>
      ) : (
        <Button onClick={onPublish} disabled={!canPublish || busy}>
          {busy ? t('publishing') : t('publish')}
        </Button>
      )}

      {outcome ? (
        <p role="status" className="text-sm text-muted-foreground">
          {outcome.held > 0
            ? t('unpublishDoneHeld', { count: format.number(outcome.held) })
            : t('unpublishDone')}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {/*
        The native <dialog>: focus trapping, the inert background, Escape and
        `aria-modal` all come from the platform, which hand-rolled overlays
        routinely get one of wrong (D-037).
      */}
      <dialog
        ref={dialogRef}
        aria-labelledby="unpublish-title"
        className="rounded-card border border-border bg-card p-6 text-foreground backdrop:bg-black/40"
      >
        <h3 id="unpublish-title" className="text-lg font-semibold">
          {t('unpublishConfirmTitle')}
        </h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">{t('unpublishConfirmBody')}</p>

        {course.learnersHolding > 0 ? (
          /*
            Told before the decision, not after. A held course degrades to
            HIDDEN_BUT_COMPLETABLE rather than being withdrawn (§2, D-059), and
            an entity who was not told would believe otherwise.
          */
          <p className="mt-2 max-w-sm text-sm text-foreground">
            {t('unpublishConfirmHeld', { count: format.number(course.learnersHolding) })}
          </p>
        ) : null}

        <div className="mt-5 flex gap-3">
          <Button variant="destructive" onClick={onUnpublish} disabled={busy}>
            {busy ? t('unpublishing') : t('unpublish')}
          </Button>
          <Button variant="ghost" onClick={() => dialogRef.current?.close()} disabled={busy}>
            {tActions('cancel')}
          </Button>
        </div>
      </dialog>
    </div>
  );
}
