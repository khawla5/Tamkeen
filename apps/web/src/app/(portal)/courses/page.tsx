'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import type { CourseSummary, PathSummary } from '@tamkeen/types';

import { CourseStatusChip, type CourseChipStatus } from '@/components/courses/course-status-chip';
import { PortalPage } from '@/components/layout/portal-page';
import { usePortal } from '@/components/layout/portal-provider';
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
 * The courses catalogue (§4.6, TAM-127, D-134).
 *
 * Browsing stays **wide** — every course the reader may see, exactly as §4.6
 * says. What TAM-127 decides is where the page *starts*, and the answer comes
 * from how many paths the ministry put the reader on:
 *
 *  - **One assigned path** is the lens they will want, so it opens selected.
 *    «كل المسارات» is one selection away — a default, never a restriction, and
 *    their own later choice wins.
 *  - **Two or more** and neither is theirs more than the other, so the page
 *    opens on all of them, grouped by path in the API's order.
 *
 * The catalogue itself opens only once a path has been assigned (D-071 restated
 * for D-134) — the nav hides it and the portal redirects the URL before this
 * page renders.
 */
export default function CoursesPage() {
  const t = useTranslations('courses');
  const format = useFormat();
  const { dashboard } = usePortal();

  /* The learner's own path, when the ministry has assigned exactly one: the
     lens they will want by default. With two, neither is "theirs" more than the
     other, so the catalogue opens on all of them. */
  const ownPathId = dashboard.paths.length === 1 ? (dashboard.paths[0]?.id ?? null) : null;

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  /* Initial state only — the user's own later choice wins, and switching to
     «كل المسارات» must stick. */
  const [pathId, setPathId] = useState(ownPathId ?? '');
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
   * Every assigned path, because a course may be owed through any of them. Its
   * failure is deliberately *not* fed into the DataView below: a missing chip
   * costs a reader nothing, and blocking the whole catalogue on a decoration
   * would trade the page for a badge.
   */
  const myPaths = useApiQuery(
    () => (dashboard.paths.length > 0 ? myPathApi.all() : Promise.resolve([])),
    [dashboard.paths.length],
  );

  const statusByCourseId = useMemo(() => {
    const map = new Map<string, CourseChipStatus>();

    for (const path of myPaths.data ?? []) {
      for (const level of path.levels) {
        for (const course of level.courses) {
          /* Only what they owe carries a chip: a course below their rung is not
             "not started", it is ground the placement says they covered, and
             absence is the honest signal for it (§4.6). */
          if (!course.startable) continue;

          map.set(course.courseId, course.status === 'NOT_STARTED' ? 'IN_PATH' : course.status);
        }
      }
    }

    return map;
  }, [myPaths.data]);

  const hasFilters = Boolean(debouncedSearch || pathId || maxDuration);

  const pathOptions = useMemo(() => {
    const sorted =
      paths.data?.paths.slice().sort((a, b) => a.name.localeCompare(b.name, 'ar')) ?? [];

    /* Their own path first: it is the one selection they will make most, and
       alphabetical order would bury it among twelve. */
    return ownPathId
      ? [
          ...sorted.filter((path) => path.id === ownPathId),
          ...sorted.filter((path) => path.id !== ownPathId),
        ]
      : sorted;
  }, [paths.data, ownPathId]);

  /*
   * The grouped view (TAM-127, D-134): one section per path the learner holds,
   * in the API's order. Nothing is re-sorted here — the ordering lives in one
   * place, which is the server.
   *
   * A filter collapses the grouping into the flat grid: a filtered result is an
   * answer to a question, not a tour of the catalogue.
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

/**
 * One path's courses, under a rectangle that *is* the path (D-134): its name,
 * where the assessment placed them, and how many courses it holds — the same
 * three facts the heading used to state as text, now a single card that leads
 * straight into the path's own ladder, where those courses are shown in their
 * placement order rather than the catalogue's flat grid.
 */
function PathGroup({
  path,
  courses,
  statusByCourseId,
}: {
  path: PathSummary;
  courses: CourseSummary[];
  statusByCourseId: Map<string, CourseChipStatus>;
}) {
  const t = useTranslations('courses');
  const format = useFormat();

  return (
    <section className="flex flex-col gap-4">
      <Link
        href={`/paths/${path.id}`}
        className={cn(
          cardVariants(),
          'flex flex-col gap-1 p-5 transition-colors hover:border-primary-600',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2',
        )}
      >
        <h2 className="text-lg font-semibold text-foreground">{path.name}</h2>
        {/* Where the assessment placed them: a fact about the path, stated
            once on its own card rather than repeated on every course below it. */}
        {path.placedLevel ? (
          <p className="text-sm font-medium text-primary-700">
            {t('placedAt', { level: path.placedLevel.name })}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {t('resultCount', { count: format.number(path.courseCount) })}
        </p>
      </Link>

      <CourseGrid courses={courses} statusByCourseId={statusByCourseId} titleAs="h3" layout="list" />
    </section>
  );
}

function CourseGrid({
  courses,
  statusByCourseId,
  titleAs,
  layout = 'grid',
}: {
  courses: CourseSummary[];
  statusByCourseId: Map<string, CourseChipStatus>;
  /* The grouped view puts an h2 above each grid, so its cards are h3; the flat
     grid has no heading above it and its cards stay h2. Levels follow the
     document, rather than a card deciding its own rank. */
  titleAs: 'h2' | 'h3';
  /* 'list' for a path's own courses: a single stacked column under the
     path's rectangle rather than a multi-column grid — the flat/ungrouped
     views stay a grid, where there is no path card above them to read as a
     list continuing from. */
  layout?: 'grid' | 'list';
}) {
  return (
    <ul className={cn(layout === 'grid' ? 'grid gap-4 md:grid-cols-2 xl:grid-cols-3' : 'flex flex-col')}>
      {courses.map((course) => (
        <CourseCard
          key={course.id}
          course={course}
          status={statusByCourseId.get(course.id) ?? null}
          titleAs={titleAs}
          layout={layout}
        />
      ))}
    </ul>
  );
}

/**
 * A catalogue card — or, under a path's own rectangle, plain text in a list
 * rather than another box: the path card already drew the boundary, and a
 * box inside a box for every course under it would be a border repeated
 * fifteen times over for no new information.
 *
 * Always a link to the course's own page — never a deep link into the player.
 * One predictable behaviour: the chip informs, the detail page acts (§4.7 owns
 * the single context-dependent action).
 */
function CourseCard({
  course,
  status,
  titleAs: Title,
  layout,
}: {
  course: CourseSummary;
  status: CourseChipStatus | null;
  titleAs: 'h2' | 'h3';
  layout: 'grid' | 'list';
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
          'flex flex-col gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2',
          layout === 'grid'
            ? cn(cardVariants(), 'h-full p-5 hover:border-primary-600')
            : 'border-b border-border py-3 first:pt-0 last:border-0 hover:text-primary-700',
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
