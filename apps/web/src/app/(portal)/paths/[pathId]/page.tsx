'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { PATH_MAX_COURSES, PATH_MIN_COURSES, type PathDetail } from '@tamkeen/types';

import { useErrorMessage } from '@/components/auth/use-error-message';
import { PortalPage } from '@/components/layout/portal-page';
import { usePortal } from '@/components/layout/portal-provider';
import { ConfirmPathDialog } from '@/components/paths/confirm-path-dialog';
import { DataView, EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFormat } from '@/i18n/format-provider';
import { myPathApi, pathsApi } from '@/lib/api-client';
import { toHours } from '@/lib/duration';
import { useApiMutation, useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

/**
 * Path detail / build (§4.5).
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
  const router = useRouter();
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
      <div className="mx-auto max-w-2xl">
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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-28">
      <p className="text-muted-foreground">{path.description}</p>

      <Card>
        <CardHeader>
          <CardTitle>{t('coursesHeading')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {t('coursesBody', {
              min: format.number(PATH_MIN_COURSES),
              max: format.number(PATH_MAX_COURSES),
            })}
          </p>

          {path.courses.map((course) => {
            const isSelected = selected.includes(course.id);
            const isAvailable = course.status === 'AVAILABLE';
            const atMax = !isSelected && count >= PATH_MAX_COURSES;
            const hours = toHours(course.durationMinutes);

            return (
              <div
                key={course.id}
                className={cn(
                  'flex flex-wrap items-start justify-between gap-3 rounded-card border p-4',
                  isSelected ? 'border-2 border-primary-600 bg-card' : 'border-border bg-card',
                )}
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <h3 className="font-medium text-foreground">{course.title}</h3>
                  <p className="text-sm text-muted-foreground">{course.summary}</p>
                  {hours !== null ? (
                    <p className="text-sm text-muted-foreground">
                      {t('duration', { hours: format.number(hours) })}
                    </p>
                  ) : null}
                  {!isAvailable ? (
                    <p className="text-sm text-muted-foreground">{t('unavailableHint')}</p>
                  ) : null}
                </div>

                {/* Exactly one control per course, and its label states the
                    current state rather than relying on the border colour. */}
                <Button
                  type="button"
                  variant={isSelected ? 'primary' : 'outline'}
                  size="sm"
                  aria-pressed={isSelected}
                  disabled={!isAvailable || atMax || setCourses.isPending}
                  onClick={() => void toggle(course.id)}
                >
                  {!isAvailable
                    ? t('unavailable')
                    : isSelected
                      ? t('added')
                      : atMax
                        ? t('atMaximum')
                        : t('add')}
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

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
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
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
