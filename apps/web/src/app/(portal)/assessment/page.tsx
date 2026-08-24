'use client';

import { useAppRouter } from '@/lib/use-app-router';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import type { AssessmentView } from '@tamkeen/types';

import { PortalPage } from '@/components/layout/portal-page';
import { usePortal } from '@/components/layout/portal-provider';
import { useErrorMessage } from '@/components/auth/use-error-message';
import { DataView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { assessmentApi } from '@/lib/api-client';
import { useApiMutation, useApiQuery } from '@/lib/use-api';
import { useFormat } from '@/i18n/format-provider';

/**
 * The assessment (§4.3).
 *
 * One question at a time, with a progress indicator and back/next. Presenting
 * all thirty at once would turn a considered answer into a scroll-and-tick
 * exercise, which is the failure mode a career-interest instrument cannot
 * afford.
 *
 * **No score dump.** On finish it goes straight to Results — §4.3 is explicit
 * that the user never sees raw numbers, and the transition is what makes the
 * result feel like a conclusion rather than a readout.
 *
 * The page sits in the normal shell (D-094): mid-assessment the sidebar is the
 * two-item pre-assessment nav (D-071), so الرئيسية and الملف الشخصي stay one
 * click away. Leaving must not cost the answers, so the draft below survives
 * the round trip within the browser session.
 */

const DRAFT_KEY = 'tamkeen:assessment-draft';

interface Draft {
  assessmentId: string;
  /** The bank at the time of the draft: a changed bank invalidates it. */
  questionIds: string[];
  index: number;
  answers: Record<string, string>;
}

/**
 * Draft answers in sessionStorage — per tab, gone when the tab closes, and
 * holding option ids only, never anything a person typed. A draft for a
 * different assessment, or for a bank whose question ids have changed (Phase 5
 * can edit the bank), is discarded rather than half-applied.
 */
function readDraft(assessment: AssessmentView): Draft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    const ids = assessment.questions.map((question) => question.id);
    const sameBank =
      draft.assessmentId === assessment.id &&
      draft.questionIds.length === ids.length &&
      draft.questionIds.every((id, i) => id === ids[i]);
    if (!sameBank) {
      window.sessionStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return { ...draft, index: Math.min(Math.max(draft.index, 0), ids.length - 1) };
  } catch {
    return null;
  }
}

function writeDraft(assessment: AssessmentView, index: number, answers: Record<string, string>) {
  if (typeof window === 'undefined') return;
  const draft: Draft = {
    assessmentId: assessment.id,
    questionIds: assessment.questions.map((question) => question.id),
    index,
    answers,
  };
  window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function clearDraft() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(DRAFT_KEY);
}
export default function AssessmentPage() {
  const t = useTranslations('assessment');
  const assessment = useApiQuery(() => assessmentApi.get(), []);

  return (
    <PortalPage title={t('title')}>
      <DataView
        isLoading={assessment.isLoading}
        error={assessment.error}
        isEmpty={assessment.data?.questions.length === 0}
        onRetry={assessment.refetch}
        emptyProps={{ title: t('emptyTitle'), body: t('emptyBody') }}
      >
        {assessment.data ? <AssessmentFlow assessment={assessment.data} /> : null}
      </DataView>
    </PortalPage>
  );
}

function AssessmentFlow({ assessment }: { assessment: AssessmentView }) {
  const t = useTranslations('assessment');
  const tActions = useTranslations('actions');
  const translateError = useErrorMessage();
  const router = useAppRouter();
  const format = useFormat();
  const { refresh } = usePortal();

  const [draft] = useState(() => readDraft(assessment));
  const [index, setIndex] = useState(draft?.index ?? 0);
  const [answers, setAnswers] = useState<Record<string, string>>(draft?.answers ?? {});
  const [showUnanswered, setShowUnanswered] = useState(false);

  /* Write-through: every answer and every step is on disk the moment it
     happens, so there is no "save" the user could forget. */
  useEffect(() => {
    if (Object.keys(answers).length === 0 && index === 0) return;
    writeDraft(assessment, index, answers);
  }, [assessment, index, answers]);

  const submit = useApiMutation(() =>
    assessmentApi.submit({
      assessmentId: assessment.id,
      answers: assessment.questions.map((question) => ({
        questionId: question.id,
        optionId: answers[question.id]!,
      })),
    }),
  );

  const question = assessment.questions[index]!;
  const total = assessment.questions.length;
  const isLast = index === total - 1;
  const chosen = answers[question.id];

  function choose(optionId: string) {
    setAnswers((current) => ({ ...current, [question.id]: optionId }));
    setShowUnanswered(false);
  }

  async function goNext() {
    if (!chosen) {
      /* Blocking on an unanswered question rather than allowing a skip: the
         server rejects an incomplete submission anyway, and discovering that at
         the end after thirty questions would be a poor trade. */
      setShowUnanswered(true);
      return;
    }

    if (!isLast) {
      setIndex((current) => current + 1);
      return;
    }

    const result = await submit.run();

    if (result) {
      /* Submitted: the draft has done its job, and a later retake (allowed
         before commitment, D-015) must start clean. */
      clearDraft();
      /* The dashboard's state changed from PRE_ASSESSMENT; refresh it before
         navigating so the nav and the results page agree. */
      refresh();
      router.replace('/results');
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <p className="text-muted-foreground">{t('intro')}</p>

      <Progress
        value={index + 1}
        max={total}
        label={t('progressLabel')}
        valueText={t('step', {
          current: format.number(index + 1),
          total: format.number(total),
        })}
      />

      <fieldset className="flex flex-col gap-4">
        {/* The statement is the legend, so a screen reader announces it before
            each option instead of leaving five bare agreement levels. */}
        <legend className="mb-2 text-lg font-semibold text-foreground">{question.text}</legend>

        <div className="flex flex-col gap-2">
          {question.options.map((option) => {
            const id = `${question.id}-${option.id}`;
            const isChosen = chosen === option.id;

            return (
              <label
                key={option.id}
                htmlFor={id}
                className={`flex cursor-pointer items-center gap-3 rounded-card border p-4 transition-colors ${
                  isChosen
                    ? 'border-primary-600 bg-card font-medium'
                    : 'border-border bg-card hover:border-neutral-400'
                }`}
              >
                <input
                  type="radio"
                  id={id}
                  name={question.id}
                  value={option.id}
                  checked={isChosen}
                  onChange={() => choose(option.id)}
                  className="size-4 accent-navy"
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {showUnanswered ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {t('unanswered')}
        </p>
      ) : null}

      {submit.error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {translateError(submit.error)}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => setIndex((current) => Math.max(0, current - 1))}
          disabled={index === 0 || submit.isPending}
        >
          {tActions('back')}
        </Button>

        <Button type="button" onClick={goNext} disabled={submit.isPending}>
          {submit.isPending ? t('submitting') : isLast ? t('submit') : tActions('next')}
        </Button>
      </div>
    </div>
  );
}
