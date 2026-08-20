import { ArrowLeft, GraduationCap, Briefcase, Users, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useFormat } from '@/i18n/format-provider';

/**
 * The same platform seen from three starting points — a student, a graduate,
 * and a faculty advisor — each as an ordered list of the steps that person
 * takes.
 *
 * `steps` differs per journey (seven, six, six) rather than being padded to a
 * common length: a journey with a made-up seventh step to square the columns
 * would be describing the layout instead of the product.
 *
 * Distinct from the four-step section above it, and the distinction is worth
 * keeping: that one is what the *platform* does, in order; this is what each
 * *person* does. If these ever start saying the same thing, one of them should
 * be deleted rather than both kept.
 */
const JOURNEYS: Array<{ key: string; icon: LucideIcon; steps: number }> = [
  { key: 'journey1', icon: GraduationCap, steps: 7 },
  { key: 'journey2', icon: Briefcase, steps: 6 },
  { key: 'journey3', icon: Users, steps: 6 },
];

export function JourneysSection() {
  const t = useTranslations('landing');
  const { number } = useFormat();

  return (
    <section id="how-it-works" tabIndex={-1} className="scroll-mt-20 bg-surface py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold text-gold-deep ltr:uppercase ltr:tracking-[0.2em]">
            {t('journeysEyebrow')}
          </p>
          <h2 className="mt-4 text-3xl font-bold text-navy sm:text-4xl">{t('journeysTitle')}</h2>
          <span aria-hidden="true" className="mx-auto mt-6 block h-px w-16 bg-gold" />
          <p className="mt-6 leading-relaxed text-muted-foreground">{t('journeysBody')}</p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {JOURNEYS.map(({ key, icon: Icon, steps }) => (
            <div
              key={key}
              className="flex flex-col rounded-card border border-border bg-cream p-6 sm:p-7"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface ring-1 ring-border">
                  <Icon aria-hidden="true" className="size-5 text-navy-soft" />
                </span>
                <div>
                  <h3 className="font-semibold text-navy">{t(`${key}Title`)}</h3>
                  <p className="text-sm text-muted-foreground">{t(`${key}Body`)}</p>
                </div>
              </div>

              <ol className="mt-6 flex flex-1 flex-col gap-2.5">
                {Array.from({ length: steps }, (_, index) => (
                  <li key={index} className="flex items-start gap-3">
                    {/* The step number is decorative — the <ol> already conveys
                        the order to assistive technology, so announcing it a
                        second time would just be noise. */}
                    <span
                      aria-hidden="true"
                      className="mt-px flex size-6 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-bold text-navy-soft ring-1 ring-border"
                    >
                      {number(index + 1)}
                    </span>
                    <span className="text-sm leading-relaxed text-navy">
                      {t(`${key}Step${index + 1}`)}
                    </span>
                  </li>
                ))}
              </ol>

              <Button asChild variant="outline" className="mt-7 rounded-full bg-surface">
                <Link href="/register">
                  {t(`${key}Cta`)}
                  <ArrowLeft aria-hidden="true" className="ltr:rotate-180" />
                </Link>
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
