'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { directionForCourseLanguage, type EntityCourseDetail } from '@tamkeen/types';

import { BlockerList } from '@/components/entity/blocker-list';
import { PublishAction } from '@/components/entity/publish-action';
import { EntityPage } from '@/components/layout/entity-page';
import { DataView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useErrorMessage } from '@/components/auth/use-error-message';
import { entityApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * §4B.3 / §4B.4 — Add / Manage Course.
 *
 * Three regions, in the order an entity actually works: go to the content
 * page (where Moodle's editor is framed — TAM-130), set the product metadata
 * our app owns, then publish. The publish button and the reasons it is disabled
 * arrive together from one request, so the screen never offers an action it
 * would then refuse.
 *
 * **There is no content editing here** (Model 1, D-046), and no launch either:
 * the author credential is minted in one place, the content page, so there is
 * one audit trail. This page's contribution is the metadata Moodle has no field
 * for, and the decision to publish — through the same `PublishAction` the
 * content page uses, so the two cannot disagree.
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
        {course.summary ? (
          <p
            dir={directionForCourseLanguage(course.language)}
            lang={course.language === 'EN' ? 'en' : 'ar'}
            className="mt-1 text-sm text-muted-foreground"
          >
            {course.summary}
          </p>
        ) : null}
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
 * The way to the editor (§4B.4). A link, not a launch: the content page mints
 * the credential when it opens (D-098), and minting it here as well would mean
 * two places issuing logins for one purpose.
 */
function AuthoringCard({ course }: { course: EntityCourseDetail }) {
  const t = useTranslations('entity');

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

      <div className="mt-4">
        <Button asChild>
          <Link href={`/entity/courses/${course.id}/content`}>{t('authorOpenEditor')}</Link>
        </Button>
      </div>
    </Card>
  );
}

/** §4B.3 — the product metadata our app owns (D-035, D-039, D-047, D-066). */
function MetadataForm({ course, onSaved }: { course: EntityCourseDetail; onSaved: () => void }) {
  const t = useTranslations('entity');
  const tActions = useTranslations('actions');
  const translateError = useErrorMessage();

  const [pathIds, setPathIds] = useState<string[]>(course.paths.map((path) => path.id));
  const rules = course.pathRules;
  /* The letters the current selection would give the course (D-066) — the live
     form of the read-only preview, and the input to the coherence rule. */
  const selectedLetters = [
    ...new Set(
      course.availablePaths
        .filter((path) => pathIds.includes(path.id))
        .map((path) => path.riasecLetter),
    ),
  ];
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
        <fieldset disabled={course.isGeneral}>
          <legend className="text-sm font-medium text-foreground">{t('fieldPaths')}</legend>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('fieldPathsHint')} {t('pathsCapHint', { max: rules.maxPaths })}
          </p>

          {course.isGeneral ? (
            /* Admin-only reach (§4C.5): nothing to choose here. */
            <p role="status" className="mt-2 text-sm text-foreground">
              {t('courseGeneral')}
            </p>
          ) : null}

          {rules.frozen ? (
            /* Grandfathered: over the limits from before the rule existed.
               Removals only, and said so — a disabled checkbox with no reason
               would read as a bug. */
            <p role="status" className="mt-2 text-sm text-warning">
              {t('pathsFrozen')}
            </p>
          ) : null}

          {rules.approvalRequired ? (
            <p className="mt-2 text-sm text-muted-foreground">{t('pathsApprovalNote')}</p>
          ) : null}

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {course.availablePaths.map((path) => {
              const checked = pathIds.includes(path.id);
              const membership = course.paths.find((entry) => entry.id === path.id);
              const wouldAddLetter = !selectedLetters.includes(path.riasecLetter);
              /* The same three rules the server applies (TAM-132), decided
                 per checkbox so the form never offers a choice it would then
                 refuse: frozen → removals only; the cap; coherence. */
              const disabled =
                !checked &&
                (rules.frozen ||
                  pathIds.length >= rules.maxPaths ||
                  (wouldAddLetter && selectedLetters.length >= rules.maxLetters));
              const reason = !checked
                ? rules.frozen
                  ? t('pathsFrozen')
                  : pathIds.length >= rules.maxPaths
                    ? t('pathsCapReached')
                    : wouldAddLetter && selectedLetters.length >= rules.maxLetters
                      ? t('pathsLettersReached', { max: rules.maxLetters })
                      : null
                : null;

              return (
                <label
                  key={path.id}
                  className={`flex items-center gap-2 text-sm ${disabled ? 'text-muted-foreground' : 'text-foreground'}`}
                  title={reason ?? undefined}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={(event) => togglePath(path.id, event.target.checked)}
                    className="size-4 rounded border-input"
                  />
                  <span>{path.name}</span>
                  {membership?.status === 'PENDING' ? (
                    <span className="rounded-sm bg-warning-50 px-1.5 py-0.5 text-xs text-warning">
                      {t('pathPending')}
                    </span>
                  ) : null}
                  {reason ? (
                    <span id={`path-reason-${path.id}`} className="sr-only">
                      {reason}
                    </span>
                  ) : null}
                </label>
              );
            })}
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
            {course.isGeneral
              ? t('riasecNone')
              : selectedLetters.length > 0
                ? selectedLetters.join(' · ')
                : t('riasecNone')}
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
            <Select
              {...field}
              value={language}
              onChange={(event) => setLanguage(event.target.value as 'AR' | 'EN' | '')}
            >
              <option value="AR">{t('languageAr')}</option>
              <option value="EN">{t('languageEn')}</option>
            </Select>
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
 * Publish and unpublish (§4A's bridge, §2/D-015) — the shared `PublishAction`,
 * with the blockers shown beside it rather than hidden behind the disabled
 * state: a button that cannot be pressed and does not say why is worse than no
 * button.
 */
function PublishCard({ course, onChanged }: { course: EntityCourseDetail; onChanged: () => void }) {
  const t = useTranslations('entity');

  const isPublished = course.publication === 'PUBLISHED';
  const canPublish = course.publishBlockers.length === 0;

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-foreground">
        {isPublished ? t('unpublish') : t('publish')}
      </h2>

      {!isPublished && !canPublish ? (
        <div className="mt-3">
          <p className="text-sm font-medium text-foreground">{t('publishBlockedTitle')}</p>
          <BlockerList blockers={course.publishBlockers} maxPaths={course.pathRules.maxPaths} />
        </div>
      ) : null}

      <div className="mt-4">
        <PublishAction course={course} onChanged={onChanged} />
      </div>
    </Card>
  );
}
