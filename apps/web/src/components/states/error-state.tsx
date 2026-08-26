'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ErrorStateProps {
  title?: string;
  body?: string;
  /** When provided, the user gets a way out. Prefer always providing it. */
  onRetry?: () => void;
  className?: string;
}

/**
 * The error state every data view uses (§2B DoD 4) — "no dead blank screens, no
 * unhandled failures".
 *
 * On the `Alert` error tone (TAM-118): the danger hairline and `-50` fill, the
 * danger colour for icon and title, so a failed view and a failed form say
 * "something went wrong" in the same voice. `role="alert"` so the failure is
 * announced immediately. The message is deliberately plain Arabic with no
 * technical detail: a stack trace or an endpoint path would leak
 * implementation information to an end user, and §2 forbids putting anything
 * sensitive in front of them.
 */
export function ErrorState({ title, body, onRetry, className }: ErrorStateProps) {
  const t = useTranslations('states');
  const tActions = useTranslations('actions');

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-card border border-danger bg-danger-50 px-6 py-12 text-center',
        className,
      )}
    >
      <AlertTriangle aria-hidden="true" className="size-8 text-danger" />
      <p className="font-semibold text-danger">{title ?? t('errorTitle')}</p>
      <p className="max-w-prose text-sm text-neutral-700">{body ?? t('errorBody')}</p>

      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw aria-hidden="true" />
          {tActions('retry')}
        </Button>
      ) : null}
    </div>
  );
}
