'use client';

import { ArrowLeft, Award, BookOpen, Check, Gauge, Route } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';

/**
 * "عن المنصة" as the platform's idea in four tabs — the employee's journey
 * under the assigned-path model (D-130): a skill-level assessment driven by
 * the ministry's needs, the path assigned by the ministry (no
 * recommendations, no free choice), the path's fixed course set, and the
 * certificates that close it. One tab per stage, each panel a few sentences,
 * one «إنشاء حساب» action beneath.
 *
 * The copy is PLACEHOLDER pending the user's authored content (and, as all
 * landing copy, الإدارة العامة للتدريب's sign-off) — the structure is what
 * this component owns. Static: no fetch, nothing interpolated since the
 * 5–10 self-build rule left with D-130.
 */
const STAGES = ['assessment', 'assign', 'courses', 'certificate'] as const;

type Stage = (typeof STAGES)[number];

/** Decorative stage icons — the tab label is the name (D-069: one accent). */
const STAGE_ICONS: Record<Stage, typeof Gauge> = {
  assessment: Gauge,
  assign: Route,
  courses: BookOpen,
  certificate: Award,
};

const POINTS = ['p1', 'p2', 'p3'] as const;

export function AboutSection() {
  const t = useTranslations('landing');
  const [stage, setStage] = useState<Stage>('assessment');

  return (
    <section id="about" className="scroll-mt-20 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-3xl font-bold text-foreground">{t('aboutTitle')}</h2>
        <p className="mt-2 text-base text-muted-foreground">{t('aboutSubtitle')}</p>

        <div className="mt-8">
          <Tabs
            label={t('platformTabsLabel')}
            items={STAGES.map((key) => ({ value: key, label: t(`platform.${key}.tab`) }))}
            value={stage}
            onValueChange={(value) => setStage(value as Stage)}
            panelClassName="mt-8"
          >
            <StagePanel stage={stage} />
          </Tabs>

          <Button asChild size="lg" className="mt-10">
            <Link href="/register">
              {t('aboutAction')}
              <ArrowLeft aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

/**
 * One stage's panel: a decorative icon tile, the stage's paragraph, and
 * three concrete points — each a fact of the product, never a slogan. The
 * tick glyph accompanies the text (WCAG 1.4.1: never colour alone).
 */
function StagePanel({ stage }: { stage: Stage }) {
  const t = useTranslations('landing');
  const Icon = STAGE_ICONS[stage];

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
      <div
        aria-hidden="true"
        className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700"
      >
        <Icon className="size-7" />
      </div>

      <div>
        <p className="max-w-2xl text-base leading-relaxed text-neutral-700">
          {t(`platform.${stage}.body`)}
        </p>

        <ul className="mt-6 flex flex-col gap-3">
          {POINTS.map((point) => (
            <li key={point} className="flex items-start gap-2.5 text-base text-neutral-700">
              <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary-600" />
              {t(`platform.${stage}.${point}`)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
