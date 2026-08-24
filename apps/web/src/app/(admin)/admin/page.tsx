'use client';

import { useTranslations } from 'next-intl';

import type { AdminDashboardView } from '@tamkeen/types';

import { AdminPage } from '@/components/layout/admin-page';
import { DataView } from '@/components/states';
import { Card } from '@/components/ui/card';
import { adminApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';
import { useFormat } from '@/i18n/format-provider';

/**
 * §4C.1 — the admin dashboard.
 *
 * **Integration health is the page; the counts are context.** §4C.1 asks for
 * both, and §3 requires that what is shown be actionable — an administrator can
 * do nothing about "312 employees", but a Moodle that stopped answering, or a
 * sync job that has not run since yesterday, is theirs to fix and nobody else's.
 * So health sits first and reads in words rather than as a coloured tick, and
 * the totals follow as the context that makes the health figure mean something.
 */
export default function AdminDashboardPage() {
  const t = useTranslations('admin');
  const dashboard = useApiQuery(() => adminApi.dashboard(), []);

  return (
    <AdminPage title={t('dashboardTitle')}>
      <DataView isLoading={dashboard.isLoading} error={dashboard.error} onRetry={dashboard.refetch}>
        {dashboard.data ? <DashboardBody data={dashboard.data} /> : null}
      </DataView>
    </AdminPage>
  );
}

function DashboardBody({ data }: { data: AdminDashboardView }) {
  const t = useTranslations('admin');
  const format = useFormat();

  return (
    <div className="space-y-8">
      <IntegrationHealth data={data} />

      <section aria-labelledby="admin-people">
        <SectionHeading id="admin-people">{t('sectionPeople')}</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t('statEmployees')} value={format.number(data.users.employees)} />
          <Stat label={t('statEntities')} value={format.number(data.entities.active)} />
          <Stat label={t('statSuspended')} value={format.number(data.users.suspended)} />
          <Stat label={t('statUnverified')} value={format.number(data.users.unverified)} />
        </div>
      </section>

      <section aria-labelledby="admin-journey">
        <SectionHeading id="admin-journey">{t('sectionJourney')}</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t('statAssessed')} value={format.number(data.journey.assessed)} />
          <Stat label={t('statActivePaths')} value={format.number(data.journey.active)} />
          <Stat
            label={t('statPathCompletion')}
            /* An em dash, not 0%: a rate over an empty denominator is undefined,
               and "0%" on a product nobody has finished yet reads as failure. */
            value={
              data.journey.pathCompletionRate === null
                ? '—'
                : format.percent(data.journey.pathCompletionRate)
            }
          />
          <Stat
            label={t('statCertificates')}
            value={format.number(data.journey.certificatesIssued)}
          />
        </div>
      </section>

      <section aria-labelledby="admin-catalogue">
        <SectionHeading id="admin-catalogue">{t('sectionCatalogue')}</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t('statPathsActive')} value={format.number(data.paths.active)} />
          <Stat label={t('statCoursesPublished')} value={format.number(data.courses.published)} />
          <Stat label={t('statCoursesDraft')} value={format.number(data.courses.draft)} />
          {/* Courses no entity supplies (D-063). §4C.5 makes them the admin's,
              and they are invisible from every entity portal by construction. */}
          <Stat label={t('statCoursesUnowned')} value={format.number(data.courses.unowned)} />
        </div>
      </section>

      <CodeDistribution shares={data.codeDistribution} />
      <RecentActivity rows={data.recentActivity} />
    </div>
  );
}

function IntegrationHealth({ data }: { data: AdminDashboardView }) {
  const t = useTranslations('admin');
  const format = useFormat();

  const stamp = (value: string | null) =>
    value === null ? t('syncNever') : format.dateTime(new Date(value));

  return (
    <section aria-labelledby="admin-health">
      <SectionHeading id="admin-health">{t('sectionHealth')}</SectionHeading>

      <Card className="p-5">
        <p className="flex flex-wrap items-center gap-2 text-base font-medium text-foreground">
          {/*
            The dot is decorative and paired with the wording beside it: colour
            alone must never carry the state (WCAG 1.4.1), and "متصل" / "غير
            متصل" is what a screen reader and a colour-blind operator both read.
          */}
          <span
            aria-hidden="true"
            className={`size-2.5 shrink-0 rounded-full ${data.lms.reachable ? 'bg-success' : 'bg-destructive'}`}
          />
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
          <Detail label={t('lmsAddress')} value={data.lms.baseUrl || '—'} ltr />
          {/*
            Sync freshness is asked separately from reachability on purpose: a
            Moodle that answers while the job has not run since yesterday is a
            healthy LMS behind a broken scheduler, and a single tick hides it.
          */}
          <Detail label={t('lastCatalogSync')} value={stamp(data.lms.lastCatalogSyncAt)} />
          <Detail label={t('lastCompletionSync')} value={stamp(data.lms.lastCompletionSyncAt)} />
        </dl>

        {data.assessment ? (
          <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
            {t('assessmentVersion', {
              version: format.number(data.assessment.version),
              date: format.date(new Date(data.assessment.effectiveFrom)),
            })}
          </p>
        ) : null}
      </Card>
    </section>
  );
}

function CodeDistribution({ shares }: { shares: AdminDashboardView['codeDistribution'] }) {
  const t = useTranslations('admin');
  const format = useFormat();

  const total = shares.reduce((sum, share) => sum + share.count, 0);
  /* Bars are scaled against the largest share, not the total: with thirty-odd
     possible codes every bar would otherwise be a sliver and the chart would
     say nothing. */
  const largest = shares.reduce((max, share) => Math.max(max, share.count), 0);

  return (
    <section aria-labelledby="admin-codes">
      <SectionHeading id="admin-codes">{t('sectionCodes')}</SectionHeading>

      {shares.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">{t('codesEmpty')}</Card>
      ) : (
        <Card className="p-5">
          <ul className="space-y-3">
            {shares.slice(0, 8).map((share) => (
              <li key={share.code} className="flex items-center gap-3">
                {/* Holland codes are Latin letters inside an RTL page. */}
                <span dir="ltr" className="w-12 shrink-0 font-mono text-sm text-foreground">
                  {share.code}
                </span>
                <span
                  aria-hidden="true"
                  className="h-2 rounded-full bg-gold"
                  style={{ width: `${Math.max(4, (share.count / largest) * 100)}%` }}
                />
                <span className="shrink-0 text-sm text-muted-foreground">
                  {format.fraction(share.count, total)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

function RecentActivity({ rows }: { rows: AdminDashboardView['recentActivity'] }) {
  const t = useTranslations('admin');
  const tAction = useTranslations('admin.auditAction');
  const format = useFormat();

  return (
    <section aria-labelledby="admin-activity">
      <SectionHeading id="admin-activity">{t('sectionActivity')}</SectionHeading>

      {rows.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">{t('activityEmpty')}</Card>
      ) : (
        <Card className="divide-y divide-border">
          <ul>
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
                  {row.actorName ?? t('actorSystem')} · {format.dateTime(new Date(row.occurredAt))}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="mb-3 text-lg font-semibold text-foreground">
      {children}
    </h2>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
    </Card>
  );
}

function Detail({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all text-foreground" dir={ltr ? 'ltr' : undefined}>
        {value}
      </dd>
    </div>
  );
}
