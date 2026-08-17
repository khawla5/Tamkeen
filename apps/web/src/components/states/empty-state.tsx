import { Inbox } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  title?: string;
  body?: string;
  /** A single action, only when there is genuinely something to do here (§3). */
  action?: ReactNode;
  className?: string;
}

/**
 * The empty state every data view uses (§2B DoD 4) — "nothing here yet", which
 * is different from a failure and must never be styled as one.
 *
 * Not a live region: an empty result is the expected outcome of a successful
 * request, so it does not warrant interrupting a screen-reader user.
 */
export function EmptyState({ title, body, action, className }: EmptyStateProps) {
  const t = useTranslations('states');

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-card px-6 py-12 text-center',
        className,
      )}
    >
      <Inbox aria-hidden="true" className="size-8 text-muted-foreground" />
      <p className="font-semibold text-foreground">{title ?? t('emptyTitle')}</p>
      <p className="max-w-prose text-sm text-muted-foreground">{body ?? t('emptyBody')}</p>
      {action}
    </div>
  );
}
