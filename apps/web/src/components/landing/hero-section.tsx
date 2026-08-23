import { ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { SaudiMap } from '@/components/brand/saudi-map';
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
/**
 * The hero of a government front page: who this is for, what it does, and the
 * one thing to do next — one sentence from the BRD's executive summary (§1)
 * and the registration rule (BR-101), in the ministry's own register. No
 * feature pills, no stat row: the paragraph carries the message.
 *
 * Two columns from `lg`: the text block on the start edge; on the end edge the
 * ministry emblem over the Kingdom's map, the map revealing region by region. The emblem is decorative here (`alt=""`) —
 * the header already names the ministry, and naming it twice in a row is
 * exactly the duplicate announcement the header tests guard against.
 *
 * No stat row. An internal platform does not need to prove its scale to its
 * own employees, and the only honest figures (path and course counts) belong
 * in the catalogue, where they change.
 */
export function HeroSection() {
  const t = useTranslations('landing');
  const tAuth = useTranslations('auth');

  return (
    <section className="bg-primary-deep text-surface">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:py-24">
        <div className="flex max-w-2xl flex-col items-start text-start">
          <Badge variant="onColor">{t('eyebrow')}</Badge>

          <h1 className="mt-6 text-4xl font-extrabold leading-tight text-surface sm:text-5xl">
            {t('heroTitle')}
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-primary-50">{t('heroBody')}</p>

          <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <Button asChild size="lg" variant="onColor">
              <Link href="/register">
                {t('heroCta')}
                <ArrowLeft aria-hidden="true" />
              </Link>
            </Button>

            {/* Same-page jump to the explorer, not a route — a plain anchor is
                correct here, not next/link. */}
            <Button asChild size="lg" variant="outlineOnColor">
              <a href="#about">{t('heroSecondaryCta')}</a>
            </Button>
          </div>

          <p className="mt-4 text-sm text-primary-50/90">{t('heroEligibility')}</p>

          <p className="mt-2 text-sm text-primary-50/90">
            {tAuth('haveAccount')}{' '}
            <Link href="/login" className="font-medium text-surface underline underline-offset-4">
              {tAuth('signInLink')}
            </Link>
          </p>
        </div>

        {/* Owner over territory: the emblem above, the Kingdom's map — every
            region named — beneath it. Both decorative; see SaudiMap. */}
        <div className="hidden flex-col items-center gap-5 rounded-2xl bg-surface/10 p-6 ring-1 ring-surface/15 lg:flex">
          <div className="flex size-36 items-center justify-center rounded-full bg-surface shadow-md">
            <Image
              src="/brand/MOI.svg"
              alt=""
              width={112}
              height={112}
              priority
              unoptimized
              className="size-28"
            />
          </div>
          <SaudiMap />
        </div>
      </div>
    </section>
  );
}
