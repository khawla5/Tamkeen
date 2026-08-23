'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { AdminAuditRow, AdminReports } from '@tamkeen/types';

import { AdminPage } from '@/components/layout/admin-page';
import { DataView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { useFormat } from '@/i18n/format-provider';
import { adminApi } from '@/lib/api-client';
import { useApiQuery } from '@/lib/use-api';

/**
 * §4C.8 — the audit trail and reports.
 *
 * **Read-only, and it looks it.** There is no control on this page that changes
 * anything: an audit entry an administrator can edit is evidence of nothing, and
 * the API has no route that would let them.
 *
 * **The reports are ordered to be acted on.** Course outcomes are worst-first,
 * because a list of the best-performing courses tells the ministry nothing it
 * needs to do; paths are by how many chose them, which is what "popular" is
 * asking.
 */
export default function AdminAuditPage() {
  const t = useTranslations('admin');
  const [tab, setTab] = useState<'reports' | 'audit'>('reports');

  return (
    <AdminPage title={t('auditTitle')}>
      <div className="space-y-6">
        <nav aria-label={t('auditTitle')} className="flex gap-1 border-b border-border">
          <TabButton active={tab === 'reports'} onClick={() => setTab('reports')}>
            {t('auditTabReports')}
          </TabButton>
          <TabButton active={tab === 'audit'} onClick={() => setTab('audit')}>
            {t('auditTabTrail')}
          </TabButton>
        </nav>

        {tab === 'reports' ? <ReportsTab /> : <TrailTab />}
      </div>
    </AdminPage>
  );
}

function ReportsTab() {
  const t = useTranslations('admin');
  const format = useFormat();
  const reports = useApiQuery(() => adminApi.reports(), []);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        {/* A plain link: the session is an httpOnly cookie on the API's origin,
            so the browser carries it and handles the download itself. */}
        <Button asChild variant="outline">
          <a href={adminApi.reportsCsvUrl()}>{t('auditExport')}</a>
        </Button>
      </div>

      <DataView isLoading={reports.isInitialLoad} error={reports.error} onRetry={reports.refetch}>
        {reports.data ? <ReportsBody reports={reports.data} format={format} /> : null}
      </DataView>
    </div>
  );
}

