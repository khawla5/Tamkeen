import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFormat } from '@/i18n/format-provider';

/**
 * `ArrowLeft` is the "forward" glyph here, not "back". This product is
 * RTL-only with no LTR toggle (D-024), and in RTL reading flow, forward
 * motion points visually start-to-end, i.e. left. Reaching for `ArrowRight`
 * and mirroring it would produce the same pixels through an extra step; using
 * the left-pointing glyph directly is the correct icon for this direction,
 * not a workaround.
 */
const HERO_PILL_KEYS = ['heroPill1', 'heroPill2', 'heroPill3'] as const;

/**
 * Real catalogue facts (apps/api/src/seed-data/catalog.ts — 12 seed paths,
 * two per RIASEC letter, 48 seeded courses) and the fixed RIASEC/journey
 * shape, not invented adoption metrics. A pre-launch government platform has
 * no "78% employment rate" to report yet, and the trust section already
 * commits to grounded claims over aspirational marketing (see its comment) —
 * this stat row holds the same line.
 */
const HERO_STATS: Array<{ key: string; value: number }> = [
  { key: 'heroStatSteps', value: 4 },
  { key: 'heroStatPaths', value: 12 },
  { key: 'heroStatCourses', value: 48 },
  { key: 'heroStatRiasec', value: 6 },
];

export function HeroSection() {
  const t = useTranslations('landing');
  const tAuth = useTranslations('auth');
  const { number } = useFormat();

  return (
    <section className="border-b border-border bg-cream">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <Badge>{t('eyebrow')}</Badge>

          <h1 className="mt-6 text-4xl font-extrabold leading-tight text-navy sm:text-5xl">
            {t('heroTitleLine1')}
            <br />
            {/* Large bold text clears the 3:1 AA threshold for gold (D-025);
                4.5:1 only applies at body size, which this isn't. */}
            <span className="text-gold">{t('heroTitleLine2')}</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            {t('heroBody')}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {HERO_PILL_KEYS.map((key) => (
              <Badge key={key} variant="soft">
                {t(key)}
              </Badge>
            ))}
          </div>

          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button asChild size="lg">
              <Link href="/register">
                {t('heroCta')}
                <ArrowLeft aria-hidden="true" />
              </Link>
            </Button>

            {/* Same-page jump to the four-step journey, not a route — a plain
                anchor is correct here, not next/link. */}
            <Button asChild size="lg" variant="outline">
              <a href="#how-it-works">{t('heroSecondaryCta')}</a>
            </Button>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            {tAuth('haveAccount')}{' '}
            <Link href="/login" className="font-medium text-navy underline underline-offset-4">
              {tAuth('signInLink')}
            </Link>
          </p>
        </div>

        {/* Catalogue scope, in numbers — see HERO_STATS for why these four and
            not usage metrics. A <dl>: each figure (term) is paired with what
            it counts (description). */}
        <dl className="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4">
          {HERO_STATS.map(({ key, value }) => (
            <div key={key} className="text-center">
              <dt className="text-3xl font-extrabold text-navy">{number(value)}</dt>
              <dd className="mt-1 text-xs text-muted-foreground">{t(`${key}Label`)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
