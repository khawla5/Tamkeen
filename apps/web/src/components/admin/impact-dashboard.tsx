'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { AdminDashboardView, AdminImpactView, AdminReports } from '@tamkeen/types';

import { isoDay } from '@/components/admin/impact-tab';
import { InteractiveSaudiMap } from '@/components/brand/interactive-saudi-map';
import type { MapRegion } from '@/components/brand/saudi-map-paths';
import { DataView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useFormat } from '@/i18n/format-provider';
import { adminApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * The head of «قياس الأثر»: the programme at a glance, in the shape of the
 * admin dashboard — the Kingdom, four totals, and the programmes people joined
 * most.
 *
 * **Totals, not a period.** The detailed analysis beneath has its own period and
 * department filters; this block answers the question before them — how big is
 * the programme — so none of it moves when a filter does.
 *
 * **Composed from the endpoints the portal already has** (dashboard, reports,
 * impact), so there is no second source for a number that already has one:
 * accounts and entities come from the dashboard, the programme count from its
 * published courses, the hours from the impact view read over the platform's
 * whole life, and «joined» from the reports' per-course enrolments.
 *
 * **The map is interactive but carries no regional figures.** It follows the
 * MOIA branches panel (hover tooltip, click to select, a column that swaps
 * between the totals and the chosen region's card) without its content — those
 * region texts and links belong to another ministry. No account, entity or
 * enrolment here records a region (users have a directorate, not a province),
 * so a selection names the region and says plainly that there is nothing to
 * break down by it yet.
 *
 * **Bars on the token palette, no chart dependency** — the same reasoning as the
 * trend below it. Each row carries its count in words beside the bar, so the
 * ranking survives without colour (WCAG 1.4.1).
 */

/** The platform's whole life, as far as the impact endpoint is concerned — a
 *  day, because `adminApi.impact` widens each end to the start/end of it. */
const SINCE = '2000-01-01';

/** How many programmes the ranking shows — enough to compare, few enough to read. */
const TOP_PROGRAMMES = 6;

export function ImpactDashboard() {
  const dashboard = useApiQuery(() => adminApi.dashboard(), []);
  const reports = useApiQuery(() => adminApi.reports(), []);
  /* `to` is read once per mount: a total is "up to now", and a value that moved
     under the reader would make the tile disagree with itself on a refetch. */
  const impact = useApiQuery(() => adminApi.impact({ from: SINCE, to: isoDay(new Date()) }), []);

  const error = dashboard.error ?? reports.error ?? impact.error;

  return (
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
          <RegionPanel dashboard={dashboard.data} impact={impact.data} />

          <TopProgrammes reports={reports.data} />

          <TraineeProgress reports={reports.data} />
        </div>
      ) : null}
    </DataView>
  );
}

/**
 * The map and, beside it, whatever the map is currently about — the layout of
 * the MOIA branches panel: a header with a way back to "all", the map, and a
 * column that shows the totals until a region is chosen and that region's card
 * after it.
 */
