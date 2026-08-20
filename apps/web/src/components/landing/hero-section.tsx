import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { HeroBackdrop } from '@/components/landing/hero-backdrop';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCountUp } from '@/components/landing/use-count-up';
import { useFormat } from '@/i18n/format-provider';
import { cn } from '@/lib/utils';

/**
 * `ArrowLeft` is the "forward" glyph here, not "back": in Arabic's right-to-
 * left reading flow, onward motion points left. Since the page can now also be
 * read in English (D-041), the glyph is rotated back under `ltr:` rather than
 * swapped for `ArrowRight` — one icon that follows the reading direction, not
 * two that must be kept in agreement about which way "forward" is.
 */
const HERO_PILL_KEYS = ['heroPill1', 'heroPill2', 'heroPill3'] as const;

/**
 * The four headline figures.
 *
 * PROVENANCE — read before changing or reusing these. They are marketing copy
 * supplied by the product owner, NOT derived from anything in this repository:
 * nothing here counts placements, assessed students, or an employment rate, and
 * no query would reproduce them. A previous version of this section carried
 * catalogue facts (paths, courses, RIASEC dimensions) that could be checked
 * against `apps/api/src/seed-data/catalog.ts`; these cannot. Publishing the page
 * asserts them, so they need an owner who stands behind them and a date they
 * were last confirmed — treat them as content awaiting sign-off, not as data.
 *
 * `suffix` is a marketing mark, not a unit, which is why it lives here rather
 * than in the catalog. Note the deliberate DOM order: value then suffix. In an
 * RTL paragraph the bidi algorithm renders a trailing "+" to the *left* of the
 * digits ("+1,247") while "%" binds to them and stays on the right ("78%") —
 * which is exactly how the reference design reads, obtained by writing the
 * markup in logical order rather than by hand-placing either mark.
 */
interface HeroStat {
  key: string;
  value: number;
  suffix?: string;
  percent?: boolean;
}

const HERO_STATS: HeroStat[] = [
  { key: 'heroStatEmployment', value: 78, percent: true },
  { key: 'heroStatAssessed', value: 1247, suffix: '+' },
  { key: 'heroStatCoop', value: 312, suffix: '+' },
  { key: 'heroStatPaths', value: 18, suffix: '+' },
];

/**
 * One figure, counting up to its value on load.
 *
 * Its own component because `useCountUp` is a hook and the four stats are a
 * `map` — calling a hook inside that loop is the rule React does not bend.
 *
 * THREE COPIES OF THE SAME NUMBER, each answering a different reader:
 *
 *   1. The counting one. Starts at zero so the server's first paint and the
 *      animation's first frame agree — see `use-count-up.ts` for the snap this
 *      avoids. CSS removes it outright under `prefers-reduced-motion`.
 *   2. The static one, shown by that same media query. It is correct from the
 *      very first paint with no JavaScript involved, which is the only way to
 *      honour the preference before hydration has had a chance to run.
 *   3. The visually-hidden one, and the ONLY copy in the accessibility tree.
 *      The number is announced once, at its final value: a live count would be
 *      re-announced on every tick, or read at whatever arbitrary point the
 *      screen reader happened to reach it — "طلاب مقيَّمون ٤١٣" is worse than no
 *      animation at all. The suffix rides along so the spoken figure is
 *      "1,247+" rather than a bare "1,247".
 */
function HeroStatFigure({ stat, isAccent }: { stat: HeroStat; isAccent: boolean }) {
  const t = useTranslations('landing');
  const { number, percent } = useFormat();
  const counted = useCountUp(stat.value);

  const render = (value: number) => (stat.percent ? percent(value) : number(value));

  const suffix = stat.suffix ? (
    <span className="align-super text-xl text-muted-foreground">{stat.suffix}</span>
  ) : null;

  return (
    <div className="text-start">
      {/* Only the leading figure is gold — one accent, so it still reads as an
          accent (§3: keep gold scarce). At 36px extrabold the 3:1 large-text
          threshold applies and gold clears it. */}
      <dt className={cn('text-4xl font-extrabold', isAccent ? 'text-gold' : 'text-navy')}>
        <span aria-hidden="true" className="motion-reduce:hidden">
          {render(counted)}
          {suffix}
        </span>

        <span aria-hidden="true" className="hidden motion-reduce:inline">
          {render(stat.value)}
          {suffix}
        </span>

        <span className="sr-only">
          {render(stat.value)}
          {stat.suffix}
        </span>
      </dt>
      <dd className="mt-1 text-xs font-medium leading-snug text-navy-soft">
        {t(`${stat.key}Label`)}
      </dd>
    </div>
  );
}

export function HeroSection() {
  const t = useTranslations('landing');

  return (
    <section id="top" tabIndex={-1} className="relative isolate overflow-hidden scroll-mt-20">
      <HeroBackdrop />

      <div className="mx-auto max-w-6xl px-4 pt-14 pb-16 sm:px-6 sm:pt-20 sm:pb-20">
        <div className="max-w-2xl text-start">
          {/*
            The reference sets this eyebrow in tracked uppercase gold. Two of
            those three carry over unchanged; the casing and tracking do not,
            because Arabic is cursive — letter-spacing pulls joined letters
            apart — and has no uppercase to set it in. So they are applied under
            `ltr:` only, and each language gets the treatment that suits it.

            The gold is `gold-deep` (5.25:1 on white), the one gold in the
            palette that may carry text this small; plain `gold` would be
            3.74:1 and fail (globals.css / D-042).
          */}
          <p className="text-xs font-bold text-gold-deep ltr:uppercase ltr:tracking-[0.2em]">
            {t('eyebrow')}
          </p>

          <h1 className="mt-5 text-4xl font-extrabold leading-[1.2] text-navy sm:text-5xl">
            {t('heroTitleLine1')}
            <br />
            {/* Large bold text clears the 3:1 AA threshold for gold (D-025);
                4.5:1 only applies at body size, which this isn't. */}
            <span className="text-gold">{t('heroTitleLine2')}</span>
          </h1>

          {/* navy-soft, not muted: muted fails AA over the backdrop's tints —
              see hero-backdrop.tsx and src/lib/contrast.test.ts. Hierarchy
              below the headline comes from weight and size here, not from a
              lighter grey. */}
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-navy-soft">{t('heroBody')}</p>

          <div className="mt-7 flex flex-wrap items-center gap-2">
            {HERO_PILL_KEYS.map((key) => (
              <Badge key={key} variant="soft" className="bg-surface/75">
                {t(key)}
              </Badge>
            ))}
          </div>

          <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg" className="rounded-full px-7">
              <Link href="/register">
                {t('heroCta')}
                <ArrowLeft aria-hidden="true" className="ltr:rotate-180" />
              </Link>
            </Button>

            {/* Same-page jump to the four-step journey, not a route — a plain
                anchor is correct here, not next/link. */}
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full border-gold/60 bg-surface/75 px-7 hover:bg-surface"
            >
              <a href="#features">
                {t('heroSecondaryCta')}
                <ArrowLeft aria-hidden="true" className="ltr:rotate-180" />
              </a>
            </Button>
          </div>
        </div>

        {/* See HERO_STATS for where these figures come from — they are not
            computed from anything. A <dl>: each figure (term) is paired with
            what it counts (description). Labels are navy-soft, not muted,
            because they sit lowest in the hero where the bands are densest. */}
        <dl className="mt-12 grid max-w-3xl grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-4">
          {HERO_STATS.map((stat, index) => (
            <HeroStatFigure key={stat.key} stat={stat} isAccent={index === 0} />
          ))}
        </dl>
      </div>
    </section>
  );
}
