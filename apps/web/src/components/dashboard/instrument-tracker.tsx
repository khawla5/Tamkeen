import type { DashboardView } from '@tamkeen/types';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * One stage per required instrument, done or pending, in the order an admin
 * assigned them (§4.2 part 3, D-095, TAM-147).
 *
 * A different question from `JourneyTracker` beside it, not a replacement:
 * that tracker is the single Holland pipeline (assessment → path → courses →
 * certificate) and stays exactly that — `dashboard.state` remains derived
 * from the Holland assessment alone (§4.2's clarification of D-071). This
 * answers "what has this person been assigned, and have they done it",
 * which can include CEFR, a future instrument, or nothing beyond the
 * baseline RIASEC assignment every account gets.
 *
 * Unlike the Holland pipeline, instruments have no required order relative
 * to each other — a learner may take CEFR before RIASEC — so there is no
 * "current" stage here, only done and pending.
 *
 * Renders nothing once there is only the one baseline instrument to show:
 * a single-item stepper would duplicate `JourneyTracker`'s first stage
 * rather than add information.
 */
export function InstrumentTracker({ dashboard }: { dashboard: DashboardView }) {
  const t = useTranslations('dashboard');
  const required = dashboard.assessments.filter((assessment) => assessment.required);

  if (required.length < 2) {
    return null;
  }

  return (
    <Card>
      <CardContent className="py-5">
        <ol aria-label={t('instrumentsLabel')} className="flex items-center gap-0">
          {required.map((assessment, index) => {
            const done = assessment.takenAt !== null;
            const isLast = index === required.length - 1;

            return (
              <li
                key={assessment.key}
                data-stage={done ? 'done' : 'upcoming'}
                aria-label={assessment.title}
                className="flex flex-1 items-center"
              >
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold',
                      done
                        ? 'border-primary-600 bg-primary-600 text-surface'
                        : 'border-neutral-300 bg-surface text-neutral-400',
                    )}
                  >
                    {done ? <Check className="size-4" /> : index + 1}
                  </span>
                  {/* At phone widths (TAM-124's 360px gate) only icons fit;
                      every stage keeps its accessible name via the li's
                      aria-label. */}
                  <span
                    className={cn(
                      'hidden text-sm sm:inline',
                      done ? 'font-medium text-primary-700' : 'text-neutral-500',
                    )}
                  >
                    {assessment.title}
                  </span>
                </div>
                {!isLast ? (
                  <span
                    aria-hidden="true"
                    className={cn('mx-3 h-px flex-1', done ? 'bg-primary-600' : 'bg-neutral-300')}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