function RegionPanel({
  dashboard,
  impact,
}: {
  dashboard: AdminDashboardView;
  impact: AdminImpactView;
}) {
  const t = useTranslations('admin');
  const [selected, setSelected] = useState<MapRegion | null>(null);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-3 pt-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t('impactDashMapTitle')}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('impactDashMapHint')}</p>
        </div>

        {/* Present only once there is something to go back from: a link that
            does nothing on a map nobody has touched is noise (§3). */}
        {selected === null ? null : (
          <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
            {t('impactDashRegionClear')}
          </Button>
        )}
      </div>

      <div className="flex flex-col lg:flex-row">
        <div className="flex flex-1 items-center justify-center p-4 lg:p-6">
          <div className="w-full max-w-md">
            <InteractiveSaudiMap
              label={t('impactDashMapLabel')}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
            />
          </div>
        </div>

        <div aria-live="polite" className="lg:w-[22rem] lg:shrink-0 xl:w-[26rem]">
          {selected === null ? (
            <Totals dashboard={dashboard} impact={impact} />
          ) : (
            <FeaturedRegion region={selected} />
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * The selected region's card.
 *
 * It names the region and says what it cannot yet say: no account, entity or
 * enrolment records a region (users have a directorate, not a province), so
 * there is no per-region figure to put in the rows MOIA's card carries. The day
 * accounts record a region, this is where those numbers attach — until then a
 * row of dashes would claim a count that nobody took.
 */
function FeaturedRegion({ region }: { region: MapRegion }) {
  const t = useTranslations('admin');

  return (
    <div className="flex h-full min-h-72 flex-col justify-end bg-gradient-to-br from-primary-600 to-primary-900 p-6 text-white">
      <p className="text-sm font-medium text-white/90">{t('impactDashRegionEyebrow')}</p>
      <h3 className="mt-2 text-2xl font-bold leading-tight">
        {t('impactDashRegionTitle', { name: region.name })}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-white/90">{t('impactDashRegionNote')}</p>
    </div>
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
      className="grid h-full grid-cols-2 gap-3 bg-neutral-50 p-4 lg:p-6"
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
    <div className="flex flex-col justify-center rounded-xl border border-border bg-surface p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-4xl font-semibold text-foreground">{value}</p>
    </div>
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

              <span
                aria-hidden="true"
                className="block h-3 overflow-hidden rounded-full bg-neutral-200"
              >
                <span
                  className="block h-full rounded-full bg-primary-600"
                  /* Scaled against the leader, so the ranking reads as
                     proportion rather than as six near-identical full bars. */
                  style={{ width: `${(row.enrolled / largest) * 100}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * Where the trainees have got to — the achievements overview.
 *
 * Three views of the same journey, read from the reports the page already has:
 * how many people reached each stage (assigned → placed → finished a path),
 * what they have earned along the way (courses passed, certificates), and how
 * far along each path they are.
 *
 * **Counts of people, with their denominator beside them.** A stage reads
 * «٣ من ١٠ المُسنَد إليهم», never a bare percentage, because the denominator is
 * the interesting part early on (§4C.1). Over an empty denominator the share is
 * an em dash, not 0% — nobody has been assigned yet is not the same finding as
 * nobody got anywhere.
 *
 * **Bars scaled against what they are a share of**, with the number in words
 * beside each, so the picture survives without colour (WCAG 1.4.1).
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

  /* The levels people were placed on, by path — the "where exactly" under each
     path's own progress. */
  const levelsByPath = new Map<string, string[]>();

  for (const row of reports.placementDistribution) {
    const line = `${row.levelName}: ${format.number(row.employees)}`;
    levelsByPath.set(row.pathId, [...(levelsByPath.get(row.pathId) ?? []), line]);
  }

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

      <section aria-labelledby="impact-achievements" className="mt-8">
        <h3 id="impact-achievements" className="text-base font-semibold text-foreground">
          {t('impactProgAchievements')}
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {achievements.map((item) => (
            <div key={item.label} className="rounded-xl border border-border bg-neutral-50 p-4">
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className="mt-1 text-3xl font-semibold text-foreground">
                {format.number(item.value)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="impact-paths-progress" className="mt-8">
        <h3 id="impact-paths-progress" className="text-base font-semibold text-foreground">
          {t('impactProgPaths')}
        </h3>

        {reports.pathPopularity.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t('reportEmpty')}</p>
        ) : (
          <ul aria-label={t('impactProgPaths')} className="mt-3 space-y-5">
            {reports.pathPopularity.map((path) => {
              const levels = levelsByPath.get(path.pathId);

              return (
                <li key={path.pathId} className="grid gap-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <span dir="auto" className="text-sm font-medium text-foreground">
                      {path.name}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {t('impactProgPathCounts', {
                        assigned: format.number(path.assigned),
                        completed: format.number(path.completed),
                      })}
                    </span>
                  </div>
                  <ProgressBar value={path.completed} of={path.assigned} />
                  {levels === undefined ? null : (
                    <p className="text-xs text-muted-foreground">
                      {t('impactProgLevels')}: {levels.join(' · ')}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Card>
  );
}

function ProgressBar({ value, of }: { value: number; of: number }) {
  return (
    <span aria-hidden="true" className="block h-3 overflow-hidden rounded-full bg-neutral-200">
      <span
        className="block h-full rounded-full bg-primary-600"
        style={{ width: of === 0 ? '0%' : `${Math.min(100, (value / of) * 100)}%` }}
      />
    </span>
  );
}
