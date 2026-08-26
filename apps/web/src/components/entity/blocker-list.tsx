'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import type { PublishBlocker } from '@tamkeen/types';

/**
 * `NO_COMPLETION_CRITERIA` is the one blocker whose fix is inside Moodle, not
 * this portal — the create/metadata blockers all resolve on this page's own
 * form. Only that one gets a guide link (TAM-134); linking the others would
 * send someone looking in Moodle for a field that has always been right here.
 */
const GUIDE_ANCHORS: Partial<Record<PublishBlocker, string>> = {
  NO_COMPLETION_CRITERIA: '/entity/guide#completion',
};

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
export function BlockerList({ blockers }: { blockers: readonly PublishBlocker[] }) {
  const t = useTranslations('entity');

  if (blockers.length === 0) {
    return null;
  }

  return (
    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
      {blockers.map((blocker) => {
        const anchor = GUIDE_ANCHORS[blocker];

        return (
          <li key={blocker}>
            • {t(`blocker${blocker}`)}
            {anchor ? (
              <>
                {' '}
                <Link
                  href={anchor}
                  className="font-medium text-primary-700 underline-offset-4 hover:underline"
                >
                  {t('guideLink')}
                </Link>
              </>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
