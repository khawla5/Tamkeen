'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAppRouter } from '@/lib/use-app-router';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import {
  PATH_MAX_COURSES,
  PATH_MIN_COURSES,
  type CourseSummary,
  type PathDetail,
} from '@tamkeen/types';

import { useErrorMessage } from '@/components/auth/use-error-message';
import { PAGE_MAX_WIDTH, PortalPage } from '@/components/layout/portal-page';
import { usePortal } from '@/components/layout/portal-provider';
import { ConfirmPathDialog } from '@/components/paths/confirm-path-dialog';
import { RecommendedBadge } from '@/components/paths/recommended-badge';
import { DataView, EmptyState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, cardVariants } from '@/components/ui/card';
import { useFormat } from '@/i18n/format-provider';
import { myPathApi, pathsApi } from '@/lib/api-client';
import { toHours, totalHours } from '@/lib/duration';
import { useApiMutation, useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

/**
 * Path detail / build (§4.5, TAM-125).
 *
 * The 5-10 rule is enforced here *and* on the server. This copy exists so the
 * page never offers an action that would be rejected — it is a courtesy, not the
 * authority, and the integration suite proves the server refuses a bad request
 * regardless of what this file does.
 */
export default function PathBuildPage() {
  const t = useTranslations('pathBuild');
  const params = useParams<{ pathId: string }>();
  const pathId = params.pathId;

  const path = useApiQuery(() => pathsApi.detail(pathId), [pathId]);

  return (
    <PortalPage title={path.data?.name ?? t('title')} chrome="bare">
      <DataView
        isLoading={path.isLoading}
        error={path.error}
        isEmpty={path.data?.courses.length === 0}
        onRetry={path.refetch}
        emptyProps={{ title: t('emptyTitle'), body: t('emptyBody') }}
      >
        {path.data ? <Builder path={path.data} onReload={path.refetch} /> : null}
      </DataView>
    </PortalPage>
  );
}

function Builder({ path, onReload }: { path: PathDetail; onReload: () => void }) {
  const t = useTranslations('pathBuild');
  const translateError = useErrorMessage();
  const format = useFormat();
  const router = useAppRouter();
  const { refresh } = usePortal();

  const [selected, setSelected] = useState<string[]>(path.selectedCourseIds);
  const [dialogOpen, setDialogOpen] = useState(false);

  /* The server owns the selection; if it changes underneath (another tab, a
     refetch), follow it rather than keeping a stale local copy. */
  useEffect(() => {
    setSelected(path.selectedCourseIds);
  }, [path.selectedCourseIds]);

  const selectPath = useApiMutation(() => myPathApi.selectPath(path.id));
  const setCourses = useApiMutation((courseIds: string[]) => myPathApi.setCourses(courseIds));
  const confirm = useApiMutation(() => myPathApi.confirm());

  const count = selected.length;
  const withinRange = count >= PATH_MIN_COURSES && count <= PATH_MAX_COURSES;

  async function toggle(courseId: string) {
    const next = selected.includes(courseId)
      ? selected.filter((id) => id !== courseId)
      : [...selected, courseId];

    if (next.length > PATH_MAX_COURSES) {
      return;
    }

    setSelected(next);

    /* Selecting a path is implicit in building it — the first tick is what
       claims the path, so the user never meets a separate "choose this path"
       step before being allowed to pick courses. */
    if (path.selectedCourseIds.length === 0 && selected.length === 0) {
      await selectPath.run();
    }

    const saved = await setCourses.run(next);

    if (!saved) {
      /* The server refused; fall back to its view rather than showing a
         selection that does not exist. */
      onReload();
    }
  }

  async function onConfirm() {
    const result = await confirm.run();

    if (result) {
      refresh();
      router.replace('/my-path');
    }
  }

  if (!path.canBuild) {
    return (
      <div>
        <EmptyState
          title={t('lockedTitle')}
          body={t('lockedBody')}
          action={
            <Button asChild>
              <Link href="/my-path">{t('goToMyPath')}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const saveError = selectPath.error ?? setCourses.error;

  /* Recomputed on every toggle, which is the point: the header answers "what
     am I committing to" while the answer is still changing (TAM-125). Derived
     from `selected` rather than accumulated alongside it, so it cannot drift
     out of step with the tick marks. */
  const selectedHours = totalHours(
    path.courses.filter((course) => selected.includes(course.id)).map((c) => c.durationMinutes),
  );

  return (
    <div className="flex flex-col gap-6 pb-28">
      <PathMeta path={path} selectedHours={selectedHours} />

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">{t('coursesHeading')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('coursesBody', {
              min: format.number(PATH_MIN_COURSES),
              max: format.number(PATH_MAX_COURSES),
            })}
          </p>
        </div>

        {/*
          A grid of cards rather than eleven full-width rows: the choice this
          page exists for is a comparison between courses, and a list that
          takes six screenfuls to read is not one anybody compares.
        */}
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {path.courses.map((course) => (
            <li key={course.id}>
              <CourseToggle
                course={course}
                isSelected={selected.includes(course.id)}
                atMax={!selected.includes(course.id) && count >= PATH_MAX_COURSES}
                isPending={setCourses.isPending}
                onToggle={() => void toggle(course.id)}
              />
            </li>
          ))}
        </ul>
      </section>

      {saveError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {translateError(saveError)}
        </p>
      ) : null}

      {/*
        The counter is persistent (§4.5), so it is fixed to the bottom of the
        viewport rather than sitting at the end of a long list — a counter the
        user has to scroll to find is not a counter.
        `aria-live="polite"` announces each change without interrupting.
      */}
      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-card/95 px-6 py-4 backdrop-blur">
        <div
          className={cn(
            'mx-auto flex flex-wrap items-center justify-between gap-3',
            PAGE_MAX_WIDTH,
          )}
        >
          <p aria-live="polite" aria-label={t('counterLabel')} className="text-sm font-medium">
            {t('counter', {
              selected: format.number(count),
              min: format.number(PATH_MIN_COURSES),
              max: format.number(PATH_MAX_COURSES),
            })}
          </p>

          <div className="flex items-center gap-3">
            {!withinRange && count < PATH_MIN_COURSES ? (
              <span className="text-sm text-muted-foreground">
                {t('needMore', { count: format.number(PATH_MIN_COURSES - count) })}
              </span>
            ) : null}

            <Button
              type="button"
              disabled={!withinRange || setCourses.isPending || confirm.isPending}
              onClick={() => setDialogOpen(true)}
            >
              {t('confirm')}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmPathDialog
        open={dialogOpen}
        pathName={path.name}
        courseCount={count}
        isPending={confirm.isPending}
        error={confirm.error ? translateError(confirm.error) : null}
        onConfirm={() => void onConfirm()}
        onCancel={() => setDialogOpen(false)}
      />
    </div>
  );
}

