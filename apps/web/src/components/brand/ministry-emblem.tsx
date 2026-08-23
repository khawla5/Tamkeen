import Image from 'next/image';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

/*
 * The Ministry of Interior emblem, as supplied (public/brand/MOI.svg, the
 * ministry's own artwork; only the SVG viewBox was tightened to the emblem's
 * bounds so it renders at size). Its accessible name is the ministry's Arabic
 * name. It is never a link: the emblem states who owns the platform, it is
 * not a navigation target.
 */
export function MinistryEmblem({
  height = 44,
  priority = false,
  className,
}: {
  /** Rendered size in CSS px; the emblem is square. */
  height?: number;
  priority?: boolean;
  className?: string;
}) {
  const t = useTranslations('app');

  return (
    <Image
      src="/brand/MOI.svg"
      alt={t('ministry')}
      width={height}
      height={height}
      priority={priority}
      /* SVG is served as-is: the optimiser would rasterise vector artwork. */
      unoptimized
      className={cn('shrink-0', className)}
      style={{ width: height, height }}
    />
  );
}
