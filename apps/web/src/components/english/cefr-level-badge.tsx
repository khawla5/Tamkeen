import type { CefrLevel } from '@tamkeen/types';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * A CEFR level as the user should meet it: the level code beside its Arabic
 * name — «B2 · فوق المتوسط».
 *
 * **Why the Latin code is shown here when `HollandCodeChips` deliberately hides
 * its letters.** A RIASEC letter is a storage key: "S" means nothing to an
 * Arabic-speaking employee and «الاجتماعي» is the whole of the result. A CEFR
 * level is the opposite — "B2" is the internationally recognised name of the
 * thing, the token a training officer looks for and the one an employee would
 * put on the CV §4.11 exports in English. Hiding it would withhold the useful
 * half. The Arabic name carries the meaning; the code carries the currency.
 *
 * The code comes from the data, never from the message catalogue, which is what
 * keeps `ar.json` free of Latin characters and bare digits — the two rules
 * `messages.test.ts` enforces.
 *
 * One component for the dashboard card, the result page and the profile, so the
 * three can never disagree about what a level looks like.
 */
export function CefrLevelBadge({ level, className }: { level: CefrLevel; className?: string }) {
  const t = useTranslations('english');

  return (
    <Badge variant="primary" className={cn('px-3 py-1 text-sm', className)}>
      {/* `dir="ltr"` on the code alone: an isolated Latin token inside an RTL
          run has its neighbouring punctuation thrown to the wrong end, so
          «B2 · فوق المتوسط» would render with the separator adrift. */}
      <span dir="ltr" className="font-semibold">
        {level}
      </span>
      <span aria-hidden="true" className="mx-1.5 opacity-60">
        ·
      </span>
      {t(`level.${level}`)}
    </Badge>
  );
}