/**
 * What the user is committing to, before the list (TAM-125).
 *
 * The path's own type and its recommendation status were only ever on the
 * results page, so arriving here from a link — or after a reload — lost the
 * one fact that explains why this path was suggested at all.
 */
function PathMeta({ path, selectedHours }: { path: PathDetail; selectedHours: number }) {
  const t = useTranslations('pathBuild');
  const tRiasec = useTranslations('riasec');
  const format = useFormat();

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <p className="text-muted-foreground">{path.description}</p>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral">{tRiasec(`${path.riasecLetter}.name`)}</Badge>
          {/* Only when this path really is in the user's code — the badge is
              a statement about *this* reader, not decoration (§3A). */}
          {path.recommended ? <RecommendedBadge /> : null}
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <p>{t('availableCourses', { count: format.number(path.courseCount) })}</p>
          <p>{t('selectedHours', { hours: format.number(selectedHours) })}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * One course, one control: the whole card is the toggle.
 *
 * `aria-pressed` and the state word carry the selection; the primary edge and
 * the tick glyph only repeat it, so the card is never readable by colour alone
 * (WCAG 1.4.1). The accessible name pairs the state with the title rather than
 * reading the summary aloud on every tab stop, and contains both visible
 * labels the control offers (WCAG 2.5.3).
 *
 * Unavailable and at-max cards stay buttons and stay disabled — the reason is
 * printed on the card, so the bound is visible rather than merely enforced.
 */
function CourseToggle({
  course,
  isSelected,
  atMax,
  isPending,
  onToggle,
}: {
  course: CourseSummary;
  isSelected: boolean;
  atMax: boolean;
  isPending: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations('pathBuild');
  const format = useFormat();

  const isAvailable = course.status === 'AVAILABLE';
  const hours = toHours(course.durationMinutes);

  const state = !isAvailable
    ? t('unavailable')
    : isSelected
      ? t('added')
      : atMax
        ? t('atMaximum')
        : t('add');

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      aria-label={t('cardLabel', { state, title: course.title })}
      disabled={!isAvailable || atMax || isPending}
      onClick={onToggle}
      className={cn(
        cardVariants({ variant: isSelected ? 'selected' : 'default' }),
        'flex h-full w-full flex-col gap-2 p-4 text-start transition-colors',
        'hover:border-primary-600',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:border-border',
      )}
    >
      <span className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[4px] border',
            isSelected
              ? 'border-primary-600 bg-primary-600 text-white'
              : 'border-neutral-400 bg-card',
          )}
        >
          {isSelected ? <Check className="size-3.5" strokeWidth={3} /> : null}
        </span>
        <span className="font-medium text-foreground">{course.title}</span>
      </span>

      {/* Clamped, not truncated by the API: the full summary is on the course
          page, and a card that grows to fit its longest neighbour breaks the
          scan the grid exists for. */}
      <span className="line-clamp-2 text-sm text-muted-foreground">{course.summary}</span>

      <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-sm">
        {hours !== null ? (
          <span className="text-muted-foreground">
            {t('duration', { hours: format.number(hours) })}
          </span>
        ) : null}
        <span className={cn('font-medium', isSelected ? 'text-primary-700' : 'text-foreground')}>
          {state}
        </span>
      </span>

      {!isAvailable ? (
        <span className="text-sm text-muted-foreground">{t('unavailableHint')}</span>
      ) : null}
    </button>
  );
}
