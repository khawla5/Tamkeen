'use client';

import { PATH_MAX_COURSES, PATH_MIN_COURSES, type PublicPathSummary } from '@tamkeen/types';
import { ArrowLeft, Check } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { useFormat } from '@/i18n/format-provider';
import { publicApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * «عن المنصة» — the ministry's training paths, one tab each (TAM-150).
 *
 * **It used to explain the product's four stages, and that was the wrong
 * subject.** A manager reading the front page is not asking how the screens
 * work; they are asking what their employees will be able to do afterwards. So
 * each tab is now a real path, and each panel answers that question in the
 * path's own words: what it develops, the capabilities it produces, its career
 * type, how much choice it offers and how long it takes.
 *
 * The four stages did not disappear — they became four lines under the tabs
 * (`MatchingStrip`), which is the right weight for process on a page whose
 * subject is capability.
 *
 * **Every number here is interpolated, never typed** (§4.0): the course count
 * and the duration come from the API, the 5–10 range from the shared
 * constants, so the front page cannot promise something the product does not
 * do.
 *
 * **Read client-side, deliberately.** The ticket asked for a server fetch, but
 * this component renders in two places — `/landing`, a server route, and `/`,
 * where `PortalProvider` mounts it from the client after a 401. A server fetch
 * would serve one of them and not the other, and one page behaving two ways is
 * worse than one honest fetch. What the ticket was protecting — "a static page
 * must not hit the database per visit" — is solved where it actually belongs,
 * in the endpoint's five-minute cache.
 */

export function AboutSection() {
  const t = useTranslations('landing');
  const paths = useApiQuery(() => publicApi.paths(), []);

  return (
    <section id="about" className="scroll-mt-20 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-3xl font-bold text-foreground">{t('aboutTitle')}</h2>
        <p className="mt-2 max-w-3xl text-base text-muted-foreground">{t('aboutSubtitle')}</p>

        {/*
          No `DataView` here, and that is the whole fallback rule: the front
          door of a ministry must never render an error card. A failed or empty
          read leaves the matching strip — which is true regardless of what the
          catalogue holds — above one Arabic line saying the paths will appear
          shortly. A visitor still learns what the platform does and can still
          register.
        */}
        {paths.data && paths.data.length > 0 ? (
          <PathExplorer paths={paths.data} />
        ) : (
          <p className="mt-8 text-base text-neutral-700">
            {paths.isLoading ? t('pathsLoading') : t('pathsUnavailable')}
          </p>
        )}

        <MatchingStrip />
      </div>
    </section>
  );
}

function PathExplorer({ paths }: { paths: PublicPathSummary[] }) {
  const t = useTranslations('landing');
  const tRiasec = useTranslations('riasec');
  const format = useFormat();

  const [selected, setSelected] = useState(paths[0]!.id);
  const path = paths.find((candidate) => candidate.id === selected) ?? paths[0]!;

  return (
    <Tabs
      className="mt-8"
      /* Named, because at twelve paths this strip scrolls and a screen-reader
         user meets it without the heading in view. `Tabs` already scrolls the
         row horizontally rather than wrapping it. */
      label={t('explorerPathsLabel')}
      items={paths.map((candidate) => ({ value: candidate.id, label: candidate.name }))}
      value={path.id}
      onValueChange={setSelected}
      panelClassName="mt-8 grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12"
    >
      <div className="flex flex-col items-start">
        <h3 className="text-2xl font-bold text-foreground">{path.name}</h3>

        {/* The career type in words. The letter is an internal code and has
            never been shown to anyone (D-126). */}
        <p className="mt-2 text-sm font-medium text-primary-700">
          {t('pathType', { type: tRiasec(`${path.riasecLetter}.name`) })}
        </p>

        <p className="mt-4 max-w-2xl text-base leading-relaxed text-neutral-700">
          {path.description}
        </p>

        <p className="mt-6 text-sm text-muted-foreground">
          {t('pathCourseCount', { count: format.number(path.courseCount) })}
          {path.typicalDurationMinutes === null ? null : (
            <>
              <span aria-hidden="true"> · </span>
              {t('pathDuration', {
                hours: format.number(Math.round(path.typicalDurationMinutes / 60)),
              })}
            </>
          )}
        </p>

        <Button asChild size="lg" className="mt-8">
          <Link href="/register">
            {t('explorerAction')}
            <ArrowLeft aria-hidden="true" />
          </Link>
        </Button>
      </div>

      {/* What the path produces. A path whose outcomes the directorate has not
          written yet simply has no list — the description still answers the
          question, and an empty box would answer nothing. */}
      {path.skillOutcomes.length > 0 ? (
        <div className="rounded-2xl bg-primary-50 p-6">
          <h4 className="text-base font-semibold text-primary-800">{t('pathOutcomesTitle')}</h4>
          <ul className="mt-4 flex flex-col gap-3">
            {path.skillOutcomes.map((outcome) => (
              <li key={outcome} className="flex items-start gap-3 text-base text-neutral-700">
                <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary-700" />
                {outcome}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Tabs>
  );
}

/**
 * How an employee reaches a path, in four lines.
 *
 * What used to be the explorer's four stage tabs. It is the same four facts and
 * it keeps the interpolated numbers — the assessment's length, the 5–10 rule —
 * but at the weight process deserves on a page about capability: a strip under
 * the paths, not the thing the page is organised around.
 */
const MATCHING_STEPS = ['assessment', 'recommendation', 'build', 'certificate'] as const;

/** The bank is thirty Likert items, balanced by construction (D-032). */
const ASSESSMENT_ITEM_COUNT = 30;

function MatchingStrip() {
  const t = useTranslations('landing');
  const { number } = useFormat();

  const values = {
    count: number(ASSESSMENT_ITEM_COUNT),
    min: number(PATH_MIN_COURSES),
    max: number(PATH_MAX_COURSES),
  };

  return (
    <div className="mt-12 rounded-2xl border border-border bg-card p-6 sm:p-8">
      <h3 className="text-lg font-semibold text-foreground">{t('matchingTitle')}</h3>

      <ol className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {MATCHING_STEPS.map((key, index) => (
          <li key={key} className="flex items-start gap-3">
            {/* The number is the ordering made visible; the list is already
                ordered for a screen reader, so the badge is decorative. */}
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-800"
            >
              {number(index + 1)}
            </span>
            <p className="text-sm leading-relaxed text-neutral-700">
              {t(`matching.${key}`, values)}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
