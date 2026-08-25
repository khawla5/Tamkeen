'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import type { CoursePlayerView } from '@tamkeen/types';

import { useErrorMessage } from '@/components/auth/use-error-message';
import { PortalPage } from '@/components/layout/portal-page';
import { MoodleEmbed } from '@/components/moodle-embed';
import { DataView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFormat } from '@/i18n/format-provider';
import { coursesApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * Course view / player (§4.8) — the course inside the page (D-102).
 *
 * Moodle still owns the material, the quiz and the grading; what changed is
 * that the learner no longer leaves for it. The page keeps what Moodle cannot
 * provide — where the learner is in their path, what happened last time — and
 * frames the course beneath it, with the full-page handoff (D-045) as the
 * fallback when the frame cannot establish a session.
 *
 * The launch URL is minted **on mount** and rendered only as the frame's `src`
 * once it has resolved; by then the plugin has spent the nonce (D-098). When
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
  const onQuizFinished = useCallback(() => {
    /* The sync is best-effort: the scheduled run remains the safety net. */
    coursesApi
      .sync(course.courseId)
      .catch(() => undefined)
      .finally(onOutcome);
  }, [course.courseId, onOutcome]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          {course.pathName ? (
            <p className="text-muted-blue text-sm">
              {course.orderInPath !== null && course.totalInPath !== null
                ? t('pathContext', {
                    path: course.pathName,
                    order: format.number(course.orderInPath),
                    total: format.number(course.totalInPath),
                  })
                : course.pathName}
            </p>
          ) : null}
          <CardTitle>{course.title}</CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          <p>{course.summary}</p>

          {course.durationMinutes !== null ? (
            <p className="text-muted-blue text-sm">
              {t('duration', { minutes: format.number(course.durationMinutes) })}
            </p>
          ) : null}

          <Outcome course={course} />

          {!course.canLaunch ? <p className="text-muted-blue text-sm">{t('notEnrolled')}</p> : null}
        </CardContent>
      </Card>

      {course.canLaunch ? (
        <MoodleEmbed
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
        />
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href="/my-path">{t('backToPath')}</Link>
        </Button>

        {course.passed && course.nextCourseId ? (
          <Button asChild>
            <Link href={`/courses/${course.nextCourseId}/player`}>{t('nextCourse')}</Link>
          </Button>
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
      <div className="border-primary-600 bg-primary-50 rounded-lg border p-4">
        <p className="font-semibold">{t('passedTitle')}</p>
        <p className="text-sm">{t('passedBody', { grade })}</p>
      </div>
    );
  }

  return (
    <div className="border-danger/40 bg-danger/5 rounded-lg border p-4">
      <p className="font-semibold">{t('failedTitle')}</p>
      <p className="text-sm">
        {t('failedBody', { grade, threshold: format.percent(course.passThreshold / 100) })}
      </p>
    </div>
  );
}
