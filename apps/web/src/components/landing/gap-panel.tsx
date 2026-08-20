import { ClipboardCheck, Compass, LayoutDashboard, Layers, ScrollText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { LucideIcon } from 'lucide-react';

/**
 * The answer to the four challenge cards above it, and part of the same
 * section: the page states the gap on the light background, then turns and
 * answers it on navy before moving on.
 *
 * Five single lines rather than titled blocks. Each one names a capability the
 * platform provides, so a title would only repeat the first three words of the
 * line beneath it.
 */
const SOLUTIONS: Array<{ key: string; icon: LucideIcon }> = [
  { key: 'solution1', icon: ScrollText },
  { key: 'solution2', icon: Compass },
  { key: 'solution3', icon: Layers },
  { key: 'solution4', icon: ClipboardCheck },
  { key: 'solution5', icon: LayoutDashboard },
];

export function GapPanel() {
  const t = useTranslations('landing');

  return (
    <div className="rounded-card bg-navy p-8 sm:p-10">
      <h3 className="text-xl font-bold text-white sm:text-2xl">{t('gapPanelTitle')}</h3>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {SOLUTIONS.map(({ key, icon: Icon }, index) => (
          <li
            key={key}
            className={
              /* Five items in a two-column grid leaves one alone on the last
                 row; letting it span both columns keeps the block from ending
                 on a ragged half-row. */
              index === SOLUTIONS.length - 1 ? 'sm:col-span-2' : undefined
            }
          >
            <div className="flex h-full items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
              {/* Gold on navy is 4.24:1 — an icon needs 3:1, so this is a role
                  gold may take; the text beside it is white for the same
                  reason it could not be gold (globals.css / D-042). */}
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gold/15 ring-1 ring-gold/25">
                <Icon aria-hidden="true" className="size-4 text-gold-light" />
              </span>
              <p className="text-sm leading-relaxed text-white/80">{t(key)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
