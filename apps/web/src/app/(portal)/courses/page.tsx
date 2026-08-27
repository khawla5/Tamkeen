'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import type { CourseSummary, PathSummary, UserPathCourseStatus } from '@tamkeen/types';

import { CourseStatusChip } from '@/components/courses/course-status-chip';
import { PortalPage } from '@/components/layout/portal-page';
import { usePortal } from '@/components/layout/portal-provider';
import { RecommendedBadge } from '@/components/paths/recommended-badge';
import { DataView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useFormat } from '@/i18n/format-provider';
import { coursesApi, myPathApi, pathsApi } from '@/lib/api-client';
import { toHours } from '@/lib/duration';
import { useApiQuery } from '@/lib/use-api';
import { cardVariants } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** Duration buckets, in minutes. Coarse on purpose — a free-form number field
 *  would be a worse way to ask "something short?". */
const DURATION_OPTIONS = [120, 180, 240] as const;

/**
 * The courses catalogue (§4.6, TAM-127).
 *
 * Browsing stays **global** — every course, for everybody, exactly as §4.6
 * says. What changes with TAM-127 is where the page *starts*, because the
 * product does not treat every reader alike:
 *
 *  - A learner with a **confirmed path** can only ever act on that path's
 *    courses (`assertCoursesSelectable` refuses the rest on the server), so
 *    they land with their own path selected. «كل المسارات» is one selection
 *    away — a default, never a restriction.
 *  - A learner **still deciding** lands on the whole catalogue grouped by
 *    path, their recommended paths first, because for them the catalogue is
 *    the tool for answering "what does this path actually teach?".
 *
 * The catalogue itself opens only once the assessment is done (D-071) — the
 * nav hides it and the portal redirects the URL before this page renders.
 */
