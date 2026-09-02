'use client';

import type { DashboardActivity, DashboardView, RiasecLetter } from '@tamkeen/types';
import { Award, Lock } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { InstrumentTracker } from '@/components/dashboard/instrument-tracker';
import { JourneyTracker } from '@/components/dashboard/journey-tracker';
import { CefrLevelBadge } from '@/components/english/cefr-level-badge';
import { PortalPage } from '@/components/layout/portal-page';
import { usePortal } from '@/components/layout/portal-provider';
import { HollandCodeChips } from '@/components/riasec/holland-code-chips';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cardVariants,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useFormat } from '@/i18n/format-provider';
import type { CurrentUser } from '@/lib/api-client';
import { cn } from '@/lib/utils';

/**
 * The dashboard, in its three states (§4.2), made meaningful (TAM-123).
 *
 * The state is a single value from the API, so this renders one branch instead
 * of assembling a screen from several nullable fields — which is how a fourth,
 * unintended state gets rendered by accident. Each branch still carries exactly
 * one primary action (§3); what changed is that the page now also tells the
 * user where they are (the tracker), who they are (the header), and what is
 * next or what just happened — information, never a competing action.
 */
export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const { user, dashboard } = usePortal();

  return (
    <PortalPage title={t('title')}>
      <div className="flex flex-col gap-6">
        <PersonalHeader user={user} />
        <Card>
          <CardContent className="py-5">
            <JourneyTracker dashboard={dashboard} />
          </CardContent>
        </Card>

        {/*
         * One stage per required instrument (§4.2 part 3, D-095, TAM-147).
         * Renders nothing once there is only the baseline RIASEC assignment
         * — see the component for why.
         */}
        <InstrumentTracker dashboard={dashboard} />

        {dashboard.state === 'PRE_ASSESSMENT' ? (
          <PreAssessment />
        ) : dashboard.state === 'ASSESSED_NO_PATH' ? (
          <AssessedNoPath dashboard={dashboard} />
        ) : (
          <ActivePath dashboard={dashboard} />
        )}

        {/*
         * The English placement test (§4.13, D-123), in every state and below
         * the state's own card.
         *
         * It is independent of the Holland journey, so it does not belong inside
         * any of the three branches — and it must not compete with them. §4.2
         * gives each state one primary action; this card's action is secondary
         * (an outline button, beneath), so a new employee's single primary
         * action is still «ابدأ التقييم» for the career assessment.
         */}
        <EnglishCard level={dashboard.englishLevel} />

        {dashboard.recentActivity.length > 0 ? (
          <ActivityFeed activity={dashboard.recentActivity} />
        ) : null}
      </div>
    </PortalPage>
  );
}

/**
 * Who this page belongs to — the greeting only. The department and employee
 * number moved into the shell header (D-096): chrome, not page content, so
 * they are visible on every screen instead of one.
 */
function PersonalHeader({ user }: { user: CurrentUser }) {
  const t = useTranslations('dashboard');

  return (
    <p className="text-lg font-semibold text-foreground">
      {t('greeting', { name: user.fullName })}
    </p>
  );
}

function PreAssessment() {
  const t = useTranslations('dashboard');

  return (
    /* One card, one action. */
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
  );
}

/**
 * The English placement test, in both of its states (§4.13, D-123).
 *
 * One card rather than two, because it is the same card: it names the
 * instrument and offers the one thing that applies — take it, or read the level
 * — which is §3's context-dependent action rule, not a branch of the dashboard's
 * own state machine.
 *
 * Never a primary button. The dashboard's primary action belongs to whichever
 * of the three states the learner is in; this is a second, optional thing they
 * may do, and rendering it at equal weight would put two competing calls on a
 * page §4.2 says should have one.
 */
