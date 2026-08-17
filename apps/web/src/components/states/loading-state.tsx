import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface LoadingStateProps {
  /** Number of skeleton rows to suggest the shape of the incoming content. */
  rows?: number;
  /** Overrides the announced label when a generic one would be unhelpful. */
  label?: string;
  className?: string;
}

/**
 * The loading state every data view uses (§2B DoD 4).
 *
 * A single `role="status"` region carries the announcement; the skeletons are
 * `aria-hidden`, so assistive technology hears "جارٍ التحميل" once instead of
 * reciting a list of empty placeholders.
 */
export function LoadingState({ rows = 3, label, className }: LoadingStateProps) {
  const t = useTranslations('states');

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn('flex flex-col gap-3', className)}
    >
      <span className="sr-only">{label ?? t('loadingLabel')}</span>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        <span>{t('loading')}</span>
      </div>

      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}
