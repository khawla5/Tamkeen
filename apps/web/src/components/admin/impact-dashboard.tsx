'use client';

import { useTranslations } from 'next-intl';

import type { AdminDashboardView, AdminImpactView, AdminReports } from '@tamkeen/types';

import { ImpactReadiness } from '@/components/admin/impact-readiness';
import { isoDay } from '@/components/admin/impact-tab';
import { DataView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useFormat } from '@/i18n/format-provider';
import { adminApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * The head of «قياس الأثر»: has the need been met, and what is the platform
 * itself doing.
 *
 * Two halves that must never be mistaken for one another:
 *
 *  - **Readiness** (`ImpactReadiness`) — the proposal deck's slide 6: a target,
 *    the gap, where it is, how long it took, what it changed. **Illustrative**
 *    until the platform records targets; every block carries a «أرقام تجريبية»
 *    tag.
 *  - **Platform activity** (below) — real numbers, read from the endpoints the
 *    portal already has (dashboard, reports, impact), so there is no second
 *    source for a figure that already has one. Accounts and entities come from
 *    the dashboard, the programme count from its published courses, the hours
 *    from the impact view read over the platform's whole life, and «joined» from
 *    the reports' per-course enrolments.
 *
 * The detailed TAM-149 analysis (period and department filters, tables, export)
 * follows on the page, unchanged.
 */

/** The platform's whole life, as far as the impact endpoint is concerned — a
 *  day, because `adminApi.impact` widens each end to the start/end of it. */
const SINCE = '2000-01-01';

/** How many programmes the ranking shows — enough to compare, few enough to read. */
const TOP_PROGRAMMES = 6;

export function ImpactDashboard() {
  const t = useTranslations('admin');

  return (
    <div className="space-y-10">
      <div className="space-y-6">
        <p className="text-base text-muted-foreground">{t('impactLead')}</p>
        <ImpactReadiness />
      </div>

      <PlatformActivity />
    </div>
  );
}

function PlatformActivity() {
  const t = useTranslations('admin');

  const dashboard = useApiQuery(() => adminApi.dashboard(), []);
  const reports = useApiQuery(() => adminApi.reports(), []);
  /* `to` is read once per mount: a total is "up to now", and a value that moved
     under the reader would make the tile disagree with itself on a refetch. */
  const impact = useApiQuery(() => adminApi.impact({ from: SINCE, to: isoDay(new Date()) }), []);

  const error = dashboard.error ?? reports.error ?? impact.error;

  return (
    <section aria-labelledby="impact-live" className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="impact-live" className="text-xl font-semibold text-foreground">
            {t('livePlatformTitle')}
          </h2>
          <Badge variant="success">{t('impactLiveBadge')}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t('livePlatformHint')}</p>
      </div>

      <DataView
        isLoading={dashboard.isInitialLoad || reports.isInitialLoad || impact.isInitialLoad}
        error={error}
        onRetry={() => {
          dashboard.refetch();
          reports.refetch();
          impact.refetch();
        }}
      >
        {dashboard.data && reports.data && impact.data ? (
          <div className="space-y-6">
            <Totals dashboard={dashboard.data} impact={impact.data} />

            <div className="grid gap-6 lg:grid-cols-2">
              <TopProgrammes reports={reports.data} />
              <TraineeProgress reports={reports.data} />
            </div>
          </div>
        ) : null}
      </DataView>
    </section>
  );
}

function Totals({ dashboard, impact }: { dashboard: AdminDashboardView; impact: AdminImpactView }) {
  const t = useTranslations('admin');
  const format = useFormat();

  const accounts =
    dashboard.users.employees + dashboard.users.entityAccounts + dashboard.users.admins;
  const hours = Math.round(impact.learning.learningMinutes.value / 60);

  return (
    <section
      aria-label={t('impactDashTotals')}
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <Total label={t('impactDashUsers')} value={format.number(accounts)} />
      <Total label={t('impactDashPrograms')} value={format.number(dashboard.courses.published)} />
      <Total label={t('impactDashHours')} value={format.number(hours)} />
      <Total label={t('impactDashEntities')} value={format.number(dashboard.entities.total)} />
    </section>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex flex-col justify-center p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-4xl font-semibold text-foreground">{value}</p>
    </Card>
  );
}