function EnglishCard({ level }: { level: DashboardView['englishLevel'] }) {
  const t = useTranslations('english');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('cardTitle')}</CardTitle>
        <CardDescription>{level ? t('cardTakenBody') : t('cardBody')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        {level ? (
          <>
            <CefrLevelBadge level={level} />
            <Button asChild variant="outline">
              <Link href="/english-assessment/result">{t('viewResult')}</Link>
            </Button>
          </>
        ) : (
          <Button asChild variant="outline">
            <Link href="/english-assessment">{t('start')}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function AssessedNoPath({ dashboard }: { dashboard: DashboardView }) {
  const t = useTranslations('dashboard');
  const tRiasec = useTranslations('riasec');

  return (
    <>
      {/* The result as Arabic chips, not the Latin code. Explanation and the
          retake live on Results — this card has one job: send the user there. */}
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

      {dashboard.recommendedPaths.length > 0 ? (
        /* The decision is the most meaningful thing this state can hold: the top
           recommendations, in the user's rank order, each opening its path page.
           Results owns the full ranking and the explanation. */
        <section aria-labelledby="recommended-heading" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="recommended-heading" className="text-lg font-semibold text-foreground">
              {t('recommendedHeading')}
            </h2>
            <Link
              href="/results"
              className="text-sm font-medium text-primary-700 underline-offset-4 hover:underline"
            >
              {t('viewAllPaths')}
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">{t('recommendedBody')}</p>
          <ul className="grid gap-3 sm:grid-cols-3">
            {dashboard.recommendedPaths.map((path) => (
              <li key={path.id}>
                <Link
                  href={`/paths/${path.id}`}
                  className={cn(
                    cardVariants({ variant: 'selected' }),
                    'flex h-full flex-col gap-1 p-4 transition-colors hover:bg-primary-50',
                  )}
                >
                  <span className="font-semibold text-foreground">{path.name}</span>
                  <span className="text-sm text-primary-700">
                    {tRiasec(`${path.riasecLetter}.name`)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function ActivePath({ dashboard }: { dashboard: DashboardView }) {
  const t = useTranslations('dashboard');
  const tRiasec = useTranslations('riasec');
  const tMyPath = useTranslations('myPath');
  const format = useFormat();

  const path = dashboard.path!;
  const next = path.nextCourse;
  const notStarted = path.totalCount - path.completedCount - path.inProgressCount;
  const counts = [
    { key: 'statusCompleted', value: path.completedCount },
    { key: 'statusInProgress', value: path.inProgressCount },
    { key: 'statusNotStarted', value: notStarted },
  ] as const;

  return (
    <>
      {/* The status strip: which path, and how the courses break down. Pure
          information — nothing here is a link.
          Four tiles, deliberately equal-width grid cells at every breakpoint:
          `grid-cols-2` wraps them 2×2 below `sm` (the path tile is not
          spanned wide there — a spanned first row reads as one wide tile
          plus a dangling three, not the 2×2 the acceptance criteria call
          for), and `sm:grid-cols-[2fr_1fr_1fr_1fr]` widens just the path
          tile once there is room for the desktop row from the mockup. */}
      <ul
        aria-label={t('statusHeading')}
        className="grid grid-cols-2 gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]"
      >
        <li className={cn(cardVariants(), 'flex flex-col justify-center px-4 py-3')}>
          <span className="text-sm font-bold text-foreground">{path.name}</span>
          <span className="text-xs font-medium text-primary-700">
            {tRiasec(`${path.riasecLetter}.name`)}
          </span>
        </li>
        {counts.map(({ key, value }) => (
          <li key={key} className={cn(cardVariants(), 'flex flex-col justify-center px-4 py-3')}>
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

      <div className="grid gap-6 md:grid-cols-[3fr_2fr]">
        {dashboard.upcomingCourses.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('upcomingHeading')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ol
                aria-label={t('upcomingHeading')}
                className="flex flex-col divide-y divide-border"
              >
                {dashboard.upcomingCourses.map((course) => (
                  <li key={course.id} className="flex items-center justify-between gap-3 py-3">
                    <Link
                      href={`/courses/${course.courseId}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {course.title}
                    </Link>
                    <Badge variant={course.status === 'IN_PROGRESS' ? 'primary' : 'soft'}>
                      {course.status === 'IN_PROGRESS'
                        ? tMyPath('statusInProgress')
                        : tMyPath('statusNotStarted')}
                    </Badge>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        ) : null}

        <section
          aria-labelledby="latest-certificate-heading"
          className={cn(cardVariants(), 'flex flex-col gap-3 p-6')}
        >
          <h2 id="latest-certificate-heading" className="text-lg font-semibold text-foreground">
            {t('latestCertificateHeading')}
          </h2>
          {dashboard.latestCertificate ? (
            <>
              <div className="flex items-start gap-3">
                <Award aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary-700" />
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium text-foreground">
                    {dashboard.latestCertificate.subjectTitle}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {dashboard.latestCertificate.type === 'PATH'
                      ? t('latestCertificatePath')
                      : t('latestCertificateCourse')}
                    <span aria-hidden="true"> · </span>
                    {format.date(new Date(dashboard.latestCertificate.issuedAt))}
                  </span>
                </div>
              </div>
              <Link
                href="/certificates"
                className="self-start text-sm font-medium text-primary-700 underline-offset-4 hover:underline"
              >
                {t('viewCertificates')}
              </Link>
            </>
          ) : (
            <div className="flex items-start gap-3 text-sm text-muted-foreground">
              <Lock aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-neutral-400" />
              <p>{t('noCertificateYet')}</p>
            </div>
          )}
        </section>
      </div>

      {/* Compact tiles — everything shown is actionable (§4.2). */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ['/my-path', 'tileMyPath'],
            ['/courses', 'tileCourses'],
            ['/certificates', 'tileCertificates'],
            ['/cv', 'tileCv'],
          ] as const
        ).map(([href, key]) => (
          <Link
            key={href}
            href={href}
            className={cn(
              cardVariants(),
              'p-5 font-medium transition-colors hover:border-primary-600',
            )}
          >
            {t(key)}
          </Link>
        ))}
      </div>
    </>
  );
}

function ActivityFeed({ activity }: { activity: DashboardActivity[] }) {
  const t = useTranslations('dashboard');
  const format = useFormat();

  return (
    <section aria-labelledby="activity-heading" className="flex flex-col gap-3">
      <h2 id="activity-heading" className="text-lg font-semibold text-foreground">
        {t('activityHeading')}
      </h2>
      <ol
        aria-label={t('activityHeading')}
        className={cn(cardVariants(), 'flex flex-col divide-y divide-border')}
      >
        {activity.map((event) => (
          <li
            key={`${event.kind}-${event.at}`}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3"
          >
            <span className="text-sm text-foreground">
              {t(`activity.${event.kind}`, { title: event.title ?? '' })}
            </span>
            <time dateTime={event.at} className="text-xs text-muted-foreground">
              {format.date(new Date(event.at))}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}
