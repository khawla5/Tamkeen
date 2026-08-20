'use client';

import { Award, ClipboardCheck, GraduationCap, Route, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { useFormat } from '@/i18n/format-provider';

const STEPS: Array<{ key: string; icon: LucideIcon }> = [
  { key: 'step1', icon: ClipboardCheck },
  { key: 'step2', icon: Route },
  { key: 'step3', icon: GraduationCap },
  { key: 'step4', icon: Award },
];

/**
 * The four-step journey (§5 of the PRD): assessment → committed path →
 * Moodle-hosted courses → certificate + CV.
 *
 * A zigzag timeline, not a plain grid: each card sits on alternating sides
 * of a central gold spine with a numbered milestone. `lg:flex-row-reverse`
 * on every other row is a *relative* flip — it reverses whatever the page's
 * own direction already put first — so the alternation reads correctly in
 * RTL without any hardcoded left/right positioning.
 *
 * An `<ol>`, not a styled `<div>` grid: the steps are genuinely ordered, and
 * a screen reader announcing "item 2 of 4" is lost the moment this becomes
 * decorative markup.
 */
export function StepsSection() {
  const t = useTranslations('landing');
  const { number } = useFormat();

  return (
    <section className="border-y border-border bg-navy py-16 sm:py-24 lg:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="navy">{t('stepsEyebrow')}</Badge>
          <h2 className="mt-4 text-3xl font-bold text-white">{t('stepsTitle')}</h2>
        </div>

        <ol className="relative mt-14 flex flex-col gap-6 lg:gap-0">
          {STEPS.map(({ key, icon: Icon }, index) => {
            const isReversed = index % 2 !== 0;
            const isLast = index === STEPS.length - 1;

            return (
              <li
                key={key}
                className={`relative flex items-start gap-0 lg:gap-8 ${
                  isReversed ? 'lg:flex-row-reverse' : ''
                }`}
              >
                <div className="flex-1">
                  <div
                    className={`rounded-card border border-white/10 bg-white/5 p-6 transition-colors hover:border-gold/40 lg:p-7 ${
                      isReversed ? 'lg:text-end' : ''
                    }`}
                  >
                    <div
                      className={`flex items-center gap-3 ${isReversed ? 'lg:flex-row-reverse' : ''}`}
                    >
                      <Icon aria-hidden="true" className="size-6 shrink-0 text-gold" />
                      <h3 className="font-semibold text-white">{t(`${key}Title`)}</h3>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-white/70">
                      {key === 'step1'
                        ? t(`${key}Body`, { min: 20, max: 30 })
                        : key === 'step2'
                          ? t(`${key}Body`, { min: 5, max: 10 })
                          : t(`${key}Body`)}
                    </p>
                  </div>
                </div>

                {/*
                  The spine: a numbered milestone on a vertical gold line,
                  desktop only — on narrow viewports the cards simply stack,
                  the plain layout the previous version used everywhere.

                  The ring is gold (border, non-text — 3:1 threshold, D-025).
                  The digit itself is white, not gold: at this size (text-sm)
                  gold text falls under the 4.5:1 AA floor for body text.
                */}
                <div className="hidden w-12 shrink-0 flex-col items-center lg:flex">
                  <span
                    aria-hidden="true"
                    className="z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-gold bg-navy text-sm font-bold text-white"
                  >
                    {number(index + 1)}
                  </span>
                  {!isLast && <div className="min-h-16 w-px flex-1 bg-gold/20" />}
                </div>

                <div className="hidden flex-1 lg:block" />
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
