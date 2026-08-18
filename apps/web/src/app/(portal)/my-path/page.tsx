'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import type { MyPathCourseView, MyPathView } from '@tamkeen/types';

import { PortalPage } from '@/components/layout/portal-page';
import { DataView, EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useFormat } from '@/i18n/format-provider';
import { myPathApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

/**
 * My Path (§4.9).
 *
 * One progress bar, the chosen courses in order with their status, and the path
 * certificate as a locked slot at the bottom. Issuing that certificate is Phase
 * 3; the slot exists now so the goal is visible, and it says plainly that it is
 * locked rather than implying an action.
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
    <div className="mx-auto max-w-2xl">
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
      <div className="mx-auto max-w-2xl">
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
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
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
      <Card className={cn(path.pathCertificateUnlocked && 'border-2 border-gold')}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {!path.pathCertificateUnlocked ? (
              <Lock aria-hidden="true" className="size-4 text-muted-foreground" />
            ) : null}
            {t('certificateHeading')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {path.pathCertificateUnlocked ? t('certificateReady') : t('certificateLocked')}
          </p>
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
        'flex flex-wrap items-center justify-between gap-3 rounded-card border bg-card p-4',
        course.isNextUp ? 'border-2 border-gold' : 'border-border',
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium text-foreground">{course.title}</h3>
          {course.isNextUp ? (
            <span className="rounded-full bg-accent px-2.5 py-0.5 text-sm font-semibold text-accent-foreground">
              {t('nextUp')}
            </span>
          ) : null}
        </div>

        <p className="text-sm text-muted-foreground">
          {statusLabel}
          {course.gradePercent !== null
            ? ` · ${t('grade', { grade: format.percent(course.gradePercent) })}`
            : ''}
        </p>
      </div>

      {/* One action, and only on the course the user should do next — §4.9's
          "must not compete with continue". Completed rows offer nothing. */}
      {course.status !== 'COMPLETED' ? (
        <Button asChild variant={course.isNextUp ? 'primary' : 'outline'} size="sm">
          <a href={course.courseUrl} target="_blank" rel="noreferrer noopener">
            {course.status === 'IN_PROGRESS' ? t('continue') : t('start')}
          </a>
        </Button>
      ) : null}
    </div>
  );
}
