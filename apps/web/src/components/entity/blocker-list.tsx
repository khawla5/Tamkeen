'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import type { PublishBlocker } from '@tamkeen/types';

/**
 * Why a course cannot be published (§4B.3, D-061).
 *
 * Renders **every** blocker rather than the first. A gate that reports one
 * problem per attempt makes an entity fix, click, fix, click; the server returns
 * the whole list precisely so this can show it at once.
 *
 * Shared by the dashboard's needs-attention list and the manage screen, so the
 * two cannot describe the same course differently.
 */
/**
 * Where the guide explains the fix (TAM-134). Moodle-side blockers point at the
 * completion section; the metadata ones at بيانات الدورة. `LMS_UNREACHABLE`
 * has no fix an entity can make, so it carries no link.
 */
const GUIDE_SECTION: Partial<Record<PublishBlocker, string>> = {
  NO_COMPLETION_CRITERIA: 'completion',
  NO_PATH: 'metadata',
  NO_LANGUAGE: 'metadata',
  NO_OBJECTIVES: 'metadata',
  NO_DURATION: 'metadata',
};

export function BlockerList({
  blockers,
  maxPaths = 3,
}: {
  blockers: readonly PublishBlocker[];
  /** TAM-132: the cap, named in the NO_PATH message. */
  maxPaths?: number;
}) {
  const t = useTranslations('entity');

  if (blockers.length === 0) {
    return null;
  }

  return (
    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
      {blockers.map((blocker) => (
        <li key={blocker}>
          • {t(`blocker${blocker}`, { max: maxPaths })}
          {GUIDE_SECTION[blocker] ? (
            <>
              {' '}
              <Link
                href={`/entity/courses/guide#${GUIDE_SECTION[blocker]}`}
                className="text-primary-700 underline"
              >
                {t('blockerHow')}
              </Link>
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
