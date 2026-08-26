'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import type { PathSummary } from '@tamkeen/types';

import { Button } from '@/components/ui/button';
import { useFormat } from '@/i18n/format-provider';
import { toHours } from '@/lib/duration';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { cardVariants } from '@/components/ui/card';

/**
 * A path card (§4.4).
 *
 * The recommended treatment is the **primary border plus a badge** (D-069 — the
 * product uses one accent, the Platforms Code primary, for recommendation and
 * achievement alike). The badge carries the word "موصى به": colour alone would
 * fail WCAG 1.4.1, and would say nothing at all to a user who cannot
 * distinguish the border.
 *
 * The card is deliberately **compact** (TAM-113): name, type, badge, course
 * count, duration, one action. The description belongs to the path page the
 * action opens — twelve cards each carrying a paragraph buried the ranking that
 * is the whole point of this screen.
 */
export function PathCard({
  path,
  committedPathId = null,
}: {
  path: PathSummary;
  /**
   * The path this user has confirmed, when they have confirmed one (§2).
   *
   * Passed in rather than read from portal state so the card stays
   * presentational. `null` means "nothing is committed yet" — every card is
   * still choosable, which is also the correct reading for a user mid-build,
   * since nothing is locked before confirm.
   */
  committedPathId?: string | null;
}) {
  const t = useTranslations('results');
  const tRiasec = useTranslations('riasec');
  const format = useFormat();

  const hours = toHours(path.typicalDurationMinutes);
  const isCommitted = committedPathId !== null;
  const isChosen = isCommitted && path.id === committedPathId;

  return (
    <article
      className={cn(
        cardVariants({ variant: path.recommended || isChosen ? 'selected' : 'default' }),
        'flex flex-col gap-3 p-5',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold text-foreground">{path.name}</h3>
          <p className="text-sm text-muted-foreground">{tRiasec(`${path.riasecLetter}.name`)}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Not the primary colour: primary means *recommended* (§3), and a
              chosen-but-unrecommended path would otherwise look recommended
              after the fact. */}
          {isChosen ? <Badge variant="neutral">{t('committedBadge')}</Badge> : null}

          {path.recommended ? (
            <Badge variant="primary" className="text-sm">
              {t('recommendedBadge')}
            </Badge>
          ) : null}
        </div>
      </div>

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

      {/*
        One action per card — and after commitment, at most one card has one
        (§2, TAM-114). Switching is impossible, so the other cards drop their
        button entirely rather than showing a disabled one: §3 prefers absence
        to a control that exists only to refuse.
      */}
      {isChosen ? (
        <Button asChild variant="outline" className="self-start">
          <Link href="/my-path">{t('openMyPath')}</Link>
        </Button>
      ) : null}

      {/* The highlight is not a pre-selection — §3A is explicit that the user
          must actively choose. */}
      {!isCommitted ? (
        <Button asChild variant="outline" className="self-start">
          <Link href={`/paths/${path.id}`}>{t('openPath')}</Link>
        </Button>
      ) : null}
    </article>
  );
}
