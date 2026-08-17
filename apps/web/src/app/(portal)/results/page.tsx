'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import type { AssessmentResultView, PathRecommendations } from '@tamkeen/types';

import { PortalPage } from '@/components/layout/portal-page';
import { PathCard } from '@/components/paths/path-card';
import { DataView, EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFormat } from '@/i18n/format-provider';
import { assessmentApi, pathsApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * Results & Path Selection (§4.4).
 *
 * The gold ordering is *not* recomputed here — the API already applied
 * `rankPathsByRecommendation` and sent the paths in order. Re-sorting in the
 * browser would put §3A's rule in two places, and the two would eventually
 * disagree about a user's recommendation.
 */
export default function ResultsPage() {
  const t = useTranslations('results');
  const result = useApiQuery(() => assessmentApi.result(), []);
  const paths = useApiQuery(() => pathsApi.list(), []);

  const isLoading = result.isLoading || paths.isLoading;
  const error = result.error ?? paths.error;

  return (
    <PortalPage title={t('title')} chrome="bare">
      <DataView
        isLoading={isLoading}
        error={error}
        isEmpty={paths.data?.paths.length === 0}
        onRetry={() => {
          result.refetch();
          paths.refetch();
        }}
        emptyProps={{ title: t('emptyTitle'), body: t('emptyBody') }}
      >
        {paths.data ? <Results result={result.data ?? null} paths={paths.data} /> : null}
      </DataView>
    </PortalPage>
  );
}

function Results({
  result,
  paths,
}: {
  result: AssessmentResultView | null;
  paths: PathRecommendations;
}) {
  const t = useTranslations('results');

  if (!result) {
    /* Reaching this page without a result is a normal navigation, not an error
       — an empty state with the way forward beats a dead end. */
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          title={t('noResultTitle')}
          body={t('noResultBody')}
          action={
            <Button asChild>
              <Link href="/assessment">{t('goToAssessment')}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const recommended = paths.paths.filter((path) => path.recommended);
  const others = paths.paths.filter((path) => !path.recommended);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <HollandCode result={result} />

      {recommended.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-foreground">{t('recommendedHeading')}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {recommended.map((path) => (
              <PathCard key={path.id} path={path} />
            ))}
          </div>
        </section>
      ) : null}

      {others.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-foreground">{t('otherHeading')}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {others.map((path) => (
              <PathCard key={path.id} path={path} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function HollandCode({ result }: { result: AssessmentResultView }) {
  const t = useTranslations('results');
  const tRiasec = useTranslations('riasec');
  const format = useFormat();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('codeHeading')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-3">
          {result.code.map((letter, position) => (
            <span
              key={letter}
              className="rounded-card border-2 border-gold bg-card px-4 py-2 text-base font-semibold text-foreground"
            >
              {/* The ordinal is what makes "top three, in rank order" visible;
                  without it the code reads as an unordered set. */}
              <span className="text-muted-foreground">{format.number(position + 1)}. </span>
              {tRiasec(`${letter}.name`)}
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{t('codeIntro')}</p>
          <ul className="flex list-disc flex-col gap-1 ps-5 text-sm text-foreground">
            {result.code.map((letter) => (
              <li key={letter}>{tRiasec(`${letter}.summary`)}</li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">{t('codeOutro')}</p>
        </div>

        {/* The compact six-dimension view §4.4 allows. Kept as a labelled list
            rather than a chart: it is six values, and a chart would need its own
            accessible text anyway. */}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-foreground">{t('profileHeading')}</h3>
          <dl className="flex flex-col gap-2">
            {result.ranked.map((dimension) => (
              <div key={dimension.letter} className="flex items-center gap-3">
                <dt className="w-32 shrink-0 text-sm text-foreground">
                  {tRiasec(`${dimension.letter}.name`)}
                </dt>
                <dd className="flex flex-1 items-center gap-3">
                  <div
                    aria-hidden="true"
                    className="h-2 flex-1 overflow-hidden rounded-full bg-muted/20"
                  >
                    <div
                      className="h-full rounded-full bg-secondary"
                      style={{ width: `${Math.round(dimension.percent)}%` }}
                    />
                  </div>
                  <span className="w-14 shrink-0 text-sm text-muted-foreground">
                    {format.percent(dimension.percent)}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* The retake entry point exists only before commitment (D-015); the
            server decides, and it disappears entirely afterwards rather than
            appearing disabled. */}
        {result.canRetake ? (
          <Button asChild variant="ghost" size="sm" className="self-start">
            <Link href="/assessment">{t('retake')}</Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
