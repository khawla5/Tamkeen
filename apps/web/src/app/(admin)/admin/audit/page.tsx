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
import { Select } from '@/components/ui/select';
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
            <Select
              {...field}
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                setBefore(undefined);
              }}
            >
              <option value="">{t('filterAny')}</option>
              {/* Sorted by the Arabic label rather than by the code: the list is
                  fifty entries long, and ordering it by a vocabulary the reader
                  cannot see makes it unscannable. */}
              {[...(log.data?.actions ?? [])]
                .map((code) => ({ code, label: tAction.has(code) ? tAction(code) : code }))
                .sort((a, b) => a.label.localeCompare(b.label, 'ar'))
                .map(({ code, label }) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
            </Select>
          )}
        </Field>

        <Field id="audit-outcome" label={t('auditOutcome')}>
          {(field) => (
            <Select
              {...field}
              value={outcome}
              onChange={(event) => {
                setOutcome(event.target.value as 'SUCCESS' | 'FAILURE' | '');
                setBefore(undefined);
              }}
            >
              <option value="">{t('filterAny')}</option>
              <option value="SUCCESS">{t('outcomeSuccess')}</option>
              <option value="FAILURE">{t('outcomeFailure')}</option>
            </Select>
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
            {/* A list, and marked up as one: the trail is a sequence of
                discrete events, so a screen reader should announce how many
                there are and let its user move between them — the same
                treatment the paths screen gives its cards. */}
            <Card className="p-0">
              <ul aria-label={t('auditTabTrail')} className="divide-y divide-border">
                {log.data.rows.map((row) => (
                  <li key={row.id}>
                    <AuditEntry row={row} />
                  </li>
                ))}
              </ul>
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

/**
 * One event, in words (TAM-137).
 *
 * **Every part of a row is translated or dropped.** What an administrator used
 * to read here was `reason=BAD_PASSWORD` and `pathId=fa9f3562-…` printed
 * left-to-right in the middle of an Arabic page — the internals of the log
 * rather than an account of what happened. Now: what was done, to what (by
 * name), by whom, when, and — on a refusal — why, as a sentence.
 *
 * Anything still without Arabic copy falls back to its raw code rather than
 * rendering blank, because a row that hides the event is worse than an
 * untranslated one. Nothing should reach that fallback: the message-catalogue
 * test asserts every action and every reason has copy.
 */
function AuditEntry({ row }: { row: AdminAuditRow }) {
  const t = useTranslations('admin');
  const tAction = useTranslations('admin.auditAction');
  const tReason = useTranslations('admin.auditReason');
  const tTarget = useTranslations('admin.auditTargetType');
  const tDetail = useTranslations('admin.auditDetail');
  const tSetting = useTranslations('admin.setting');
  const format = useFormat();

  /*
   * A setting names itself: its target id *is* the key, and §4C.6's Arabic name
   * for it is already in this catalogue — so it resolves here rather than in the
   * API, which has no business holding Arabic copy.
   */
  const targetLabel =
    row.targetType === 'setting' && row.targetId !== null && tSetting.has(row.targetId)
      ? tSetting(row.targetId)
      : row.targetLabel;

  const targetType =
    row.targetType === null
      ? null
      : tTarget.has(row.targetType)
        ? tTarget(row.targetType)
        : row.targetType;

  const target =
    targetType === null
      ? null
      : targetLabel === null
        ? targetType
        : `${targetType}: ${targetLabel}`;

  const details = Object.entries(row.detail ?? {});

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 py-4">
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
          {tAction.has(row.action) ? tAction(row.action) : row.action}
          {row.outcome === 'FAILURE' ? <Badge variant="danger">{t('outcomeFailure')}</Badge> : null}
        </p>

        {/* What it was about, by name. The type is the qualifier, because
            «مسار» and «مسار موظف» are different things that can share a name.
            One text node, not two spans — a name split across elements is one a
            reader can select but a matcher cannot find. */}
        {target !== null ? (
          /* `dir="auto"` because a target's name is not always Arabic: a course
             may be authored in English (D-047), and an LTR name inside an RTL
             run has its punctuation thrown to the wrong end. */
          <p dir="auto" className="text-sm text-muted-foreground">
            {target}
          </p>
        ) : null}

        {/* Half the value of a refused entry, and the reason the trail is worth
            reading at all. */}
        {row.reason !== null ? (
          <p className="text-sm text-danger">
            {tReason.has(row.reason) ? tReason(row.reason) : row.reason}
          </p>
        ) : null}

        {/* What is left is counts, statuses and changed-field names — the server
            strips every opaque identifier before this point. Numbers go through
            the shared formatter so they honour D-018 like everything else. */}
        {details.length > 0 ? (
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {details.map(([key, value]) => (
              <div key={key} className="flex gap-1">
                <dt>{tDetail.has(key) ? tDetail(key) : key}:</dt>
                {/* Same reason, and here it was actually wrong on screen: the
                    requested path of a denied request rendered as
                    `api/admin/settings/` — its leading slash thrown to the end
                    by the surrounding RTL run, which makes the route read as a
                    different route. */}
                <dd dir="auto" className="font-medium">
                  {typeof value === 'number' ? format.number(value) : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      <p className="shrink-0 text-xs text-muted-foreground">
        <span>{row.actorName ?? t('actorSystem')}</span>
        <span className="block">{format.dateTime(new Date(row.occurredAt))}</span>
      </p>
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
          ? 'border-b-2 border-primary px-4 py-2 text-sm font-semibold text-foreground'
          : 'border-b-2 border-transparent px-4 py-2 text-sm text-muted-foreground hover:text-foreground'
      }
    >
      {children}
    </button>
  );
}
