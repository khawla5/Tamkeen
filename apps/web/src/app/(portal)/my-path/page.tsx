'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import type { MyPathCourseView, MyPathView } from '@tamkeen/types';

import { PortalPage } from '@/components/layout/portal-page';
import { DataView, EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, cardVariants } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useFormat } from '@/i18n/format-provider';
import { myPathApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

/**
 * My Path (§4.9).
 *
 * One progress bar, the chosen courses in order with their status, and the path
 * certificate slot at the bottom. While locked it says so plainly rather than
 * implying an action; once the path is complete it leads to the real
 * certificate in the gallery.
 */
export default function MyPathPage() {
  const t = useTranslations('myPath');
  const myPath = useApiQuery(() => myPathApi.get(), []);

  return (
    <PortalPage title={t('title')}>
      <DataView isLoading={myPath.isLoading} error={myPath.error} onRetry={myPath.refetch}>
        {myPath.data ? <PathRun path={myPath.data} /> : <NoPath />}
      </DataView>
    </PortalPage>
  );
}

function NoPath() {
  const t = useTranslations('myPath');

  return (
    <div>
      <EmptyState
        title={t('emptyTitle')}
        body={t('emptyBody')}
        action={
          <Button asChild>
            <Link href="/results">{t('goToResults')}</Link>
          </Button>
        }
      />
    </div>
  );
}

function PathRun({ path }: { path: MyPathView }) {
  const t = useTranslations('myPath');
  const format = useFormat();

  /* A path still being built is not a run view — send the user back to finish
     choosing rather than showing a progress bar over an unconfirmed selection. */
  if (path.status === 'BUILDING') {
    return (
      <div>
        <EmptyState
          title={t('buildingTitle')}
          body={t('buildingBody')}
          action={
            <Button asChild>
              <Link href={`/paths/${path.pathId}`}>{t('goToBuild')}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{path.pathName}</CardTitle>
        </CardHeader>
        <CardContent>
          <Progress
            value={path.completedCount}
            max={path.totalCount}
            label={t('progressLabel')}
            valueText={t('progressValue', {
              completed: format.number(path.completedCount),
              total: format.number(path.totalCount),
            })}
          />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">{t('coursesHeading')}</h2>

        <ol className="flex flex-col gap-3">
          {path.courses.map((course) => (
            <li key={course.id}>
              <CourseRow course={course} />
            </li>
          ))}
        </ol>
      </section>

      {/* The locked certificate slot (§4.9). */}
      <Card variant={path.pathCertificateUnlocked ? 'selected' : 'default'}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {!path.pathCertificateUnlocked ? (
              <Lock aria-hidden="true" className="size-4 text-muted-foreground" />
            ) : null}
            {t('certificateHeading')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">
            {path.pathCertificateUnlocked ? t('certificateReady') : t('certificateLocked')}
          </p>
          {/*
            The slot now leads somewhere. `pathCertificateUnlocked` is the
            path's own COMPLETED status, which is the same condition the
            certificate is issued on — so an unlocked slot always has a real
            certificate behind it rather than a promise.
          */}
          {path.pathCertificateUnlocked ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/certificates">{t('certificateOpen')}</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function CourseRow({ course }: { course: MyPathCourseView }) {
  const t = useTranslations('myPath');
  const format = useFormat();

  const statusLabel =
    course.status === 'COMPLETED'
      ? t('statusCompleted')
      : course.status === 'IN_PROGRESS'
        ? t('statusInProgress')
        : t('statusNotStarted');

  return (
    <div
      className={cn(
        cardVariants({ variant: course.isNextUp ? 'selected' : 'default' }),
        'flex flex-wrap items-center justify-between gap-3 p-4',
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium text-foreground">{course.title}</h3>
          {course.isNextUp ? <Badge variant="primary">{t('nextUp')}</Badge> : null}
        </div>

        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {/* The state as a tag (TAM-119): the word carries it, the tone repeats it. */}
          <Badge
            variant={
              course.status === 'COMPLETED'
                ? 'success'
                : course.status === 'IN_PROGRESS'
                  ? 'info'
                  : 'neutral'
            }
          >
            {statusLabel}
          </Badge>
          {course.gradePercent !== null ? (
            <span>{t('grade', { grade: format.percent(course.gradePercent) })}</span>
          ) : null}
        </p>
      </div>

      {/* One action, and only on the course the user should do next — §4.9's
          "must not compete with continue". Completed rows offer nothing. */}
      {course.status !== 'COMPLETED' ? (
        <Button asChild variant={course.isNextUp ? 'primary' : 'outline'} size="sm">
          {/* The player owns the handoff. Linking at the LMS directly would
              send the learner to a Moodle page that does not know who they
              are — the deep link carries no session (D-044). */}
          <Link href={`/courses/${course.courseId}/player`}>
            {course.status === 'IN_PROGRESS' ? t('continue') : t('start')}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
