'use client';

import { Check, Lock } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import type { CourseSummary, PathDetail, PathLevelView } from '@tamkeen/types';

import { CourseStatusChip } from '@/components/courses/course-status-chip';
import { PortalPage } from '@/components/layout/portal-page';
import { DataView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, cardVariants } from '@/components/ui/card';
import { useFormat } from '@/i18n/format-provider';
import { pathsApi } from '@/lib/api-client';
import { toHours } from '@/lib/duration';
import { useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

/**
 * The path, as its ladder (§4.5, D-134).
 *
 * **Nothing here is a choice.** The build page this replaces asked a learner to
 * pick five to ten courses and commit; under the ministry's model the path is
 * assigned and its content is decided. What the page owes them instead is
 * orientation: where they were placed, what that opens, and what sits below it.
 *
 * **Every rung is shown, including the ones below theirs.** A learner placed on
 * the third rung sees the first two as ground already covered rather than as
 * work missing — which is the difference between a path that explains itself and
 * one that looks incomplete. Those courses are readable and not startable, and
 * the card says which.
 */
export default function PathPage() {
  const t = useTranslations('path');
  const params = useParams<{ pathId: string }>();
  const pathId = params.pathId;

  const path = useApiQuery(() => pathsApi.detail(pathId), [pathId]);

  return (
    <PortalPage title={path.data?.name ?? t('title')} chrome="bare">
      <DataView
        isLoading={path.isLoading}
        error={path.error}
        isEmpty={path.data?.levels.length === 0}
        onRetry={path.refetch}
        emptyProps={{ title: t('emptyTitle'), body: t('emptyBody') }}
      >
        {path.data ? <Ladder path={path.data} /> : null}
      </DataView>
    </PortalPage>
  );
}

function Ladder({ path }: { path: PathDetail }) {
  const t = useTranslations('path');
  const format = useFormat();

  const placed = path.placedLevel !== null;

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardContent className="flex flex-col gap-4 py-6">
          <h1 className="text-2xl font-bold text-foreground">{path.name}</h1>
          <p className="text-muted-foreground">{path.description}</p>

          <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">{t('levelCount')}</dt>
              <dd className="font-semibold text-foreground tabular-nums">
                {format.number(path.levelCount)}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">{t('courseCount')}</dt>
              <dd className="font-semibold text-foreground tabular-nums">
                {format.number(path.courseCount)}
              </dd>
            </div>
            {path.typicalDurationMinutes ? (
              <div className="flex gap-2">
                <dt className="text-muted-foreground">{t('duration')}</dt>
                <dd className="font-semibold text-foreground tabular-nums">
                  {t('hours', { hours: format.number(toHours(path.typicalDurationMinutes) ?? 0) })}
                </dd>
              </div>
            ) : null}
          </dl>

          {placed ? (
            /* The one fact that decides what the rest of the page means. */
            <p className="text-sm font-medium text-primary-700">
              {t('placedAt', { level: path.placedLevel!.name })}
            </p>
          ) : path.pendingAssessmentId ? (
            /* The single action, and the only one on this page (§3). */
            <Button asChild size="lg" className="self-start">
              <Link href={`/paths/${path.id}/assessment`}>{t('startAssessment')}</Link>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">{t('assessmentNotReady')}</p>
          )}
        </CardContent>
      </Card>

      <ol className="flex flex-col gap-6">
        {path.levels.map((level) => (
          <li key={level.id}>
            <Level level={level} placed={placed} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function Level({ level, placed }: { level: PathLevelView; placed: boolean }) {
  const t = useTranslations('path');
  const format = useFormat();

  const headingId = `level-${level.id}`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 id={headingId} className="text-lg font-semibold text-foreground">
          {t('levelHeading', { position: format.number(level.position), name: level.name })}
        </h2>
        {/* The standing as a word, never as colour alone (WCAG 1.4.1). */}
        {level.standing === 'PLACED' ? (
          <Badge variant="primary">{t('standingPlaced')}</Badge>
        ) : level.standing === 'BELOW' ? (
          <Badge variant="soft">{t('standingBelow')}</Badge>
        ) : null}
      </div>

      {level.courses.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('levelEmpty')}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {level.courses.map((course) => (
            <li key={course.id}>
              <CourseCard
                course={course}
                startable={placed && level.standing !== 'BELOW'}
                below={level.standing === 'BELOW'}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CourseCard({
  course,
  startable,
  below,
}: {
  course: CourseSummary;
  startable: boolean;
  below: boolean;
}) {
  const t = useTranslations('path');
  const format = useFormat();

  return (
    <Link
      href={`/courses/${course.id}`}
      className={cn(
        cardVariants(),
        'flex h-full flex-col gap-2 p-4 transition-colors hover:border-primary-600',
      )}
    >
      <span className="font-semibold text-foreground">{course.title}</span>
      <span className="line-clamp-1 text-sm text-muted-foreground">{course.summary}</span>

      <span className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-xs">
        {course.durationMinutes ? (
          <span className="text-muted-foreground tabular-nums">
            {t('hours', { hours: format.number(toHours(course.durationMinutes) ?? 0) })}
          </span>
        ) : null}
        {below ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Check aria-hidden="true" className="size-3.5" />
            {t('coveredAlready')}
          </span>
        ) : startable ? (
          <CourseStatusChip status="IN_PATH" />
        ) : (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Lock aria-hidden="true" className="size-3.5" />
            {t('lockedUntilPlaced')}
          </span>
        )}
      </span>
    </Link>
  );
}
