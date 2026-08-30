'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { PATH_MAX_COURSES, PATH_MIN_COURSES, type PublicPathSummary } from '@tamkeen/types';

import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useFormat } from '@/i18n/format-provider';
import { publicApi } from '@/lib/api-client';
import { toHours } from '@/lib/duration';
import { useApiQuery } from '@/lib/use-api';

/**
 * "عن المنصة" as an explorer of the real paths, not the generic four-stage
 * process it used to walk through (TAM-150). A dropdown of active paths — the
 * platform's own `Select` (native `<select>`, so keyboard and mobile pickers
 * come free, and its hover/focus states are the ones every form field on the
 * site already uses) — with the chosen path's panel answering "what will I be
 * able to do": its career type, the skills it produces, its description, and
 * how much of it there is, all read from the API rather than typed here.
 *
 * Beneath the picker, a compact four-line strip explains *how* a path is
 * reached — the one thing the old stage-by-stage walkthrough got right and
 * the only trace of it kept.
 */
export function AboutSection() {
  const t = useTranslations('landing');
  const { number } = useFormat();

  const paths = useApiQuery(() => publicApi.paths(), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = paths.data ?? [];
  const active = list.find((path) => path.id === selectedId) ?? list[0] ?? null;

  const matchValues = useMemo(
    () => ({ min: number(PATH_MIN_COURSES), max: number(PATH_MAX_COURSES) }),
    [number],
  );

  return (
    <section id="about" className="scroll-mt-20 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-3xl font-bold text-foreground">{t('aboutTitle')}</h2>
        <p className="mt-2 text-base text-muted-foreground">{t('aboutSubtitle')}</p>

        <div className="mt-8">
          {/* Not an error state: a marketing page's front door does not fail
              on an outage, it just has nothing new to show yet. Covers both a
              fetch failure and a catalogue with no active paths — the same
              honest fallback either way. */}
          {!paths.isLoading && active ? (
            <>
              <div className="max-w-sm">
                <label htmlFor="explorer-path" className="text-sm font-medium text-foreground">
                  {t('explorerPathsLabel')}
                </label>
                <div className="mt-2">
                  <Select
                    id="explorer-path"
                    value={active.id}
                    onChange={(event) => setSelectedId(event.target.value)}
                    className="cursor-pointer transition-colors hover:bg-primary-50"
                  >
                    {list.map((path) => (
                      <option key={path.id} value={path.id}>
                        {path.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {/* A `<select>` change moves the panel below it, off-screen from
                  where a screen reader user's focus stays — `aria-live`
                  announces the new path rather than leaving that update
                  silent. */}
              <div aria-live="polite" className="mt-8">
                <PathPanel path={active} />
              </div>
            </>
          ) : !paths.isLoading ? (
            <p role="status" className="text-base text-muted-foreground">
              {t('explorerFallback')}
            </p>
          ) : (
            <div aria-hidden="true" className="h-64 animate-pulse rounded-2xl bg-neutral-100" />
          )}
        </div>

        <ul className="mt-10 flex flex-col gap-3 border-t border-border pt-8 sm:flex-row sm:flex-wrap sm:gap-x-8 sm:gap-y-3">
          {(['assessment', 'recommend', 'build', 'certificate'] as const).map((key, index) => (
            <li key={key} className="flex items-start gap-2 text-sm text-neutral-700 sm:flex-1">
              <span
                aria-hidden="true"
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-800"
              >
                {number(index + 1)}
              </span>
              {t(`matchStrip.${key}`, matchValues)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function PathPanel({ path }: { path: PublicPathSummary }) {
  const t = useTranslations('landing');
  const tRiasec = useTranslations('riasec');
  const { number } = useFormat();

  const hours = toHours(path.typicalDurationMinutes);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12">
      <div className="flex flex-col items-start">
        <h3 className="text-2xl font-bold text-foreground">{path.name}</h3>

        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-sm font-medium text-primary-800">
          <span className="text-primary-600">{t('explorerRiasecLabel')}:</span>
          {tRiasec(`${path.riasecLetter}.name`)}
        </span>

        <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-700">
          {path.description}
        </p>

        <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>{t('explorerCourseCount', { count: number(path.courseCount) })}</span>
          {hours !== null ? <span>{t('explorerDuration', { hours: number(hours) })}</span> : null}
        </p>

        <Button asChild size="lg" className="mt-8">
          <Link href="/register">
            {t('explorerAction')}
            <ArrowLeft aria-hidden="true" />
          </Link>
        </Button>
      </div>

      {path.skillOutcomes.length > 0 ? (
        <div>
          <h4 className="text-sm font-semibold text-foreground">{t('explorerSkillsHeading')}</h4>
          <ul className="mt-3 flex flex-col gap-2">
            {path.skillOutcomes.map((outcome) => (
              <li
                key={outcome}
                className="rounded-lg border border-border bg-card px-4 py-3 text-base font-medium text-foreground"
              >
                {outcome}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
