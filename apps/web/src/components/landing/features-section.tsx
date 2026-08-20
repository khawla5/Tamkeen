'use client';

import { BadgeCheck, Briefcase, ClipboardCheck, Route, type LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';

import { useFormat } from '@/i18n/format-provider';

const STEPS: Array<{ key: string; icon: LucideIcon }> = [
  { key: 'feature1', icon: ClipboardCheck },
  { key: 'feature2', icon: Route },
  { key: 'feature3', icon: BadgeCheck },
  { key: 'feature4', icon: Briefcase },
];

/**
 * The four steps that carry the whole product: assess → follow a path → build a
 * record → reach an opportunity.
 *
 * A zigzag timeline, not a plain grid: each card sits on alternating sides of a
 * central gold spine with a numbered milestone. `lg:flex-row-reverse` on every
 * other row is a *relative* flip — it reverses whatever the page's own
 * direction already put first — so the alternation reads correctly in both
 * Arabic and English with no hardcoded left/right.
 *
 * An `<ol>`, not a styled `<div>` grid: the steps are genuinely ordered, and a
 * screen reader announcing "item 2 of 4" is lost the moment this becomes
 * decorative markup.
 */
export function FeaturesSection() {
  const t = useTranslations('landing');
  const { number } = useFormat();

  return (
    <section
      id="features"
      tabIndex={-1}
      className="scroll-mt-20 border-y border-border bg-navy py-16 sm:py-24 lg:py-28"
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          {/* On navy, gold-light is the legible gold: 4.94:1 against this
              background, where plain gold would be 4.24:1 and fine for an icon
              but tight for text this small. */}
          <p className="text-xs font-bold text-gold-light ltr:uppercase ltr:tracking-[0.2em]">
            {t('featuresEyebrow')}
          </p>
          <h2 className="mt-4 text-3xl font-bold text-white sm:text-4xl">{t('featuresTitle')}</h2>
          <span aria-hidden="true" className="mx-auto mt-6 block h-px w-16 bg-gold" />
          <p className="mt-6 leading-relaxed text-white/70">{t('featuresBody')}</p>
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
                {/*
                  Each card slides in from its own side as it is reached, the
                  reference's treatment. `once` so it plays on the way down and
                  not again on the way back up; the margin delays it until the
                  card is properly in view rather than clipping the viewport
                  edge. The offset sign follows `isReversed`, so the movement
                  agrees with the side the card sits on.
                */}
                <motion.div
                  className="flex-1"
                  initial={{ opacity: 0, x: isReversed ? 40 : -40 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '-80px' }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div
                    className={`rounded-card border border-white/10 bg-white/5 p-6 transition-colors hover:border-gold/40 lg:p-7 ${
                      isReversed ? 'lg:text-end' : ''
                    }`}
                  >
                    <div
                      className={`flex items-center gap-3 ${isReversed ? 'lg:flex-row-reverse' : ''}`}
                    >
                      <Icon aria-hidden="true" className="size-6 shrink-0 text-gold-light" />
                      <h3 className="font-semibold text-white">{t(`${key}Title`)}</h3>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-white/70">{t(`${key}Body`)}</p>
                  </div>
                </motion.div>

                {/*
                  The spine: a numbered milestone on a vertical gold line,
                  desktop only — on narrow viewports the cards simply stack.

                  The ring is gold (a border, so the 3:1 threshold applies). The
                  digit itself is white, not gold: at this size gold text would
                  fall under the 4.5:1 AA floor for body text.
                */}
                <div className="hidden w-12 shrink-0 flex-col items-center lg:flex">
                  <motion.span
                    aria-hidden="true"
                    className="z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-gold bg-navy text-sm font-bold text-white"
                    initial={{ scale: 0 }}
                    whileInView={{ scale: 1 }}
                    viewport={{ once: true, margin: '-80px' }}
                    transition={{ duration: 0.4, type: 'spring', stiffness: 300 }}
                  >
                    {number(index + 1)}
                  </motion.span>
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
