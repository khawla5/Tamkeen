'use client';

import { PATH_MAX_COURSES, PATH_MIN_COURSES } from '@tamkeen/types';
import {
  ArrowLeft,
  Award,
  ClipboardCheck,
  GraduationCap,
  Route,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { useFormat } from '@/i18n/format-provider';
import { cn } from '@/lib/utils';

/**
 * "عن المنصة" as an explorer, in the pattern Absher uses for its services: a
 * row of stage tabs, a list of that stage's steps on the start side, and the
 * selected step explained on the end side with the one action that follows.
 * The reader browses what the platform does instead of reading a wall of
 * prose, and every explanation comes from the BRD's functional requirements.
 *
 * Semantics: the stages are a real tablist (arrow keys move between them,
 * the panel is labelled by its tab); the steps are buttons marked
 * `aria-current` rather than a nested tablist — one level of tabs is enough
 * for a screen reader to hold in mind.
 */

/** The bank is thirty Likert items, balanced by construction (D-032). */
const ASSESSMENT_ITEM_COUNT = 30;

const STAGES: ReadonlyArray<{ key: string; icon: LucideIcon; items: readonly string[] }> = [
  { key: 'assessment', icon: ClipboardCheck, items: ['test', 'result', 'retake'] },
  { key: 'path', icon: Route, items: ['recommended', 'build', 'confirm'] },
  { key: 'courses', icon: GraduationCap, items: ['enter', 'quiz', 'progress'] },
  { key: 'certificates', icon: Award, items: ['course', 'path', 'verify', 'cv'] },
];

export function AboutSection() {
  const t = useTranslations('landing');
  const { number } = useFormat();

  const [stageIndex, setStageIndex] = useState(0);
  const [itemIndex, setItemIndex] = useState(0);
  const stage = STAGES[stageIndex]!;
  const itemKey = stage.items[itemIndex]!;

  const values = {
    count: number(ASSESSMENT_ITEM_COUNT),
    min: number(PATH_MIN_COURSES),
    max: number(PATH_MAX_COURSES),
  };

  function selectStage(next: number) {
    setStageIndex(next);
    setItemIndex(0);
  }

  return (
    <section id="about" className="scroll-mt-20 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-3xl font-bold text-foreground">{t('aboutTitle')}</h2>
        <p className="mt-2 text-base text-muted-foreground">{t('aboutSubtitle')}</p>

        <Tabs
          className="mt-8"
          label={t('explorerStagesLabel')}
          items={STAGES.map(({ key, icon: Icon }) => ({
            value: key,
            icon: <Icon aria-hidden="true" className="size-5" />,
            label: t(`stages.${key}.label`),
          }))}
          value={stage.key}
          onValueChange={(next) => selectStage(STAGES.findIndex((item) => item.key === next))}
          panelClassName="mt-8 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12"
        >
          <ul aria-label={t('explorerItemsLabel')} className="flex flex-col gap-1">
            {stage.items.map((key, index) => {
              const current = index === itemIndex;
              return (
                <li key={key}>
                  <button
                    type="button"
                    aria-current={current ? 'true' : undefined}
                    onClick={() => setItemIndex(index)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-4 py-3 text-start text-base font-semibold transition-colors',
                      current
                        ? 'bg-primary-50 text-primary-800'
                        : 'text-neutral-700 hover:bg-neutral-100',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        current ? 'bg-primary-600' : 'bg-neutral-300',
                      )}
                    />
                    {t(`stages.${stage.key}.items.${key}.title`)}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col items-start">
            <h3 className="text-2xl font-bold text-foreground">
              {t(`stages.${stage.key}.items.${itemKey}.title`)}
            </h3>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-neutral-700">
              {t(`stages.${stage.key}.items.${itemKey}.body`, values)}
            </p>
            <Button asChild size="lg" className="mt-8">
              <Link href="/register">
                {t('explorerAction')}
                <ArrowLeft aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </Tabs>
      </div>
    </section>
  );
}
