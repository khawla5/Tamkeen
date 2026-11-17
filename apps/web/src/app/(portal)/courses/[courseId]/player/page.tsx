'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';

import type { CourseOutlineView, CoursePlayerView } from '@tamkeen/types';

import { useErrorMessage } from '@/components/auth/use-error-message';
import { PortalPage } from '@/components/layout/portal-page';
import { MoodleEmbed, type MoodleEmbedHandle } from '@/components/moodle-embed';
import { DataView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFormat } from '@/i18n/format-provider';
import { coursesApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * Course view / player (§4.8) — the course inside the page (D-121).
 *
 * Moodle still owns the material, the quiz and the grading; what changed is
 * that the learner no longer leaves for it. The page keeps what Moodle cannot
 * provide — where the learner is in their path, what happened last time — and
 * frames the course beneath it, with the full-page handoff (D-045) as the
 * fallback when the frame cannot establish a session.
 *
 * The launch URL is minted **on mount** and rendered only as the frame's `src`
 * once it has resolved; by then the plugin has spent the nonce (D-101). When
 * the frame reports a submitted quiz, the page asks for an on-demand sync and
 * refetches, so the outcome below updates within seconds rather than at the
 * next scheduled run.
 */
export default function CoursePlayerPage() {
  const t = useTranslations('player');
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;

  const player = useApiQuery(() => coursesApi.player(courseId), [courseId]);

  return (
    <PortalPage title={t('title')}>
      <DataView isLoading={player.isLoading} error={player.error} onRetry={player.refetch}>
        {player.data ? <Player course={player.data} onOutcome={player.refetch} /> : null}
      </DataView>
    </PortalPage>
  );
}

function Player({ course, onOutcome }: { course: CoursePlayerView; onOutcome: () => void }) {
  const t = useTranslations('player');
  const format = useFormat();
  const translateError = useErrorMessage();

  const launchEmbed = useCallback(
    () => coursesApi.launch(course.courseId, { embed: true }),
    [course.courseId],
  );
  const launchFullPage = useCallback(() => coursesApi.launch(course.courseId), [course.courseId]);
  /* The outline (D-122): the activities in order, so the panel can say where
     the learner is and move the frame to the neighbour. Loaded only when the
     course can be entered; the frame reports which activity it shows. */
  const outline = useApiQuery<CourseOutlineView>(
    () => (course.canLaunch ? coursesApi.outline(course.courseId) : Promise.resolve({ items: [] })),
    [course.courseId, course.canLaunch],
  );
  const frame = useRef<MoodleEmbedHandle>(null);
  const [currentModuleId, setCurrentModuleId] = useState<number | null>(null);
  const items = outline.data?.items ?? [];
  const currentIndex = items.findIndex((item) => item.moduleId === currentModuleId);
  const previous = currentIndex > 0 ? items[currentIndex - 1] : null;
  const next = currentIndex === -1 ? (items[0] ?? null) : (items[currentIndex + 1] ?? null);
  const onReady = useCallback((info: { moduleId: number | null }) => {
    setCurrentModuleId(info.moduleId);
  }, []);

  const onQuizFinished = useCallback(() => {
    /* The sync is best-effort: the scheduled run remains the safety net. */
    coursesApi
      .sync(course.courseId)
      .catch(() => undefined)
      .finally(onOutcome);
  }, [course.courseId, onOutcome]);

  /*
   * The course is the page. The frame takes the main column at the height the
   * viewport allows; everything the frame cannot say — where this course sits
   * in the path, what happened last time, the way back and the way on — lives
   * in a slim panel beside it (RTL: on the start side, the frame on the end),
   * sticky so it stays in reach while the course scrolls. Under `lg` the panel
   * becomes a compact strip above the frame; the description folds away so
   * the material is never more than one glance down.
   */
  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
      <aside className="space-y-4 lg:sticky lg:top-6">
        <Card>
          <CardHeader className="space-y-1">
            {course.pathName ? (
              <p className="text-muted-blue text-sm">
                {course.levelName !== null &&
                course.orderInLevel !== null &&
                course.totalInLevel !== null
                  ? t('pathContext', {
                      path: course.pathName,
                      level: course.levelName,
                      order: format.number(course.orderInLevel),
                      total: format.number(course.totalInLevel),
                    })
                  : course.pathName}
              </p>
            ) : null}
            <CardTitle className="text-lg">{course.title}</CardTitle>
          </CardHeader>

          <CardContent className="space-y-3">
            {course.durationMinutes !== null ? (
              <p className="text-muted-blue text-sm">
                {t('duration', { minutes: format.number(course.durationMinutes) })}
              </p>
            ) : null}

            <Outcome course={course} />

            {course.summary ? (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-blue">{t('about')}</summary>
                <p className="mt-2">{course.summary}</p>
              </details>
            ) : null}

            {!course.canLaunch ? (
              <p className="text-muted-blue text-sm">{t('notEnrolled')}</p>
            ) : null}

            {items.length > 0 ? (
              <nav aria-label={t('outlineNav')} className="space-y-2 border-t border-border pt-3">
                <p className="text-sm">
                  {currentIndex === -1 ? (
                    <span className="text-muted-blue">
                      {t('outlineAtCourse', { total: format.number(items.length) })}
                    </span>
                  ) : (
                    <>
                      <span className="text-muted-blue">
                        {t('outlinePosition', {
                          order: format.number(currentIndex + 1),
                          total: format.number(items.length),
                        })}
                      </span>
                      <span className="block font-medium">{items[currentIndex]!.name}</span>
                    </>
                  )}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!previous}
                    onClick={() => previous && frame.current?.navigate(previous.url)}
                  >
                    <ChevronRight aria-hidden="true" className="size-4 ltr:rotate-180" />
                    {t('previous')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!next}
                    onClick={() => next && frame.current?.navigate(next.url)}
                  >
                    {t('next')}
                    <ChevronLeft aria-hidden="true" className="size-4 ltr:rotate-180" />
                  </Button>
                </div>
              </nav>
            ) : null}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button asChild variant="outline" size="sm">
                <Link href="/my-path">{t('backToPath')}</Link>
              </Button>

              {course.passed && course.nextCourseId ? (
                <Button asChild size="sm">
                  <Link href={`/courses/${course.nextCourseId}/player`}>{t('nextCourse')}</Link>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </aside>

      <div className="min-w-0">
        {course.canLaunch ? (
          <MoodleEmbed
            ref={frame}
            onReady={onReady}
            title={course.title}
            labels={{
              loading: t('embedLoading'),
              failedTitle: t('embedFailedTitle'),
              failedBody: t('embedFailedBody'),
              openFullPage: t('embedOpenFullPage'),
              opening: t('opening'),
            }}
            launchEmbed={launchEmbed}
            launchFullPage={launchFullPage}
            translateError={translateError}
            onQuizFinished={onQuizFinished}
            frameClassName="h-[calc(100dvh-11rem)] min-h-[36rem]"
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * What happened last time.
 *
 * The failing case is the one that matters: §4.8 asks for a *clear retake
 * action*, so it states the grade, states the threshold, and says plainly that
 * the course can be taken again — rather than leaving a learner to infer why
 * nothing was awarded.
 */
function Outcome({ course }: { course: CoursePlayerView }) {
  const t = useTranslations('player');
  const format = useFormat();

  if (course.gradePercent === null) {
    return null;
  }

  const grade = format.percent(course.gradePercent / 100);

  if (course.passed) {
    return (
      <Card edge="success" className="p-4">
        <p className="font-semibold text-foreground">{t('passedTitle')}</p>
        <p className="text-sm text-neutral-700">{t('passedBody', { grade })}</p>
      </Card>
    );
  }

  return (
    <Card edge="danger" className="p-4">
      <p className="font-semibold text-foreground">{t('failedTitle')}</p>
      <p className="text-sm">
        {t('failedBody', { grade, threshold: format.percent(course.passThreshold / 100) })}
      </p>
    </Card>
  );
}
