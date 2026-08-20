import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * `ArrowLeft` is the "forward" glyph here, not "back". This product is
 * RTL-only with no LTR toggle (D-024), and in RTL reading flow, forward
 * motion points visually start-to-end, i.e. left. Reaching for `ArrowRight`
 * and mirroring it would produce the same pixels through an extra step; using
 * the left-pointing glyph directly is the correct icon for this direction,
 * not a workaround.
 */
export function HeroSection() {
  const t = useTranslations('landing');
  const tAuth = useTranslations('auth');

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

          <div className="mt-10 flex flex-col items-center gap-4">
            <Button asChild size="lg">
              <Link href="/register">
                {t('heroCta')}
                <ArrowLeft aria-hidden="true" />
              </Link>
            </Button>

            <p className="text-sm text-muted-foreground">
              {tAuth('haveAccount')}{' '}
              <Link href="/login" className="font-medium text-navy underline underline-offset-4">
                {tAuth('signInLink')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
