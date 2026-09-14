'use client';

import type { DashboardActivity, DashboardPath } from '@tamkeen/types';
import { Award, Lock } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { JourneyTracker } from '@/components/dashboard/journey-tracker';
import { PortalPage } from '@/components/layout/portal-page';
import { usePortal } from '@/components/layout/portal-provider';
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
 * The dashboard, in its two states (§4.2, D-134).
 *
 * The state is a single value from the API, so this renders one branch instead
 * of assembling a screen from several nullable fields — which is how a third,
 * unintended state gets rendered by accident.
 *
 * **The two questions are the ministry's, not the learner's.** Have they been
 * given a path, and have they sat its assessment. Nobody chooses a path here and
 * nothing recommends one, so the old middle state — assessed, still deciding —
 * has no meaning left.
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

        {dashboard.state === 'NO_PATH' ? (
          <NoPath />
        ) : (
          <ul className="flex flex-col gap-6">
            {dashboard.paths.map((path) => (
              <li key={path.id}>
                <PathCard path={path} />
              </li>
            ))}
          </ul>
        )}

        {dashboard.state !== 'NO_PATH' ? <Tiles /> : null}

        {dashboard.state === 'ACTIVE_PATH' ? (
          <LatestCertificate certificate={dashboard.latestCertificate} />
        ) : null}

        {dashboard.recentActivity.length > 0 ? (
          <ActivityFeed activity={dashboard.recentActivity} />
        ) : null}
      </div>
    </PortalPage>
  );
}

/**
 * Who this page belongs to — the greeting only. The department and employee
 * number live in the shell header (D-096): chrome, not page content, so they are
 * visible on every screen instead of one.
 */
function PersonalHeader({ user }: { user: CurrentUser }) {
  const t = useTranslations('dashboard');

  return (
    <p className="text-lg font-semibold text-foreground">
      {t('greeting', { name: user.fullName })}
    </p>
  );
}

/**
 * No path assigned: information, not a dead button (D-130).
 *
 * There is nothing for this employee to do, and inventing an action — browse
 * the catalogue, express a preference — would misdescribe a product where the
 * ministry decides. What the card owes them is the truth and where it will come
 * from.
 */
function NoPath() {
  const t = useTranslations('dashboard');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('noPathTitle')}</CardTitle>
        <CardDescription>{t('noPathBody')}</CardDescription>
      </CardHeader>
    </Card>
  );
}

/**
 * One assigned path, in whichever of its two states it is in.
 *
 * Awaiting placement, the single action is the assessment — and no progress is
 * shown, because "0 من 0" would tell the learner the path is empty when it is
 * simply not yet theirs to start.
 */
function PathCard({ path }: { path: DashboardPath }) {
  const t = useTranslations('dashboard');
  const tMyPath = useTranslations('myPath');
  const format = useFormat();

  if (!path.placedLevel) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{path.name}</CardTitle>
          <CardDescription>{t('awaitingPlacementBody')}</CardDescription>
        </CardHeader>
        <CardContent>
          {path.pendingAssessmentId ? (
            <Button asChild size="lg">
              <Link href={`/paths/${path.id}/assessment`}>{t('startAssessment')}</Link>
            </Button>
          ) : (
            /* The path has no published assessment yet — the administrator's
               problem, surfaced honestly rather than as a button that fails. */
            <p className="text-sm text-muted-foreground">{t('assessmentNotReady')}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  const notStarted = path.totalCount - path.completedCount - path.inProgressCount;
  const counts = [
    { key: 'statusCompleted', value: path.completedCount },
    { key: 'statusInProgress', value: path.inProgressCount },
    { key: 'statusNotStarted', value: notStarted },
  ] as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{path.name}</CardTitle>
        <CardDescription>
          {path.nextCourse
            ? t('activeNextCourse', { title: path.nextCourse.title })
            : t('activeAllDone')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* Which rung they were placed on: the fact that decides everything
            else on this card, so it is stated rather than implied. */}
        <p className="text-sm font-medium text-primary-700">
          {t('placedAt', { level: path.placedLevel.name })}
        </p>

        <ul aria-label={t('statusHeading')} className="grid grid-cols-3 gap-3">
          {counts.map(({ key, value }) => (
            <li key={key} className={cn(cardVariants(), 'flex flex-col justify-center px-4 py-3')}>
              <span data-count className="text-xl font-bold text-foreground tabular-nums">
                {format.number(value)}
              </span>
              <span className="text-xs text-muted-foreground">{tMyPath(key)}</span>
            </li>
          ))}
        </ul>

        <Progress
          value={path.completedCount}
          max={path.totalCount}
          label={t('progressLabel')}
          valueText={t('progressValue', {
            completed: format.number(path.completedCount),
            total: format.number(path.totalCount),
          })}
        />

        {path.nextCourse ? (
          <Button asChild size="lg" className="self-start">
            <Link href={`/courses/${path.nextCourse.courseId}`}>{t('continueCourse')}</Link>
          </Button>
        ) : (
          <Button asChild size="lg" variant="outline" className="self-start">
            <Link href={`/my-path?pathId=${path.id}`}>{t('viewMyPath')}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function LatestCertificate({
  certificate,
}: {
  certificate: {
    id: string;
    type: 'COURSE' | 'PATH';
    subjectTitle: string;
    issuedAt: string;
  } | null;
}) {
  const t = useTranslations('dashboard');
  const format = useFormat();

  return (
    <section
      aria-labelledby="latest-certificate-heading"
      className={cn(cardVariants(), 'flex flex-col gap-3 p-6')}
    >
      <h2 id="latest-certificate-heading" className="text-lg font-semibold text-foreground">
        {t('latestCertificateHeading')}
      </h2>
      {certificate ? (
        <>
          <div className="flex items-start gap-3">
            <Award aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary-700" />
            <div className="flex flex-col gap-0.5">
              <span className="font-medium text-foreground">{certificate.subjectTitle}</span>
              <span className="text-sm text-muted-foreground">
                {certificate.type === 'PATH'
                  ? t('latestCertificatePath')
                  : t('latestCertificateCourse')}
                <span aria-hidden="true"> · </span>
                {format.date(new Date(certificate.issuedAt))}
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
  );
}

/** Compact tiles — everything shown is actionable (§4.2). */
function Tiles() {
  const t = useTranslations('dashboard');

  return (
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
