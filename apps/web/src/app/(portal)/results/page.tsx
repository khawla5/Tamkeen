'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import type { AssessmentResultView, PathRecommendations, RiasecLetter } from '@tamkeen/types';

import { PortalPage } from '@/components/layout/portal-page';
import { usePortal } from '@/components/layout/portal-provider';
import { PathCard } from '@/components/paths/path-card';
import { DataView, EmptyState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFormat } from '@/i18n/format-provider';
import { assessmentApi, pathsApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';
import { HollandCodeChips } from '@/components/riasec/holland-code-chips';

/**
 * Results & Path Selection (§4.4).
 *
 * The recommendation ordering is *not* recomputed here — the API already applied
 * `rankPathsByRecommendation` and sent the paths in order. Re-sorting in the
 * browser would put §3A's rule in two places, and the two would eventually
 * disagree about a user's recommendation.
 */
export default function ResultsPage() {
  const t = useTranslations('results');
  const { dashboard } = usePortal();
  const result = useApiQuery(() => assessmentApi.result(), []);
  const paths = useApiQuery(() => pathsApi.list(), []);

  const isLoading = result.isLoading || paths.isLoading;
  const error = result.error ?? paths.error;

  /* Non-null exactly when the journey is ACTIVE_PATH — i.e. after the hard
     commitment gate, which is the moment every other path stops being an
     option (§2). A user mid-build is still ASSESSED_NO_PATH and sees the
     choosable page. */
  const committedPathId = dashboard.path?.id ?? null;

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
        {paths.data ? (
          <Results
            result={result.data ?? null}
            paths={paths.data}
            committedPathId={committedPathId}
          />
        ) : null}
      </DataView>
    </PortalPage>
  );
}

/** The ordinal words the group headings and their rank tags read from. */
const ORDINAL_KEYS = ['ordinalFirst', 'ordinalSecond', 'ordinalThird'] as const;

function Results({
  result,
  paths,
  committedPathId,
}: {
  result: AssessmentResultView | null;
  paths: PathRecommendations;
  committedPathId: string | null;
}) {
  const t = useTranslations('results');

  if (!result) {
    /* Reaching this page without a result is a normal navigation, not an error
       — an empty state with the way forward beats a dead end. */
    return (
      <div>
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

  /*
   * One group per letter of the user's own code, in the user's rank order
   * (TAM-113). The heading is what explains *why* these paths are recommended,
   * which is why the cards no longer need to.
   *
   * `recommendationRank` is the position of the path's letter in that code, so
   * the same number both groups the paths and names the group. A letter the
   * catalogue has no path for produces no group at all — never an empty heading.
   */
  const code = paths.code ?? result.code;
  const groups = ORDINAL_KEYS.flatMap((ordinalKey, rank) => {
    const letter = code[rank];
    /* `filter` preserves the API's order inside the group; nothing here
       re-sorts. */
    const grouped = letter
      ? paths.paths.filter((path) => path.recommended && path.recommendationRank === rank)
      : [];

    return grouped.length > 0 && letter ? [{ letter, rank, ordinalKey, paths: grouped }] : [];
  });

  const others = paths.paths.filter((path) => !path.recommended);

  return (
    <div className="flex flex-col gap-8">
      <HollandCode result={result} />

      {groups.map((group) => (
        <LetterGroup
          key={group.letter}
          letter={group.letter}
          rank={group.rank}
          ordinalKey={group.ordinalKey}
          paths={group.paths}
          committedPathId={committedPathId}
        />
      ))}

      {others.length > 0 ? <OtherPaths paths={others} committedPathId={committedPathId} /> : null}
    </div>
  );
}

function LetterGroup({
  letter,
  rank,
  ordinalKey,
  paths,
  committedPathId,
}: {
  letter: RiasecLetter;
  rank: number;
  ordinalKey: (typeof ORDINAL_KEYS)[number];
  paths: PathRecommendations['paths'];
  committedPathId: string | null;
}) {
  const t = useTranslations('results');
  const tRiasec = useTranslations('riasec');

  const type = tRiasec(`${letter}.name`);
  const ordinal = t(ordinalKey);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-foreground">
          {rank === 0
            ? t('groupClosestHeading', { ordinal, type })
            : t('groupAlsoHeading', { type })}
        </h2>
        {/* The quiet rank tag on the second and third groups; the first
            heading already says "ميلك الأول" in its own words. */}
        {rank > 0 ? <Badge variant="neutral">{t('groupRankTag', { ordinal })}</Badge> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {paths.map((path) => (
          <PathCard key={path.id} path={path} committedPathId={committedPathId} />
        ))}
      </div>
    </section>
  );
}

/**
 * The paths outside the user's code — one click below, never removed (§3A:
 * recommendation, not restriction).
 *
 * `<details>` rather than React state: the element already announces its own
 * expanded/collapsed state to assistive technology, is keyboard-operable for
 * free, and cannot desynchronise from a `useState` a re-render resets.
 * Collapsed on every visit by design — remembering the choice would put a
 * returning user back in the long list they came here to escape.
 */
function OtherPaths({
  paths,
  committedPathId,
}: {
  paths: PathRecommendations['paths'];
  committedPathId: string | null;
}) {
  const t = useTranslations('results');
  const format = useFormat();

  return (
    <details className="group">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-md px-1 py-1 text-sm font-semibold text-primary-700 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
        {/* Mirrored, not re-pointed: the caret follows the reading direction in
            RTL as well as LTR, and turns down when the section opens. */}
        <span
          aria-hidden="true"
          className="text-base leading-none transition-transform group-open:rotate-90 rtl:-scale-x-100 rtl:group-open:-rotate-90"
        >
          ›
        </span>
        {t('othersToggle', { count: format.number(paths.length) })}
      </summary>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {paths.map((path) => (
          <PathCard key={path.id} path={path} committedPathId={committedPathId} />
        ))}
      </div>
    </details>
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
        <HollandCodeChips code={result.code} ordinals />

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
                    className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200"
                  >
                    <div
                      className="h-full rounded-full bg-primary-600"
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
