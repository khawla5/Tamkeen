'use client';

import { Award, Check, Lock, Plus } from 'lucide-react';
import { Check, Lock } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { PATH_MAX_COURSES, type MyPathCourseView, type MyPathView } from '@tamkeen/types';
import type { MyPathCourseView, MyPathLevelView, MyPathView } from '@tamkeen/types';

import { PortalPage } from '@/components/layout/portal-page';
import { DataView, EmptyState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useFormat } from '@/i18n/format-provider';
import { certificatesApi, myPathApi } from '@/lib/api-client';
import { toHours } from '@/lib/duration';
import { useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

/**
 * My Path (§4.9) as the journey it describes (TAM-126).
 *
 * A header card with the path's meta and the one progress bar, then a
 * **vertical rail** of numbered stops in API order: done stops carry a check,
 * «مكتملة», the grade and a quiet link to that course's certificate; the
 * current stop (`isNextUp`) is the highlighted card and holds **the page's
 * only button**; upcoming stops are quiet rows with their state in words. The
 * certificate is the rail's last stop — locked, it says exactly what unlocks
 * it; unlocked, it leads to the gallery. Between the two, while the path is
 * active and under the cap, the quiet add (§4.9, owed since Phase 1) points at
 * the catalogue, where the course page performs the add.
 *
 * The rail is presentation: the list stays an `<ol>`, every state is text
 * (glyphs are `aria-hidden`), and headings run h1 page → h2 section → h3 stop.
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
  const tRiasec = useTranslations('riasec');
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

  const remaining = path.totalCount - path.completedCount;
  /* The quiet add: only while the path is live and there is room (§4.9). The
     server enforces both; this only decides whether to point at the catalogue. */
  const canAdd = path.status === 'ACTIVE' && path.totalCount < PATH_MAX_COURSES;

  return (
    <div className="flex flex-col gap-6">
      {others.length > 1 ? <PathSwitcher current={path} paths={others} /> : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle>{path.pathName}</CardTitle>
            <Badge variant="neutral">{tRiasec(`${path.riasecLetter}.name`)}</Badge>
          </div>
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

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-foreground">{t('coursesHeading')}</h2>

        {/* The rail: a start-side border the stops' markers sit on. Logical
            properties only — the rail is on the inline-start edge in any
            direction. */}
        <ol className="ms-4 flex flex-col gap-4 border-s-2 border-neutral-300 ps-8">
          {path.courses.map((course, index) => (
            <Stop key={course.id} course={course} position={index + 1} />
          ))}

          {canAdd ? (
            <li className="relative">
              <Marker tone="quiet">
                <Plus aria-hidden="true" className="size-4" />
              </Marker>
              <Link
                href="/courses"
                className="inline-block py-2 text-sm font-medium text-neutral-700 underline-offset-4 hover:text-foreground hover:underline"
              >
                {t('addCourse', {
                  count: format.number(path.totalCount),
                  max: format.number(PATH_MAX_COURSES),
                })}
              </Link>
            </li>
      <PathCheckpoints levels={path.levels} />

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

          <CertificateStop
            unlocked={path.pathCertificateUnlocked}
            total={path.totalCount}
            remaining={remaining}
          />
        </ol>
      </section>
    </div>
  );
}

/** The circle on the rail: a number, a check, a lock. Decorative — the state is
 *  in the stop's text. */
function Marker({
  tone,
  children,
}: {
  tone: 'done' | 'current' | 'upcoming' | 'quiet' | 'achievement';
  children: ReactNode;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'absolute top-3 -start-[calc(2rem+1px)] flex size-8 -translate-x-1/2 items-center justify-center rounded-full border-2 text-sm font-semibold rtl:translate-x-1/2',
        tone === 'done' && 'border-success bg-success-50 text-success',
        tone === 'current' && 'border-primary-600 bg-primary-600 text-primary-foreground',
        tone === 'upcoming' && 'border-neutral-300 bg-card text-neutral-500',
        tone === 'quiet' && 'border-dashed border-neutral-300 bg-card text-neutral-500',
        tone === 'achievement' && 'border-primary-600 bg-primary-50 text-primary-700',
      )}
    >
      {children}
    </span>
  );
}

function Stop({ course, position }: { course: MyPathCourseView; position: number }) {
  const t = useTranslations('myPath');
  const format = useFormat();
  const hours = toHours(course.durationMinutes);

  if (course.status === 'COMPLETED') {
    return (
      <li className="relative">
        <Marker tone="done">
          <Check aria-hidden="true" className="size-4" />
        </Marker>
        <div className="flex flex-col gap-1 py-2">
          <h3 className="font-medium text-foreground">{course.title}</h3>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="success">{t('statusCompleted')}</Badge>
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

/** A step's visual weight on the trail: passed, the one to do next, or ahead. */
type CheckpointState = 'done' | 'current' | 'upcoming';

function levelState(level: MyPathLevelView): CheckpointState {
  if (level.standing === 'BELOW') return 'done';
  if (level.standing === 'PLACED') return 'current';
  return 'upcoming';
}

function courseState(
  course: MyPathCourseView,
  levelStanding: MyPathLevelView['standing'],
): CheckpointState {
  if (course.status === 'COMPLETED') return 'done';
  /* Ground below the learner's rung reads as covered, same as the level
     circle above it. A rung above theirs is real work they have not reached
     yet — 'upcoming', never 'done': a green check there would claim they
     passed something they have not even started. */
  if (levelStanding === 'BELOW') return 'done';
  if (!course.startable) return 'upcoming';
  if (course.isNextUp) return 'current';
  return 'upcoming';
}

/**
 * The rungs and their courses as one connected trail (D-134): a single line
 * runs through every checkpoint in order, a level's circle bigger than a
 * course's, so the path reads as one continuous climb rather than a stack of
 * unrelated cards. Every circle still sits in a fixed-width column so the
 * line lands on its centre regardless of which size the step uses.
 */
function PathCheckpoints({ levels }: { levels: MyPathLevelView[] }) {
  return (
    <ol className="relative flex flex-col">
      <div aria-hidden="true" className="absolute inset-y-0 start-5 w-px bg-border" />
      {levels.map((level) => (
        <li key={level.id} className="flex flex-col">
          <LevelCheckpoint level={level} />
          {level.courses.map((course) => (
            <CourseCheckpoint
              key={course.courseId}
              course={course}
              levelStanding={level.standing}
            />
          ))}
        </li>
      ))}
    </ol>
  );
}

function CheckpointCircle({
  state,
  size,
  children,
}: {
  state: CheckpointState;
  size: 'lg' | 'md';
  children: ReactNode;
}) {
  return (
    <span className="relative flex w-10 shrink-0 items-center justify-center py-1.5">
      <span
        className={cn(
          'relative z-10 flex shrink-0 items-center justify-center rounded-full border-2 font-semibold',
          size === 'lg' ? 'size-10 text-base' : 'size-8 text-sm',
          state === 'done' && 'border-success bg-success text-white',
          state === 'current' &&
            'border-primary-600 bg-primary-600 text-white ring-4 ring-primary-100',
          state === 'upcoming' && 'border-border bg-card text-muted-foreground',
        )}
      >
        {children}
      </span>
    </span>
  );
}

function LevelCheckpoint({ level }: { level: MyPathLevelView }) {
  const t = useTranslations('myPath');
  const format = useFormat();
  const state = levelState(level);
  const headingId = `my-path-level-${level.id}`;

  return (
    <section aria-labelledby={headingId} className="flex gap-4 pb-4">
      <CheckpointCircle state={state} size="lg">
        {state === 'done' ? (
          <Check aria-hidden="true" className="size-5" />
        ) : (
          format.number(level.position)
        )}
      </CheckpointCircle>

      <div className="flex flex-1 flex-wrap items-baseline gap-3 pt-2.5">
        <h2 id={headingId} className="text-lg font-semibold text-foreground">
          {t('levelHeading', { position: format.number(level.position), name: level.name })}
        </h2>
        {level.standing === 'PLACED' ? (
          <Badge variant="primary">{t('standingPlaced')}</Badge>
        ) : level.standing === 'BELOW' ? (
          <Badge variant="soft">{t('standingBelow')}</Badge>
        ) : null}

        {level.courses.length === 0 ? (
          <p className="w-full text-sm text-muted-foreground">{t('levelEmpty')}</p>
        ) : null}
      </div>
    </section>
  );
}

function CourseCheckpoint({
  course,
  levelStanding,
}: {
  course: MyPathCourseView;
  levelStanding: MyPathLevelView['standing'];
}) {
  const t = useTranslations('myPath');
  const format = useFormat();
  const state = courseState(course, levelStanding);
  const below = levelStanding === 'BELOW';

  const statusLabel =
    course.status === 'COMPLETED'
      ? t('statusCompleted')
      : course.status === 'IN_PROGRESS'
        ? t('statusInProgress')
        : t('statusNotStarted');

  return (
    <div className="flex gap-4 pb-4">
      <CheckpointCircle state={state} size="md">
        {state === 'done' ? <Check aria-hidden="true" className="size-4" /> : null}
      </CheckpointCircle>

      <div
        className={cn(
          'flex flex-1 flex-wrap items-center justify-between gap-3 rounded-lg p-3',
          course.isNextUp && 'bg-primary-50',
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
          {/* The same file the gallery opens — one URL scheme, not two. A link,
              not a button: nothing here competes with the current stop. */}
          {course.certificateId !== null ? (
            <a
              href={certificatesApi.fileUrl(course.certificateId, 'inline')}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('viewCourseCertificate', { title: course.title })}
              className="self-start text-sm font-medium text-primary-700 underline-offset-4 hover:underline"
            >
              {t('viewCertificate')}
            </a>
          ) : null}
        </div>
      </li>
    );
  }

  const statusLabel =
    course.status === 'IN_PROGRESS' ? t('statusInProgress') : t('statusNotStarted');

  if (course.isNextUp) {
    return (
      <li className="relative">
        <Marker tone="current">{format.number(position)}</Marker>
        <div
          className={cn(
            cardVariants({ variant: 'selected' }),
            'flex flex-wrap items-center justify-between gap-3 p-4',
          )}
        >
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium text-foreground">{course.title}</h3>
              <Badge variant="primary">{t('nextUp')}</Badge>
            </div>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant={course.status === 'IN_PROGRESS' ? 'info' : 'neutral'}>
                {statusLabel}
              </Badge>
              {hours !== null ? (
                <span>{t('duration', { hours: format.number(hours) })}</span>
              ) : null}
            </p>
          </div>

          {/* The page's one button (§3, §4.9). The player owns the handoff —
              a direct LMS link carries no session (D-044). */}
          <Button asChild size="sm">
            <Link href={`/courses/${course.courseId}/player`}>
              {course.status === 'IN_PROGRESS' ? t('continue') : t('start')}
            </Link>
          </Button>
        </div>
      </li>
    );
  }

  /* Upcoming — and an IN_PROGRESS course that is not next-up: its state only;
     its access stays on the course page. */
  return (
    <li className="relative">
      <Marker tone="upcoming">{format.number(position)}</Marker>
      <div className="flex flex-col gap-1 py-2">
        <h3 className="font-medium text-foreground">{course.title}</h3>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant={course.status === 'IN_PROGRESS' ? 'info' : 'neutral'}>
            {statusLabel}
          </Badge>
          {hours !== null ? <span>{t('duration', { hours: format.number(hours) })}</span> : null}
        </p>
      </div>
    </li>
  );
}

function CertificateStop({
  unlocked,
  total,
  remaining,
}: {
  unlocked: boolean;
  total: number;
  remaining: number;
}) {
  const t = useTranslations('myPath');
  const format = useFormat();

  if (unlocked) {
    return (
      <li className="relative">
        <Marker tone="achievement">
          <Award aria-hidden="true" className="size-4" />
        </Marker>
        <div
          className={cn(
            cardVariants({ variant: 'selected' }),
            'flex flex-col items-start gap-3 p-4',
          )}
        >
          <h3 className="font-semibold text-foreground">{t('certificateHeading')}</h3>
          <p className="text-sm text-muted-foreground">{t('certificateReady')}</p>
          {/* `pathCertificateUnlocked` is the path's own COMPLETED status, the
              same condition the certificate is issued on — so this always leads
              to a real certificate, never a promise. */}
          <Button asChild variant="outline" size="sm">
            <Link href="/certificates">{t('certificateOpen')}</Link>
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="relative">
      <Marker tone="upcoming">
        <Lock aria-hidden="true" className="size-4" />
      </Marker>
      <div className="flex flex-col gap-1 py-2">
        <h3 className="font-medium text-foreground">{t('certificateHeading')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('certificateLocked', {
            total: format.number(total),
            remaining: format.number(remaining),
          })}
        </p>
      </div>
    </li>
        {/*
         * One action, and only on the course the learner should do next — §4.9's
         * "must not compete with continue". A course below their rung offers
         * nothing at all: the placement says they have covered it, and a start
         * button would contradict that (D-134). A course above their rung is
         * real work they have not reached yet — locked, not covered, so it
         * gets its own word rather than borrowing the "already done" one.
         */}
        {below ? (
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <Check aria-hidden="true" className="size-4" />
            {t('coveredAlready')}
          </span>
        ) : !course.startable ? (
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <Lock aria-hidden="true" className="size-4" />
            {t('lockedAboveLevel')}
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
    </div>
  );
}
