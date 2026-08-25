'use client';

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
        <li key={blocker}>• {t(`blocker${blocker}`, { max: maxPaths })}</li>
      ))}
    </ul>
  );
}
