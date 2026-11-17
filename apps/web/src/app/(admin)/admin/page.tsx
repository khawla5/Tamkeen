'use client';

import {
  Activity,
  BarChart3,
  BadgeCheck,
  BookOpen,
  Building2,
  History,
  Link2,
  RefreshCw,
  Route,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { AdminDashboardView } from '@tamkeen/types';

import { NeedsAction } from '@/components/admin/needs-action';
import { AdminPage } from '@/components/layout/admin-page';
import { DataView } from '@/components/states';
import { Card } from '@/components/ui/card';
import { adminApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';
import { useFormat } from '@/i18n/format-provider';

/**
 * §4C.1 — the admin dashboard.
 *
 * **Same information as before; only the way it is laid out changed**, to the
 * approved proposal's (admin_dashboard_redesign_proposal.html): a status line in
 * the title row, a box of what is waiting on the administrator, four figures,
 * and the employees' journey as bars. Every figure the page ever showed is still
 * here — the integration detail, the per-path picture and the activity list
 * follow, unchanged.
 *
 * **Integration health is still what the page is for**, which is why the status
 * line is the first thing in the title row and the address and both sync times
 * remain on the page in full: a Moodle that answers while the scheduler has not
 * run since yesterday is a healthy LMS behind a broken job, and one tick would
 * hide it.
 *
 * The box of waiting work is not drawn at all when there is nothing to do (§3),
 * and no row of it leans on colour alone — each says what it is in words
 * (WCAG 1.4.1).
 */
export default function AdminDashboardPage() {
  const t = useTranslations('admin');
  const dashboard = useApiQuery(() => adminApi.dashboard(), []);

  return (
    <AdminPage
      title={t('dashboardTitle')}
      action={dashboard.data ? <StatusLine data={dashboard.data} /> : undefined}
    >
      <DataView isLoading={dashboard.isLoading} error={dashboard.error} onRetry={dashboard.refetch}>
        {dashboard.data ? <DashboardBody data={dashboard.data} /> : null}
      </DataView>
    </AdminPage>
  );
}

function DashboardBody({ data }: { data: AdminDashboardView }) {
  return (
    <div className="space-y-6">
      <NeedsAction data={data} />
      <Totals data={data} />
      <Journey data={data} />

      <PathDistribution rows={data.pathDistribution} />
      <RecentActivity rows={data.recentActivity} />
      <IntegrationHealth data={data} />
    </div>
  );
}

/** The platform's state in the title row: a dot, and the words beside it. */
function StatusLine({ data }: { data: AdminDashboardView }) {
  const t = useTranslations('admin');
  const format = useFormat();

  /* The newer of the two syncs: «آخر مزامنة» is one answer here; the two separate
     times are in «حالة التكامل» below. */
  const stamps = [data.lms.lastCatalogSyncAt, data.lms.lastCompletionSyncAt]
    .filter((value): value is string => value !== null)
    .map((value) => new Date(value).getTime());
  const latest = stamps.length === 0 ? null : new Date(Math.max(...stamps));

  const up = data.lms.reachable;

  return (
    <p
      className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] ${
        up ? 'bg-success-50 text-success' : 'bg-danger-50 text-danger'
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-full ${up ? 'bg-success' : 'bg-danger'}`}
      />
      {up ? t('lmsReachable') : t('lmsUnreachable')}
      <span className="text-muted-foreground">
        · {t('statusLastSync', { when: latest ? format.dateTime(latest) : t('syncNever') })}
      </span>
    </p>
  );
}

/** The four figures that say how big the platform is. */
function Totals({ data }: { data: AdminDashboardView }) {
  const t = useTranslations('admin');
  const format = useFormat();

  return (
    <section aria-label={t('sectionTotals')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat
        icon={Users}
        label={t('statEmployees')}
        value={format.number(data.users.employees)}
        note={t('suspendedNote', {
          n: data.users.suspended,
          count: format.number(data.users.suspended),
        })}
      />
      <Stat
        icon={Building2}
        label={t('statEntities')}
        value={format.number(data.entities.active)}
      />
      <Stat icon={Route} label={t('statPathsActive')} value={format.number(data.paths.published)} />
      <Stat
        icon={BookOpen}
        label={t('statCoursesPublished')}
        value={format.number(data.courses.published)}
        note={t('draftNote', {
          n: data.courses.draft,
          count: format.number(data.courses.draft),
        })}
      />
    </section>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-lg bg-neutral-100 p-4">
      <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {label}
      </p>
      <p className="mt-1 text-2xl font-medium text-foreground">{value}</p>
      {/* A blank line keeps the four cards one height when one has no note. */}
      <p className="min-h-4 text-xs text-muted-foreground">{note ?? ' '}</p>
    </div>
  );
}

/** How far the employees have got: assigned, placed, certified. */
function Journey({ data }: { data: AdminDashboardView }) {
  const t = useTranslations('admin');
  const format = useFormat();

  const { journey } = data;
  const share = (part: number, whole: number) =>
    whole === 0 ? 0 : Math.min(100, (part / whole) * 100);

  return (
    <section
      aria-labelledby="admin-journey"
      className="rounded-xl border border-border bg-card px-5 py-4"
    >
      <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="admin-journey" className="text-base font-medium text-foreground">
          {t('sectionJourney')}
        </h2>
        <p className="text-[13px] text-muted-foreground">
          {t('statPathCompletion')}{' '}
          {/* An em dash, not 0%: a rate over an empty denominator is undefined,
              and "0%" on a product nobody has finished yet reads as failure. */}
          {journey.pathCompletionRate === null ? '—' : format.percent(journey.pathCompletionRate)}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Progress
          label={t('statAssigned')}
          detail={t('ofTotal', {
            value: format.number(journey.assigned),
            total: format.number(data.users.employees),
          })}
          percent={share(journey.assigned, data.users.employees)}
        />
        <Progress
          label={t('statPlaced')}
          detail={t('ofTotal', {
            value: format.number(journey.placed),
            total: format.number(journey.assigned),
          })}
          percent={share(journey.placed, journey.assigned)}
        />
        {/* Certificates have no whole of their own, so the bar is read against
            the employees who have been placed — the people who can earn one. */}
        <Progress
          label={t('statCertificates')}
          detail={format.number(journey.certificatesIssued)}
          percent={share(journey.certificatesIssued, journey.placed)}
        />
      </div>
    </section>
  );
}

function Progress({ label, detail, percent }: { label: string; detail: string; percent: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[13px]">
        <span className="text-foreground">{label}</span>
        <span className="font-medium text-foreground">{detail}</span>
      </div>
      <span aria-hidden="true" className="block h-2 overflow-hidden rounded bg-neutral-100">
        <span className="block h-full bg-success" style={{ width: `${percent}%` }} />
      </span>
    </div>
  );
}

/**
 * «حالة التكامل» in full: the platform's name, its address and both sync times.
 *
 * Sync freshness is asked separately from reachability on purpose: a Moodle that
 * answers while the job has not run since yesterday is a healthy LMS behind a
 * broken scheduler, and a single tick hides it.
 */
function IntegrationHealth({ data }: { data: AdminDashboardView }) {
  const t = useTranslations('admin');
  const format = useFormat();

  const stamp = (value: string | null) =>
    value === null ? t('syncNever') : format.dateTime(new Date(value));

  return (
    <section aria-labelledby="admin-health">
      <SectionHeading id="admin-health" icon={Activity}>
        {t('sectionHealth')}
      </SectionHeading>

      <Card className="p-5">
        <p className="flex flex-wrap items-center gap-2 text-base font-medium text-foreground">
          {data.lms.reachable ? t('lmsReachable') : t('lmsUnreachable')}
          {data.lms.siteName ? (
            <span className="text-sm font-normal text-muted-foreground">{data.lms.siteName}</span>
          ) : null}
        </p>

        {/* Why it is unreachable, when it is: a bad token and a down server need
            different fixes, and one red dot would cost the operator an hour. */}
        {!data.lms.reachable && data.lms.failureCode ? (
          <p className="mt-2 text-sm text-destructive">{t(`lmsFailure.${data.lms.failureCode}`)}</p>
        ) : null}

        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
          <Detail icon={Link2} label={t('lmsAddress')} value={data.lms.baseUrl || '—'} ltr />
          <Detail
            icon={RefreshCw}
            label={t('lastCatalogSync')}
            value={stamp(data.lms.lastCatalogSyncAt)}
          />
          <Detail
            icon={BadgeCheck}
            label={t('lastCompletionSync')}
            value={stamp(data.lms.lastCompletionSyncAt)}
          />
        </dl>
      </Card>
    </section>
  );
}

/**
 * Where the ministry has put its people, and how far each group got (D-134).
 *
 * It replaces the career-type distribution, which answered "where are our
 * people's interests" — a question the ministry stopped asking when it started
 * assigning paths. A path with many assigned and few placed is the finding, and
 * it is actionable from this screen.
 */
function PathDistribution({ rows }: { rows: AdminDashboardView['pathDistribution'] }) {
  const t = useTranslations('admin');
  const format = useFormat();

  const assigned = rows.reduce((sum, row) => sum + row.assigned, 0);
  /* Bars scale against the largest share rather than the total: paths rarely
     split evenly, and against the total the smaller ones would all be slivers of
     much the same indistinguishable width. */
  const largest = rows.reduce((max, row) => Math.max(max, row.assigned), 0);

  return (
    <section aria-labelledby="admin-paths-distribution">
      <SectionHeading id="admin-paths-distribution" icon={BarChart3}>
        {t('sectionPathShare')}
      </SectionHeading>

      {assigned === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">{t('pathShareEmpty')}</Card>
      ) : (
        <Card className="p-5">
          <p className="mb-4 text-sm text-muted-foreground">{t('sectionPathShareHint')}</p>

          <ul className="space-y-4">
            {rows.map((row) => (
              <li key={row.pathId} className="grid gap-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{row.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {t('pathShareAssigned', { count: format.number(row.assigned) })}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="h-2 flex-1 overflow-hidden rounded-full bg-muted/20"
                  >
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{
                        width: largest === 0 ? '0%' : `${(row.assigned / largest) * 100}%`,
                      }}
                    />
                  </span>

                  {/*
                    The other half of the comparison. A path everybody was
                    assigned and nobody was placed on is the finding this section
                    exists to surface, so it is said in words rather than left as
                    a "0" to be noticed — and the warning colour is paired with
                    that wording, never carrying the meaning alone (WCAG 1.4.1).
                  */}
                  <span
                    className={
                      row.assigned > 0 && row.placed === 0
                        ? 'shrink-0 text-xs font-medium text-warning'
                        : 'shrink-0 text-xs text-muted-foreground'
                    }
                  >
                    {row.assigned > 0 && row.placed === 0
                      ? t('pathShareNonePlaced')
                      : t('pathSharePlaced', { count: format.number(row.placed) })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

/**
 * §4C.1 — the newest audit entries.
 *
 * **The list scrolls inside itself.** It is the only unbounded section on the
 * page: everything above it is a fixed set of figures, so letting a dozen
 * activity rows decide the page's height pushed the integration health — the
 * thing the page is actually for — further from the fold every time the
 * ministry got busier. The container is focusable and labelled so it can be
 * reached and scrolled from the keyboard, which an `overflow` box otherwise
 * cannot be (WCAG 2.1.1).
 */
function RecentActivity({ rows }: { rows: AdminDashboardView['recentActivity'] }) {
  const t = useTranslations('admin');
  const tAction = useTranslations('admin.auditAction');
  const format = useFormat();

  return (
    <section aria-labelledby="admin-activity">
      <SectionHeading id="admin-activity" icon={History}>
        {t('sectionActivity')}
      </SectionHeading>

      {rows.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">{t('activityEmpty')}</Card>
      ) : (
        <Card className="overflow-hidden">
          <div
            role="group"
            aria-label={t('activityScrollLabel')}
            tabIndex={0}
            className="max-h-72 overflow-y-auto"
          >
            <ul className="divide-y divide-border">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-3"
                >
                  <span className="text-sm text-foreground">
                    {/* An unknown action falls back to its own code rather than to
                        an empty string — a blank row would hide the event. */}
                    {tAction.has(row.action) ? tAction(row.action) : row.action}
                    {row.outcome === 'FAILURE' ? (
                      <span className="ms-2 text-xs text-destructive">{t('outcomeFailure')}</span>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {row.actorName ?? t('actorSystem')} ·{' '}
                    {format.dateTime(new Date(row.occurredAt))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}
    </section>
  );
}

function SectionHeading({
  id,
  icon: Icon,
  children,
}: {
  id: string;
  icon: LucideIcon;
  children: string;
}) {
  return (
    <h2 id={id} className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700"
      >
        <Icon className="size-[18px]" />
      </span>
      {children}
    </h2>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
  ltr,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  ltr?: boolean;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-muted-foreground">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {label}
      </dt>
      <dd className="mt-1 break-all text-foreground" dir={ltr ? 'ltr' : undefined}>
        {value}
      </dd>
    </div>
  );
}
