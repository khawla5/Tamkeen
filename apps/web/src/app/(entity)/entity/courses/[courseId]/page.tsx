'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { directionForCourseLanguage, type EntityCourseDetail } from '@tamkeen/types';

import { BlockerList } from '@/components/entity/blocker-list';
import { EntityPage } from '@/components/layout/entity-page';
import { DataView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useErrorMessage } from '@/components/auth/use-error-message';
import { useFormat } from '@/i18n/format-provider';
import { entityApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * §4B.3 / §4B.4 — Add / Manage Course.
 *
 * Three regions, in the order an entity actually works: hand into Moodle to
 * author the content, set the product metadata our app owns, then publish. The
 * publish button and the reasons it is disabled arrive together from one
 * request, so the screen never offers an action it would then refuse.
 *
 * **There is no content editing here** (Model 1, D-046). Lectures, materials,
 * the quiz and its questions are authored in Moodle; this page's contribution is
 * the launch, the metadata Moodle has no field for, and the decision to publish.
 */
export default function ManageCoursePage() {
  const t = useTranslations('entity');
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;

  const course = useApiQuery(() => entityApi.getCourse(courseId), [courseId]);

  return (
    <EntityPage title={t('manageTitle')}>
      {/*
        `course.data === undefined` guards the loading state, so it appears on
        the FIRST load only.

        Without it, every refetch — and this page refetches after each save,
        publish and withdrawal — unmounts the whole view and mounts it again.
        That is not a flicker: the form beneath holds state, so the save
        confirmation vanishes the instant it is earned, and anything half-typed
        in another field goes with it. The browser suite caught exactly that.
      */}
      <DataView
        isLoading={course.isLoading && course.data === undefined}
        error={course.error}
        onRetry={course.refetch}
      >
        {course.data ? <ManageBody course={course.data} onChanged={course.refetch} /> : null}
      </DataView>
    </EntityPage>
  );
}

function ManageBody({ course, onChanged }: { course: EntityCourseDetail; onChanged: () => void }) {
  const t = useTranslations('entity');

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <p
          dir={directionForCourseLanguage(course.language)}
          lang={course.language === 'EN' ? 'en' : 'ar'}
          className="text-lg font-semibold text-foreground"
        >
          {course.title}
        </p>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>{t(`publication${course.publication}`)}</span>
          <span>{t(`status${course.status}`)}</span>
        </p>
      </Card>

      <AuthoringCard course={course} />
      <MetadataForm course={course} onSaved={onChanged} />
      <PublishCard course={course} onChanged={onChanged} />
    </div>
  );
}

/**
 * §4B.4's launch, and a link to the fuller read-back.
 *
 * The URL is fetched **on the click** and never rendered into the page: it
 * carries a short-lived, single-use credential, so putting it in an `href` would
 * leave a live login sitting in the DOM, in view-source and in any cached copy
 * for as long as the tab stayed open (D-045).
 */
