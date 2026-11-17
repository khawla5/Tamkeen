'use client';

import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type {
  AdminAssessmentDraft,
  AdminAssessmentQuestion,
  LevelRef,
  PlacementBand,
} from '@tamkeen/types';

import { AdminDialog } from '@/components/admin/admin-dialog';
import { BandEditor } from '@/components/admin/band-editor';
import { BankReadinessPanel } from '@/components/admin/bank-readiness-panel';
import { useErrorMessage } from '@/components/auth/use-error-message';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useFormat } from '@/i18n/format-provider';
import { adminApi } from '@/lib/api-client';
import { cn } from '@/lib/utils';

/**
 * §4C.3 — the draft editor for one path's placement assessment (D-134).
 *
 * **What an administrator can change here is the instrument's content, and
 * nothing else** (D-048). Question text, what an item is worth, which option is
 * the answer, the rung an item is aimed at, the order, and the band table. The
 * tally, the placement and the partition rule are in code and this screen has no
 * vocabulary for them.
 *
 * **Marking an option correct clears the others in one action.** Two correct
 * answers is not a state the editor should be able to reach, and making the
 * administrator untick before ticking would leave the bank invalid between the
 * two requests — with the readiness panel flashing a blocker at them for it.
 */
/** One soft ground per rung, cycling if a path has more than three — the palette's own
 *  status tints (mint, cream, light blue), never a state colour carrying meaning. */
const RUNG_TINTS = ['bg-primary-50', 'bg-warning-50', 'bg-info-50'];

