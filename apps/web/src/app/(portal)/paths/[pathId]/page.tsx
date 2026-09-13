'use client';

import { Check, ChevronDown, Lock } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { CourseSummary, PathDetail, PathLevelView } from '@tamkeen/types';

import { CourseStatusChip } from '@/components/courses/course-status-chip';
import { PortalPage } from '@/components/layout/portal-page';
import { DataView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useFormat } from '@/i18n/format-provider';
import { coursesApi, pathsApi } from '@/lib/api-client';
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

  /* Shared with the checkpoint circle (D-134): the learner's own rung starts
     open, everything else starts collapsed, and either the heading or the
     circle can toggle a rung — two handles on the same state, not two. */
  const [openLevels, setOpenLevels] = useState(
    () => new Set(path.levels.filter((level) => level.standing === 'PLACED').map((level) => level.id)),
  );

  function toggleLevel(levelId: string) {
    setOpenLevels((current) => {
      const next = new Set(current);
      if (next.has(levelId)) {
        next.delete(levelId);
      } else {
        next.add(levelId);
      }
      return next;
    });
  }

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

      {/* The whole ladder as one connected trail (D-134): a single line runs
          through every level's checkpoint AND every course's beneath it, in
          order, so "where am I, what's behind me, what's ahead" reads as one
          climb rather than a heading followed by an unrelated grid. */}
      <ol className="relative flex flex-col">
        <div aria-hidden="true" className="absolute inset-y-0 start-5 w-px bg-border" />
        {path.levels.map((level) => {
          const open = openLevels.has(level.id);
          return (
            <li key={level.id} className="flex flex-col">
              <LevelRow level={level} open={open} onToggle={() => toggleLevel(level.id)} />

              {open ? (
                level.courses.length === 0 ? (
                  <p className="ps-14 pb-4 text-sm text-muted-foreground">{t('levelEmpty')}</p>
                ) : (
                  level.courses.map((course) => (
                    <CourseCheckpoint
                      key={course.id}
                      course={course}
                      startable={placed && level.standing !== 'BELOW'}
                      below={level.standing === 'BELOW'}
                    />
                  ))
                )
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** A rung's row: its checkpoint circle and its heading, both toggling the
 *  same open state — the circle is the first thing a learner's eye lands
 *  on, so it should not be the one part of the row that does nothing when
 *  clicked. */
function LevelRow({
  level,
  open,
  onToggle,
}: {
  level: PathLevelView;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations('path');
  const format = useFormat();
  const done = level.standing === 'BELOW';
  const current = level.standing === 'PLACED';
  const panelId = `level-panel-${level.id}`;

  return (
    <div className="flex gap-4 pb-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="relative flex w-10 shrink-0 items-center justify-center self-start py-1.5"
      >
        <span
          className={cn(
            'relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-2 text-base font-semibold',
            done && 'border-success bg-success text-white',
            current && 'border-primary-600 bg-primary-600 text-white ring-4 ring-primary-100',
            !done && !current && 'border-border bg-card text-muted-foreground',
          )}
        >
          {done ? <Check aria-hidden="true" className="size-5" /> : format.number(level.position)}
        </span>
      </button>

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex flex-1 flex-wrap items-baseline gap-3 pt-2.5 text-start"
      >
        <h2 className="text-lg font-semibold text-foreground">
          {t('levelHeading', { position: format.number(level.position), name: level.name })}
        </h2>
        {/* The standing as a word, never as colour alone (WCAG 1.4.1). */}
        {current ? (
          <Badge variant="primary">{t('standingPlaced')}</Badge>
        ) : done ? (
          <Badge variant="soft">{t('standingBelow')}</Badge>
        ) : null}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'ms-auto size-5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
    </div>
  );
}

/**
 * A course's own checkpoint on the same trail, one size down from a level's.
 *
 * **Deliberately not another level circle wearing a smaller size.** A level
 * is a rung the ladder itself defines; a course is content sitting on that
 * rung. So the circle here carries no number — only a state (covered /
 * in-path / locked) — and what opens beneath it is its own smaller trail:
 * the course's activities, in Moodle's own order, each a numbered
 * checkpoint one size below the course's.
 */
function CourseCheckpoint({
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
  const [open, setOpen] = useState(false);

  /* Lazy on purpose — fired only once this checkpoint is opened, not once
     per course the moment its level expands (§2B: no request without a
     reason to make it). */
  const outline = useApiQuery(
    () => (open ? coursesApi.outline(course.id) : Promise.resolve({ items: [] })),
    [open, course.id],
  );

  const panelId = `course-outline-${course.id}`;

  return (
    <div className="flex gap-4 pb-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="relative flex w-10 shrink-0 items-center justify-center self-start py-1"
      >
        <span
          className={cn(
            'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold',
            below && 'border-success bg-success text-white',
            !below && startable && 'border-primary-600 bg-card text-primary-700',
            !below && !startable && 'border-border bg-card text-muted-foreground',
          )}
        >
          {below ? (
            <Check aria-hidden="true" className="size-4" />
          ) : !startable ? (
            <Lock aria-hidden="true" className="size-3.5" />
          ) : null}
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full flex-wrap items-center gap-2 text-start"
        >
          <span className="font-medium text-foreground">{course.title}</span>
          {course.durationMinutes ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {t('hours', { hours: format.number(toHours(course.durationMinutes) ?? 0) })}
            </span>
          ) : null}
          {below ? (
            <Badge variant="soft">{t('coveredAlready')}</Badge>
          ) : startable ? (
            <CourseStatusChip status="IN_PATH" />
          ) : (
            <Badge variant="soft">{t('lockedUntilPlaced')}</Badge>
          )}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'ms-auto size-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
        <p className="line-clamp-1 text-sm text-muted-foreground">{course.summary}</p>

        {/* What's inside: the course's own activities, in the LMS's order —
            a smaller checkpoint trail of its own, one size below the course
            circle, only real once the learner has actually started it. */}
        <div id={panelId} hidden={!open} className="mt-2 rounded-lg border border-border bg-card p-3">
          {outline.isLoading ? (
            <p className="text-xs text-muted-foreground">{t('courseOutlineLoading')}</p>
          ) : outline.data && outline.data.items.length > 0 ? (
            <ol className="relative flex flex-col">
              <div aria-hidden="true" className="absolute inset-y-0 start-3 w-px bg-border" />
              {outline.data.items.map((item, index) => (
                <li key={item.moduleId} className="flex items-center gap-3 pb-2 last:pb-0">
                  <span className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-border bg-card text-[11px] font-semibold text-muted-foreground">
                    {format.number(index + 1)}
                  </span>
                  <span className="truncate text-xs text-foreground">{item.name}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-muted-foreground">{t('courseOutlineEmpty')}</p>
          )}

          <Link
            href={`/courses/${course.id}`}
            className="mt-3 inline-block text-xs font-medium text-primary-700 underline-offset-4 hover:underline"
          >
            {t('openCoursePage')}
          </Link>
        </div>
      </div>
    </div>
  );
}
