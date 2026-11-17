import type { DashboardView } from '@tamkeen/types';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

/**
 * Where the learner is in the programme, at a glance (TAM-123, D-134): four
 * stages — assigned, placed, courses, certificate — each done, current or
 * upcoming.
 *
 * The stages follow the ministry's sequence rather than a choice the learner
 * makes: a path is assigned to them, an assessment places them on it, they work
 * what they owe, and the path certificate closes it. Derived entirely from the
 * dashboard state the server already decided, so it can never disagree with the
 * cards below it.
 *
 * **The first stage is never "current".** Being assigned is not something a
 * learner does, so an employee with no path has nothing in progress — every node
 * is upcoming, which is the honest picture of somebody waiting on the ministry.
 */
type Stage = 'done' | 'current' | 'upcoming';

const STAGE_KEYS = ['assigned', 'placed', 'courses', 'certificate'] as const;

export function stagesFor(dashboard: DashboardView): Stage[] {
  if (dashboard.state === 'NO_PATH') return ['upcoming', 'upcoming', 'upcoming', 'upcoming'];
  if (dashboard.state === 'AWAITING_PLACEMENT') {
    return ['done', 'current', 'upcoming', 'upcoming'];
  }

  /* Across every assigned path: somebody who finished one and is mid-way
     through a second is still working, and the tracker should say so. */
  const owed = dashboard.paths.filter((path) => path.placedLevel !== null);
  const allDone = owed.length > 0 && owed.every((path) => path.completedCount === path.totalCount);
  const pathCertificate = dashboard.latestCertificate?.type === 'PATH';

  if (pathCertificate) return ['done', 'done', 'done', 'done'];
  if (allDone) return ['done', 'done', 'done', 'current'];

  return ['done', 'done', 'current', 'upcoming'];
}

export function JourneyTracker({ dashboard }: { dashboard: DashboardView }) {
  const t = useTranslations('dashboard');
  const stages = stagesFor(dashboard);

  return (
    <ol aria-label={t('journeyLabel')} className="flex items-center gap-0">
      {STAGE_KEYS.map((key, index) => {
        const stage = stages[index]!;
        const isLast = index === STAGE_KEYS.length - 1;
        return (
          <li
            key={key}
            data-stage={stage}
            aria-label={t(`journey.${key}`)}
            aria-current={stage === 'current' ? 'step' : undefined}
            className="flex flex-1 items-center"
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold',
                  stage === 'done' && 'border-primary-600 bg-primary-600 text-surface',
                  stage === 'current' && 'border-primary-600 bg-surface text-primary-700',
                  stage === 'upcoming' && 'border-neutral-300 bg-surface text-neutral-400',
                )}
              >
                {stage === 'done' ? <Check className="size-4" /> : index + 1}
              </span>
              <span
                className={cn(
                  'text-sm',
                  /* At phone widths four labels cannot fit beside their nodes
                     (TAM-124's 360px gate): only the current stage keeps its
                     visible label; every stage keeps its accessible name via
                     the li's aria-label. */
                  stage === 'current'
                    ? 'font-semibold text-foreground'
                    : cn(
                        'hidden sm:inline',
                        stage === 'done' && 'font-medium text-primary-700',
                        stage === 'upcoming' && 'text-neutral-500',
                      ),
                )}
              >
                {t(`journey.${key}`)}
              </span>
            </div>
            {!isLast ? (
              <span
                aria-hidden="true"
                className={cn(
                  'mx-3 h-px flex-1',
                  stage === 'done' ? 'bg-primary-600' : 'bg-neutral-300',
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
