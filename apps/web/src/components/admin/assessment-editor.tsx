'use client';

import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useFormat } from '@/i18n/format-provider';
import { adminApi } from '@/lib/api-client';

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
  const [adding, setAdding] = useState(false);
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

  function move(index: number, direction: -1 | 1) {
    const ids = draft.questions.map((question) => question.id);
    const target = index + direction;

    if (target < 0 || target >= ids.length) return;

    [ids[index], ids[target]] = [ids[target]!, ids[index]!];

    return run(() => adminApi.reorderDraft(pathId, ids));
  }

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="font-medium text-foreground">
            {t('draftHeading', { version: format.number(draft.version) })}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('draftCount', { count: format.number(draft.questions.length) })}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => setAdding(true)}>
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

      <ol className="space-y-3">
        {draft.questions.map((question, index) => (
          <li key={question.id}>
            <QuestionCard
              question={question}
              levels={draft.levels}
              index={index}
              total={draft.questions.length}
              busy={busy}
              onMove={(direction) => void move(index, direction)}
              onSave={(patch) =>
                void run(() => adminApi.updateDraftQuestion(pathId, question.id, patch))
              }
              onRemove={() => void run(() => adminApi.removeDraftQuestion(pathId, question.id))}
              onOption={(optionId, patch) =>
                void run(() => adminApi.updateDraftOption(pathId, optionId, patch))
              }
            />
          </li>
        ))}
      </ol>

      {adding ? (
        <AddQuestionDialog
          levels={draft.levels}
          onClose={() => setAdding(false)}
          onAdd={async (input) => {
            await run(() => adminApi.addDraftQuestion(pathId, input));
            setAdding(false);
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
  total,
  busy,
  onMove,
  onSave,
  onRemove,
  onOption,
}: {
  question: AdminAssessmentQuestion;
  levels: LevelRef[];
  index: number;
  total: number;
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
            disabled={busy || index === 0}
            aria-label={t('moveUp')}
            onClick={() => onMove(-1)}
          >
            <ChevronUp aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || index === total - 1}
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
  onClose,
  onAdd,
}: {
  levels: LevelRef[];
  onClose: () => void;
  onAdd: (input: { text: string; marks: number; levelId: string | null }) => Promise<void>;
}) {
  const t = useTranslations('admin');
  const [text, setText] = useState('');
  const [marks, setMarks] = useState('1');
  const [levelId, setLevelId] = useState('');

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
