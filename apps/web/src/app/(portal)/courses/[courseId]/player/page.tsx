'use client';

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import type { CoursePlayerView } from '@tamkeen/types';

import { PortalPage } from '@/components/layout/portal-page';
import { DataView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFormat } from '@/i18n/format-provider';
import { coursesApi } from '@/lib/api-client';
import { useApiMutation, useApiQuery } from '@/lib/use-api';

/**
 * Course view / player (§4.8).
 *
 * Deliberately thin, and deliberately **not** an embed. Moodle owns the
 * material, the quiz and the grading; the MVP hands off to a heavily Arabic/RTL
 * themed Moodle and this page provides only what Moodle cannot: where the
 * learner is in their path, what happened last time, and the single action that
 * applies now (§5.4, D-000).
 *
 * The launch URL is fetched **on click**, never rendered into the page. It
 * carries a short-lived single-use credential, so its life has to start when the
 * learner actually goes (D-044).
 */
export default function CoursePlayerPage() {
  const t = useTranslations('player');
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;

  const player = useApiQuery(() => coursesApi.player(courseId), [courseId]);

  return (
    <PortalPage title={t('title')}>
      <DataView isLoading={player.isLoading} error={player.error} onRetry={player.refetch}>
        {player.data ? <Player course={player.data} /> : null}
      </DataView>
    </PortalPage>
  );
}

function Player({ course }: { course: CoursePlayerView }) {
  const t = useTranslations('player');
  const format = useFormat();

  const launch = useApiMutation(() => coursesApi.launch(course.courseId));

  const openCourse = async () => {
    const result = await launch.run();

    if (result) {
      /*
       * A full navigation rather than a new tab. The learner is leaving for
       * Moodle and will come back through it, and `window.open` from an async
       * callback is what popup blockers exist to stop — the click that opened it
       * has already been forgotten by the time the request resolves.
       */
      window.location.assign(result.url);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
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

        <CardContent className="space-y-4">
          <p>{course.summary}</p>

          {course.durationMinutes !== null ? (
            <p className="text-muted-blue text-sm">
              {t('duration', { minutes: format.number(course.durationMinutes) })}
            </p>
          ) : null}

          <Outcome course={course} />

          {/* Exactly one action, chosen by state (§3). Never all three. */}
          {course.canLaunch ? (
            <div className="space-y-3">
              <Button onClick={() => void openCourse()} disabled={launch.isPending}>
                <ExternalLink aria-hidden="true" className="size-4" />
                {launch.isPending
                  ? t('opening')
                  : course.passed
                    ? t('review')
                    : course.status === 'IN_PROGRESS'
                      ? t('resume')
                      : t('start')}
              </Button>

              {launch.error ? (
                <p role="alert" className="text-danger text-sm">
                  {t('launchFailed')}
                </p>
              ) : null}

              <p className="text-muted-blue text-sm">{t('opensInMoodle')}</p>
            </div>
          ) : (
            <p className="text-muted-blue text-sm">{t('notEnrolled')}</p>
          )}
        </CardContent>
      </Card>

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
