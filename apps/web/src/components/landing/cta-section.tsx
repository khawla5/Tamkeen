'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useFormat } from '@/i18n/format-provider';

/**
 * The closing invitation, with a stylised view of the dashboard beneath it.
 *
 * The mock is a *picture of a screen*, not page copy, which is why its labels
 * live here rather than in the message catalogs — the same call already made
 * for the logotype and the language switcher's endonyms. The whole frame is
 * `aria-hidden` behind one accessible description: read aloud, a list of
 * disconnected numbers and field names tells a screen-reader user nothing the
 * heading above it has not already said.
 *
 * Every figure in it is illustrative and comes from the reference design, not
 * from anything this application computes.
 */
const MOCK_STATS: Array<{ label: string; value: number; percent?: boolean }> = [
  { label: 'Skills Record', value: 87, percent: true },
  { label: 'Applications', value: 12 },
  { label: 'Match Rate', value: 94, percent: true },
];

const MOCK_URL = 'tamkeen.imamu.edu.sa/dashboard';
const MOCK_COMPLETION = 78;

export function CtaSection() {
  const t = useTranslations('landing');
  const { number, percent } = useFormat();

  return (
    <section id="cta" tabIndex={-1} className="scroll-mt-20 bg-ink py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="text-center">
          <span className="inline-flex rounded-full bg-white/10 px-4 py-1.5 text-xs font-bold text-gold-light ltr:uppercase ltr:tracking-wider">
            {t('problemEyebrow')}
          </span>

          <h2 className="mt-8 text-3xl font-extrabold leading-tight text-white sm:text-4xl lg:text-5xl">
            {t('ctaTitle')}
          </h2>

          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/60">
            {t('ctaBody')}
          </p>

          <div className="mt-10">
            <Button asChild size="lg" variant="achievement" className="rounded-full px-7">
              <Link href="/register">
                {t('headerCta')}
                <ArrowLeft aria-hidden="true" className="ltr:rotate-180" />
              </Link>
            </Button>
          </div>
        </div>

        <figure className="mx-auto mt-16 max-w-2xl">
          <div
            aria-hidden="true"
            /* `dir="ltr"`: this is a browser window, and browser chrome does
               not mirror — the address bar reads left to right whatever the
               page around it does. */
            dir="ltr"
            className="overflow-hidden rounded-card border border-white/10 bg-white/5 shadow-sm"
          >
            <div className="flex items-center gap-3 border-b border-white/10 bg-white/5 px-4 py-3">
              <div className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-white/25" />
                <span className="size-2.5 rounded-full bg-white/25" />
                <span className="size-2.5 rounded-full bg-white/25" />
              </div>
              <div className="flex flex-1 justify-center">
                <span className="rounded-md bg-white/10 px-8 py-1 text-[10px] text-white/40">
                  {MOCK_URL}
                </span>
              </div>
            </div>

            <div className="space-y-4 p-6">
              <div className="grid grid-cols-3 gap-3">
                {MOCK_STATS.map(({ label, value, percent: isPercent }) => (
                  <div
                    key={label}
                    className="rounded-xl border border-white/10 bg-white/5 p-3 text-center"
                  >
                    <p className="text-xl font-extrabold text-gold-light">
                      {isPercent ? percent(value) : number(value)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-white/40">{label}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="text-white/50">Profile Completion</span>
                  <span className="font-bold text-gold-light">{percent(MOCK_COMPLETION)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-[78%] rounded-full bg-gold" />
                </div>
              </div>
            </div>
          </div>

          <figcaption className="sr-only">{t('ctaMockAlt')}</figcaption>
        </figure>
      </div>
    </section>
  );
}