export default function CoursesPage() {
  const t = useTranslations('courses');
  const format = useFormat();
  const { dashboard } = usePortal();

  /* Non-null exactly after the hard commitment gate, which is also the moment
     the server stops accepting any other path's courses. */
  const committedPathId = dashboard.state === 'ACTIVE_PATH' ? (dashboard.path?.id ?? null) : null;

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  /* Initial state only — the user's own later choice wins, and switching to
     «كل المسارات» must stick. */
  const [pathId, setPathId] = useState(committedPathId ?? '');
  const [maxDuration, setMaxDuration] = useState('');

  /* Debounced so typing does not fire a request per keystroke. 300ms is long
     enough to coalesce a word and short enough not to feel laggy. */
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const paths = useApiQuery(() => pathsApi.list(), []);
  const courses = useApiQuery(
    () =>
      coursesApi.list({
        q: debouncedSearch || undefined,
        pathId: pathId || undefined,
        maxDurationMinutes: maxDuration ? Number(maxDuration) : undefined,
      }),
    [debouncedSearch, pathId, maxDuration],
  );

  /*
   * The learner's own progress, for the card chips.
   *
   * Fetched only when there is a confirmed path — before that every course is
   * equally "not yours" and the request would return null on every visit. Its
   * failure is deliberately *not* fed into the DataView below: a missing chip
   * costs a reader nothing, and blocking the whole catalogue on a decoration
   * would trade the page for a badge.
   */
  const myPath = useApiQuery(
    () => (committedPathId ? myPathApi.get() : Promise.resolve(null)),
    [committedPathId],
  );

  const statusByCourseId = useMemo(() => {
    const map = new Map<string, UserPathCourseStatus>();

    for (const course of myPath.data?.courses ?? []) {
      map.set(course.courseId, course.status);
    }

    return map;
  }, [myPath.data]);

  const hasFilters = Boolean(debouncedSearch || pathId || maxDuration);

  const pathOptions = useMemo(() => {
    const sorted =
      paths.data?.paths.slice().sort((a, b) => a.name.localeCompare(b.name, 'ar')) ?? [];

    /* The committed learner's own path first: it is the one selection they
       will make most, and alphabetical order would bury it among twelve. */
    return committedPathId
      ? [
          ...sorted.filter((path) => path.id === committedPathId),
          ...sorted.filter((path) => path.id !== committedPathId),
        ]
      : sorted;
  }, [paths.data, committedPathId]);

  /*
   * The grouped view (TAM-127): one section per path, in the API's order —
   * recommended paths first, in the user's letter rank (`rankPathsByRecommendation`
   * already applied it server-side). Nothing is re-sorted here; D-113's rule
   * that the ranking lives in one place holds for this page too.
   *
   * A filter collapses the grouping into the flat grid: a filtered result is
   * an answer to a question, not a tour of the catalogue.
   */
  const groups = useMemo(() => {
    if (hasFilters || !courses.data || !paths.data) {
      return null;
    }

    const all = courses.data;
    const claimed = new Set<string>();
    const sections = paths.data.paths.flatMap((path) => {
      /* `filter` preserves the API's course order inside the section. A course
         in two paths appears in both — the grouping is a lens, not a
         partition. */
      const inPath = all.filter((course) =>
        course.paths.some((membership) => membership.id === path.id),
      );

      for (const course of inPath) {
        claimed.add(course.id);
      }

      /* A path with no visible courses produces no heading at all. */
      return inPath.length > 0 ? [{ path, courses: inPath }] : [];
    });

    return {
      sections,
      /* Never silently dropped: a course belonging to no listed path would
         otherwise vanish from a view whose own count line still counts it. */
      ungrouped: all.filter((course) => !claimed.has(course.id)),
    };
  }, [hasFilters, courses.data, paths.data]);

  function clearFilters() {
    setSearch('');
    setDebouncedSearch('');
    setPathId('');
    setMaxDuration('');
  }

  return (
    <PortalPage title={t('title')}>
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Field id="course-search" label={t('searchLabel')}>
            {(field) => (
              <Input
                {...field}
                type="search"
                value={search}
                placeholder={t('searchPlaceholder')}
                onChange={(event) => setSearch(event.target.value)}
              />
            )}
          </Field>

          <Field id="course-path" label={t('pathLabel')}>
            {(field) => (
              <Select {...field} value={pathId} onChange={(event) => setPathId(event.target.value)}>
                <option value="">{t('allPaths')}</option>
                {pathOptions.map((path) => (
                  <option key={path.id} value={path.id}>
                    {path.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field id="course-duration" label={t('durationLabel')}>
            {(field) => (
              <Select
                {...field}
                value={maxDuration}
                onChange={(event) => setMaxDuration(event.target.value)}
              >
                <option value="">{t('anyDuration')}</option>
                {DURATION_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {t('durationOption', { hours: format.number(toHours(minutes)!) })}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <DataView
          isLoading={courses.isLoading}
          error={courses.error}
          isEmpty={courses.data?.length === 0}
          onRetry={courses.refetch}
          emptyProps={{
            title: t('emptyTitle'),
            body: t('emptyBody'),
            action: hasFilters ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                {t('clearFilters')}
              </Button>
            ) : undefined,
          }}
        >
          <div className="flex flex-col gap-6">
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {t('resultCount', { count: format.number(courses.data?.length ?? 0) })}
            </p>

            {groups ? (
              <>
                {groups.sections.map((section) => (
                  <PathGroup
                    key={section.path.id}
                    path={section.path}
                    courses={section.courses}
                    statusByCourseId={statusByCourseId}
                  />
                ))}

                {groups.ungrouped.length > 0 ? (
                  <section className="flex flex-col gap-4">
                    <h2 className="text-lg font-semibold text-foreground">
                      {t('ungroupedHeading')}
                    </h2>
                    <CourseGrid
                      courses={groups.ungrouped}
                      statusByCourseId={statusByCourseId}
                      titleAs="h3"
                    />
                  </section>
                ) : null}
              </>
            ) : (
              <CourseGrid
                courses={courses.data ?? []}
                statusByCourseId={statusByCourseId}
                titleAs="h2"
              />
            )}
          </div>
        </DataView>
      </div>
    </PortalPage>
  );
}

/** One path's courses, under a heading that says why the path is here. */
function PathGroup({
  path,
  courses,
  statusByCourseId,
}: {
  path: PathSummary;
  courses: CourseSummary[];
  statusByCourseId: Map<string, UserPathCourseStatus>;
}) {
  const t = useTranslations('courses');
  const format = useFormat();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-foreground">{path.name}</h2>
        {/* Recommendation is a *path*-level fact, so it belongs on the heading
            and never on a course card (§3A). */}
        {path.recommended ? <RecommendedBadge /> : null}
        <span className="text-sm text-muted-foreground">
          {t('resultCount', { count: format.number(courses.length) })}
        </span>
      </div>

      <CourseGrid courses={courses} statusByCourseId={statusByCourseId} titleAs="h3" />
    </section>
  );
}

function CourseGrid({
  courses,
  statusByCourseId,
  titleAs,
}: {
  courses: CourseSummary[];
  statusByCourseId: Map<string, UserPathCourseStatus>;
  /* The grouped view puts an h2 above each grid, so its cards are h3; the flat
     grid has no heading above it and its cards stay h2. Levels follow the
     document, rather than a card deciding its own rank. */
  titleAs: 'h2' | 'h3';
}) {
  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {courses.map((course) => (
        <CourseCard
          key={course.id}
          course={course}
          status={statusByCourseId.get(course.id) ?? null}
          titleAs={titleAs}
        />
      ))}
    </ul>
  );
}

/**
 * A catalogue card.
 *
 * Always a link to the course's own page — never a deep link into the player.
 * One predictable behaviour: the chip informs, the detail page acts (§4.7 owns
 * the single context-dependent action).
 */
function CourseCard({
  course,
  status,
  titleAs: Title,
}: {
  course: CourseSummary;
  status: UserPathCourseStatus | null;
  titleAs: 'h2' | 'h3';
}) {
  const t = useTranslations('courses');
  const format = useFormat();

  const hours = toHours(course.durationMinutes);
  const hasFooter = course.paths.length > 0 || status !== null;

  return (
    <li>
      <Link
        href={`/courses/${course.id}`}
        className={cn(
          cardVariants(),
          'flex h-full flex-col gap-2 p-5 transition-colors hover:border-primary-600',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2',
        )}
      >
        <Title className="font-semibold text-foreground">{course.title}</Title>
        <p className="line-clamp-2 text-sm text-muted-foreground">{course.summary}</p>

        {hours !== null ? (
          <p className="text-sm text-muted-foreground">
            {t('duration', { hours: format.number(hours) })}
          </p>
        ) : null}

        {hasFooter ? (
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
            {/* Quiet tags, not a comma list: memberships are labels, and a
                joined sentence reads as prose the eye has to parse. */}
            {course.paths.map((path) => (
              <Badge key={path.id} variant="neutral">
                {path.name}
              </Badge>
            ))}
            {/* At most one, and only for the user's own courses — a card with
                no chip is a course that is not theirs (§3: absence is the
                signal). */}
            <CourseStatusChip status={status} />
          </div>
        ) : null}
      </Link>
    </li>
  );
}
