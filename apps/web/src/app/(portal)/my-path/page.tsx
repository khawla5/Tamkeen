'use client';

import { Award, Check, Lock, Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { PATH_MAX_COURSES, type MyPathCourseView, type MyPathView } from '@tamkeen/types';

import { PortalPage } from '@/components/layout/portal-page';
import { DataView, EmptyState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, cardVariants } from '@/components/ui/card';
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
  const tRiasec = useTranslations('riasec');
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

  const remaining = path.totalCount - path.completedCount;
  /* The quiet add: only while the path is live and there is room (§4.9). The
     server enforces both; this only decides whether to point at the catalogue. */
  const canAdd = path.status === 'ACTIVE' && path.totalCount < PATH_MAX_COURSES;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle>{path.pathName}</CardTitle>
            <Badge variant="neutral">{tRiasec(`${path.riasecLetter}.name`)}</Badge>
          </div>
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
  );
}
