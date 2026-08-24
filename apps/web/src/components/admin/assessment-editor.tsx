'use client';

import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  RIASEC_LETTERS,
  type AdminAssessmentDraft,
  type AdminAssessmentQuestion,
  type RiasecLetter,
} from '@tamkeen/types';

import { AdminDialog } from '@/components/admin/admin-dialog';
import { BankReadinessPanel } from '@/components/admin/bank-readiness-panel';
import { useErrorMessage } from '@/components/auth/use-error-message';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useFormat } from '@/i18n/format-provider';
import { adminApi } from '@/lib/api-client';

/**
 * §4C.3 — the draft editor.
 *
 * **What an administrator can change here is the assessment's content, and
 * nothing else** (D-048). Question text, option labels, per-dimension weights,
 * order, and how many questions there are. The tally, the ranking, the canonical
 * tie-break and the top-three derivation are in code and this screen has no
 * vocabulary for them.
 *
 * **Adding a question asks for a dimension, not a set of weights.** The full
 * weight editor is one click away on every option, but the common act — growing
 * the bank from five items per dimension to six — is six clicks of "add a
 * question for this letter", and making that the easy path is how the editor
 * helps keep the bank balanced rather than merely reporting afterwards that it
 * is not (D-071).
 */
export function AssessmentEditor({
  draft,
  onChanged,
  onPublished,
}: {
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
      await adminApi.publishAssessment();
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
      await adminApi.discardAssessmentDraft();
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

    return run(() => adminApi.reorderDraft(ids));
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

      <BankReadinessPanel readiness={draft.readiness} />

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
              index={index}
              total={draft.questions.length}
              busy={busy}
              onMove={(direction) => void move(index, direction)}
              onSave={(text) => run(() => adminApi.updateDraftQuestion(question.id, { text }))}
              onRemove={() => run(() => adminApi.removeDraftQuestion(question.id))}
              onWeights={(optionId, weights) =>
                run(() => adminApi.updateDraftOption(optionId, { weights }))
              }
              onLabel={(optionId, label) =>
                run(() => adminApi.updateDraftOption(optionId, { label }))
              }
            />
          </li>
        ))}
      </ol>

      {adding ? (
        <AddQuestionDialog
          onClose={() => setAdding(false)}
          onAdd={async (input) => {
            await run(() => adminApi.addDraftQuestion(input));
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
            The sentence D-049 exists for, said where the decision is made.
            An administrator publishing an edit needs to know, at that moment,
            that nobody's recorded result changes — otherwise the safe move looks
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
  index,
  total,
  busy,
  onMove,
  onSave,
  onRemove,
  onWeights,
  onLabel,
}: {
  question: AdminAssessmentQuestion;
  index: number;
  total: number;
  busy: boolean;
  onMove: (direction: -1 | 1) => void;
  onSave: (text: string) => void;
  onRemove: () => void;
  onWeights: (optionId: string, weights: Partial<Record<RiasecLetter, number>>) => void;
  onLabel: (optionId: string, label: string) => void;
}) {
  const t = useTranslations('admin');
  const format = useFormat();
  const [text, setText] = useState(question.text);
  const [open, setOpen] = useState(false);

  const dirty = text !== question.text;

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
          <Button size="sm" disabled={busy} onClick={() => onSave(text)}>
            {t('saveQuestion')}
          </Button>
        ) : null}

        <Button size="sm" variant="ghost" onClick={() => setOpen((value) => !value)}>
          {open ? t('hideWeights') : t('showWeights')}
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
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          {question.options.map((option) => (
            <OptionRow
              key={option.id}
              option={option}
              busy={busy}
              onWeights={(weights) => onWeights(option.id, weights)}
              onLabel={(label) => onLabel(option.id, label)}
            />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function OptionRow({
  option,
  busy,
  onWeights,
  onLabel,
}: {
  option: AdminAssessmentQuestion['options'][number];
  busy: boolean;
  onWeights: (weights: Partial<Record<RiasecLetter, number>>) => void;
  onLabel: (label: string) => void;
}) {
  const t = useTranslations('admin');
  const [label, setLabel] = useState(option.label);
  const [weights, setWeights] = useState<Partial<Record<RiasecLetter, string>>>(() =>
    Object.fromEntries(
      RIASEC_LETTERS.filter((letter) => option.weights[letter] !== undefined).map((letter) => [
        letter,
        String(option.weights[letter]),
      ]),
    ),
  );

  function submit() {
    const parsed: Partial<Record<RiasecLetter, number>> = {};

    for (const letter of RIASEC_LETTERS) {
      const raw = weights[letter];
      if (raw !== undefined && raw !== '') {
        parsed[letter] = Number(raw);
      }
    }

    if (label !== option.label) onLabel(label);
    onWeights(parsed);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
      <Field id={`opt-${option.id}`} label={t('optionLabel')}>
        {(field) => (
          <Input {...field} value={label} onChange={(event) => setLabel(event.target.value)} />
        )}
      </Field>

      <div className="flex flex-wrap items-end gap-2">
        {RIASEC_LETTERS.map((letter) => (
          <Field key={letter} id={`w-${option.id}-${letter}`} label={letter}>
            {(field) => (
              <Input
                {...field}
                type="number"
                min={0}
                max={10}
                dir="ltr"
                className="w-16"
                value={weights[letter] ?? ''}
                onChange={(event) =>
                  setWeights((current) => ({ ...current, [letter]: event.target.value }))
                }
              />
            )}
          </Field>
        ))}

        <Button size="sm" variant="outline" disabled={busy} onClick={submit}>
          {t('saveOption')}
        </Button>
      </div>
    </div>
  );
}

function AddQuestionDialog({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (input: { text: string; letter: RiasecLetter }) => Promise<void>;
}) {
  const t = useTranslations('admin');
  const [text, setText] = useState('');
  const [letter, setLetter] = useState<RiasecLetter>('R');

  return (
    <AdminDialog
      title={t('addQuestion')}
      description={t('addQuestionHint')}
      onClose={onClose}
      footer={
        <Button
          type="button"
          disabled={text.trim().length < 5}
          onClick={() => void onAdd({ text: text.trim(), letter })}
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

      <Field id="new-question-letter" label={t('questionDimension')} required>
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
    </AdminDialog>
  );
}
