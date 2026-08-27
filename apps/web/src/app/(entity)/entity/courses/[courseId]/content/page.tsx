'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { useErrorMessage } from '@/components/auth/use-error-message';

import { directionForCourseLanguage, type EntityCourseDetail } from '@tamkeen/types';

import { BlockerList } from '@/components/entity/blocker-list';
import { PublishAction } from '@/components/entity/publish-action';
import { EntityPage } from '@/components/layout/entity-page';
import { MoodleEmbed } from '@/components/moodle-embed';
import { DataView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useFormat } from '@/i18n/format-provider';
import { entityApi } from '@/lib/api-client';
import { useApiMutation, useApiQuery } from '@/lib/use-api';

/**
 * §4B.4 — Course Content: the authoring loop on one page (TAM-139, D-101).
 *
 * Moodle's own editor, framed inside the shell with editing on, and beside it
 * the **read-back** of what Moodle holds — activities, the quiz, completion
 * criteria (D-061). The entity adds material, watches the read-back update
 * (the frame says when something changed), and publishes from the page header
 * without ever seeing Moodle's frame around the editor.
 *
 * We still do not rebuild the editor (D-046): everything inside the frame is
 * Moodle's. What this page owns is the seam — the launch, the read-back, the
 * D-042 warning where it can be acted on, and the decision to publish.
 *
 * **The frame's edit signal calls `resync`, never a plain re-read (D-115).**
 * `tamkeen:content-changed` (fired for a content edit and for a Settings-tab
 * rename alike) and the manual «تحديث» both hit
 * `POST /api/entity/courses/:id/resync` — a synchronous single-course re-read
 * of the LMS — so title, status, the read-back and the publish blockers all
 * refresh together from one response, instead of waiting for the next
 * scheduled catalogue sync. The response is applied as local state: the
 * endpoint returns the full detail precisely so no second request is needed.
 */
export default function CourseContentPage() {
  const t = useTranslations('entity');
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;

  /* One request carries the read-back AND the publish gate, so a change in the
     editor refreshes both — the blockers clear on the page the entity is
     looking at. */
  const query = useApiQuery(() => entityApi.getCourse(courseId), [courseId]);
  const resync = useApiMutation(() => entityApi.resync(courseId));

  const [course, setCourse] = useState<EntityCourseDetail | undefined>(undefined);

  useEffect(() => {
    setCourse(query.data);
  }, [query.data]);

  const translateError = useErrorMessage();
  const launchEmbed = useCallback(
    () => entityApi.authorLaunch(courseId, { embed: true }),
    [courseId],
  );
  const launchFullPage = useCallback(() => entityApi.authorLaunch(courseId), [courseId]);

  /* `run` is stable (useApiMutation memoises it), so this identity holds. */
  const resyncRun = resync.run;
  const onResync = useCallback(async () => {
    const result = await resyncRun();

    if (result) {
      setCourse(result);
    }
  }, [resyncRun]);

  return (
    <EntityPage
      title={t('contentTitle')}
      action={
        course ? <PublishAction course={course} onChanged={() => query.refetch()} /> : undefined
      }
    >
      {/* First load only: the read-back refreshes after every edit, and a
          spinner over the editor each time would be exactly the interruption
          the frame exists to remove. */}
      <DataView
        isLoading={query.isLoading && course === undefined}
        error={query.error}
        onRetry={query.refetch}
      >
        {course ? (
          <div className="space-y-6">
            <ReadBackStrip
              course={course}
              onRefresh={() => void onResync()}
              refreshPending={resync.isPending}
              refreshError={resync.error}
            />
            <MoodleEmbed
              title={course.title}
              labels={{
                loading: t('embedLoading'),
                failedTitle: t('embedFailedTitle'),
                failedBody: t('embedFailedBody'),
                openFullPage: t('embedOpenFullPage'),
                opening: t('authorLaunching'),
              }}
              launchEmbed={launchEmbed}
              launchFullPage={launchFullPage}
              translateError={translateError}
              onContentChanged={() => void onResync()}
            />
          </div>
        ) : null}
      </DataView>
    </EntityPage>
  );
}

/**
 * What Moodle holds right now, and why publishing is blocked if it is. Compact
 * on purpose — it sits above the editor, not instead of it.
 */
function ReadBackStrip({
  course,
  onRefresh,
  refreshPending,
  refreshError,
}: {
  course: EntityCourseDetail;
  onRefresh: () => void;
  refreshPending: boolean;
  refreshError: unknown;
}) {
  const t = useTranslations('entity');
  const format = useFormat();
  const translateError = useErrorMessage();
  const content = course.content;
  const blocked = course.publication !== 'PUBLISHED' && course.publishBlockers.length > 0;

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            dir={directionForCourseLanguage(course.language)}
            lang={course.language === 'EN' ? 'en' : 'ar'}
            className="truncate text-base font-semibold text-foreground"
          >
            {course.title}
          </p>
          {course.summary ? (
            /* The description learners will read — shown where the entity
               edits the course, so the two never drift unnoticed (TAM-143). */
            <p
              dir={directionForCourseLanguage(course.language)}
              lang={course.language === 'EN' ? 'en' : 'ar'}
              className="mt-1 text-sm text-muted-foreground"
            >
              {course.summary}
            </p>
          ) : null}
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{t(`publication${course.publication}`)}</span>
            <span>{t(`status${course.status}`)}</span>
            {/* Quiet — this strip is exactly where "why is completion still
                false" comes up (§4B.4, TAM-143). */}
            <Link
              href="/entity/guide#completion"
              className="text-sm font-medium text-primary-700 underline-offset-4 hover:underline"
            >
              {t('guideLink')}
            </Link>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={onRefresh} disabled={refreshPending}>
            {t('contentRefresh')}
          </Button>
          <Button asChild variant="outline">
            <Link href={`/entity/courses/${course.id}`}>{t('manageTitle')}</Link>
          </Button>
        </div>
      </div>

      {refreshError !== undefined && refreshError !== null ? (
        <p role="alert" className="mt-3 text-sm font-medium text-destructive">
          {translateError(refreshError)}
        </p>
      ) : null}

      {content ? (
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <Row label={t('contentActivities')} value={format.number(content.activityCount)} />
          <Row
            label={t('contentQuiz')}
            value={content.hasQuiz ? t('contentYes') : t('contentNo')}
          />
          <Row
            label={t('contentCompletion')}
            value={content.completionConfigured ? t('contentYes') : t('contentNo')}
          />
        </dl>
      ) : (
        /*
          Null means the LMS could not be asked, which the publish gate treats
          as a blocker rather than as "fine" — so saying so plainly here matches
          what the entity will be told when they try.
        */
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          {t('contentUnavailable')}
        </p>
      )}

      {content && !content.completionConfigured ? (
        /* The D-042 dead end, named beside the editor that fixes it. */
        <p role="alert" className="mt-3 text-sm text-destructive">
          {t('contentCriteriaWarning')}
        </p>
      ) : null}

      {blocked ? (
        <div className="mt-3">
          <p className="text-sm font-medium text-foreground">{t('publishBlockedTitle')}</p>
          <BlockerList blockers={course.publishBlockers} maxPaths={course.pathRules.maxPaths} />
        </div>
      ) : null}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-base font-medium text-foreground">{value}</dd>
    </div>
  );
}
