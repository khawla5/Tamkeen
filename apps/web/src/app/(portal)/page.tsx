'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { PortalPage } from '@/components/layout/portal-page';
import { usePortal } from '@/components/layout/portal-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useFormat } from '@/i18n/format-provider';

/**
 * The dashboard, in its three states (§4.2).
 *
 * The state is a single value from the API, so this renders one branch instead
 * of assembling a screen from several nullable fields — which is how a fourth,
 * unintended state gets rendered by accident. Each branch carries exactly one
 * primary action, per §3.
 */
export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const { user, dashboard } = usePortal();
  const format = useFormat();

  const greeting = t('greeting', { name: user.fullName });

  if (dashboard.state === 'PRE_ASSESSMENT') {
    return (
      <PortalPage title={t('title')}>
        <div className="mx-auto max-w-2xl">
          <p className="mb-4 text-muted-foreground">{greeting}</p>

          {/* One card, one action. §4.2: "near-empty. No empty widgets." */}
          <Card>
            <CardHeader>
              <CardTitle>{t('preAssessmentTitle')}</CardTitle>
              <CardDescription>{t('preAssessmentBody')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="lg">
                <Link href="/assessment">{t('startAssessment')}</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </PortalPage>
    );
  }

  if (dashboard.state === 'ASSESSED_NO_PATH') {
    return (
      <PortalPage title={t('title')}>
        <div className="mx-auto max-w-2xl">
          <p className="mb-4 text-muted-foreground">{greeting}</p>

          <Card>
            <CardHeader>
              <CardTitle>{t('assessedTitle')}</CardTitle>
              <CardDescription>
                {t('assessedBody', { code: dashboard.codeString ?? '' })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="lg">
                <Link href="/results">{t('choosePath')}</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </PortalPage>
    );
  }

  const path = dashboard.path!;
  const next = path.nextCourse;

  return (
    <PortalPage title={t('title')}>
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <p className="text-muted-foreground">{greeting}</p>

        {/* "Continue where you left off" — the single primary action (§4.2). */}
        <Card>
          <CardHeader>
            <CardTitle>{t('activeTitle')}</CardTitle>
            <CardDescription>
              {next ? t('activeNextCourse', { title: next.title }) : t('activeAllDone')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <Progress
              value={path.completedCount}
              max={path.totalCount}
              label={t('progressLabel')}
              valueText={t('progressValue', {
                completed: format.number(path.completedCount),
                total: format.number(path.totalCount),
              })}
            />

            {next ? (
              <Button asChild size="lg" className="self-start">
                <Link href={`/courses/${next.courseId}`}>{t('continueCourse')}</Link>
              </Button>
            ) : (
              <Button asChild size="lg" variant="outline" className="self-start">
                <Link href="/my-path">{t('viewMyPath')}</Link>
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Compact tiles — everything shown is actionable (§4.2). */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/my-path"
            className="rounded-card border border-border bg-card p-5 font-medium transition-colors hover:border-gold"
          >
            {t('tileMyPath')}
          </Link>
          <Link
            href="/courses"
            className="rounded-card border border-border bg-card p-5 font-medium transition-colors hover:border-gold"
          >
            {t('tileCourses')}
          </Link>
        </div>
      </div>
    </PortalPage>
  );
}
