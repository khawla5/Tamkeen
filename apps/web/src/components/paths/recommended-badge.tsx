'use client';

import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';

/**
 * «موصى به» (§3A, D-069).
 *
 * One component and one string, because the badge now appears in three places
 * — the results card, the path-build header, and the catalogue's group
 * headings — and the recommendation rule is the product. Three literals would
 * eventually become three slightly different words for the same fact.
 *
 * The badge is never the whole treatment: it accompanies the primary border,
 * so recommendation is never conveyed by colour alone (WCAG 1.4.1).
 */
export function RecommendedBadge({ className }: { className?: string }) {
  const t = useTranslations('results');

  return (
    <Badge variant="primary" className={className}>
      {t('recommendedBadge')}
    </Badge>
  );
}