function TopProgrammes({ reports }: { reports: AdminReports }) {
  const t = useTranslations('admin');
  const format = useFormat();

  /* The reports list is worst-pass-rate first, which is the wrong order for
     "joined most" — sorted here, with the title as the tiebreak so two equal
     rows never swap between renders. */
  const rows = [...reports.courseOutcomes]
    .filter((row) => row.enrolled > 0)
    .sort((a, b) => b.enrolled - a.enrolled || a.title.localeCompare(b.title, 'ar'))
    .slice(0, TOP_PROGRAMMES);

  const largest = rows[0]?.enrolled ?? 0;

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-foreground">{t('impactDashTopTitle')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('impactDashTopHint')}</p>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t('impactDashTopEmpty')}</p>
      ) : (
        <ul aria-label={t('impactDashTopTitle')} className="mt-5 space-y-4">
          {rows.map((row) => (
            <li key={row.courseId} className="grid gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                {/* A programme may be authored in English (D-047); `dir="auto"`
                    keeps its punctuation off the wrong end of an RTL run. */}
                <span dir="auto" className="text-sm font-medium text-foreground">
                  {row.title}
                </span>
                <span className="text-sm text-muted-foreground">
                  {t('impactDashJoined', { count: format.number(row.enrolled) })}
                </span>
              </div>

              <ProgressBar value={row.enrolled} of={largest} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * Where the trainees have got to: the journey funnel and what they have earned.
 *
 * **Counts of people, with their denominator beside them.** A stage reads
 * «٣ من ١٠ مُسنَد إليهم», never a bare percentage, because the denominator is
 * the interesting part early on (§4C.1). Over an empty denominator the share is
 * an em dash, not 0% — nobody has been assigned yet is not the same finding as
 * nobody got anywhere.
 */
function TraineeProgress({ reports }: { reports: AdminReports }) {
  const t = useTranslations('admin');
  const format = useFormat();

  const { journey, certificates } = reports;

  const stages = [
    { label: t('statAssigned'), count: journey.assigned },
    { label: t('statPlaced'), count: journey.placed },
    { label: t('statCompletedPaths'), count: journey.completed },
  ];

  const achievements = [
    { label: t('impactCoursesPassed'), value: journey.coursesPassed },
    { label: t('impactCourseCertificates'), value: certificates.course },
    { label: t('impactPathsCompleted'), value: certificates.path },
  ];

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-foreground">{t('impactProgTitle')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('impactProgHint')}</p>

      <ul aria-label={t('impactProgTitle')} className="mt-5 space-y-4">
        {stages.map((stage) => (
          <li key={stage.label} className="grid gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-foreground">{stage.label}</span>
              <span className="text-sm text-muted-foreground">
                {journey.assigned === 0
                  ? '—'
                  : t('impactProgShare', {
                      count: format.number(stage.count),
                      total: format.number(journey.assigned),
                    })}
              </span>
            </div>
            <ProgressBar value={stage.count} of={journey.assigned} />
          </li>
        ))}
      </ul>

      <section aria-labelledby="impact-achievements" className="mt-6">
        <h3 id="impact-achievements" className="text-base font-semibold text-foreground">
          {t('impactProgAchievements')}
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {achievements.map((item) => (
            <div key={item.label} className="rounded-xl bg-neutral-100 p-4">
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {format.number(item.value)}
              </p>
            </div>
          ))}
        </div>
      </section>
    </Card>
  );
}

function ProgressBar({ value, of }: { value: number; of: number }) {
  return (
    <span aria-hidden="true" className="block h-2.5 overflow-hidden rounded-full bg-neutral-200">
      <span
        className="block h-full rounded-full bg-primary-600"
        /* Scaled against what it is a share of — the leader, or the assigned —
           so the ranking reads as proportion rather than as full bars. */
        style={{ width: of === 0 ? '0%' : `${Math.min(100, (value / of) * 100)}%` }}
      />
    </span>
  );
}
