import { getTranslations } from 'next-intl/server';

import { formatDate, formatNumber, formatPercent } from '@tamkeen/types';

import { AppShell } from '@/components/layout/app-shell';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getFormatContext } from '@/i18n/config';

/**
 * Temporary Phase 0 page. It is the Checkpoint C evidence: the shell in the
 * brand palette, the three mandatory data states side by side, and the
 * formatting layer in use. Phase 1 replaces it with the real dashboard.
 */
export default async function FoundationsPage() {
  const t = await getTranslations('foundations');
  const context = getFormatContext();

  return (
    <AppShell title={t('title')} action={<Button>{t('primaryAction')}</Button>}>
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <p className="text-muted-foreground">{t('intro')}</p>

        <Card>
          <CardHeader>
            <CardTitle>{t('statesHeading')}</CardTitle>
            <CardDescription>{t('statesBody')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-3">
            <section aria-label={t('loadingLabel')}>
              <LoadingState rows={2} />
            </section>
            <section aria-label={t('emptyLabel')}>
              <EmptyState
                className="h-full"
                action={
                  <Button variant="outline" size="sm">
                    {t('emptyActionExample')}
                  </Button>
                }
              />
            </section>
            <section aria-label={t('errorLabel')}>
              <ErrorState className="h-full" />
            </section>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('formatHeading')}</CardTitle>
            <CardDescription>{t('formatBody')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>{t('sampleCourses', { count: formatNumber(1248, context) })}</p>
            <p>
              {t('sampleCounter', {
                selected: formatNumber(4, context),
                min: formatNumber(5, context),
                max: formatNumber(10, context),
              })}
            </p>
            <p>{t('sampleGrade', { grade: formatPercent(85, context) })}</p>
            <p>{t('sampleDate', { date: formatDate(new Date('2026-08-17'), context) })}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('buttonsHeading')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button>{t('primaryAction')}</Button>
            <Button variant="achievement">{t('achievementAction')}</Button>
            <Button variant="outline">{t('outlineAction')}</Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