function ReportsBody({
  reports,
  format,
}: {
  reports: AdminReports;
  format: ReturnType<typeof useFormat>;
}) {
  const t = useTranslations('admin');

  return (
    <div className="space-y-6">
      <section aria-labelledby="report-journey">
        <Heading id="report-journey">{t('reportJourney')}</Heading>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t('statAssessed')} value={format.number(reports.journey.assessed)} />
          <Stat label={t('statActivePaths')} value={format.number(reports.journey.active)} />
          <Stat
            label={t('statPathCompletion')}
            value={
              reports.journey.pathCompletionRate === null
                ? '—'
                : format.percent(reports.journey.pathCompletionRate)
            }
          />
          <Stat label={t('statCertificates')} value={format.number(reports.certificates.total)} />
        </div>
      </section>

      <section aria-labelledby="report-paths">
        <Heading id="report-paths">{t('reportPaths')}</Heading>
        {reports.pathPopularity.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">{t('reportEmpty')}</Card>
        ) : (
          <Card className="divide-y divide-border">
            {reports.pathPopularity.map((row) => (
              <div
                key={row.pathId}
                className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-3"
              >
                <span className="text-sm text-foreground">{row.name}</span>
                <span className="text-sm text-muted-foreground">
                  {t('reportPathCounts', {
                    chosen: format.number(row.chosen),
                    completed: format.number(row.completed),
                  })}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section aria-labelledby="report-courses">
        <Heading id="report-courses">{t('reportCourses')}</Heading>
        {/* Worst first, and the page says so — otherwise the ordering reads as
            arbitrary and the list stops being a to-do. */}
        <p className="mb-3 text-sm text-muted-foreground">{t('reportCoursesHint')}</p>

        {reports.courseOutcomes.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">{t('reportEmpty')}</Card>
        ) : (
          <Card className="divide-y divide-border">
            {reports.courseOutcomes.slice(0, 15).map((row) => (
              <div
                key={row.courseId}
                className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-3"
              >
                <span className="text-sm text-foreground">{row.title}</span>
                <span className="text-sm text-muted-foreground">
                  {/* Undefined over an empty denominator, as everywhere else. */}
                  {row.passRate === null ? '—' : format.percent(row.passRate)} ·{' '}
                  {format.fraction(row.passed, row.enrolled)}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function TrailTab() {
  const t = useTranslations('admin');
  const tAction = useTranslations('admin.auditAction');

  const [action, setAction] = useState('');
  const [outcome, setOutcome] = useState<'SUCCESS' | 'FAILURE' | ''>('');
  const [before, setBefore] = useState<string | undefined>(undefined);

  const log = useApiQuery(
    () =>
      adminApi.auditLog({
        action: action || undefined,
        outcome: outcome || undefined,
        before,
      }),
    [action, outcome, before],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="audit-action" label={t('auditActionLabel')}>
          {(field) => (
            <select
              {...field}
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                setBefore(undefined);
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{t('filterAny')}</option>
              {(log.data?.actions ?? []).map((code) => (
                <option key={code} value={code}>
                  {tAction.has(code) ? tAction(code) : code}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field id="audit-outcome" label={t('auditOutcome')}>
          {(field) => (
            <select
              {...field}
              value={outcome}
              onChange={(event) => {
                setOutcome(event.target.value as 'SUCCESS' | 'FAILURE' | '');
                setBefore(undefined);
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{t('filterAny')}</option>
              <option value="SUCCESS">{t('outcomeSuccess')}</option>
              <option value="FAILURE">{t('outcomeFailure')}</option>
            </select>
          )}
        </Field>

        <div className="flex items-end">
          <Button asChild variant="outline">
            <a
              href={adminApi.auditCsvUrl({
                action: action || undefined,
                outcome: outcome || undefined,
              })}
            >
              {t('auditExport')}
            </a>
          </Button>
        </div>
      </div>

      <DataView
        isLoading={log.isInitialLoad}
        error={log.error}
        onRetry={log.refetch}
        isEmpty={log.data?.rows.length === 0}
        emptyProps={{ title: t('auditEmpty') }}
      >
        {log.data ? (
          <>
            <Card className="divide-y divide-border">
              {log.data.rows.map((row) => (
                <AuditEntry key={row.id} row={row} />
              ))}
            </Card>

            {log.data.nextBefore ? (
              <div className="flex justify-center">
                <Button variant="outline" onClick={() => setBefore(log.data!.nextBefore!)}>
                  {t('auditOlder')}
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </DataView>
    </div>
  );
}

function AuditEntry({ row }: { row: AdminAuditRow }) {
  const t = useTranslations('admin');
  const tAction = useTranslations('admin.auditAction');
  const format = useFormat();

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm text-foreground">
          {/* An action with no Arabic copy falls back to its code — a blank row
              would hide the event, which is worse than an untranslated one. */}
          {tAction.has(row.action) ? tAction(row.action) : row.action}
          {row.outcome === 'FAILURE' ? <Badge variant="navy">{t('outcomeFailure')}</Badge> : null}
        </p>

        {/* The reason, which is half the value of a refused entry. Non-PII by
            construction — the audit service accepts only enumerated codes and
            scalars, never free text. */}
        {row.detail ? (
          <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
            {Object.entries(row.detail)
              .map(([key, value]) => `${key}=${String(value)}`)
              .join(' · ')}
          </p>
        ) : null}
      </div>

      <span className="text-xs text-muted-foreground">
        {row.actorName ?? t('actorSystem')} · {format.dateTime(new Date(row.occurredAt))}
      </span>
    </div>
  );
}

function Heading({ id, children }: { id: string; children: string }) {
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

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={
        active
          ? 'border-b-2 border-gold px-4 py-2 text-sm font-semibold text-foreground'
          : 'border-b-2 border-transparent px-4 py-2 text-sm text-muted-foreground hover:text-foreground'
      }
    >
      {children}
    </button>
  );
}
