'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import type { EnglishAssessmentView } from '@tamkeen/types';

import { useErrorMessage } from '@/components/auth/use-error-message';
import { PortalPage } from '@/components/layout/portal-page';
import { usePortal } from '@/components/layout/portal-provider';
import { DataView, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { cardVariants } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useFormat } from '@/i18n/format-provider';
import { englishAssessmentApi } from '@/lib/api-client';
import { useApiQuery, useApiMutation } from '@/lib/use-api';
import { useAppRouter } from '@/lib/use-app-router';
import { cn } from '@/lib/utils';

/**
 * The English placement test (§4.13, D-123).
 *
 * Built on the Holland flow's shape deliberately — one question at a time, a
 * progress indicator, back/next, a blocked advance on an unanswered item, and a
 * per-tab draft — because that shape is already the right answer to the same
 * problems and a second, subtly different one would be worse for no reason. The
 * differences are the instrument's, not the interface's.
 *
 * **The test is taken once** (D-123), so a learner who already has a result is
 * sent to it rather than being offered a second attempt the server would refuse.
 * The redirect reads the result, not the dashboard, because the dashboard is
 * loaded once per session and a submission made in another tab would leave a
 * stale `englishLevel` here — the wrong thing to gate an irreversible action on.
 */

const DRAFT_KEY = 'tamkeen:english-assessment-draft';

interface Draft {
  assessmentId: string;
  /** The bank at the time of the draft: a changed bank invalidates it. */
  questionIds: string[];
  index: number;
  answers: Record<string, string>;
}

/**
 * Draft answers in sessionStorage — per tab, gone when the tab closes, holding
 * option ids only and never anything a person typed. A draft for a different
 * version, or for a bank whose question ids have changed (§4C.9 can edit it), is
 * discarded rather than half-applied.
 *
 * It matters more here than it does for Holland: this bank spans A1 to C2 and a
 * learner may genuinely need to stop and come back, and losing thirty considered
 * answers to a closed tab would be losing their one attempt.
 */
function readDraft(assessment: EnglishAssessmentView): Draft | null {
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

function writeDraft(
  assessment: EnglishAssessmentView,
  index: number,
  answers: Record<string, string>,
) {
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

export default function EnglishAssessmentPage() {
  const t = useTranslations('english');
  const router = useAppRouter();

  const existing = useApiQuery(() => englishAssessmentApi.result(), []);
  const assessment = useApiQuery(() => englishAssessmentApi.get(), []);

  const alreadyTaken = existing.data != null;

  useEffect(() => {
    if (alreadyTaken) {
      router.replace('/english-assessment/result');
    }
  }, [alreadyTaken, router]);

  return (
    <PortalPage title={t('title')} width="narrow">
      <DataView
        isLoading={existing.isInitialLoad || assessment.isLoading}
        error={assessment.error}
        isEmpty={assessment.data?.questions.length === 0}
        onRetry={() => {
          assessment.refetch();
          existing.refetch();
        }}
        emptyProps={{ title: t('emptyTitle'), body: t('emptyBody') }}
      >
        {alreadyTaken ? (
          /* The redirect is in flight. Showing the loading state rather than the
             first question avoids offering an attempt that cannot be made. */
          <LoadingState label={t('loadingResult')} />
        ) : assessment.data ? (
          <EnglishFlow assessment={assessment.data} />
        ) : null}
      </DataView>
    </PortalPage>
  );
}

function EnglishFlow({ assessment }: { assessment: EnglishAssessmentView }) {
  const t = useTranslations('english');
  const tActions = useTranslations('actions');
  const translateError = useErrorMessage();
  const router = useAppRouter();
  const format = useFormat();
  const { refresh } = usePortal();

  const [draft] = useState(() => readDraft(assessment));
  const [index, setIndex] = useState(draft?.index ?? 0);
  const [answers, setAnswers] = useState<Record<string, string>>(draft?.answers ?? {});
  const [showUnanswered, setShowUnanswered] = useState(false);

  /* Write-through: every answer and every step is stored the moment it happens,
     so there is no "save" the learner could forget. */
  useEffect(() => {
    if (Object.keys(answers).length === 0 && index === 0) return;
    writeDraft(assessment, index, answers);
  }, [assessment, index, answers]);

  const submit = useApiMutation(() =>
    englishAssessmentApi.submit({
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
      /* Blocking rather than allowing a skip: the server rejects an incomplete
         submission anyway, and discovering that after thirty questions — on the
         one attempt there is — would be a poor trade. */
      setShowUnanswered(true);
      return;
    }

    if (!isLast) {
      setIndex((current) => current + 1);
      return;
    }

    const result = await submit.run();

    if (result) {
      clearDraft();
      /* The dashboard card now has a level to show; refresh it before
         navigating so the two agree. */
      refresh();
      router.replace('/english-assessment/result');
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground">{assessment.description}</p>

      {/* Said once, before the first question, because it is the fact that
          changes how somebody answers. */}
      <p
        className={cn(
          cardVariants({ variant: 'default' }),
          'bg-neutral-50 p-4 text-sm text-neutral-700',
        )}
      >
        {t('singleAttemptNotice')}
      </p>

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
        {/*
         * The question is the legend, so a screen reader announces it before
         * each option. `dir="auto"` on both: an English item ("Choose the
         * correct form: …") is an LTR run inside an RTL page, and without it the
         * punctuation lands at the wrong end — which for a *grammar* question
         * changes what is being asked (D-047's single-language content, met at
         * the one place it is rendered).
         */}
        <legend dir="auto" className="mb-2 text-lg font-semibold text-foreground">
          {question.text}
        </legend>

        <div className="flex flex-col gap-2">
          {question.options.map((option) => {
            const id = `${question.id}-${option.id}`;
            const isChosen = chosen === option.id;

            return (
              <label
                key={option.id}
                htmlFor={id}
                className={cn(
                  cardVariants({ variant: isChosen ? 'selected' : 'default' }),
                  'flex cursor-pointer items-center gap-3 p-4 transition-colors',
                  isChosen ? 'font-medium' : 'hover:border-neutral-400',
                )}
              >
                <input
                  type="radio"
                  id={id}
                  name={question.id}
                  value={option.id}
                  checked={isChosen}
                  onChange={() => choose(option.id)}
                  className="size-4 accent-primary-600"
                />
                <span dir="auto">{option.label}</span>
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
