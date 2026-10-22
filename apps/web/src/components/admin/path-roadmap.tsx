'use client';

import { BookOpen, ChevronLeft, ChevronRight, EyeOff } from 'lucide-react';
import { Fragment } from 'react';
import { useTranslations } from 'next-intl';

import { courseVisibility, type AdminPathCourseRow, type AdminPathDetail } from '@tamkeen/types';

import { DataView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { useFormat } from '@/i18n/format-provider';
import { adminApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

/** How many courses sit on one stretch of the road before it turns back. */
const ROW_SIZE = 4;

/** The height of one stretch, which is also how far the road drops at a turn. */
const PITCH = '5rem';

/**
 * A path's courses, laid out as a winding road (the proposal's «مسار المغامرة»).
 *
 * **The road follows the learner's own order**: the levels in their order, each
 * level's courses in the order an employee meets them, one stretch of road going
 * one way and the next coming back, so a long path stays inside the width of the
 * card instead of running off it. A level with more than four courses takes more
 * than one stretch; a level with none shows a dashed marker, so an empty rung is
 * visible rather than missing.
 *
 * Presentation only. It reads the same path the manage screen reads
 * (`getPath`) and shows what is already there: each course's name and whether an
 * employee can reach it, with the number who have started it. Courses in the path
 * but on no level are named underneath — they are not on the road because no
 * employee can reach them yet (D-134).
 */
export function PathRoadmap({ pathId }: { pathId: string }) {
  const detail = useApiQuery(() => adminApi.getPath(pathId), [pathId]);

  return (
    <DataView isLoading={detail.isInitialLoad} error={detail.error} onRetry={detail.refetch}>
      {detail.data ? <Road path={detail.data} /> : null}
    </DataView>
  );
}

interface Stretch {
  /** The rung's name, on the first stretch of that rung only. */
  label: string | null;
  courses: AdminPathCourseRow[];
}

function stretchesOf(path: AdminPathDetail): Stretch[] {
  return path.levels.flatMap((level) => {
    const courses = [...level.courses].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    if (courses.length === 0) {
      return [{ label: level.name, courses: [] }];
    }

    const chunks: AdminPathCourseRow[][] = [];

    for (let index = 0; index < courses.length; index += ROW_SIZE) {
      chunks.push(courses.slice(index, index + ROW_SIZE));
    }

    return chunks.map((chunk, index) => ({
      label: index === 0 ? level.name : null,
      courses: chunk,
    }));
  });
}

function Road({ path }: { path: AdminPathDetail }) {
  const t = useTranslations('admin');
  const format = useFormat();

  const stretches = stretchesOf(path);

  if (stretches.length === 0 && path.unassignedCourses.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('roadmapNone')}</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('roadmapHint')}</p>

      {stretches.length > 0 ? (
        <div className="overflow-x-auto">
          <ol className="min-w-[40rem] pb-2" aria-label={path.name}>
            {stretches.map((stretch, index) => {
              const last = index === stretches.length - 1;
              /* Even stretches run the way the page reads (start edge to end edge)
                 and turn at the end edge; odd ones come back. */
              const returning = index % 2 === 1;

              return (
                <li key={index} className="relative" style={{ height: PITCH }}>
                  {stretch.label ? (
                    <span className="absolute start-2 top-0 rounded-md bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-800">
                      {stretch.label}
                    </span>
                  ) : null}

                  {/* The road itself: a line through the stretch, and — unless this is
                      the last — the turn that carries it down to the next. */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-8 h-0.5 bg-success/70"
                    style={{ top: 'calc(3rem - 1px)' }}
                  />
                  {/* Where the road begins: a filled dot on the first stretch's starting
                      edge, named, so the direction of travel has an origin. */}
                  {index === 0 ? (
                    <>
                      <span
                        aria-hidden="true"
                        className="absolute size-4 rounded-full border-2 border-card bg-success ring-2 ring-success/40"
                        style={{ top: 'calc(3rem - 0.5rem)', insetInlineStart: '1.5rem' }}
                      />
                      <span
                        className="absolute text-[11px] font-medium text-success"
                        style={{ top: 'calc(3rem + 0.75rem)', insetInlineStart: '0.75rem' }}
                      >
                        {t('roadmapStart')}
                      </span>
                    </>
                  ) : null}
                  {!last ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute w-10 border-y-2 border-success/70',
                        returning
                          ? 'start-6 rounded-s-full border-s-2'
                          : 'end-6 rounded-e-full border-e-2',
                      )}
                      style={{ top: 'calc(3rem - 1px)', height: PITCH }}
                    />
                  ) : null}

                  <div
                    className={cn(
                      'absolute inset-x-14 flex items-center justify-around gap-4',
                      returning && 'flex-row-reverse',
                    )}
                    style={{ top: '3rem', transform: 'translateY(-50%)' }}
                  >
                    {stretch.courses.length === 0 ? (
                      <span className="rounded-full border border-dashed border-neutral-400 bg-card px-4 py-2 text-sm text-muted-foreground">
                        {t('roadmapEmptyLevel')}
                      </span>
                    ) : (
                      stretch.courses.map((course, position) => (
                        <Fragment key={course.id}>
                          {/* A small arrow between neighbours, pointing the way the
                              road runs on this stretch. */}
                          {position > 0 ? <Way returning={returning} /> : null}
                          <CoursePill course={course} />
                        </Fragment>
                      ))
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {path.unassignedCourses.length > 0 ? (
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">
            {t('pathUnassignedHeading', { count: format.number(path.unassignedCourses.length) })}
          </p>
          <p className="mb-2 text-xs text-muted-foreground">{t('pathUnassignedHint')}</p>
          <ul className="flex flex-wrap gap-2">
            {path.unassignedCourses.map((course) => (
              <li key={course.id}>
                <Badge variant="warning">{course.title}</Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** One course on the road: its name, and in words whether an employee can reach it. */
function CoursePill({ course }: { course: AdminPathCourseRow }) {
  const t = useTranslations('admin');
  const format = useFormat();

  const reachable = courseVisibility(course.status) === 'AVAILABLE';

  return (
    <span
      title={t('roadmapStarted', { count: format.number(course.learnersStarted) })}
      className={cn(
        'relative z-10 inline-flex max-w-[13rem] items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm shadow-sm',
        reachable
          ? 'border-success/50 text-foreground'
          : 'border-neutral-300 text-muted-foreground',
      )}
    >
      {reachable ? (
        <BookOpen aria-hidden="true" className="size-4 shrink-0 text-success" />
      ) : (
        <EyeOff aria-hidden="true" className="size-4 shrink-0" />
      )}
      <span className="truncate">{course.title}</span>
      {/* The state in words for anyone who cannot see the icon or the colour. */}
      {reachable ? null : <span className="sr-only">{t('courseVisibility.HIDDEN')}</span>}
    </span>
  );
}

/** A small chevron on the line, pointing the way the road runs (the page is RTL). */
function Way({ returning }: { returning: boolean }) {
  const Icon = returning ? ChevronRight : ChevronLeft;

  return (
    <span
      aria-hidden="true"
      className="relative z-10 flex size-5 shrink-0 items-center justify-center rounded-full bg-card text-success"
    >
      <Icon className="size-4 ltr:rotate-180" />
    </span>
  );
}