export function AssessmentEditor({
  pathId,
  draft,
  onChanged,
  onPublished,
}: {
  pathId: string;
  draft: AdminAssessmentDraft;
  onChanged: (next: AdminAssessmentDraft) => void;
  onPublished: () => void;
}) {
  const t = useTranslations('admin');
  const format = useFormat();
  const translateError = useErrorMessage();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* `null` is closed; otherwise the rung the new question starts on ('' for none). */
  const [adding, setAdding] = useState<string | null>(null);
  const [confirmingPublish, setConfirmingPublish] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  async function run(action: () => Promise<AdminAssessmentDraft>) {
    setError(null);
    setBusy(true);

    try {
      onChanged(await action());
    } catch (caught) {
      setError(translateError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setError(null);
    setBusy(true);

    try {
      await adminApi.publishAssessment(pathId);
      setConfirmingPublish(false);
      onPublished();
    } catch (caught) {
      setError(translateError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    setError(null);
    setBusy(true);

    try {
      await adminApi.discardAssessmentDraft(pathId);
      setConfirmingDiscard(false);
      onPublished();
    } catch (caught) {
      setError(translateError(caught));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Moves a question up or down **within its own rung's column**.
   *
   * The order is still one order for the whole bank (that is what the learner is
   * asked in), so a move swaps with the nearest neighbour *of the same rung* and
   * leaves every other question where it was. Swapping with the adjacent question
   * in the bank would be right in one long list and wrong here, where that
   * neighbour may be in another column.
   */
  function move(globalIndex: number, groupIndexes: number[], position: number, direction: -1 | 1) {
    const neighbour = groupIndexes[position + direction];

    if (neighbour === undefined) return;

    const ids = draft.questions.map((question) => question.id);

    [ids[globalIndex], ids[neighbour]] = [ids[neighbour]!, ids[globalIndex]!];

    return run(() => adminApi.reorderDraft(pathId, ids));
  }

  /* One column for each rung, in path order, plus one for questions aimed at none. */
  const columns = [
    ...draft.levels.map((level) => ({ id: level.id, name: level.name as string | null })),
    ...(draft.questions.some((question) => question.levelId === null) || draft.levels.length === 0
      ? [{ id: '', name: null as string | null }]
      : []),
  ].map((column) => ({
    ...column,
    /* Indexes into the whole bank, so the number shown and the order saved stay the
       bank's own however the columns are cut. */
    indexes: draft.questions.flatMap((question, index) =>
      (question.levelId ?? '') === column.id ? [index] : [],
    ),
  }));

  return (
    <div className="space-y-6">
      {/* The instrument's header beside its readiness: what this version is and what
          can be done with it on one side, why it can or cannot be published on the
          other. */}
      <div className="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="space-y-4 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-foreground">
              {t('draftHeading', { version: format.number(draft.version) })}
            </h2>
            <Badge variant="soft">{t('versionStatus.DRAFT')}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('draftCount', { count: format.number(draft.questions.length) })}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setAdding('')}>
              {t('addQuestion')}
            </Button>
            <Button
              disabled={busy || draft.readiness.blockers.length > 0}
              onClick={() => setConfirmingPublish(true)}
            >
              {t('publishVersion')}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirmingDiscard(true)}>
              {t('discardDraft')}
            </Button>
          </div>
        </Card>

        <BankReadinessPanel readiness={draft.readiness} levels={draft.levels} />
      </div>

      <BandEditor
        levels={draft.levels}
        bands={draft.bands}
        maxScore={draft.readiness.maxScore}
        isDefault={draft.bandsAreDefault}
        busy={busy}
        onSave={(bands: PlacementBand[]) =>
          void run(() => adminApi.setAssessmentBands(pathId, bands))
        }
      />

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {/* One tinted column per rung, as the proposal draws it: the rung's name, how many
          questions aim at it and a + that adds one already aimed there. Every
          question keeps its full editor inside its column. */}
      <div className="grid items-start gap-4 lg:grid-cols-3">
        {columns.map((column, columnIndex) => (
          <section
            key={column.id || 'none'}
            aria-labelledby={`rung-${column.id || 'none'}`}
            className={cn('space-y-3 rounded-2xl p-4', RUNG_TINTS[columnIndex % RUNG_TINTS.length])}
          >
            <div className="flex items-center justify-between gap-2">
              <h3
                id={`rung-${column.id || 'none'}`}
                className="flex items-center gap-2 font-semibold text-foreground"
              >
                {column.name ?? t('questionLevelNone')}
                <span className="rounded-full bg-white/70 px-2 text-xs font-medium text-muted-foreground">
                  {format.number(column.indexes.length)}
                </span>
              </h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                aria-label={`${t('addQuestion')} — ${column.name ?? t('questionLevelNone')}`}
                onClick={() => setAdding(column.id)}
              >
                <Plus aria-hidden="true" />
              </Button>
            </div>

            {column.indexes.length === 0 ? (
              <p className="rounded-xl bg-white/60 p-4 text-sm text-muted-foreground">
                {t('rungEmpty')}
              </p>
            ) : (
              <ol className="space-y-3">
                {column.indexes.map((index, position) => {
                  const question = draft.questions[index]!;

                  return (
                    <li key={question.id}>
                      <QuestionCard
                        question={question}
                        levels={draft.levels}
                        index={index}
                        position={position}
                        groupSize={column.indexes.length}
                        busy={busy}
                        onMove={(direction) =>
                          void move(index, column.indexes, position, direction)
                        }
                        onSave={(patch) =>
                          void run(() => adminApi.updateDraftQuestion(pathId, question.id, patch))
                        }
                        onRemove={() =>
                          void run(() => adminApi.removeDraftQuestion(pathId, question.id))
                        }
                        onOption={(optionId, patch) =>
                          void run(() => adminApi.updateDraftOption(pathId, optionId, patch))
                        }
                      />
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        ))}
      </div>

      {adding !== null ? (
        <AddQuestionDialog
          levels={draft.levels}
          initialLevelId={adding}
          onClose={() => setAdding(null)}
          onAdd={async (input) => {
            await run(() => adminApi.addDraftQuestion(pathId, input));
            setAdding(null);
          }}
        />
      ) : null}

      {confirmingPublish ? (
        <AdminDialog
          title={t('publishVersion')}
          onClose={() => setConfirmingPublish(false)}
          footer={
            <Button type="button" disabled={busy} onClick={publish}>
              {t('publishConfirm')}
            </Button>
          }
        >
          <p className="text-sm text-foreground">
            {t('publishBody', { version: format.number(draft.version) })}
          </p>
          {/*
            The sentence D-049 exists for, said where the decision is made. An
            administrator publishing an edit needs to know, at that moment, that
            nobody's recorded placement changes — otherwise the safe move looks
            like not editing at all.
          */}
          <p className="text-sm text-muted-foreground">{t('publishFrozenNotice')}</p>
        </AdminDialog>
      ) : null}

      {confirmingDiscard ? (
        <AdminDialog
          title={t('discardDraft')}
          onClose={() => setConfirmingDiscard(false)}
          footer={
            <Button type="button" variant="destructive" disabled={busy} onClick={discard}>
              {t('discardConfirm')}
            </Button>
          }
        >
          <p className="text-sm text-foreground">{t('discardBody')}</p>
        </AdminDialog>
      ) : null}
    </div>
  );
}

function QuestionCard({
  question,
  levels,
  index,
  position,
  groupSize,
  busy,
  onMove,
  onSave,
  onRemove,
  onOption,
}: {
  question: AdminAssessmentQuestion;
  levels: LevelRef[];
  /** Its place in the whole bank — the number printed and the order saved. */
  index: number;
  /** Its place among the questions of its own rung, which the arrows move within. */
  position: number;
  groupSize: number;
  busy: boolean;
  onMove: (direction: -1 | 1) => void;
  onSave: (patch: { text?: string; marks?: number; levelId?: string | null }) => void;
  onRemove: () => void;
  onOption: (optionId: string, patch: { label?: string; isCorrect?: boolean }) => void;
}) {
  const t = useTranslations('admin');
  const format = useFormat();
  const [text, setText] = useState(question.text);
  const [marks, setMarks] = useState(String(question.marks));
  const [open, setOpen] = useState(false);

  const dirty = text !== question.text || marks !== String(question.marks);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="mt-2 shrink-0 text-sm text-muted-foreground">
          {format.number(index + 1)}
        </span>

        <div className="min-w-0 flex-1">
          <Field id={`q-${question.id}`} label={t('questionText')}>
            {(field) => (
              <Textarea
                {...field}
                rows={2}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            )}
          </Field>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field id={`marks-${question.id}`} label={t('questionMarks')}>
              {(field) => (
                <Input
                  {...field}
                  type="number"
                  min={1}
                  max={20}
                  dir="ltr"
                  value={marks}
                  onChange={(event) => setMarks(event.target.value)}
                />
              )}
            </Field>

            {/* Authoring metadata: scoring never reads it. It is here so a bank
                spanning every rung can be reviewed by a human without reading
                every item (D-134). */}
            <Field id={`level-${question.id}`} label={t('questionLevel')}>
              {(field) => (
                <Select
                  {...field}
                  value={question.levelId ?? ''}
                  disabled={busy}
                  onChange={(event) =>
                    onSave({ levelId: event.target.value === '' ? null : event.target.value })
                  }
                >
                  <option value="">{t('questionLevelNone')}</option>
                  {levels.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <p className="mt-1 text-xs text-muted-foreground">
            {/* The key, because it is what makes a revised question recognisably
                the same question across versions (D-032). */}
            <span dir="ltr">{question.key}</span>
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || position === 0}
            aria-label={t('moveUp')}
            onClick={() => onMove(-1)}
          >
            <ChevronUp aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || position === groupSize - 1}
            aria-label={t('moveDown')}
            onClick={() => onMove(1)}
          >
            <ChevronDown aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* Save appears only when there is something to save (§3). */}
        {dirty ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => onSave({ text, marks: Number(marks) || 1 })}
          >
            {t('saveQuestion')}
          </Button>
        ) : null}

        <Button size="sm" variant="ghost" onClick={() => setOpen((value) => !value)}>
          {open ? t('hideOptions') : t('showOptions')}
        </Button>

        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          aria-label={t('removeQuestion')}
          onClick={onRemove}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>

      {open ? (
        <fieldset className="mt-4 space-y-3 border-t border-border pt-4">
          <legend className="sr-only">{t('questionOptions')}</legend>
          {question.options.map((option) => (
            <OptionRow
              key={option.id}
              option={option}
              questionId={question.id}
              busy={busy}
              onLabel={(label) => onOption(option.id, { label })}
              onCorrect={() => onOption(option.id, { isCorrect: true })}
            />
          ))}
        </fieldset>
      ) : null}
    </Card>
  );
}

function OptionRow({
  option,
  questionId,
  busy,
  onLabel,
  onCorrect,
}: {
  option: AdminAssessmentQuestion['options'][number];
  questionId: string;
  busy: boolean;
  onLabel: (label: string) => void;
  onCorrect: () => void;
}) {
  const t = useTranslations('admin');
  const [label, setLabel] = useState(option.label);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-48 flex-1">
        <Field id={`opt-${option.id}`} label={t('optionLabel')}>
          {(field) => (
            <Input {...field} value={label} onChange={(event) => setLabel(event.target.value)} />
          )}
        </Field>
      </div>

      {/* A radio, because exactly one option is the answer — a set of checkboxes
          would let the editor express a state the bank cannot have. */}
      <label className="flex items-center gap-2 pb-2 text-sm text-foreground">
        <input
          type="radio"
          name={`correct-${questionId}`}
          checked={option.isCorrect}
          disabled={busy}
          onChange={onCorrect}
          className="size-4"
        />
        {t('optionCorrect')}
      </label>

      {label !== option.label ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onLabel(label)}>
          {t('saveOption')}
        </Button>
      ) : null}
    </div>
  );
}

function AddQuestionDialog({
  levels,
  initialLevelId,
  onClose,
  onAdd,
}: {
  levels: LevelRef[];
  /** The rung the + was pressed on; empty for the header button. */
  initialLevelId: string;
  onClose: () => void;
  onAdd: (input: { text: string; marks: number; levelId: string | null }) => Promise<void>;
}) {
  const t = useTranslations('admin');
  const [text, setText] = useState('');
  const [marks, setMarks] = useState('1');
  const [levelId, setLevelId] = useState(initialLevelId);

  return (
    <AdminDialog
      title={t('addQuestion')}
      description={t('addQuestionHint')}
      onClose={onClose}
      footer={
        <Button
          type="button"
          disabled={text.trim().length < 5}
          onClick={() =>
            void onAdd({
              text: text.trim(),
              marks: Number(marks) || 1,
              levelId: levelId === '' ? null : levelId,
            })
          }
        >
          {t('addQuestionAction')}
        </Button>
      }
    >
      <Field id="new-question-text" label={t('questionText')} required>
        {(field) => (
          <Textarea
            {...field}
            rows={3}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="new-question-marks" label={t('questionMarks')}>
          {(field) => (
            <Input
              {...field}
              type="number"
              min={1}
              max={20}
              dir="ltr"
              value={marks}
              onChange={(event) => setMarks(event.target.value)}
            />
          )}
        </Field>

        <Field id="new-question-level" label={t('questionLevel')}>
          {(field) => (
            <Select {...field} value={levelId} onChange={(event) => setLevelId(event.target.value)}>
              <option value="">{t('questionLevelNone')}</option>
              {levels.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </AdminDialog>
  );
}
