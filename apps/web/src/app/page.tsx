import { getTranslations } from 'next-intl/server';

import { formatDate, formatFraction, formatNumber, formatPercent } from '@tamkeen/types';

import { getFormatContext } from '@/i18n/config';

/**
 * Temporary Phase 0 landing page. It doubles as the Checkpoint B evidence: every
 * string comes from the catalog, and every number/date goes through the single
 * formatting layer, so flipping NUMBER_FORMAT changes all of them at once.
 * Replaced by the real dashboard in Phase 1.
 */
export default async function HomePage() {
  const t = await getTranslations('home');
  const context = getFormatContext();

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold text-navy">{t('title')}</h1>
      <p className="text-muted">{t('intro')}</p>

      <section aria-labelledby="sample-heading" className="rounded-lg bg-surface p-6">
        <h2 id="sample-heading" className="mb-3 text-lg font-semibold text-navy">
          {t('sampleHeading')}
        </h2>
        <dl className="space-y-1 text-navy-soft">
          <div>{t('sampleCourses', { count: formatNumber(1248, context) })}</div>
          <div>
            {t('sampleCounter', {
              selected: formatNumber(4, context),
              min: formatNumber(5, context),
              max: formatNumber(10, context),
            })}
          </div>
          <div>{t('sampleGrade', { grade: formatPercent(85, context) })}</div>
          <div>{t('sampleDate', { date: formatDate(new Date('2026-08-17'), context) })}</div>
          <div>{formatFraction(3, 7, context)}</div>
        </dl>
      </section>
    </main>
  );
}
