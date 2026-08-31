'use client';

import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  RIASEC_LETTERS,
  courseVisibility,
  type AdminPathDetail,
  type RiasecLetter,
} from '@tamkeen/types';

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
 * **Hiding and deleting are two decisions, so they are two sections.** One is
 * reversible and leaves every learner untouched; the other cannot be undone and
 * is refused outright for any path somebody ever chose (D-098). Putting them
 * side by side as a pair of buttons would invite the irreversible one to be
 * clicked in place of the reversible one.
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
  onDeleted,
}: {
  pathId: string;
  onClose: () => void;
  onChanged: () => void;
  /** Called once the path is gone. Separate from `onClose` so the list can say
   *  what happened — the panel closing is not, by itself, an announcement. */
  onDeleted: () => void;
}) {
  const t = useTranslations('admin');
  const detail = useApiQuery(() => adminApi.getPath(pathId), [pathId]);
  const [current, setCurrent] = useState<AdminPathDetail | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const shown = current ?? detail.data;

  return (
    <>
      <AdminDialog title={t('pathManageTitle')} onClose={onClose}>
        <DataView isLoading={detail.isInitialLoad} error={detail.error} onRetry={detail.refetch}>
          {shown ? (
            <Body
              path={shown}
              onChanged={(next) => {
                setCurrent(next);
                onChanged();
              }}
              onRequestDelete={() => setConfirmingDelete(true)}
            />
          ) : null}
        </DataView>
      </AdminDialog>

      {/*
        A sibling of the panel rather than a child of it: `AdminDialog` wraps its
        content in a `<form>`, and a dialog nested inside that form would nest
        one form in another — invalid, and the kind of thing that works until a
        submit button starts closing the wrong dialog.
      */}
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
  /* One outcome per line. A textarea rather than a row of inputs with add and
     remove buttons: the list is three to five short nouns, the directorate
     writes it in one sitting, and a line break is a control everybody already
     knows. The array is the storage; lines are only how it is typed. */
  const [outcomes, setOutcomes] = useState(path.skillOutcomes.join('\n'));
  const [letter, setLetter] = useState<RiasecLetter>(path.riasecLetter);

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

  function move(index: number, direction: -1 | 1) {
    const ids = path.courses.map((course) => course.id);
    const target = index + direction;

    if (target < 0 || target >= ids.length) return;

    [ids[index], ids[target]] = [ids[target]!, ids[index]!];

    return run(() => adminApi.reorderPathCourses(path.id, ids), t('pathOrderSaved'));
  }

  const parsedOutcomes = outcomes
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const dirty =
    name !== path.name ||
    description !== path.description ||
    letter !== path.riasecLetter ||
    parsedOutcomes.join('\n') !== path.skillOutcomes.join('\n');

  return (
    <div className="flex flex-col gap-5">
      {/*
        Name, letter, description — and no duration (D-098). The estimate is a
        number an administrator was asked to keep true by hand, in minutes, for
        a path whose real length is the sum of the courses a learner picks from
        it — five to ten out of however many it holds — so no single figure was
        ever right for two people.

        **It is still shown on the learner's path card.** Removing the editor
        does not remove the column or the card: existing values stand and are
        now settable only through the API. Deriving it from the path's courses
        is the fix, and it belongs with the learner-facing screens rather than
        here (recorded in progress.md as owed).
      */}
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
          <Field id="path-description" label={t('pathDescription')} hint={t('pathDescriptionHint')}>
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

        {/*
          What the path produces (TAM-150). Beside the description because they
          are written together and read together — on the ministry's public
          front page, which is the one screen in the product where this text
          reaches somebody who has not signed in.
        */}
        <div className="sm:col-span-2">
          <Field id="path-outcomes" label={t('pathOutcomes')} hint={t('pathOutcomesHint')}>
            {(field) => (
              <Textarea
                {...field}
                rows={5}
                value={outcomes}
                onChange={(event) => setOutcomes(event.target.value)}
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
              run(
                () =>
                  adminApi.updatePath(path.id, {
                    name,
                    description,
                    skillOutcomes: parsedOutcomes,
                    riasecLetter: letter,
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
        The courses stay, and so does everything that can be decided about them
        from here: the order they are offered in, and removing one. Adding is
        the course's own act — an entity publishes a course into its paths with
        the rest of its product metadata (§4B.3) — so this screen no longer
        offers a second way in that reads as if it were the only one.
      */}
      <section className="flex flex-col gap-3 rounded-md border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">
          {t('pathCourses', { count: format.number(path.courses.length) })}
        </h3>

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

                {/* The same two words §4C.5 uses (TAM-134): a course in a path
                    is either available to choose or it is not, and the four-state
                    derivation is not what this list is about. */}
                {courseVisibility(course.status) !== 'AVAILABLE' ? (
                  <Badge variant="soft">{t('courseVisibility.HIDDEN')}</Badge>
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
            variant="outline"
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

      {/*
        Deletion, kept apart from retirement and never dressed the same way.
        Hiding is the reversible decision above and it keeps the outline button;
        this one is destructive, sits below, and is simply absent — with the
        reason in its place — for any path somebody has chosen. The server
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
 * The last chance to not do it.
 *
 * Names the path in the question, because "are you sure" beside a list of
 * twelve is a question about nothing in particular — and offers the reversible
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
      /* Shown here rather than swallowed: the likeliest failure is that
         somebody chose the path between the screen loading and this click, and
         the server's refusal names that. */
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
