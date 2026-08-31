'use client';

import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  CEFR_LEVELS,
  ENGLISH_SKILLS,
  type AdminEnglishDraft,
  type AdminEnglishQuestion,
  type CefrLevel,
  type EnglishSkill,
} from '@tamkeen/types';

import { AdminDialog } from '@/components/admin/admin-dialog';
import { EnglishBandEditor } from '@/components/admin/english-band-editor';
import { EnglishReadinessPanel } from '@/components/admin/english-readiness-panel';
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
 * §4C.9 — the English draft editor.
 *
 * **A parallel screen to `AssessmentEditor`, not a mode of it** (D-124). The
 * RIASEC editor is live and guarded; teaching it to also edit correct answers,
 * marks and a band table would mean half its controls hiding themselves on every
 * render. Nothing here imports from it.
 *
 * What an administrator can change is the assessment's *content and its band
 * table*, and nothing else. The tally, the band resolution and the partition
 * rule are in code and this screen has no vocabulary for them — D-048's rule,
 * applied to the second instrument.
 *
 * **Two invalid states are made unreachable rather than merely refused.**
 * Marking an option correct clears its siblings (radio semantics, server-side),
 * and the band editor derives every lower bound from the previous ceiling. Both
 * guards stay in the publish gate regardless, because rows can arrive by routes
 * this screen does not own.
 */
export function EnglishAssessmentEditor({
  draft,
  onChanged,
  onPublished,
}: {
  draft: AdminEnglishDraft;
  onChanged: (next: AdminEnglishDraft) => void;
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

  async function run(action: () => Promise<AdminEnglishDraft>) {
    setBusy(true);
    setError(null);
    try {
      onChanged(await action());
    } catch (caught) {
      setError(translateError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      await adminApi.publishEnglish();
      setConfirmingPublish(false);
      onPublished();
    } catch (caught) {
      setError(translateError(caught));
      setConfirmingPublish(false);
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    setBusy(true);
    setError(null);
    try {
      await adminApi.discardEnglishDraft();
      setConfirmingDiscard(false);
      onPublished();
    } catch (caught) {
      setError(translateError(caught));
      setConfirmingDiscard(false);
    } finally {
      setBusy(false);
    }
  }

  const publishable = draft.readiness.blockers.length === 0;

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="font-medium text-foreground">
            {t('englishDraftHeading', { version: format.number(draft.version) })}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {draft.basedOnVersion === null
              ? t('englishDraftFirst')
              : t('englishDraftBasedOn', { version: format.number(draft.basedOnVersion) })}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => setConfirmingPublish(true)} disabled={busy}>
            {t('englishPublish')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmingDiscard(true)}
            disabled={busy}
          >
            {t('englishDiscard')}
          </Button>
        </div>
      </Card>

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <EnglishReadinessPanel readiness={draft.readiness} />

      <EnglishBandEditor
        draft={draft}
        busy={busy}
        onSave={(bands) => void run(() => adminApi.setEnglishBands(bands))}
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-sm font-semibold text-foreground">
          {t('englishQuestionsHeading', { count: format.number(draft.questions.length) })}
        </h3>
        <Button type="button" variant="outline" onClick={() => setAdding(true)} disabled={busy}>
          {t('englishAddQuestion')}
        </Button>
      </div>

      <ol className="space-y-3">
        {draft.questions.map((question, index) => (
          <li key={question.id}>
            <EnglishQuestionCard
              question={question}
              index={index}
              total={draft.questions.length}
              busy={busy}
              onRun={run}
              questionIds={draft.questions.map((item) => item.id)}
            />
          </li>
        ))}
      </ol>

      {draft.questions.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">{t('englishNoQuestions')}</Card>
      ) : null}

      {adding ? (
        <AddEnglishQuestionDialog
          busy={busy}
          onClose={() => setAdding(false)}
          onAdd={async (input) => {
            await run(() => adminApi.addEnglishQuestion(input));
            setAdding(false);
          }}
        />
      ) : null}

      {confirmingPublish ? (
        <AdminDialog
          title={t('englishPublishConfirmTitle')}
          onClose={() => setConfirmingPublish(false)}
          footer={
            <>
              <Button type="button" onClick={() => void publish()} disabled={busy || !publishable}>
                {t('englishPublish')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmingPublish(false)}
                disabled={busy}
              >
                {t('cancel')}
              </Button>
            </>
          }
        >
          {/* Said again at the moment of the decision, not only on the overview:
              this is the point at which every future placement changes scale. */}
          <p>{t('englishPublishConfirmBody')}</p>
          <p className="mt-2">{t('englishFrozenNotice')}</p>
          {!publishable ? (
            <p className="mt-2 font-medium text-destructive">{t('englishPublishBlocked')}</p>
          ) : null}
        </AdminDialog>
      ) : null}

      {confirmingDiscard ? (
        <AdminDialog
          title={t('englishDiscardConfirmTitle')}
          onClose={() => setConfirmingDiscard(false)}
          footer={
            <>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void discard()}
                disabled={busy}
              >
                {t('englishDiscard')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmingDiscard(false)}
                disabled={busy}
              >
                {t('cancel')}
              </Button>
            </>
          }
        >
          <p>{t('englishDiscardConfirmBody')}</p>
        </AdminDialog>
      ) : null}
    </div>
  );
}

