'use client';

import {
  BadgeCheck,
  BarChart3,
  BookOpen,
  Briefcase,
  Building2,
  Compass,
  FileText,
  GraduationCap,
  Handshake,
  Layers,
  Search,
  Send,
  Target,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState, type KeyboardEvent } from 'react';

import { baseLocale } from '@/i18n/config';
import { cn } from '@/lib/utils';

/**
 * Six sides of the platform, and what each one gets from it.
 *
 * A selector across the top and one panel beneath it, rather than six stacked
 * cards: six actors times three capabilities is eighteen lines, of which
 * exactly one actor describes any given reader. All at once it is a wall;
 * chosen, it is three lines.
 *
 * Each capability carries its own icon rather than reusing the actor's — the
 * three lines are three different things, and one repeated glyph beside them
 * only says "this is a list", which the list already says.
 */
const ACTORS: Array<{
  key: string;
  icon: LucideIcon;
  features: [LucideIcon, LucideIcon, LucideIcon];
}> = [
  { key: 'actor1', icon: GraduationCap, features: [Compass, FileText, Target] },
  { key: 'actor2', icon: Briefcase, features: [Compass, TrendingUp, Search] },
  { key: 'actor3', icon: Users, features: [Users, Handshake, BadgeCheck] },
  { key: 'actor4', icon: Building2, features: [Send, Search, BarChart3] },
  { key: 'actor5', icon: Target, features: [TrendingUp, BarChart3, Handshake] },
  { key: 'actor6', icon: BookOpen, features: [Layers, BarChart3, BadgeCheck] },
];

const FEATURE_KEYS = ['F1', 'F2', 'F3'] as const;

export function EcosystemSection() {
  const t = useTranslations('landing');
  const isRtl = baseLocale(useLocale()) === 'ar';
  const [selected, setSelected] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusTab = (index: number) => {
    const next = (index + ACTORS.length) % ACTORS.length;
    setSelected(next);
    tabs.current[next]?.focus();
  };

  /*
   * WAI-ARIA's tabs pattern: arrows move between tabs, Home/End jump to the
   * ends, and the panel follows selection. The arrow keys are mirrored in
   * Arabic — "next" is the key pointing toward the end of the line, which is
   * ArrowLeft in RTL. Hardcoding ArrowRight-as-next would send an Arabic reader
   * backwards through the list every time.
   */
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const forward = isRtl ? 'ArrowLeft' : 'ArrowRight';
    const back = isRtl ? 'ArrowRight' : 'ArrowLeft';

    if (event.key === forward) focusTab(index + 1);
    else if (event.key === back) focusTab(index - 1);
    else if (event.key === 'Home') focusTab(0);
    else if (event.key === 'End') focusTab(ACTORS.length - 1);
    else return;

    event.preventDefault();
  };

  const active = ACTORS[selected]!;

  return (
    <section id="ecosystem" tabIndex={-1} className="scroll-mt-20 bg-gold-pale py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-xs font-bold text-gold-deep ltr:uppercase ltr:tracking-[0.2em]">
            {t('ecosystemEyebrow')}
          </p>
          <h2 className="mt-4 text-3xl font-bold leading-tight text-navy sm:text-4xl">
            {t('ecosystemTitle')}
          </h2>
          <span aria-hidden="true" className="mx-auto mt-4 block h-px w-12 bg-gold" />
          <p className="mt-4 leading-relaxed text-muted-foreground">{t('ecosystemBody')}</p>
        </div>

        <div
          role="tablist"
          aria-label={t('ecosystemTitle')}
          className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6"
        >
          {ACTORS.map(({ key, icon: Icon }, index) => {
            const isActive = index === selected;

            return (
              <button
                key={key}
                type="button"
                role="tab"
                id={`ecosystem-tab-${key}`}
                aria-selected={isActive}
                aria-controls="ecosystem-panel"
                /* Roving tabindex: one stop for the whole group, so Tab moves
                   past the tabs rather than through all six of them. */
                tabIndex={isActive ? 0 : -1}
                ref={(node) => {
                  tabs.current[index] = node;
                }}
                onClick={() => setSelected(index)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={cn(
                  'relative rounded-card border p-5 text-center transition-colors',
                  isActive ? 'border-gold/40 bg-surface' : 'border-transparent bg-surface/50',
                )}
              >
                <span
                  className={cn(
                    'mx-auto mb-3 flex size-12 items-center justify-center rounded-xl transition-colors',
                    isActive ? 'bg-navy text-white' : 'bg-navy/10 text-navy-soft',
                  )}
                >
                  <Icon aria-hidden="true" className="size-5" />
                </span>

                <span
                  className={cn(
                    'block text-sm font-semibold',
                    isActive ? 'text-navy' : 'text-navy-soft',
                  )}
                >
                  {t(`${key}Name`)}
                </span>

                {/* Hidden on the narrowest screens, where six of these are
                    already two columns deep and the caption would treble the
                    height of the selector. */}
                <span className="mt-1 hidden text-xs leading-relaxed text-muted-foreground sm:block">
                  {t(`${key}Desc`)}
                </span>

                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-2 start-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-gold rtl:translate-x-1/2"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id="ecosystem-panel"
          aria-labelledby={`ecosystem-tab-${active.key}`}
          /* Focusable so a keyboard reader can Tab straight from the chosen tab
             into the content it just revealed. */
          tabIndex={0}
          className="mt-8 rounded-card border border-border bg-surface p-8 shadow-sm lg:p-10"
        >
          <h3 className="sr-only">{t('actorFeaturesLabel', { actor: t(`${active.key}Name`) })}</h3>

          <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURE_KEYS.map((feature, index) => {
              const FeatureIcon = active.features[index]!;

              return (
                <div key={feature} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-navy/10">
                    <FeatureIcon aria-hidden="true" className="size-5 text-navy-soft" />
                  </span>
                  <div>
                    <dt className="text-sm font-semibold text-navy">
                      {t(`${active.key}${feature}`)}
                    </dt>
                    <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {t(`${active.key}${feature}Desc`)}
                    </dd>
                  </div>
                </div>
              );
            })}
          </dl>
        </div>
      </div>
    </section>
  );
}
