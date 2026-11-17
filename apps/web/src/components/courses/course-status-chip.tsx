'use client';

import { useTranslations } from 'next-intl';

import type { CourseProgressStatus } from '@tamkeen/types';

import { Badge } from '@/components/ui/badge';

/**
 * What this chip may say (D-134).
 *
 * `IN_PATH` is not a progress state — it is the fourth word §4.6 needs: a course
 * the learner owes but has not touched, seen from the catalogue where "not
 * started" would read as a rebuke rather than as a fact.
 */
export type CourseChipStatus = CourseProgressStatus | 'IN_PATH';

/**
 * The learner's own status on a course — one implementation, three screens
 * (TAM-127, TAM-128).
 *
 * `null` renders nothing at all: a course outside the user's path has no
 * personal status, and **absence is the signal**. A chip reading "ليست في
 * مسارك" on forty of the forty-eight catalogue cards would be noise on every
 * card that is not the answer to anything (§3).
 *
 * Neutral, never the primary accent: the accent means *recommended* (§3,
 * D-069), and a chip in it would read as a recommendation of a course the
 * user has already committed to. The word inside carries the meaning, so the
 * chip never depends on colour (WCAG 1.4.1).
 *
 * The vocabulary lives in its own namespace rather than being read out of
 * `myPath`: three screens share these three words now, and a namespace named
 * after one of them would make the other two look like they were borrowing.
 */
export function CourseStatusChip({ status }: { status: CourseChipStatus | null }) {
  const t = useTranslations('courseStatus');

  if (status === null) {
    return null;
  }

  return <Badge variant="neutral">{t(status)}</Badge>;
}
