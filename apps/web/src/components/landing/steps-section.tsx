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
 * Moodle-hosted courses → certificate + CV. An `<ol>` because the steps are
 * genuinely ordered, not just visually arranged — a screen reader announces
 * "item 2 of 4", which a `<div>` grid would not convey.
 */
export function StepsSection() {
  const t = useTranslations('landing');
  const { number } = useFormat();

  return (
    <section className="border-y border-border bg-navy py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="navy">{t('stepsEyebrow')}</Badge>
          <h2 className="mt-4 text-3xl font-bold text-white">{t('stepsTitle')}</h2>
        </div>

        <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ key, icon: Icon }, index) => (
            <li
              key={key}
              className="rounded-card border border-white/10 bg-white/5 p-6"
            >
              <div className="flex items-center gap-3">
                {/*
                  The ring is gold (border, non-text — 3:1 threshold, D-025).
                  The digit itself is white, not gold: at this size (text-sm)
                  gold text falls under the 4.5:1 AA floor for body text.
                */}
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-gold text-sm font-bold text-white"
                >
                  {number(index + 1)}
                </span>
                <Icon aria-hidden="true" className="size-6 text-gold" />
              </div>
              <h3 className="mt-4 font-semibold text-white">{t(`${key}Title`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                {key === 'step1'
                  ? t(`${key}Body`, { min: 20, max: 30 })
                  : key === 'step2'
                    ? t(`${key}Body`, { min: 5, max: 10 })
                    : t(`${key}Body`)}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
