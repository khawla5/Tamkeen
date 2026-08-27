'use client';

import { useTranslations } from 'next-intl';

import type { UserPathCourseStatus } from '@tamkeen/types';

import { Badge } from '@/components/ui/badge';

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
export function CourseStatusChip({ status }: { status: UserPathCourseStatus | null }) {
  const t = useTranslations('courseStatus');

  if (status === null) {
    return null;
  }

  return <Badge variant="neutral">{t(status)}</Badge>;
}
