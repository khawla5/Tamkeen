'use client';

import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { RIASEC_LETTERS, type AdminPathDetail, type RiasecLetter } from '@tamkeen/types';

import { AdminDialog } from '@/components/admin/admin-dialog';
import { useErrorMessage } from '@/components/auth/use-error-message';
import { DataView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useFormat } from '@/i18n/format-provider';
import { adminApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * §4C.4 — one path: its content, its courses, and who is on it.
 *
 * **The learner counts are the safety rail, not decoration.** Retiring a path
 * takes it out of new selections and touches nobody who holds it — My Path and
 * certificates read through `user_paths` and never consult the flag — so the
 * only group a retirement inconveniences is the people still *building*. The
 * panel prints that number where the decision is made, because a retirement
 * taken knowing "nine people are part way through choosing this" is a different
 * decision from one taken blind.
 *
 * **Two refusals are shown before they happen.** A path with fewer than five
 * selectable courses cannot be offered, and a course cannot leave while learners
 * hold it through this path — both server rules, both surfaced here so the
 * administrator is not learning them by being refused.
 */
export function PathDetailPanel({
  pathId,
  onClose,
  onChanged,
}: {
  pathId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useTranslations('admin');
  const detail = useApiQuery(() => adminApi.getPath(pathId), [pathId]);
  const [current, setCurrent] = useState<AdminPathDetail | null>(null);

  const shown = current ?? detail.data;

  return (
    <AdminDialog title={t('pathManageTitle')} onClose={onClose}>
      <DataView isLoading={detail.isInitialLoad} error={detail.error} onRetry={detail.refetch}>
        {shown ? (
          <Body
            path={shown}
            onChanged={(next) => {
              setCurrent(next);
              onChanged();
            }}
          />
        ) : null}
      </DataView>
    </AdminDialog>
  );
}

function Body({
  path,
  onChanged,
}: {
  path: AdminPathDetail;
  onChanged: (next: AdminPathDetail) => void;
}) {
  const t = useTranslations('admin');
  const format = useFormat();
  const translateError = useErrorMessage();

  const [name, setName] = useState(path.name);
  const [description, setDescription] = useState(path.description);
  const [letter, setLetter] = useState<RiasecLetter>(path.riasecLetter);
  const [duration, setDuration] = useState(String(path.typicalDurationMinutes ?? ''));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function run(action: () => Promise<AdminPathDetail>, message: string) {
    setError(null);
    setDone(null);
    setBusy(true);

    try {
      onChanged(await action());
      setDone(message);
    } catch (caught) {
      setError(translateError(caught));
    } finally {
      setBusy(false);
    }
  }

  function move(index: number, direction: -1 | 1) {
    const ids = path.courses.map((course) => course.id);
    const target = index + direction;

    if (target < 0 || target >= ids.length) return;

    [ids[index], ids[target]] = [ids[target]!, ids[index]!];

    return run(() => adminApi.reorderPathCourses(path.id, ids), t('pathOrderSaved'));
  }

  const dirty =
    name !== path.name ||
    description !== path.description ||
    letter !== path.riasecLetter ||
    duration !== String(path.typicalDurationMinutes ?? '');

  return (
    <div className="flex flex-col gap-5">
      <section className="grid gap-4 sm:grid-cols-2">
        <Field id="path-name" label={t('pathName')}>
          {(field) => (
            <Input {...field} value={name} onChange={(event) => setName(event.target.value)} />
          )}
        </Field>

        <Field id="path-letter" label={t('pathLetter')} hint={t('pathLetterHint')}>
          {(field) => (
            <select
              {...field}
              value={letter}
              onChange={(event) => setLetter(event.target.value as RiasecLetter)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {RIASEC_LETTERS.map((value) => (
                <option key={value} value={value}>
                  {t(`riasec.${value}`)}
                </option>
              ))}
            </select>
          )}
        </Field>

        <div className="sm:col-span-2">
          <Field id="path-description" label={t('pathDescription')}>
            {(field) => (
              <Textarea
                {...field}
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            )}
          </Field>
        </div>

        <Field id="path-duration" label={t('pathDuration')}>
          {(field) => (
            <Input
              {...field}
              type="number"
              min={1}
              dir="ltr"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
            />
          )}
        </Field>
      </section>

      {/* Save appears only when there is something to save (§3). */}
      {dirty ? (
        <div>
          <Button
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  adminApi.updatePath(path.id, {
                    name,
                    description,
                    riasecLetter: letter,
                    typicalDurationMinutes: duration === '' ? undefined : Number(duration),
                  }),
                t('pathSaved'),
              )
            }
          >
            {t('pathSave')}
          </Button>
        </div>
      ) : null}

      <LearnerCounts path={path} />

      <section className="flex flex-col gap-3 rounded-md border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">
            {t('pathCourses', { count: format.number(path.courses.length) })}
          </h3>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setAdding(true)}>
            {t('pathAddCourse')}
          </Button>
        </div>

        {/* The refusal, stated before it happens. */}
        {path.blockers.length > 0 ? (
          <p className="text-sm text-destructive">{t(`pathBlocker.${path.blockers[0]}`)}</p>
        ) : null}

        {path.courses.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('pathNoCourses')}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {path.courses.map((course, index) => (
              <li
                key={course.id}
                className="flex flex-wrap items-center gap-2 border-b border-border pb-2 last:border-b-0"
              >
                <span className="w-6 shrink-0 text-sm text-muted-foreground">
                  {format.number(index + 1)}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">{course.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {course.ownerEntityName ?? t('pathCourseUnowned')}
                    {course.heldByLearners > 0
                      ? ` · ${t('pathCourseHeld', { count: format.number(course.heldByLearners) })}`
                      : ''}
                  </p>
                </div>

                {course.status !== 'AVAILABLE' ? (
                  <Badge variant="soft">{t(`courseStatus.${course.status}`)}</Badge>
                ) : null}

                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy || index === 0}
                  aria-label={t('moveUp')}
                  onClick={() => void move(index, -1)}
                >
                  <ChevronUp aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy || index === path.courses.length - 1}
                  aria-label={t('moveDown')}
                  onClick={() => void move(index, 1)}
                >
                  <ChevronDown aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  /* Disabled with a reason attached, rather than left to be
                     refused: the count beside the title says why. */
                  disabled={busy || course.heldByLearners > 0}
                  aria-label={t('pathRemoveCourse')}
                  onClick={() =>
                    void run(
                      () => adminApi.detachPathCourse(path.id, course.id),
                      t('pathCourseRemoved'),
                    )
                  }
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="flex flex-wrap items-center gap-3 rounded-md border border-border p-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">{t('pathOfferHeading')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {path.isActive ? t('pathOfferedHint') : t('pathNotOfferedHint')}
          </p>
        </div>

        {path.isActive ? (
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() =>
              void run(() => adminApi.updatePath(path.id, { isActive: false }), t('pathRetired'))
            }
          >
            {t('pathRetire')}
          </Button>
        ) : (
          <Button
            disabled={busy || path.blockers.length > 0}
            onClick={() =>
              void run(() => adminApi.updatePath(path.id, { isActive: true }), t('pathActivated'))
            }
          >
            {t('pathActivate')}
          </Button>
        )}
      </section>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="text-sm text-success">
          {done}
        </p>
      ) : null}

      {adding ? (
        <AddCourseDialog
          path={path}
          onClose={() => setAdding(false)}
          onAdd={async (courseId) => {
            await run(() => adminApi.attachPathCourse(path.id, courseId), t('pathCourseAdded'));
            setAdding(false);
          }}
        />
      ) : null}
    </div>
  );
}

