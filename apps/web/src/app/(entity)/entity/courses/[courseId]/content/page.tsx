'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { directionForCourseLanguage, type EntityCourseDetail } from '@tamkeen/types';

import { EntityPage } from '@/components/layout/entity-page';
import { DataView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useErrorMessage } from '@/components/auth/use-error-message';
import { useFormat } from '@/i18n/format-provider';
import { entityApi } from '@/lib/api-client';
import { useApiMutation, useApiQuery } from '@/lib/use-api';
import { useFrameContentChanged } from '@/lib/use-frame-content-changed';

/**
 * §4B.4 — Course Content.
 *
 * Deliberately thin: a launch into Moodle, and a **read-back** of what Moodle
 * holds. We do not rebuild Moodle's editor (D-046), and we do not render its
 * material (D-000/D-045) — so there is nothing else this page could honestly
 * show.
 *
 * Its real job is the last line of the read-back. D-042 found that a Moodle
 * course with no completion criteria reports `completed: false` forever, so
 * nobody on it can ever pass and no certificate can ever be issued, with nothing
 * in any log to explain it. This is where an entity sees that before publishing
 * rather than weeks later through a confused learner.
 *
 * **The frame's own edit signal (§4B.4, TAM-133).** The author launch opens
 * *inside* this page, framed (TAM-129's `embed: 'author'`) rather than through
 * a full-page redirect — the whole point of embedding is that leaving Moodle's
 * tab is no longer how an entity gets back here. `tamkeen:content-changed`
 * (fired for a content edit and for a Settings-tab rename alike, §4B.4) and the
 * manual «تحديث» both call `resync`, never the plain `getCourse` a page load
 * uses: a resync re-reads the LMS right now, so title, status, the read-back
 * and the publish blockers all refresh together from one response, instead of
 * waiting for the next scheduled catalogue sync.
 */
export default function CourseContentPage() {
  const t = useTranslations('entity');
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;

  const query = useApiQuery(() => entityApi.getCourse(courseId), [courseId]);
  const resync = useApiMutation(() => entityApi.resync(courseId));

  /*
   * Local state rather than reading `query.data` directly, because a resync
   * must apply its *own* response and stop there — the whole reason the
   * endpoint returns the full detail rather than a bare acknowledgement is so
   * the page needs no second request. `query.refetch()` would throw that
   * response away and re-read what the resync had just written.
   */
  const [course, setCourse] = useState<EntityCourseDetail | undefined>(undefined);

  useEffect(() => {
    setCourse(query.data);
  }, [query.data]);

  async function onResync() {
    const result = await resync.run();

    if (result) {
      setCourse(result);
    }
  }

  return (
    <EntityPage title={t('contentTitle')}>
      <DataView
        isLoading={query.isLoading && course === undefined}
        error={query.error}
        onRetry={query.refetch}
      >
        {course ? (
          <CourseContentBody
            course={course}
            onResync={() => void onResync()}
            resyncPending={resync.isPending}
            resyncError={resync.error}
          />
        ) : null}
      </DataView>
    </EntityPage>
  );
}

function CourseContentBody({
  course,
  onResync,
  resyncPending,
  resyncError,
}: {
  course: EntityCourseDetail;
  onResync: () => void;
  resyncPending: boolean;
  resyncError: unknown;
}) {
  const t = useTranslations('entity');
  const translateError = useErrorMessage();

  return (
    <div className="space-y-6">
      {/* The course's own name, in the body rather than the page's `<h1>` —
          the same split Manage Course uses, so a page's title bar always says
          what *kind* of screen it is and the course name lives in one place
          across both. */}
      <p
        dir={directionForCourseLanguage(course.language)}
        lang={course.language === 'EN' ? 'en' : 'ar'}
        className="text-lg font-semibold text-foreground"
      >
        {course.title}
      </p>

      <AuthorCard courseId={course.id} onContentChanged={onResync} />

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">{t('contentHeading')}</h2>
          <div className="flex flex-wrap items-center gap-4">
            {/* Quiet — this strip is exactly where "why is completion still
                false" comes up (§4B.4, TAM-134). */}
            <Link
              href="/entity/guide#completion"
              className="text-sm font-medium text-primary-700 underline-offset-4 hover:underline"
            >
              {t('guideLink')}
            </Link>
            <Button variant="ghost" onClick={onResync} disabled={resyncPending}>
              {t('contentRefresh')}
            </Button>
          </div>
        </div>

        {resyncError ? (
          <p role="alert" className="mt-3 text-sm font-medium text-destructive">
            {translateError(resyncError)}
          </p>
        ) : null}

        {course.content ? (
          <ContentSummary data={course.content} />
        ) : (
          /*
            Null means the LMS could not be asked, which the publish gate
            treats as a blocker rather than as "fine" — so saying so plainly
            here matches what the entity will be told when they try.
          */
          <p role="status" className="mt-4 text-sm text-muted-foreground">
            {t('contentUnavailable')}
          </p>
        )}
      </Card>
    </div>
  );
}

function ContentSummary({
  data,
}: {
  data: { activityCount: number; hasQuiz: boolean; completionConfigured: boolean };
}) {
  const t = useTranslations('entity');
  const format = useFormat();

  return (
    <>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <Row label={t('contentActivities')} value={format.number(data.activityCount)} />
        <Row label={t('contentQuiz')} value={data.hasQuiz ? t('contentYes') : t('contentNo')} />
        <Row
          label={t('contentCompletion')}
          value={data.completionConfigured ? t('contentYes') : t('contentNo')}
        />
      </dl>

      {!data.completionConfigured ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {t('contentCriteriaWarning')}
        </p>
      ) : null}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-medium text-foreground">{value}</dd>
    </div>
  );
}

/**
 * The launch, framed inline (§4B.4, TAM-129, TAM-133) — never rendered until
 * the click, since the URL carries a short-lived, single-use credential
 * (D-045).
 *
 * `onContentChanged` fires on the frame's `tamkeen:content-changed` message —
 * a content edit and a Settings-tab rename both trigger the identical
 * message, so this reacts to it exactly once rather than by kind.
 */
function AuthorCard({
  courseId,
  onContentChanged,
}: {
  courseId: string;
  onContentChanged: () => void;
}) {
  const t = useTranslations('entity');
  const translateError = useErrorMessage();
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<{ url: string; origin: string } | null>(null);

  useFrameContentChanged(frame?.origin ?? null, onContentChanged);

  async function onLaunch() {
    setError(null);
    setLaunching(true);

    try {
      const { url } = await entityApi.authorLaunch(courseId, { embed: true });
      setFrame({ url, origin: new URL(url).origin });
    } catch (caught) {
      setError(translateError(caught));
    } finally {
      setLaunching(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-foreground">{t('authorTitle')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('authorHint')}</p>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          variant={frame ? 'outline' : undefined}
          onClick={frame ? () => setFrame(null) : onLaunch}
          disabled={launching}
        >
          {frame ? t('authorClose') : launching ? t('authorLaunching') : t('authorLaunch')}
        </Button>
        <Button asChild variant="outline">
          <Link href={`/entity/courses/${courseId}`}>{t('manageTitle')}</Link>
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {frame ? (
        <iframe
          src={frame.url}
          title={t('authorTitle')}
          className="mt-4 h-[70vh] w-full rounded-md border border-border"
        />
      ) : null}
    </Card>
  );
}
