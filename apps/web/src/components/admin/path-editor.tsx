'use client';

import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { courseVisibility, type AdminLevelRow, type AdminPathDetail } from '@tamkeen/types';

import { AdminDialog } from '@/components/admin/admin-dialog';
import { useErrorMessage } from '@/components/auth/use-error-message';
import { DataView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useFormat } from '@/i18n/format-provider';
import { adminApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * §4C.4 — one path: its content, its ladder, and who is on it (D-134).
 *
 * **A page, not a dialog.** It was a dialog while it was a form; it is now the
 * ladder editor — a work queue, three rungs with their courses, a rung selector
 * and two arrows on every row, learner counts, a publish gate and a delete
 * section. That is a screen's worth of work, and a modal is the wrong container
 * for work you come back to: it has no address to return to, it traps focus
 * around something you want to scroll, and it puts a scrollbar inside a
 * scrollbar. Deletion keeps its dialog, because a confirmation is exactly what
 * a dialog is for — one question, answered, and gone.
 *
 * **This screen is where a course becomes visible to anybody.** An entity offers
 * a course to a path; until an administrator puts it on a rung it reaches no
 * learner at all. So the unassigned group is not a footnote — it is the work
 * queue, and it sits above the ladder with its own heading and its own count.
 *
 * **Placing, moving and unplacing are one control repeated**, a rung selector on
 * every course, because they are one decision: where in the path does this
 * belong. Ordering within a rung is the pair of arrows beside it, for the same
 * reason it always was — sequence is curriculum, not decoration.
 *
 * **The learner counts are the safety rail.** Unpublishing a path takes it out
 * of new assignments and touches nobody holding it, and deleting a rung
 * unassigns its courses rather than deleting them — but a rung somebody is
 * standing on cannot go, and the screen says which before the attempt.
 */
export function PathEditor({
  pathId,
  onChanged,
  onDeleted,
}: {
  pathId: string;
  /** The list a page back is stale after any edit; the caller decides when. */
  onChanged?: () => void;
  /** Called once the path is gone, so the caller can leave a screen that no
   *  longer has a subject. */
  onDeleted: () => void;
}) {
  const detail = useApiQuery(() => adminApi.getPath(pathId), [pathId]);
  const [current, setCurrent] = useState<AdminPathDetail | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const shown = current ?? detail.data;

  return (
    <>
      <DataView isLoading={detail.isInitialLoad} error={detail.error} onRetry={detail.refetch}>
        {shown ? (
          <Body
            path={shown}
            onChanged={(next) => {
              setCurrent(next);
              onChanged?.();
            }}
            onRequestDelete={() => setConfirmingDelete(true)}
          />
        ) : null}
      </DataView>

      {confirmingDelete && shown ? (
        <ConfirmDeleteDialog
          path={shown}
          onClose={() => setConfirmingDelete(false)}
          onDeleted={onDeleted}
        />
      ) : null}
    </>
  );
}

function Body({
  path,
  onChanged,
  onRequestDelete,
}: {
  path: AdminPathDetail;
  onChanged: (next: AdminPathDetail) => void;
  onRequestDelete: () => void;
}) {
  const t = useTranslations('admin');
  const format = useFormat();
  const translateError = useErrorMessage();

  const [name, setName] = useState(path.name);
  const [description, setDescription] = useState(path.description);
  /* One outcome per line, the same convention the entity's objectives editor
     uses (§4B.3) — a repeating-row editor for three to five short phrases is
     more UI than the data deserves. */
  const [skillOutcomes, setSkillOutcomes] = useState(path.skillOutcomes.join('\n'));
  const [newLevel, setNewLevel] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

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

  const dirty =
    name !== path.name ||
    description !== path.description ||
    skillOutcomes !== path.skillOutcomes.join('\n');

  return (
    <div className="flex flex-col gap-5">
      <section className="grid gap-4 sm:grid-cols-2">
        <Field id="path-name" label={t('pathName')}>
          {(field) => (
            <Input {...field} value={name} onChange={(event) => setName(event.target.value)} />
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

        <div className="sm:col-span-2">
          <Field
            id="path-skill-outcomes"
            label={t('pathSkillOutcomes')}
            hint={t('pathSkillOutcomesHint')}
          >
            {(field) => (
              <Textarea
                {...field}
                rows={3}
                value={skillOutcomes}
                onChange={(event) => setSkillOutcomes(event.target.value)}
              />
            )}
          </Field>
        </div>
      </section>

      {/* Save appears only when there is something to save (§3). */}
      {dirty ? (
        <div>
          <Button
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  adminApi.updatePath(path.id, {
                    name,
                    description,
                    skillOutcomes: skillOutcomes
                      .split('\n')
                      .map((line) => line.trim())
                      .filter(Boolean),
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

      {/*
        The work queue, first.
        A membership nobody has placed reaches no learner, and this is the only
        screen in the product that can say so — putting it under the ladder would
        make the thing that needs doing the thing that has to be scrolled to.
      */}
      <section className="flex flex-col gap-3 rounded-md border border-warning-600 bg-warning-50 p-4">
        <h3 className="text-sm font-semibold text-foreground">
          {t('pathUnassignedHeading', { count: format.number(path.unassignedCourses.length) })}
        </h3>

        <AddCourseControl
          path={path}
          busy={busy}
          onAttach={(courseId) =>
            void run(() => adminApi.attachPathCourse(path.id, courseId), t('pathCourseAdded'))
          }
        />

        {path.unassignedCourses.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('pathUnassignedEmpty')}</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t('pathUnassignedHint')}</p>
            <ul className="flex flex-col gap-2">
              {path.unassignedCourses.map((course) => (
                <li
                  key={course.id}
                  className="flex flex-wrap items-center gap-2 border-b border-warning-600/30 pb-2 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{course.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {course.assignedByEntityName ?? t('pathCourseUnowned')}
                    </p>
                  </div>

                  <PlaceControl
                    path={path}
                    pathCourseId={course.id}
                    currentLevelId={null}
                    busy={busy}
                    onPlace={(levelId) =>
                      void run(
                        () => adminApi.placeCourse(path.id, course.id, { levelId }),
                        t('pathCoursePlaced'),
                      )
                    }
                  />

                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
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
            </ul>
          </>
        )}
      </section>

      {/* The ladder. */}
      <section className="flex flex-col gap-3 rounded-md border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">
          {t('pathLevelsHeading', { count: format.number(path.levels.length) })}
        </h3>

        {path.blockers.length > 0 ? (
          <p className="text-sm text-destructive">{t(`pathBlocker.${path.blockers[0]}`)}</p>
        ) : null}

        {path.levels.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('pathNoLevels')}</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {path.levels.map((level, index) => (
              <li key={level.id}>
                <LevelBlock
                  path={path}
                  level={level}
                  index={index}
                  busy={busy}
                  onRun={(action, message) => void run(action, message)}
                />
              </li>
            ))}
          </ol>
        )}

        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <div className="min-w-48 flex-1">
            <Field id="new-level-name" label={t('pathLevelName')}>
              {(field) => (
                <Input
                  {...field}
                  value={newLevel}
                  onChange={(event) => setNewLevel(event.target.value)}
                />
              )}
            </Field>
          </div>
          <Button
            variant="outline"
            disabled={busy || newLevel.trim().length === 0}
            onClick={() =>
              void run(
                () => adminApi.createLevel(path.id, newLevel.trim()),
                t('pathLevelAdded'),
              ).then(() => setNewLevel(''))
            }
          >
            {t('pathLevelAdd')}
          </Button>
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-3 rounded-md border border-border p-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">{t('pathOfferHeading')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {path.status === 'PUBLISHED' ? t('pathOfferedHint') : t('pathNotOfferedHint')}
          </p>
        </div>

        {path.status === 'PUBLISHED' ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(() => adminApi.updatePath(path.id, { status: 'DRAFT' }), t('pathRetired'))
            }
          >
            {t('pathRetire')}
          </Button>
        ) : (
          <Button
            disabled={busy || path.blockers.length > 0}
            onClick={() =>
              void run(
                () => adminApi.updatePath(path.id, { status: 'PUBLISHED' }),
                t('pathActivated'),
              )
            }
          >
            {t('pathActivate')}
          </Button>
        )}
      </section>

      {/*
        Deletion, kept apart from unpublishing and never dressed the same way.
        Hiding is the reversible decision above and keeps the outline button;
        this one is destructive, sits below, and is simply absent — with the
        reason in its place — for any path somebody was assigned. The server
        refuses that case regardless (D-098); saying so here means the
        administrator learns the rule without being refused by it.
      */}
      <section className="flex flex-wrap items-center gap-3 rounded-md border border-border p-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">{t('pathRemoveHeading')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {path.canDelete ? t('pathRemoveHint') : t('pathRemoveBlocked')}
          </p>
        </div>

        {path.canDelete ? (
          <Button variant="destructive" disabled={busy} onClick={onRequestDelete}>
            {t('pathRemove')}
          </Button>
        ) : null}
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
    </div>
  );
}

/** One rung, its courses, and what can be done to it. */
function LevelBlock({
  path,
  level,
  index,
  busy,
  onRun,
}: {
  path: AdminPathDetail;
  level: AdminLevelRow;
  index: number;
  busy: boolean;
  onRun: (action: () => Promise<AdminPathDetail>, message: string) => void;
}) {
  const t = useTranslations('admin');
  const format = useFormat();

  function moveLevel(direction: -1 | 1) {
    const ids = path.levels.map((row) => row.id);
    const target = index + direction;

    if (target < 0 || target >= ids.length) return;

    [ids[index], ids[target]] = [ids[target]!, ids[index]!];

    onRun(() => adminApi.reorderLevels(path.id, ids), t('pathLevelsReordered'));
  }

  function moveCourse(courseIndex: number, direction: -1 | 1) {
    const ids = level.courses.map((course) => course.id);
    const target = courseIndex + direction;

    if (target < 0 || target >= ids.length) return;

    [ids[courseIndex], ids[target]] = [ids[target]!, ids[courseIndex]!];

    onRun(() => adminApi.reorderLevelCourses(path.id, level.id, ids), t('pathOrderSaved'));
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">
          {t('pathLevelLabel', {
            position: format.number(level.position),
            name: level.name,
          })}
        </span>
        {level.hasPlacedLearners ? <Badge variant="soft">{t('pathLevelHasLearners')}</Badge> : null}

        <span className="flex-1" />

        <Button
          variant="ghost"
          size="sm"
          disabled={busy || index === 0}
          aria-label={t('moveUp')}
          onClick={() => moveLevel(-1)}
        >
          <ChevronUp aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || index === path.levels.length - 1}
          aria-label={t('moveDown')}
          onClick={() => moveLevel(1)}
        >
          <ChevronDown aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          /* Absent would be better than disabled, but the reason is what an
             administrator needs — so the badge above says it and the control
             stays where they expect it. */
          disabled={busy || level.hasPlacedLearners}
          aria-label={t('pathLevelDelete')}
          onClick={() =>
            onRun(() => adminApi.deleteLevel(path.id, level.id), t('pathLevelDeleted'))
          }
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>

      {level.courses.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t('pathLevelEmpty')}</p>
      ) : (
        <ol className="mt-2 flex flex-col gap-2">
          {level.courses.map((course, courseIndex) => (
            <li key={course.id} className="flex flex-wrap items-center gap-2">
              <span className="w-6 shrink-0 text-sm text-muted-foreground">
                {format.number(courseIndex + 1)}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">{course.title}</p>
                <p className="text-xs text-muted-foreground">
                  {course.ownerEntityName ?? t('pathCourseUnowned')}
                  {course.learnersStarted > 0
                    ? ` · ${t('pathCourseStarted', {
                        count: format.number(course.learnersStarted),
                      })}`
                    : ''}
                </p>
              </div>

              {/* The same two words §4C.5 uses (TAM-134): a course is either
                  reachable or it is not, and the four-state derivation is not
                  what this list is about. */}
              {courseVisibility(course.status) !== 'AVAILABLE' ? (
                <Badge variant="soft">{t('courseVisibility.HIDDEN')}</Badge>
              ) : null}

              <PlaceControl
                path={path}
                pathCourseId={course.id}
                currentLevelId={level.id}
                busy={busy}
                onPlace={(levelId) =>
                  onRun(
                    () => adminApi.placeCourse(path.id, course.id, { levelId }),
                    levelId === null ? t('pathCourseUnplaced') : t('pathCourseMoved'),
                  )
                }
              />

              <Button
                variant="ghost"
                size="sm"
                disabled={busy || courseIndex === 0}
                aria-label={t('moveUp')}
                onClick={() => moveCourse(courseIndex, -1)}
              >
                <ChevronUp aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy || courseIndex === level.courses.length - 1}
                aria-label={t('moveDown')}
                onClick={() => moveCourse(courseIndex, 1)}
              >
                <ChevronDown aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ol>
      )}

      {/* Warned, not asked (§10 of the spec): progress is keyed on the course
          and survives a move, so the administrator is told rather than blocked. */}
      {level.courses.some((course) => course.learnersStarted > 0) ? (
        <p className="mt-2 text-xs text-muted-foreground">{t('pathMoveWarning')}</p>
      ) : null}
    </div>
  );
}

/**
 * Where this course sits — the one control that places, moves and unplaces.
 *
 * A select rather than three buttons, because those are three spellings of one
 * decision, and a screen with «ضع» «انقل» «أزل من المستوى» beside every course
 * would be exactly the redundant UI §3 forbids.
 */
/**
 * Adds a course to the path — the administrator's own way in, beside the
 * entity's (D-134).
 *
 * A drop-down of every course that is not already in the path, drafts and hidden
 * ones included (that is what `attachableCourses` returns), so the administrator
 * chooses from what exists rather than having to remember a name. It lands
 * **unassigned**, always: membership alone reaches nobody, and the rung is the
 * separate decision made on the row it creates.
 */
function AddCourseControl({
  path,
  busy,
  onAttach,
}: {
  path: AdminPathDetail;
  busy: boolean;
  onAttach: (courseId: string) => void;
}) {
  const t = useTranslations('admin');

  const [courseId, setCourseId] = useState('');

  /* Refetched whenever the path's membership changes, so a course just added
     stops being offered. */
  const membership = path.placedCourseCount + path.unassignedCourses.length;
  const options = useApiQuery(() => adminApi.attachableCourses(path.id), [path.id, membership]);

  const courses = options.data ?? [];

  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-warning-600/30 pb-3">
      <div className="min-w-64 flex-1">
        <Field
          id="path-add-course"
          label={t('pathAddCourse')}
          hint={t('pathAddCourseHint')}
          error={options.error ? t('pathAddCourseError') : undefined}
        >
          {(field) => (
            <Select
              {...field}
              value={courseId}
              disabled={busy || options.isLoading}
              onChange={(event) => setCourseId(event.target.value)}
            >
              <option value="">
                {courses.length === 0 && !options.isLoading
                  ? t('pathAddCourseNone')
                  : t('pathAddCoursePlaceholder')}
              </option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.ownerEntityName
                    ? `${course.title} — ${course.ownerEntityName}`
                    : course.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {/* Offered only once a course is chosen (§3). */}
      {courseId !== '' ? (
        <Button
          disabled={busy}
          onClick={() => {
            onAttach(courseId);
            setCourseId('');
          }}
        >
          {t('pathAddCourseButton')}
        </Button>
      ) : null}
    </div>
  );
}

function PlaceControl({
  path,
  pathCourseId,
  currentLevelId,
  busy,
  onPlace,
}: {
  path: AdminPathDetail;
  pathCourseId: string;
  currentLevelId: string | null;
  busy: boolean;
  onPlace: (levelId: string | null) => void;
}) {
  const t = useTranslations('admin');

  return (
    <Select
      id={`place-${pathCourseId}`}
      aria-label={t('pathPlaceLabel')}
      disabled={busy || path.levels.length === 0}
      value={currentLevelId ?? ''}
      onChange={(event) => onPlace(event.target.value === '' ? null : event.target.value)}
      className="w-40"
    >
      <option value="">{t('pathPlaceUnassigned')}</option>
      {path.levels.map((level) => (
        <option key={level.id} value={level.id}>
          {level.name}
        </option>
      ))}
    </Select>
  );
}

function LearnerCounts({ path }: { path: AdminPathDetail }) {
  const t = useTranslations('admin');
  const format = useFormat();

  return (
    <Card className="grid gap-3 p-4 text-sm sm:grid-cols-3">
      <div>
        <p className="text-muted-foreground">{t('pathLearnersAwaiting')}</p>
        <p className="mt-0.5 font-medium text-foreground">
          {format.number(path.learners.awaitingPlacement)}
        </p>
        {/* The group a missing or unpublished assessment strands, and the one an
            administrator can actually unblock. */}
        <p className="mt-1 text-xs text-muted-foreground">{t('pathLearnersAwaitingHint')}</p>
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
 * The last chance to not do it.
 *
 * Names the path in the question, because "are you sure" beside a list of twelve
 * is a question about nothing in particular — and offers the reversible
 * alternative in the same breath, since an administrator reaching for delete
 * when they meant hide is the mistake this dialog exists to catch.
 */
function ConfirmDeleteDialog({
  path,
  onClose,
  onDeleted,
}: {
  path: AdminPathDetail;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const t = useTranslations('admin');
  const translateError = useErrorMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);

    try {
      await adminApi.deletePath(path.id);
      onDeleted();
    } catch (caught) {
      /* Shown here rather than swallowed: the likeliest failure is that somebody
         was assigned the path between the screen loading and this click, and the
         server's refusal names that. */
      setError(translateError(caught));
      setBusy(false);
    }
  }

  return (
    <AdminDialog
      title={t('pathRemoveConfirmTitle')}
      description={t('pathRemoveConfirmBody', { name: path.name })}
      onClose={onClose}
      footer={
        <Button type="button" variant="destructive" disabled={busy} onClick={submit}>
          {t('pathRemoveConfirm')}
        </Button>
      }
    >
      <p className="text-sm text-muted-foreground">{t('pathRemoveConfirmHint')}</p>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </AdminDialog>
  );
}
