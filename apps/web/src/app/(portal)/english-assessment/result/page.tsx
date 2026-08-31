'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import type { EnglishAssessmentResultView } from '@tamkeen/types';

import { CefrLevelBadge } from '@/components/english/cefr-level-badge';
import { PortalPage } from '@/components/layout/portal-page';
import { DataView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useFormat } from '@/i18n/format-provider';
import { englishAssessmentApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * The English result (§4.13).
 *
 * The learner's permanent record of the placement — there is no retake (D-123),
 * so this page never offers one and never needs a `canRetake` branch the way
 * Results does. What it offers instead is nothing: the level is the conclusion,
 * and §3's "only what is actionable now" means a page with no action is the
 * correct shape rather than a gap to be filled with a button.
 *
 * The score is shown beside the level because a level alone is an assertion.
 * "38 من 60" is the evidence for it, and it is the form in which somebody can
 * tell a near miss from a comfortable pass.
 */
export default function EnglishResultPage() {
  const t = useTranslations('english');
  const result = useApiQuery(() => englishAssessmentApi.result(), []);

  return (
    <PortalPage title={t('resultTitle')} width="narrow">
      <DataView
        isLoading={result.isInitialLoad}
        error={result.error}
        onRetry={result.refetch}
        /* Not an empty *state*: "you have not taken it" is a normal condition
           with a real next step, so it gets a card and a way forward rather than
           the generic nothing-here treatment. */
      >
        {result.data ? <ResultCard result={result.data} /> : <NotTakenCard />}
      </DataView>
    </PortalPage>
  );
}

function ResultCard({ result }: { result: EnglishAssessmentResultView }) {
  const t = useTranslations('english');
  const format = useFormat();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('resultHeading')}</CardTitle>
          <CardDescription>{t(`levelSummary.${result.level}`)}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <CefrLevelBadge level={result.level} className="self-start" />

          <Progress
            value={result.totalScore}
            max={result.maxScore}
            label={t('scoreLabel')}
            valueText={t('scoreValue', {
              score: format.number(result.totalScore),
              total: format.number(result.maxScore),
            })}
          />

          <p className="text-sm text-muted-foreground">
            {t('takenOn', { date: format.date(new Date(result.completedAt)) })}
          </p>
        </CardContent>
      </Card>

      {/* The one thing left to say: it does not change, and it does not decide
          anything else. Stated because a learner whose level is lower than they
          hoped will otherwise go looking for the retake that is not there. */}
      <p className="text-sm text-muted-foreground">{t('resultFinalNotice')}</p>
    </div>
  );
}

function NotTakenCard() {
  const t = useTranslations('english');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('notTakenTitle')}</CardTitle>
        <CardDescription>{t('notTakenBody')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild size="lg">
          <Link href="/english-assessment">{t('start')}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