function AuthoringCard({ course }: { course: EntityCourseDetail }) {
  const t = useTranslations('entity');
  const translateError = useErrorMessage();
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLaunch() {
    setError(null);
    setLaunching(true);

    try {
      const { url } = await entityApi.authorLaunch(course.id);
      window.location.href = url;
    } catch (caught) {
      setError(translateError(caught));
      setLaunching(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-foreground">{t('authorTitle')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('authorHint')}</p>

      {course.content && !course.content.completionConfigured ? (
        /* The D-042 dead end, named where it can be fixed. Without completion
           criteria nobody on this course can ever pass it. */
        <p role="alert" className="mt-3 text-sm text-destructive">
          {t('contentCriteriaWarning')}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <Button onClick={onLaunch} disabled={launching}>
          {launching ? t('authorLaunching') : t('authorLaunch')}
        </Button>
        <Button asChild variant="outline">
          <Link href={`/entity/courses/${course.id}/content`}>{t('contentTitle')}</Link>
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

/** §4B.3 — the product metadata our app owns (D-035, D-039, D-047, D-066). */
function MetadataForm({ course, onSaved }: { course: EntityCourseDetail; onSaved: () => void }) {
  const t = useTranslations('entity');
  const tActions = useTranslations('actions');
  const translateError = useErrorMessage();

  const [pathIds, setPathIds] = useState<string[]>(course.paths.map((path) => path.id));
  const [duration, setDuration] = useState(course.durationMinutes?.toString() ?? '');
  /* One objective per line: a repeating-row editor for three short strings is
     more UI than the data deserves, and a textarea is what an author already
     knows how to use. */
  const [objectives, setObjectives] = useState(course.objectives.join('\n'));
  const [prerequisites, setPrerequisites] = useState(course.prerequisites ?? '');
  const [language, setLanguage] = useState<'AR' | 'EN' | ''>(course.language ?? '');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);

    try {
      await entityApi.updateCourse(course.id, {
        pathIds,
        durationMinutes: duration === '' ? null : Number(duration),
        objectives: objectives
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        prerequisites: prerequisites.trim() || null,
        ...(language ? { language } : {}),
      });

      setSaved(true);
      onSaved();
    } catch (caught) {
      setError(translateError(caught));
    } finally {
      setSaving(false);
    }
  }

  function togglePath(pathId: string, checked: boolean) {
    setPathIds((current) =>
      checked ? [...new Set([...current, pathId])] : current.filter((id) => id !== pathId),
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-foreground">{t('metadataTitle')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('metadataHint')}</p>

      <form onSubmit={onSubmit} className="mt-4 space-y-5">
        <fieldset>
          <legend className="text-sm font-medium text-foreground">{t('fieldPaths')}</legend>
          <p className="mt-1 text-sm text-muted-foreground">{t('fieldPathsHint')}</p>

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {course.availablePaths.map((path) => (
              <label key={path.id} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={pathIds.includes(path.id)}
                  onChange={(event) => togglePath(path.id, event.target.checked)}
                  className="size-4 rounded border-input"
                />
                <span>{path.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/*
          Read-only, and derived from the paths above (D-066). §3A makes the path
          the owner of the letter, so a separately authored one could contradict
          it — and nothing downstream would notice, because the gold
          recommendation never reads a course's letter.
        */}
        <p className="text-sm text-muted-foreground">
          {t('riasecLetters')}:{' '}
          <span className="font-medium text-foreground">
            {course.riasecLetters.length > 0 ? course.riasecLetters.join(' · ') : t('riasecNone')}
          </span>
        </p>

        <Field id="course-duration" label={t('fieldDuration')}>
          {(field) => (
            <Input
              {...field}
              type="number"
              inputMode="numeric"
              min={1}
              max={10000}
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
            />
          )}
        </Field>

        <Field id="course-objectives" label={t('fieldObjectives')} hint={t('fieldObjectivesHint')}>
          {(field) => (
            <Textarea
              {...field}
              rows={4}
              value={objectives}
              onChange={(event) => setObjectives(event.target.value)}
            />
          )}
        </Field>

        <Field id="course-prerequisites" label={t('fieldPrerequisites')}>
          {(field) => (
            <Textarea
              {...field}
              rows={2}
              maxLength={2000}
              value={prerequisites}
              onChange={(event) => setPrerequisites(event.target.value)}
            />
          )}
        </Field>

        <Field id="course-language" label={t('fieldLanguage')}>
          {(field) => (
            <select
              {...field}
              value={language}
              onChange={(event) => setLanguage(event.target.value as 'AR' | 'EN' | '')}
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground"
            >
              <option value="AR">{t('languageAr')}</option>
              <option value="EN">{t('languageEn')}</option>
            </select>
          )}
        </Field>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {tActions('save')}
          </Button>
          {/* Polite: a save confirmation interrupting a screen reader mid-sentence
              is worse than one announced at the next pause. */}
          <span role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {saved ? t('saved') : ''}
          </span>
        </div>
      </form>
    </Card>
  );
}

/**
 * Publish and unpublish (§4A's bridge, §2/D-015).
 *
 * Exactly one of the two is offered, never both — §3's context-dependent action
 * rule. Publishing is disabled while blockers remain, and the blockers are shown
 * rather than hidden behind the disabled state: a button that cannot be pressed
 * and does not say why is worse than no button.
 */
function PublishCard({ course, onChanged }: { course: EntityCourseDetail; onChanged: () => void }) {
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
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-foreground">
        {isPublished ? t('unpublish') : t('publish')}
      </h2>

      {!isPublished && !canPublish ? (
        <div className="mt-3">
          <p className="text-sm font-medium text-foreground">{t('publishBlockedTitle')}</p>
          <BlockerList blockers={course.publishBlockers} />
        </div>
      ) : null}

      <div className="mt-4">
        {isPublished ? (
          <Button variant="outline" onClick={() => dialogRef.current?.showModal()}>
            {t('unpublish')}
          </Button>
        ) : (
          <Button onClick={onPublish} disabled={!canPublish || busy}>
            {busy ? t('publishing') : t('publish')}
          </Button>
        )}
      </div>

      {outcome ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {outcome.held > 0
            ? t('unpublishDoneHeld', { count: format.number(outcome.held) })
            : t('unpublishDone')}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
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
    </Card>
  );
}
