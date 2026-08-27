'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import { PortalPage } from '@/components/layout/portal-page';
import { usePortal } from '@/components/layout/portal-provider';
import { DataView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFormat } from '@/i18n/format-provider';
import { coursesApi, pathsApi } from '@/lib/api-client';
import { toHours } from '@/lib/duration';
import { useApiQuery } from '@/lib/use-api';
import { cardVariants } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** Duration buckets, in minutes. Coarse on purpose — a free-form number field
 *  would be a worse way to ask "something short?". */
const DURATION_OPTIONS = [120, 180, 240] as const;

/**
 * The courses catalogue (§4.6).
 *
 * Browsable before the assessment, which is why nothing here *requires* a
 * Holland Code or a chosen path. The one concession to the journey: **the path
 * filter starts on the learner's own path** when they have committed to one —
 * a learner arriving here (most often through My Path's quiet add) is looking
 * for courses they can actually add, and «جميع المسارات» stays one selection
 * away.
 */
export default function CoursesPage() {
  const t = useTranslations('courses');
  const format = useFormat();
  const { dashboard } = usePortal();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pathId, setPathId] = useState(() => dashboard.path?.id ?? '');
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

  const hasFilters = Boolean(debouncedSearch || pathId || maxDuration);

  const pathOptions = useMemo(
    () => paths.data?.paths.slice().sort((a, b) => a.name.localeCompare(b.name, 'ar')) ?? [],
    [paths.data],
  );

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
          <div className="flex flex-col gap-1.5">
            <label htmlFor="course-search" className="text-sm font-medium">
              {t('searchLabel')}
            </label>
            <Input
              id="course-search"
              type="search"
              value={search}
              placeholder={t('searchPlaceholder')}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="course-path" className="text-sm font-medium">
              {t('pathLabel')}
            </label>
            <select
              id="course-path"
              value={pathId}
              onChange={(event) => setPathId(event.target.value)}
              className="h-10 rounded-md border border-input bg-card px-3 text-sm"
            >
              <option value="">{t('allPaths')}</option>
              {pathOptions.map((path) => (
                <option key={path.id} value={path.id}>
                  {path.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="course-duration" className="text-sm font-medium">
              {t('durationLabel')}
            </label>
            <select
              id="course-duration"
              value={maxDuration}
              onChange={(event) => setMaxDuration(event.target.value)}
              className="h-10 rounded-md border border-input bg-card px-3 text-sm"
            >
              <option value="">{t('anyDuration')}</option>
              {DURATION_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {t('durationOption', { hours: format.number(toHours(minutes)!) })}
                </option>
              ))}
            </select>
          </div>
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
          <>
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {t('resultCount', { count: format.number(courses.data?.length ?? 0) })}
            </p>

            <ul className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {courses.data?.map((course) => {
                const hours = toHours(course.durationMinutes);

                return (
                  <li key={course.id}>
                    <Link
                      href={`/courses/${course.id}`}
                      className={cn(
                        cardVariants(),
                        'flex h-full flex-col gap-2 p-5 transition-colors hover:border-primary-600',
                      )}
                    >
                      <h2 className="font-semibold text-foreground">{course.title}</h2>
                      <p className="text-sm text-muted-foreground">{course.summary}</p>

                      {hours !== null ? (
                        <p className="text-sm text-muted-foreground">
                          {t('duration', { hours: format.number(hours) })}
                        </p>
                      ) : null}

                      {course.paths.length > 0 ? (
                        <p className="mt-auto pt-2 text-sm text-muted-foreground">
                          {course.paths.map((path) => path.name).join('، ')}
                        </p>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        </DataView>
      </div>
    </PortalPage>
  );
}
