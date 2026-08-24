import type { RiasecLetter } from '@tamkeen/types';
import { useTranslations } from 'next-intl';

import { useFormat } from '@/i18n/format-provider';
import { cn } from '@/lib/utils';

/**
 * A Holland Code as the user should meet it: the three letters as their
 * Arabic type names, strongest first, on the achievement fill. One
 * component for the dashboard (names only) and Results (numbered, since that
 * page explains the ranking) — so the two can never disagree about what the
 * code looks like (TAM-108 / TAM-114).
 *
 * The Latin letters never reach the screen; they are a storage key, not a
 * result an Arabic-speaking employee can read.
 */
export function HollandCodeChips({
  code,
  ordinals = false,
  className,
}: {
  code: readonly RiasecLetter[];
  /** Number the chips ("1. الاجتماعي") where the ranking is being explained. */
  ordinals?: boolean;
  className?: string;
}) {
  const t = useTranslations('riasec');
  const tResults = useTranslations('results');
  const { number } = useFormat();

  return (
    <ul aria-label={tResults('codeHeading')} className={cn('flex flex-wrap gap-2', className)}>
      {code.map((letter, position) => (
        <li
          key={letter}
          className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground"
        >
          {ordinals ? (
            <span className="font-medium opacity-70">{number(position + 1)}. </span>
          ) : null}
          {t(`${letter}.name`)}
        </li>
      ))}
    </ul>
  );
}
