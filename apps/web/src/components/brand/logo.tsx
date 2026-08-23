import Image from 'next/image';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

/*
 * The Tamkeen lockup — the Arabic wordmark, the Latin wordmark and the
 * constellation mark — as supplied by the ministry-side team (reference repo
 * `public/brand/tamkeen_logo_transparent.png`, brought over unchanged).
 *
 * Its accessible name is the Arabic brand only: the image carries "TAMKEEN"
 * as pixels, never as text, so Arabic-first (D-001) holds for assistive
 * technology too.
 */

const SOURCE_WIDTH = 1216;
const SOURCE_HEIGHT = 504;

export function Logo({
  height = 40,
  onDark = false,
  priority = false,
  className,
}: {
  /** Rendered height in CSS px; width follows the lockup's ratio. */
  height?: number;
  /** On a dark surface the navy wordmark needs a white tile behind it. */
  onDark?: boolean;
  priority?: boolean;
  className?: string;
}) {
  const t = useTranslations('landing');
  const width = Math.round((height * SOURCE_WIDTH) / SOURCE_HEIGHT);

  const image = (
    <Image
      src="/brand/tamkeen-logo.png"
      alt={t('brand')}
      width={width}
      height={height}
      priority={priority}
      className={cn('h-auto', !onDark && className)}
      style={{ width, height }}
    />
  );

  if (!onDark) {
    return image;
  }

  return (
    <span className={cn('inline-flex rounded-lg bg-surface px-2 py-1', className)}>{image}</span>
  );
}
