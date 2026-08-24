'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import type { PathSummary } from '@tamkeen/types';

import { Button } from '@/components/ui/button';
import { useFormat } from '@/i18n/format-provider';
import { toHours } from '@/lib/duration';
import { cn } from '@/lib/utils';

/**
 * A path card (§4.4).
 *
 * The recommended treatment is the **primary border plus a badge** (D-069 — the
 * product uses one accent, the Platforms Code primary, for recommendation and
 * achievement alike). The badge carries the word "موصى به": colour alone would
 * fail WCAG 1.4.1, and would say nothing at all to a user who cannot
 * distinguish the border.
 */
export function PathCard({ path }: { path: PathSummary }) {
  const t = useTranslations('results');
  const tRiasec = useTranslations('riasec');
  const format = useFormat();

  const hours = toHours(path.typicalDurationMinutes);

  return (
    <article
      className={cn(
        'flex flex-col gap-3 rounded-card border bg-card p-5',
        path.recommended ? 'border-2 border-primary-600' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold text-foreground">{path.name}</h3>
          <p className="text-sm text-muted-foreground">{tRiasec(`${path.riasecLetter}.name`)}</p>
        </div>

        {path.recommended ? (
          <span className="rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground">
            {t('recommendedBadge')}
          </span>
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground">{path.description}</p>

      {/*
        Plain paragraphs, not a definition list. The values are already
        self-describing sentences ("11 دورة متاحة"), so pairing each with a
        visually-hidden term made a screen reader announce
        "دورة متاحة، 11 دورة متاحة" — the label twice and the number once.
        Semantic markup that duplicates the content is worse than none.
      */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <p>{t('pathCourses', { count: format.number(path.courseCount) })}</p>
        {hours !== null ? <p>{t('pathDuration', { hours: format.number(hours) })}</p> : null}
      </div>

      {/* One action per card. The highlight is not a pre-selection — §3A is
          explicit that the user must actively choose. */}
      <Button asChild variant="outline" className="self-start">
        <Link href={`/paths/${path.id}`}>{t('openPath')}</Link>
      </Button>
    </article>
  );
}