function LearnerCounts({ path }: { path: AdminPathDetail }) {
  const t = useTranslations('admin');
  const format = useFormat();

  return (
    <Card className="grid gap-3 p-4 text-sm sm:grid-cols-3">
      <div>
        <p className="text-muted-foreground">{t('pathLearnersBuilding')}</p>
        <p className="mt-0.5 font-medium text-foreground">
          {format.number(path.learners.building)}
        </p>
        {/* The only group a retirement affects, and it says so. */}
        <p className="mt-1 text-xs text-muted-foreground">{t('pathLearnersBuildingHint')}</p>
      </div>
      <div>
        <p className="text-muted-foreground">{t('pathLearnersActive')}</p>
        <p className="mt-0.5 font-medium text-foreground">{format.number(path.learners.active)}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('pathLearnersCommittedHint')}</p>
      </div>
      <div>
        <p className="text-muted-foreground">{t('pathLearnersCompleted')}</p>
        <p className="mt-0.5 font-medium text-foreground">
          {format.number(path.learners.completed)}
        </p>
      </div>
    </Card>
  );
}

/**
 * Picks a course to attach.
 *
 * Reads the admin course list rather than the learner catalogue: an
 * administrator attaching a course needs to see drafts and hidden ones too, and
 * which organisation supplies each.
 */
function AddCourseDialog({
  path,
  onClose,
  onAdd,
}: {
  path: AdminPathDetail;
  onClose: () => void;
  onAdd: (courseId: string) => Promise<void>;
}) {
  const t = useTranslations('admin');
  const [selected, setSelected] = useState('');

  const courses = useApiQuery(() => adminApi.attachableCourses(path.id), [path.id]);

  return (
    <AdminDialog
      title={t('pathAddCourse')}
      description={t('pathAddCourseHint')}
      onClose={onClose}
      footer={
        <Button type="button" disabled={!selected} onClick={() => void onAdd(selected)}>
          {t('pathAddCourseAction')}
        </Button>
      }
    >
      <DataView
        isLoading={courses.isInitialLoad}
        error={courses.error}
        onRetry={courses.refetch}
        isEmpty={courses.data?.length === 0}
        emptyProps={{ title: t('pathNoCourseToAdd') }}
      >
        <Field id="attach-course" label={t('pathCourseToAdd')} required>
          {(field) => (
            <select
              {...field}
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{t('pathChooseCourse')}</option>
              {(courses.data ?? []).map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          )}
        </Field>
      </DataView>
    </AdminDialog>
  );
}