/**
 * One item: its text, what it is worth, what it targets, and its options.
 *
 * The correct answer is a **radio group**, not a set of checkboxes — an item has
 * one right answer, and the server enforces the same exclusivity so the
 * two-correct state cannot be produced from here at all.
 */
function EnglishQuestionCard({
  question,
  index,
  total,
  busy,
  onRun,
  questionIds,
}: {
  question: AdminEnglishQuestion;
  index: number;
  total: number;
  busy: boolean;
  onRun: (action: () => Promise<AdminEnglishDraft>) => Promise<void>;
  questionIds: string[];
}) {
  const t = useTranslations('admin');
  const tLevel = useTranslations('english.level');
  const tSkill = useTranslations('admin.englishSkill');
  const format = useFormat();

  const [text, setText] = useState(question.text);
  const [expanded, setExpanded] = useState(false);

  function move(delta: number) {
    const next = [...questionIds];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    void onRun(() => adminApi.reorderEnglishDraft(next));
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span className="pt-2 text-sm text-muted-foreground">{format.number(index + 1)}</span>

        <div className="min-w-64 flex-1">
          <Field id={`q-${question.id}-text`} label={t('englishQuestionText')}>
            {(field) => (
              <Textarea
                {...field}
                dir="auto"
                rows={2}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onBlur={() => {
                  if (text.trim() && text !== question.text) {
                    void onRun(() => adminApi.updateEnglishQuestion(question.id, { text }));
                  }
                }}
              />
            )}
          </Field>
        </div>

        <div className="flex gap-1 pt-6">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => move(-1)}
            disabled={busy || index === 0}
            aria-label={t('moveUp')}
          >
            <ChevronUp aria-hidden="true" className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => move(1)}
            disabled={busy || index === total - 1}
            aria-label={t('moveDown')}
          >
            <ChevronDown aria-hidden="true" className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void onRun(() => adminApi.removeEnglishQuestion(question.id))}
            disabled={busy}
            aria-label={t('englishRemoveQuestion')}
          >
            <Trash2 aria-hidden="true" className="size-4 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="w-40">
          <Field id={`q-${question.id}-level`} label={t('englishQuestionLevel')}>
            {(field) => (
              <Select
                {...field}
                value={question.level}
                disabled={busy}
                onChange={(event) =>
                  void onRun(() =>
                    adminApi.updateEnglishQuestion(question.id, {
                      level: event.target.value as CefrLevel,
                    }),
                  )
                }
              >
                {CEFR_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level} · {tLevel(level)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <div className="w-44">
          <Field id={`q-${question.id}-skill`} label={t('englishQuestionSkill')}>
            {(field) => (
              <Select
                {...field}
                value={question.skill}
                disabled={busy}
                onChange={(event) =>
                  void onRun(() =>
                    adminApi.updateEnglishQuestion(question.id, {
                      skill: event.target.value as EnglishSkill,
                    }),
                  )
                }
              >
                {ENGLISH_SKILLS.map((skill) => (
                  <option key={skill} value={skill}>
                    {tSkill(skill)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <div className="w-32">
          <Field id={`q-${question.id}-marks`} label={t('englishQuestionMarks')}>
            {(field) => (
              <Input
                {...field}
                type="number"
                inputMode="numeric"
                min={1}
                defaultValue={question.marks}
                disabled={busy}
                onBlur={(event) => {
                  const marks = Number(event.target.value);
                  if (Number.isInteger(marks) && marks >= 1 && marks !== question.marks) {
                    void onRun(() => adminApi.updateEnglishQuestion(question.id, { marks }));
                  }
                }}
              />
            )}
          </Field>
        </div>
      </div>

      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
        >
          {expanded ? t('englishHideOptions') : t('englishShowOptions')}
        </Button>

        {expanded ? (
          <fieldset className="mt-3 space-y-2">
            <legend className="mb-2 text-sm text-muted-foreground">
              {t('englishCorrectLegend')}
            </legend>
            {question.options.map((option) => (
              <div key={option.id} className="flex items-center gap-3">
                <input
                  type="radio"
                  id={`opt-${option.id}`}
                  name={`correct-${question.id}`}
                  checked={option.isCorrect}
                  disabled={busy}
                  onChange={() =>
                    void onRun(() => adminApi.updateEnglishOption(option.id, { isCorrect: true }))
                  }
                  className="size-4 shrink-0 accent-primary-600"
                />
                <label htmlFor={`opt-${option.id}`} className="sr-only">
                  {t('englishMarkCorrect', { label: option.label })}
                </label>
                <Input
                  aria-label={t('englishOptionLabel')}
                  dir="auto"
                  defaultValue={option.label}
                  disabled={busy}
                  onBlur={(event) => {
                    const label = event.target.value;
                    if (label.trim() && label !== option.label) {
                      void onRun(() => adminApi.updateEnglishOption(option.id, { label }));
                    }
                  }}
                />
              </div>
            ))}
          </fieldset>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * Adding an item asks for its options, where §4C.3 generates them.
 *
 * A RIASEC question's options are the same five agreement levels every time, so
 * generating them is a kindness. An English item's options are the distractors
 * somebody wrote — generating them would be inventing assessment content.
 */
function AddEnglishQuestionDialog({
  busy,
  onClose,
  onAdd,
}: {
  busy: boolean;
  onClose: () => void;
  onAdd: (input: {
    text: string;
    marks: number;
    level: CefrLevel;
    skill: EnglishSkill;
    options: string[];
    correctIndex: number;
  }) => Promise<void>;
}) {
  const t = useTranslations('admin');
  const tLevel = useTranslations('english.level');
  const tSkill = useTranslations('admin.englishSkill');

  const [text, setText] = useState('');
  const [level, setLevel] = useState<CefrLevel>('B1');
  const [skill, setSkill] = useState<EnglishSkill>('GRAMMAR');
  const [marks, setMarks] = useState('1');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctIndex, setCorrectIndex] = useState(0);

  const filled = options.map((option) => option.trim()).filter(Boolean);
  const parsedMarks = Number(marks);
  const valid =
    text.trim().length >= 3 &&
    filled.length >= 2 &&
    Number.isInteger(parsedMarks) &&
    parsedMarks >= 1 &&
    (options[correctIndex] ?? '').trim().length > 0;

  return (
    <AdminDialog
      title={t('englishAddQuestion')}
      onClose={onClose}
      footer={
        <>
          <Button
            type="button"
            disabled={busy || !valid}
            onClick={() => {
              /* Blank rows are dropped, and the correct index is re-pointed at
                 the option it was actually on — dropping rows before it would
                 otherwise silently move the right answer. */
              const kept = options
                .map((label, index) => ({ label: label.trim(), index }))
                .filter((entry) => entry.label.length > 0);

              void onAdd({
                text: text.trim(),
                marks: parsedMarks,
                level,
                skill,
                options: kept.map((entry) => entry.label),
                correctIndex: kept.findIndex((entry) => entry.index === correctIndex),
              });
            }}
          >
            {t('englishAddQuestion')}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t('cancel')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field id="new-english-text" label={t('englishQuestionText')}>
          {(field) => (
            <Textarea
              {...field}
              dir="auto"
              rows={2}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          )}
        </Field>

        <div className="flex flex-wrap gap-4">
          <div className="w-40">
            <Field id="new-english-level" label={t('englishQuestionLevel')}>
              {(field) => (
                <Select
                  {...field}
                  value={level}
                  onChange={(event) => setLevel(event.target.value as CefrLevel)}
                >
                  {CEFR_LEVELS.map((value) => (
                    <option key={value} value={value}>
                      {value} · {tLevel(value)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <div className="w-44">
            <Field id="new-english-skill" label={t('englishQuestionSkill')}>
              {(field) => (
                <Select
                  {...field}
                  value={skill}
                  onChange={(event) => setSkill(event.target.value as EnglishSkill)}
                >
                  {ENGLISH_SKILLS.map((value) => (
                    <option key={value} value={value}>
                      {tSkill(value)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <div className="w-32">
            <Field id="new-english-marks" label={t('englishQuestionMarks')}>
              {(field) => (
                <Input
                  {...field}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={marks}
                  onChange={(event) => setMarks(event.target.value)}
                />
              )}
            </Field>
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm text-muted-foreground">
            {t('englishCorrectLegend')}
          </legend>
          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-3">
              <input
                type="radio"
                id={`new-english-correct-${index}`}
                name="new-english-correct"
                checked={correctIndex === index}
                onChange={() => setCorrectIndex(index)}
                className="size-4 shrink-0 accent-primary-600"
              />
              <label htmlFor={`new-english-correct-${index}`} className="sr-only">
                {t('englishMarkCorrectPosition')}
              </label>
              <Input
                aria-label={t('englishOptionLabel')}
                dir="auto"
                value={option}
                onChange={(event) =>
                  setOptions((current) =>
                    current.map((value, position) =>
                      position === index ? event.target.value : value,
                    ),
                  )
                }
              />
            </div>
          ))}
          <p className="text-sm text-muted-foreground">{t('englishOptionsHint')}</p>
        </fieldset>
      </div>
    </AdminDialog>
  );
}
