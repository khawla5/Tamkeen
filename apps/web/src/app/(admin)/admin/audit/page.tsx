'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  AUDIT_ACTION_CATEGORIES,
  AUDIT_ACTION_CATEGORY,
  toCsv,
  type AdminAuditRow,
  type AdminReports,
  type AuditActionCode,
} from '@tamkeen/types';

import { ImpactTab } from '@/components/admin/impact-tab';
import { AdminPage } from '@/components/layout/admin-page';
import { DataView } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Tabs } from '@/components/ui/tabs';
import { useFormat } from '@/i18n/format-provider';
import { adminApi } from '@/lib/api-client';
import { downloadFile } from '@/lib/download';
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
  const [tab, setTab] = useState<'impact' | 'reports' | 'audit'>('impact');

  /*
   * Three views of §4C.8, on the shared tablist (TAM-118) rather than the pair
   * of buttons this page hand-rolled: real `tab`/`tabpanel` semantics, arrow
   * keys that move the right way in an RTL page, and one implementation to fix
   * when any of that is wrong.
   *
   * «الأثر» leads because it answers the question the ministry opens this page
   * with — how many of our people took part, and is it growing. The reports are
   * unchanged behind it, and the trail last: it is evidence, consulted when
   * something needs explaining rather than read as a report.
   */
  return (
    <AdminPage title={t('auditTitle')}>
      <Tabs
        label={t('auditTitle')}
        value={tab}
        onValueChange={(value) => setTab(value as 'impact' | 'reports' | 'audit')}
        items={[
          { value: 'impact', label: t('auditTabImpact') },
          { value: 'reports', label: t('auditTabReports') },
          { value: 'audit', label: t('auditTabTrail') },
        ]}
        /* The tablist is chrome; on paper the sheet carries the tab's own
           heading and its period instead. */
        className="print:contents"
        panelClassName="pt-6"
      >
        {tab === 'impact' ? <ImpactTab /> : tab === 'reports' ? <ReportsTab /> : <TrailTab />}
      </Tabs>
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
        {/* Every stage the API counts, so the screen and the export agree about
            how the programme is doing (TAM-138). */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label={t('statAssigned')} value={format.number(reports.journey.assigned)} />
          <Stat label={t('statPlaced')} value={format.number(reports.journey.placed)} />
          <Stat label={t('statCompletedPaths')} value={format.number(reports.journey.completed)} />
          <Stat
            label={t('statPathCompletion')}
            value={
              reports.journey.pathCompletionRate === null
                ? '—'
                : format.percent(reports.journey.pathCompletionRate)
            }
          />
          <Stat
            label={t('statCoursesPassed')}
            value={format.number(reports.journey.coursesPassed)}
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
                    assigned: format.number(row.assigned),
                    completed: format.number(row.completed),
                  })}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section aria-labelledby="report-placements">
        <Heading id="report-placements">{t('reportPlacements')}</Heading>
        {/* What the code distribution used to be, asked the way the assigned
            model makes it answerable (D-134): a code told the ministry what
            somebody was drawn to, a placement tells them what somebody can
            already do — which is the fact a training programme is planned
            against. */}
        <p className="mb-3 text-sm text-muted-foreground">{t('reportPlacementsHint')}</p>

        {reports.placementDistribution.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">{t('reportEmpty')}</Card>
        ) : (
          <Card className="divide-y divide-border">
            {reports.placementDistribution.map((row) => (
              <div
                key={`${row.pathId}-${row.levelId}`}
                className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-3"
              >
                <span className="text-sm text-foreground">
                  {row.pathName}
                  <span aria-hidden="true"> · </span>
                  {row.levelName}
                </span>
                <span className="text-sm text-muted-foreground">
                  {t('reportPlacementCount', { count: format.number(row.employees) })}
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

/** What the trail is filtered by — the screen's state, and the export's query. */
interface AuditFilters {
  action?: string;
  outcome?: 'SUCCESS' | 'FAILURE';
  from?: string;
  to?: string;
}

/**
 * The most rows one export carries.
 *
 * The API's own ceiling on `pageSize`. An export is not a licence to page the
 * whole table into memory — on the table that will be the largest in the system
 * that is how this endpoint becomes the way to take the API down — so an export
 * of a very wide period is a narrower period's worth of the *newest* entries,
 * which is why the date filters exist beside it.
 */
const AUDIT_EXPORT_LIMIT = 5_000;

function TrailTab() {
  const t = useTranslations('admin');
  const tAction = useTranslations('admin.auditAction');

  const tCategory = useTranslations('admin.auditCategory');

  const [action, setAction] = useState('');
  const [outcome, setOutcome] = useState<'SUCCESS' | 'FAILURE' | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [before, setBefore] = useState<string | undefined>(undefined);

  const filters = {
    action: action || undefined,
    outcome: outcome || undefined,
    from: from || undefined,
    to: to || undefined,
  };

  /* Every filter clears the cursor: a `before` from the previous result set
     points into rows the new filter may not contain. */
  const log = useApiQuery(
    () => adminApi.auditLog({ ...filters, before }),
    [action, outcome, from, to, before],
  );

  const exportCsv = useAuditCsvExport(filters);

  /*
   * The action list, grouped by the area it belongs to (TAM-138).
   *
   * Fifty-three options in one flat list is not a filter anybody uses. The
   * grouping is the vocabulary's own (`AUDIT_ACTION_CATEGORY`), so a heading
   * here cannot disagree with what the codebase records; within a group the
   * sort is by the Arabic label, because ordering by a code the reader never
   * sees is no order at all.
   */
  const grouped = AUDIT_ACTION_CATEGORIES.map((category) => ({
    category,
    options: (log.data?.actions ?? [])
      .filter((code) => AUDIT_ACTION_CATEGORY[code as AuditActionCode] === category)
      .map((code) => ({ code, label: tAction.has(code) ? tAction(code) : code }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ar')),
  })).filter((group) => group.options.length > 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              {grouped.map((group) => (
                <optgroup key={group.category} label={tCategory(group.category)}>
                  {group.options.map(({ code, label }) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </optgroup>
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

        {/* A period, which is how an administrator actually arrives here — "what
            happened around the day that certificate was issued". The API has
            accepted `from`/`to` since §4C.8 was built; nothing offered them. */}
        <Field id="audit-from" label={t('auditFrom')}>
          {(field) => (
            <Input
              {...field}
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => {
                setFrom(event.target.value);
                setBefore(undefined);
              }}
            />
          )}
        </Field>

        <Field id="audit-to" label={t('auditTo')}>
          {(field) => (
            <Input
              {...field}
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => {
                setTo(event.target.value);
                setBefore(undefined);
              }}
            />
          )}
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t('auditFilterHint')}</p>

        <div className="flex items-center gap-3">
          {exportCsv.error ? (
            <span role="alert" className="text-sm text-danger">
              {t('auditExportFailed')}
            </span>
          ) : null}
          <Button variant="outline" onClick={exportCsv.run} disabled={exportCsv.isRunning}>
            {exportCsv.isRunning ? t('auditExporting') : t('auditExport')}
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
  const tValue = useTranslations('admin.auditValue');
  const tSetting = useTranslations('admin.setting');
  const format = useFormat();

  const target = targetText(row, { tTarget, tSetting });
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
                  {detailValue(key, value, { tValue, format })}
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

/**
 * What an entry was about, as «نوع: الاسم».
 *
 * Shared by the row and the export so the two cannot disagree (TAM-138).
 *
 * A setting names itself: its target id *is* the key, and §4C.6's Arabic name
 * for it is already in the message catalogue — so it resolves here rather than
 * in the API, which has no business holding Arabic copy. The type stays as the
 * qualifier because «مسار» and «مسار موظف» are different things that can share
 * a name.
 */
function targetText(
  row: AdminAuditRow,
  copy: {
    tTarget: { has: (key: string) => boolean; (key: string): string };
    tSetting: { has: (key: string) => boolean; (key: string): string };
  },
): string | null {
  const { tTarget, tSetting } = copy;

  if (row.targetType === null) {
    return null;
  }

  const type = tTarget.has(row.targetType) ? tTarget(row.targetType) : row.targetType;

  const label =
    row.targetType === 'setting' && row.targetId !== null && tSetting.has(row.targetId)
      ? tSetting(row.targetId)
      : row.targetLabel;

  return label === null ? type : `${type}: ${label}`;
}

/**
 * One detail value, in words (TAM-138).
 *
 * **The keys were translated and the values were not.** A row read «الحالة:
 * HIDDEN_BUT_COMPLETABLE», «الدور: SUPER_ADMIN», «الحقول المعدَّلة:
 * department,fullName» — an Arabic label followed by the codebase's own
 * vocabulary, which is exactly the "technically exposed" half of the entry.
 *
 * Four rules, in order:
 *  - a boolean is «نعم»/«لا»; `true` is not a word in any language the ministry
 *    reads, and the audit writer stores real booleans as well as the string;
 *  - a number goes through the shared formatter, so digits honour D-018;
 *  - a comma-joined list — changed fields, publish blockers — is split and each
 *    part translated, because that is the only form the writers emit lists in
 *    (`AuditEntry.detail` is scalar-only by design, §6).
 *
 * Anything with no copy falls through as itself. That is deliberate and it is
 * where the route of a denied request lands: `/api/admin/settings` is the point
 * of an `AUTHZ_DENIED` entry, not an identifier to be scrubbed.
 */
export function detailValue(
  key: string,
  value: string | number | boolean,
  copy: {
    tValue: { has: (key: string) => boolean; (key: string): string };
    format: ReturnType<typeof useFormat>;
  },
): string {
  const { tValue, format } = copy;

  if (typeof value === 'boolean') {
    return tValue(value ? 'true' : 'false');
  }

  if (typeof value === 'number') {
    return format.number(value);
  }

  const word = (token: string): string => (tValue.has(token) ? tValue(token) : token);

  if (value.includes(',')) {
    return value
      .split(',')
      .map((part) => word(part.trim()))
      .join('، ');
  }

  return word(value);
}

/**
 * The trail as a CSV the ministry can read (TAM-138).
 *
 * **Built here rather than by the API, and that is the point.** The export used
 * to be a link to `/api/admin/audit.csv`, which wrote the raw vocabulary —
 * `ADMIN_SETTING_CHANGED,SUCCESS,setting,BAD_PASSWORD` — so the file said
 * something different from the screen it came from. Arabic copy lives in the
 * message catalogue by convention and the API has none, so the only way to make
 * the two agree is to render the file where the words are. `toCsv` is the same
 * shared implementation the reports export uses, quoting and BOM included, so
 * nothing about Excel or CSV injection is re-decided here.
 *
 * Bounded at the API's own maximum page, and the request carries the filters the
 * screen is showing: an export that ignored them would answer a question nobody
 * asked.
 */
function useAuditCsvExport(filters: AuditFilters): {
  run: () => void;
  isRunning: boolean;
  error: boolean;
} {
  const t = useTranslations('admin');
  const tAction = useTranslations('admin.auditAction');
  const tReason = useTranslations('admin.auditReason');
  const tTarget = useTranslations('admin.auditTargetType');
  const tDetail = useTranslations('admin.auditDetail');
  const tValue = useTranslations('admin.auditValue');
  const tSetting = useTranslations('admin.setting');
  const format = useFormat();

  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState(false);

  const run = async (): Promise<void> => {
    setIsRunning(true);
    setError(false);

    try {
      const page = await adminApi.auditLog({ ...filters, pageSize: AUDIT_EXPORT_LIMIT });

      const csv = toCsv(
        [
          t('auditColumnDate'),
          t('auditColumnAction'),
          t('auditOutcome'),
          t('auditColumnActor'),
          t('auditTarget'),
          t('auditReasonLabel'),
          t('auditDetailsLabel'),
        ],
        page.rows.map((row) => [
          format.dateTime(new Date(row.occurredAt)),
          tAction.has(row.action) ? tAction(row.action) : row.action,
          t(row.outcome === 'FAILURE' ? 'outcomeFailure' : 'outcomeSuccess'),
          row.actorName ?? t('actorSystem'),
          targetText(row, { tTarget, tSetting }) ?? t('auditNoTarget'),
          row.reason === null ? '' : tReason.has(row.reason) ? tReason(row.reason) : row.reason,
          Object.entries(row.detail ?? {})
            .map(
              ([key, value]) =>
                `${tDetail.has(key) ? tDetail(key) : key}: ${detailValue(key, value, {
                  tValue,
                  format,
                })}`,
            )
            .join(' | '),
        ]),
      );

      downloadFile('tamkeen-audit.csv', csv);
    } catch {
      setError(true);
    } finally {
      setIsRunning(false);
    }
  };

  return { run: () => void run(), isRunning, error };
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
