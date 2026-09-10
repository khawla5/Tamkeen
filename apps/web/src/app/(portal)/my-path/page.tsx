'use client';

import { Check, Lock } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import type { MyPathCourseView, MyPathLevelView, MyPathView } from '@tamkeen/types';

import { PortalPage } from '@/components/layout/portal-page';
import { DataView, EmptyState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, cardVariants } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useFormat } from '@/i18n/format-provider';
import { myPathApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

/**
 * My Path (§4.9, D-134).
 *
 * The rungs in order, the courses on each with their status, and the path
 * certificate slot at the bottom. While locked it says so plainly rather than
 * implying an action; once the path is complete it leads to the real certificate
 * in the gallery.
 *
 * **A learner may hold more than one path** (D-130). The page shows one at a
 * time — `?pathId=` picks it, the first assigned one by default — with a
 * switcher above when there are others. One path per screen because the progress
 * bar, the next-up course and the certificate slot are all *about a path*, and
 * stacking two of each would leave no single answer to "what do I do now".
 */
export default function MyPathPage() {
  const t = useTranslations('myPath');
  const search = useSearchParams();
  const pathId = search.get('pathId') ?? undefined;

  const myPath = useApiQuery(() => myPathApi.get(pathId), [pathId]);
  const all = useApiQuery(() => myPathApi.all(), []);

  return (
    <PortalPage title={t('title')}>
      <DataView isLoading={myPath.isLoading} error={myPath.error} onRetry={myPath.refetch}>
        {myPath.data ? <PathRun path={myPath.data} others={all.data ?? []} /> : <NoPath />}
      </DataView>
    </PortalPage>
  );
}

/**
 * No path assigned: information, not a dead button (D-130).
 *
 * The empty state used to send the learner to Results to choose one. There is
 * nothing to choose any more, so pointing anywhere would be pointing at a page
 * that cannot help.
 */
function NoPath() {
  const t = useTranslations('myPath');

  return (
    <div>
      <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
    </div>
  );
}

function PathRun({ path, others }: { path: MyPathView; others: MyPathView[] }) {
  const t = useTranslations('myPath');
  const format = useFormat();

  /* Assigned but not placed: the progress bar would read "0 من 0" and the rungs
     would all be locked, which describes the path as empty rather than as not
     yet theirs to start. */
  if (!path.placedLevel) {
    return (
      <div>
        <EmptyState
          title={t('awaitingPlacementTitle')}
          body={t('awaitingPlacementBody')}
          action={
            path.pendingAssessmentId ? (
              <Button asChild>
                <Link href={`/paths/${path.pathId}/assessment`}>{t('goToAssessment')}</Link>
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {others.length > 1 ? <PathSwitcher current={path} paths={others} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>{path.pathName}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm font-medium text-primary-700">
            {t('placedAt', { level: path.placedLevel.name })}
          </p>
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

      <ol className="flex flex-col gap-6">
        {path.levels.map((level) => (
          <li key={level.id}>
            <LevelSection level={level} />
          </li>
        ))}
      </ol>

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

/** Which path this screen is about, when the ministry assigned more than one. */
function PathSwitcher({ current, paths }: { current: MyPathView; paths: MyPathView[] }) {
  const t = useTranslations('myPath');

  return (
    <nav aria-label={t('switcherLabel')}>
      <ul className="flex flex-wrap gap-2">
        {paths.map((path) => (
          <li key={path.pathId}>
            <Link
              href={`/my-path?pathId=${path.pathId}`}
              aria-current={path.pathId === current.pathId ? 'page' : undefined}
              className={cn(
                'inline-flex rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                path.pathId === current.pathId
                  ? 'border-primary-600 bg-primary-50 text-primary-800'
                  : 'border-border text-muted-foreground hover:border-primary-600',
              )}
            >
              {path.pathName}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function LevelSection({ level }: { level: MyPathLevelView }) {
  const t = useTranslations('myPath');
  const format = useFormat();
  const headingId = `my-path-level-${level.id}`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 id={headingId} className="text-lg font-semibold text-foreground">
          {t('levelHeading', { position: format.number(level.position), name: level.name })}
        </h2>
        {level.standing === 'PLACED' ? (
          <Badge variant="primary">{t('standingPlaced')}</Badge>
        ) : level.standing === 'BELOW' ? (
          <Badge variant="soft">{t('standingBelow')}</Badge>
        ) : null}
      </div>

      {level.courses.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('levelEmpty')}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {level.courses.map((course) => (
            <li key={course.courseId}>
              <CourseRow course={course} />
            </li>
          ))}
        </ol>
      )}
    </section>
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

      {/*
       * One action, and only on the course the learner should do next — §4.9's
       * "must not compete with continue". A course below their rung offers
       * nothing at all: the placement says they have covered it, and a start
       * button would contradict that (D-134).
       */}
      {!course.startable ? (
        <span className="flex items-center gap-1 text-sm text-muted-foreground">
          <Check aria-hidden="true" className="size-4" />
          {t('coveredAlready')}
        </span>
      ) : course.status !== 'COMPLETED' ? (
        <Button asChild variant={course.isNextUp ? 'primary' : 'outline'} size="sm">
          {/* The player owns the handoff. Linking at the LMS directly would send
              the learner to a Moodle page that does not know who they are — the
              deep link carries no session (D-044). */}
          <Link href={`/courses/${course.courseId}/player`}>
            {course.status === 'IN_PROGRESS' ? t('continue') : t('start')}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
