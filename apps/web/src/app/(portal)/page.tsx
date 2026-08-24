'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { PortalPage } from '@/components/layout/portal-page';
import { usePortal } from '@/components/layout/portal-provider';
import { Button } from '@/components/ui/button';
import { HollandCodeChips } from '@/components/riasec/holland-code-chips';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useFormat } from '@/i18n/format-provider';

import type { RiasecLetter } from '@tamkeen/types';

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
  const tRiasec = useTranslations('riasec');
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

          {/* The result as Arabic chips, not the Latin code (D-071/TAM-108).
              Explanation, the gold ranking and the retake live on Results —
              this card has one job: send the user there. */}
          <Card>
            <CardHeader>
              <CardTitle>{t('assessedTitle')}</CardTitle>
              <CardDescription>{t('assessedBody')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <HollandCodeChips code={(dashboard.codeString ?? '').split('') as RiasecLetter[]} />
              <Button asChild size="lg" className="self-start">
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
  const notStarted = path.totalCount - path.completedCount - path.inProgressCount;
  const counts = [
    { key: 'statusCompleted', value: path.completedCount },
    { key: 'statusInProgress', value: path.inProgressCount },
    { key: 'statusNotStarted', value: notStarted },
  ] as const;

  return (
    <PortalPage title={t('title')}>
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <p className="text-muted-foreground">{greeting}</p>

        {/* The status strip (TAM-108): which path, and how the courses break
            down. Pure information — nothing here is a link, so it cannot
            compete with the one action below. */}
        <ul
          aria-label={t('statusHeading')}
          className="grid grid-cols-2 gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]"
        >
          <li className="col-span-2 flex flex-col justify-center rounded-card border border-border bg-card px-4 py-3 sm:col-span-1">
            <span className="text-sm font-bold text-foreground">{path.name}</span>
            <span className="text-xs font-medium text-primary-700">
              {tRiasec(`${path.riasecLetter}.name`)}
            </span>
          </li>
          {counts.map(({ key, value }) => (
            <li
              key={key}
              className="flex flex-col justify-center rounded-card border border-border bg-card px-4 py-3"
            >
              <span data-count className="text-xl font-bold text-foreground tabular-nums">
                {format.number(value)}
              </span>
              <span className="text-xs text-muted-foreground">{t(key)}</span>
            </li>
          ))}
        </ul>

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/my-path"
            className="rounded-card border border-border bg-card p-5 font-medium transition-colors hover:border-primary-600"
          >
            {t('tileMyPath')}
          </Link>
          <Link
            href="/courses"
            className="rounded-card border border-border bg-card p-5 font-medium transition-colors hover:border-primary-600"
          >
            {t('tileCourses')}
          </Link>
          <Link
            href="/certificates"
            className="rounded-card border border-border bg-card p-5 font-medium transition-colors hover:border-primary-600"
          >
            {t('tileCertificates')}
          </Link>
          <Link
            href="/cv"
            className="rounded-card border border-border bg-card p-5 font-medium transition-colors hover:border-primary-600"
          >
            {t('tileCv')}
          </Link>
        </div>
      </div>
    </PortalPage>
  );
}
