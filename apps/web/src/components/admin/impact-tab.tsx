'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { toCsv, type AdminImpactCount, type AdminImpactView } from '@tamkeen/types';

import { DataView } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useFormat } from '@/i18n/format-provider';
import { adminApi } from '@/lib/api-client';
import { DEPARTMENTS } from '@/lib/auth-constants';
import { downloadFile } from '@/lib/download';
import { useApiQuery } from '@/lib/use-api';

/**
 * §4C.8's «الأثر» — what the ministry's employees enrolled in, completed and
 * learnt, by period and department (TAM-149).
 *
 * **The tab beside it has no time axis and no department axis**, so it cannot
 * answer the question management actually asks: how many of our people took
 * part this quarter, in which directorates, what did they complete, and is it
 * growing. Everything here is the same data read through those two axes.
 *
 * **Growth is answered on every tile, not in a footnote.** A count with nothing
 * beside it is a number nobody can act on — four hundred assessed is the
 * programme working or stalling depending entirely on the quarter before — so
 * each figure carries its delta against the previous period of equal length,
 * computed by the API so the screen, the export and the printed sheet cannot
 * disagree.
 *
 * **It prints.** A one-page A4 summary through the browser's own print-to-PDF:
 * no second renderer, and the Puppeteer path stays where it belongs, on
 * certificates and the CV.
 */

/** The periods the ministry actually asks about, plus an explicit range. */
export type ImpactPreset = 'month' | 'quarter' | 'year' | 'custom';

const PRESETS: ImpactPreset[] = ['month', 'quarter', 'year', 'custom'];

/** Which column the department table is ordered by. */
type DepartmentColumn = 'department' | 'registered' | 'assessed' | 'committed' | 'active';

/** `YYYY-MM-DD` in local time — what a date input holds, and what the API's
 *  `from`/`to` are widened to at the client (a day, not an instant). */
export function isoDay(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');

  return `${value.getFullYear()}-${month}-${day}`;
}

/**
 * The two ends of a preset.
 *
 * Calendar-aligned, because that is what "this quarter" means to the person
 * asking. The *comparison* the API draws is a window of equal length rather
 * than the previous calendar quarter — ninety-one days against ninety-two would
 * report a per cent of growth that is nothing but the length of the months.
 */
export function presetRange(preset: ImpactPreset, now = new Date()): { from: string; to: string } {
  if (preset === 'year') {
    return {
      from: isoDay(new Date(now.getFullYear(), 0, 1)),
      to: isoDay(new Date(now.getFullYear(), 11, 31)),
    };
  }

  if (preset === 'quarter') {
    const first = Math.floor(now.getMonth() / 3) * 3;

    return {
      from: isoDay(new Date(now.getFullYear(), first, 1)),
      /* Day zero of the next month is the last day of this one, which is the
         only spelling that is right in February and in a leap year alike. */
      to: isoDay(new Date(now.getFullYear(), first + 3, 0)),
    };
  }

  return {
    from: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: isoDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

export function ImpactTab() {
  const t = useTranslations('admin');
  const format = useFormat();

  const [preset, setPreset] = useState<ImpactPreset>('month');
  const initial = presetRange('month');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [department, setDepartment] = useState('');

  /* One source of truth for the period: the preset seeds the two dates and
     then gets out of the way, so «فترة محددة» is not a second piece of state
     that can disagree with what is being shown. */
  const choosePreset = (next: ImpactPreset) => {
    setPreset(next);

    if (next !== 'custom') {
      const range = presetRange(next);
      setFrom(range.from);
      setTo(range.to);
    }
  };

  const impact = useApiQuery(
    () => adminApi.impact({ from, to, department: department || undefined }),
    [from, to, department],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="impact-preset" label={t('impactPeriod')}>
            {(field) => (
              <Select
                {...field}
                value={preset}
                onChange={(event) => choosePreset(event.target.value as ImpactPreset)}
              >
                {PRESETS.map((option) => (
                  <option key={option} value={option}>
                    {t(`impactPeriod${option[0]!.toUpperCase()}${option.slice(1)}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {/* The two dates are always shown, never only under «فترة محددة»:
              they are what the preset resolved to, so the administrator can see
              the period they are reading before they change it. */}
          <Field id="impact-from" label={t('auditFrom')}>
            {(field) => (
              <Input
                {...field}
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setPreset('custom');
                }}
              />
            )}
          </Field>

          <Field id="impact-to" label={t('auditTo')}>
            {(field) => (
              <Input
                {...field}
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => {
                  setTo(event.target.value);
                  setPreset('custom');
                }}
              />
            )}
          </Field>

          <Field id="impact-department" label={t('impactDepartment')}>
            {(field) => (
              <Select
                {...field}
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
              >
                <option value="">{t('impactAllDepartments')}</option>
                {DEPARTMENTS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => impact.data && exportCsv(impact.data, { from, to }, t, format)}
            disabled={impact.data === undefined}
          >
            {t('auditExport')}
          </Button>
          {/* The browser's own print-to-PDF: the stylesheet turns this tab into
              a one-page A4 summary, so there is no second renderer to keep in
              step with the screen. */}
          <Button variant="outline" onClick={() => window.print()}>
            {t('impactPrint')}
          </Button>
        </div>
      </div>

      <DataView isLoading={impact.isInitialLoad} error={impact.error} onRetry={impact.refetch}>
        {impact.data ? <ImpactBody view={impact.data} /> : null}
      </DataView>
    </div>
  );
}

function ImpactBody({ view }: { view: AdminImpactView }) {
  const t = useTranslations('admin');
  const format = useFormat();

  return (
    <div className="space-y-8">
      {/* What is being read, said once — on screen it saves the administrator
          reading the filter back, and on paper it is the only thing that makes
          the sheet interpretable at all. */}
      <p className="text-sm text-muted-foreground">
        {t('impactPeriodRange', {
          from: format.date(new Date(view.period.from), 'short'),
          to: format.date(new Date(view.period.to), 'short'),
        })}
        {view.department === null ? '' : ` · ${view.department}`}
      </p>

      <Participation view={view} />
      <Learning view={view} />
      <Learnt view={view} />
    </div>
  );
}

function Participation({ view }: { view: AdminImpactView }) {
  const t = useTranslations('admin');
  const format = useFormat();
  const { participation } = view;

  const rateDelta =
    participation.participationRate === null || participation.previousParticipationRate === null
      ? null
      : participation.participationRate - participation.previousParticipationRate;

  return (
    <section aria-labelledby="impact-participation" className="space-y-4">
      <Heading id="impact-participation">{t('impactParticipation')}</Heading>
      <p className="text-sm text-muted-foreground">{t('impactComparison')}</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile label={t('impactRegistered')} count={participation.registered} />
        <Tile label={t('impactAssessed')} count={participation.assessed} />
        <Tile label={t('impactCommitted')} count={participation.committed} />
        <Tile label={t('impactActive')} count={participation.active} />

        {/* The one rate on the tab, and the only tile that has to explain its
            own denominator: it is accounts, not the ministry's headcount, which
            the platform has no way of knowing. */}
        <Card className="p-5 sm:col-span-2">
          <p className="text-sm text-muted-foreground">{t('impactRate')}</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {participation.participationRate === null
              ? '—'
              : format.percent(participation.participationRate)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            <span>
              {t('impactRateDenominator', { count: format.number(participation.accountsToDate) })}
            </span>
            {/* The rate's own comparison, in percentage *points* — the one
                figure on the tab whose delta is not a count, and calling five
                points "five" beside a percentage would read as five per cent.
                Absent when the previous period had no accounts at all: there is
                no rate to compare against, and a "+15" against nothing would be
                an invention. */}
            {rateDelta === null ? null : (
              <>
                {' · '}
                {rateDelta === 0 ? (
                  t('impactNoChange')
                ) : (
                  <span dir="ltr" className="inline-block">
                    {t('impactRatePoints', {
                      points: `${rateDelta > 0 ? '+' : '−'}${format.number(Math.abs(rateDelta))}`,
                    })}
                  </span>
                )}
              </>
            )}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{t('impactRateHint')}</p>
        </Card>
      </div>

      <DepartmentTable rows={view.byDepartment} />
    </section>
  );
}

/**
 * The four counts per directorate.
 *
 * Sortable, because the question a table like this is opened with is "which
 * directorate is behind" — and that is a different ordering from the one it
 * opens in. The default is by name so the order is stable and says nothing;
 * a header sorts descending first, which is the direction the question is
 * asked in.
 */
function DepartmentTable({ rows }: { rows: AdminImpactView['byDepartment'] }) {
  const t = useTranslations('admin');
  const format = useFormat();

  const [column, setColumn] = useState<DepartmentColumn>('department');
  const [descending, setDescending] = useState(false);

  const columns: Array<{ key: DepartmentColumn; label: string }> = [
    { key: 'department', label: t('impactDepartment') },
    { key: 'registered', label: t('impactRegistered') },
    { key: 'assessed', label: t('impactAssessed') },
    { key: 'committed', label: t('impactCommitted') },
    { key: 'active', label: t('impactActive') },
  ];

  if (rows.length === 0) {
    return <Card className="p-6 text-sm text-muted-foreground">{t('impactDepartmentEmpty')}</Card>;
  }

  const sorted = [...rows].sort((a, b) => {
    const order =
      column === 'department'
        ? a.department.localeCompare(b.department, 'ar')
        : a[column] - b[column] || a.department.localeCompare(b.department, 'ar');

    return descending ? -order : order;
  });

  const choose = (next: DepartmentColumn) => {
    setDescending(next === column ? !descending : next !== 'department');
    setColumn(next);
  };

  return (
    <Table caption={t('impactByDepartment')} captionVisible minWidthClassName="min-w-[44rem]">
      <TableHeader>
        <TableRow>
          {columns.map(({ key, label }) => (
            <TableHead
              key={key}
              aria-sort={column === key ? (descending ? 'descending' : 'ascending') : 'none'}
            >
              {/* A button, not a click handler on the cell: sorting is an
                  action, and it has to be reachable from the keyboard. */}
              <button
                type="button"
                onClick={() => choose(key)}
                className="rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-primary-600/50"
              >
                {label}
                {column === key ? <span aria-hidden="true">{descending ? ' ↓' : ' ↑'}</span> : null}
              </button>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>

      <TableBody>
        {sorted.map((row) => (
          <TableRow key={row.department}>
            <TableCell className="font-medium text-foreground">{row.department}</TableCell>
            <TableCell>{format.number(row.registered)}</TableCell>
            <TableCell>{format.number(row.assessed)}</TableCell>
            <TableCell>{format.number(row.committed)}</TableCell>
            <TableCell>{format.number(row.active)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Learning({ view }: { view: AdminImpactView }) {
  const t = useTranslations('admin');
  const format = useFormat();
  const { learning } = view;

  return (
    <section aria-labelledby="impact-learning" className="space-y-4">
      <Heading id="impact-learning">{t('impactLearning')}</Heading>
      <p className="text-sm text-muted-foreground">{t('impactLearningHint')}</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label={t('impactCoursesPassed')} count={learning.coursesPassed} />
        <Tile label={t('impactHours')} count={toHours(learning.learningMinutes)} />
        <Tile label={t('impactCourseCertificates')} count={learning.certificatesCourse} />
        {/* One path certificate is issued per completed path, idempotently
            (§2), so the certificate count *is* the number of paths finished. */}
        <Tile label={t('impactPathsCompleted')} count={learning.certificatesPath} />
      </div>

      {/* The hours figure is short by exactly these, and saying so is the
          difference between an understated total and a wrong one (D-035). */}
      {learning.passesWithoutDuration > 0 ? (
        <p className="text-sm text-warning">
          {t('impactMissingDuration', {
            count: format.number(learning.passesWithoutDuration),
          })}
        </p>
      ) : null}

      <Trend points={view.trend} />
    </section>
  );
}

/**
 * Twelve months of passes and certificates, as columns along a time axis.
 *
 * **Months run across, so the eye reads them as time.** The first version stacked
 * twelve rows of two thin bars, which made the months a list to read rather than
 * a shape to see; here each month is a column, the oldest at the start edge, with
 * two bars rising from a shared baseline — passes and certificates side by side —
 * so a quiet month and a busy one differ by height at a glance.
 *
 * Built on the existing token palette — `bg-primary-600` and `bg-primary-800` —
 * rather than a charting dependency: the repo does not take one for a bar, and a
 * government build has to review and patch everything it ships. **Each column
 * carries its numbers twice:** printed above its bars, and in words for a screen
 * reader (`sr-only`), so the chart survives a printer that drops background
 * colours and a reader that cannot see them (WCAG 1.4.1). The bars themselves are
 * decoration.
 *
 * Narrow screens scroll the chart sideways rather than squeezing twelve columns
 * into a phone's width, where the numbers would collide.
 */
/**
 * Twelve invented months, drawn only when the real twelve are all zero.
 *
 * A chart of twelve empty columns says nothing about what it will look like, so
 * until the first pass is recorded it shows a plausible rise instead — clearly
 * tagged «أرقام تجريبية» beside the title and again under the chart, the same
 * convention the readiness blocks on this page use. The moment any month holds a
 * real figure, the real series replaces it whole: the two are never mixed.
 */
const SAMPLE_TREND: Array<{ passed: number; certificates: number }> = [
  { passed: 4, certificates: 2 },
  { passed: 6, certificates: 3 },
  { passed: 5, certificates: 3 },
  { passed: 9, certificates: 5 },
  { passed: 12, certificates: 6 },
  { passed: 10, certificates: 6 },
  { passed: 14, certificates: 8 },
  { passed: 18, certificates: 10 },
  { passed: 16, certificates: 9 },
  { passed: 21, certificates: 12 },
  { passed: 19, certificates: 11 },
  { passed: 24, certificates: 14 },
];

function Trend({ points: real }: { points: AdminImpactView['trend'] }) {
  const t = useTranslations('admin');
  const format = useFormat();

  const realTotal = real.reduce((sum, point) => sum + point.coursesPassed + point.certificates, 0);
  const sample = realTotal === 0;
  const points = sample
    ? real.map((point, index) => ({
        ...point,
        coursesPassed: SAMPLE_TREND[index]?.passed ?? 0,
        certificates: SAMPLE_TREND[index]?.certificates ?? 0,
      }))
    : real;

  /* Scaled against the busiest month rather than the total: twelve months against
     a year's total are all indistinguishable slivers. */
  const largest = points.reduce(
    (max, point) => Math.max(max, point.coursesPassed, point.certificates),
    0,
  );

  const totalPassed = points.reduce((sum, point) => sum + point.coursesPassed, 0);
  const totalCertificates = points.reduce((sum, point) => sum + point.certificates, 0);
  const nothingYet = sample;

  /* The busiest month by everything it recorded; the first one wins a tie, so
     the answer does not jump around between renders. */
  const busiest = nothingYet
    ? null
    : points.reduce((best, point) =>
        point.coursesPassed + point.certificates > best.coursesPassed + best.certificates
          ? point
          : best,
      );

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-base font-semibold text-foreground">{t('impactTrend')}</h3>
          {sample ? <Badge variant="dark">{t('impactSampleShort')}</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground">{t('impactTrendHint')}</p>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3 rounded-sm bg-primary-600" />
          {t('impactLegendPasses')}
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3 rounded-sm bg-primary-800" />
          {t('impactLegendCertificates')}
        </span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{t('impactTrendHow')}</p>

      <div className="mt-4 overflow-x-auto pb-1">
        <ul className="flex min-w-[42rem] items-stretch gap-1.5">
          {points.map((point) => {
            /* «أغسطس 2026» → the month on one line and the year under it, so
               twelve of them fit along an axis. The whole string is still read. */
            const [monthName, ...rest] = format.monthYear(point.month).split(' ');
            const year = rest.join(' ');

            return (
              <li
                key={point.month}
                className="flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-md px-1 py-2 hover:bg-neutral-100"
              >
                <span className="sr-only">{format.monthYear(point.month)}</span>
                <span className="sr-only">
                  {t('impactTrendCounts', {
                    passed: format.number(point.coursesPassed),
                    certificates: format.number(point.certificates),
                  })}
                </span>

                {/* The bars share a baseline; each number sits on top of its own. */}
                <span
                  aria-hidden="true"
                  className="flex h-40 w-full items-end justify-center gap-1 border-b border-border"
                  /* Faint rules at every quarter of the plot, so a month with
                     nothing in it still reads as a column on a scale. */
                  style={{
                    backgroundImage:
                      'linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
                    backgroundSize: '100% 25%',
                  }}
                >
                  <Column
                    value={point.coursesPassed}
                    largest={largest}
                    format={format.number}
                    className="bg-primary-600"
                  />
                  <Column
                    value={point.certificates}
                    largest={largest}
                    format={format.number}
                    className="bg-primary-800"
                  />
                </span>

                <span aria-hidden="true" className="text-center text-xs leading-tight">
                  <span className="block font-medium text-foreground">{monthName}</span>
                  {year ? <span className="block text-muted-foreground">{year}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {nothingYet ? (
        <p className="mt-3 rounded-lg bg-neutral-100 px-3 py-2 text-sm text-muted-foreground">
          {t('impactTrendSampleNote')}
        </p>
      ) : (
        <p className="mt-3 flex flex-wrap gap-x-6 gap-y-1 rounded-lg bg-neutral-100 px-3 py-2 text-sm text-foreground">
          <span>
            {t('impactTrendTotal', {
              passed: format.number(totalPassed),
              certificates: format.number(totalCertificates),
            })}
          </span>
          {busiest ? (
            <span>{t('impactTrendBusiest', { month: format.monthYear(busiest.month) })}</span>
          ) : null}
        </p>
      )}
    </Card>
  );
}

/** One bar, rising from the baseline, with its number above it. */
function Column({
  value,
  largest,
  format,
  className,
}: {
  value: number;
  largest: number;
  format: (value: number) => string;
  className: string;
}) {
  /* A month with anything in it never rounds to an invisible bar. */
  const height = largest === 0 || value === 0 ? 0 : Math.max(4, (value / largest) * 100);

  return (
    <span className="flex h-full w-1/2 max-w-6 flex-col items-center justify-end gap-0.5">
      <span className="text-[11px] leading-none text-muted-foreground">{format(value)}</span>
      <span
        className={`block w-full rounded-t ${value === 0 ? 'bg-neutral-200' : className}`}
        /* Four fifths of the plot, leaving the number room above the tallest bar. */
        style={{ height: value === 0 ? '2px' : `${height * 0.8}%` }}
      />
    </span>
  );
}

function Learnt({ view }: { view: AdminImpactView }) {
  const t = useTranslations('admin');
  const format = useFormat();

  return (
    <section aria-labelledby="impact-learnt" className="space-y-4">
      <Heading id="impact-learnt">{t('impactLearnt')}</Heading>

      <div className="grid gap-4 lg:grid-cols-2">
        <List
          title={t('impactTopCourses')}
          rows={view.topCourses.map((row) => ({
            id: row.courseId,
            name: row.title,
            detail: `${t('impactCoursePasses', { count: format.number(row.passes) })} · ${
              row.averageGrade === null
                ? t('impactNoGrade')
                : t('impactAverageGrade', { grade: format.percent(row.averageGrade) })
            }`,
          }))}
        />

        <List
          title={t('impactTopPaths')}
          rows={view.topPaths.map((row) => ({
            id: row.pathId,
            name: row.name,
            detail: t('impactPathCompletions', { count: format.number(row.completions) }),
          }))}
        />

        {/* Where the period's assessments put people (D-134). An empty list is a
            real finding — a quarter in which no directorate sat an assessment —
            so `List` renders its own empty state rather than the block
            vanishing. */}
        <List
          title={t('impactPlacements')}
          rows={view.placements.map((row) => ({
            id: `${row.pathId}-${row.levelId}`,
            name: `${row.pathName} · ${row.levelName}`,
            detail: t('impactPlacementCount', { count: format.number(row.employees) }),
          }))}
        />
      </div>
    </section>
  );
}

function List({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ id: string; name: string; detail: string }>;
}) {
  const t = useTranslations('admin');

  return (
    <Card className="p-0">
      <h3 className="border-b border-border px-5 py-4 text-base font-semibold text-foreground">
        {title}
      </h3>

      {rows.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">{t('reportEmpty')}</p>
      ) : (
        <ul aria-label={title} className="divide-y divide-border">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-3"
            >
              {/* A course may be authored in English (D-047), and an LTR title
                  in an RTL run has its punctuation thrown to the wrong end. */}
              <span dir="auto" className="text-sm text-foreground">
                {row.name}
              </span>
              <span className="text-sm text-muted-foreground">{row.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Tile({ label, count }: { label: string; count: AdminImpactCount }) {
  const t = useTranslations('admin');
  const format = useFormat();

  return (
    <Card className="p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{format.number(count.value)}</p>

      <p className="mt-1 text-sm text-muted-foreground">
        <span className="sr-only">{t('impactVsPrevious')}: </span>
        {count.delta === 0 ? (
          t('impactNoChange')
        ) : (
          /* The sign leads the number, which only reads correctly left to
             right — inside the RTL paragraph it would otherwise land after it
             and turn a fall into what looks like a rise. */
          <span dir="ltr" className="inline-block">
            {count.delta > 0 ? '+' : '−'}
            {format.number(Math.abs(count.delta))}
          </span>
        )}
      </p>
    </Card>
  );
}

function Heading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="text-lg font-semibold text-foreground">
      {children}
    </h2>
  );
}

/** Minutes as whole hours, with the delta converted the same way. */
function toHours(minutes: AdminImpactCount): AdminImpactCount {
  const value = Math.round(minutes.value / 60);
  const previous = Math.round(minutes.previous / 60);

  /* Recomputed from the rounded hours rather than converted from the minute
     delta: a tile that reads 41 against 40 must not print a change of two. */
  return { value, previous, delta: value - previous };
}

/**
 * Every table on the tab as one file (TAM-149, D-076's pattern).
 *
 * Rendered in the browser, like the trail's export and for the same reason:
 * every heading in it is Arabic copy, and that lives in the message catalogue,
 * not in the API. `toCsv` supplies the BOM without which Excel reads the whole
 * file as the system codepage and every department name arrives as mojibake.
 *
 * The generic value columns follow the reports export's shape; each multi-column
 * block prints its own caption row first, so a reader knows what the third and
 * fourth columns hold in that section.
 */
function exportCsv(
  view: AdminImpactView,
  /* The two days the screen is showing, for the filename. The view's own
     `period` is an ISO instant, and slicing ten characters off it names the
     file by the UTC date — so a year selected in Riyadh downloaded as
     `2025-12-31_2026-12-31`, which is a different period from the one in it. */
  days: { from: string; to: string },
  t: ReturnType<typeof useTranslations<'admin'>>,
  format: ReturnType<typeof useFormat>,
): void {
  const participation = t('impactParticipation');
  const byDepartment = t('impactByDepartment');
  const learning = t('impactLearning');
  const trend = t('impactTrend');

  const count = (label: string, section: string, value: AdminImpactCount) => [
    section,
    label,
    value.value,
    value.previous,
    '',
    '',
  ];

  const csv = toCsv(
    [
      t('impactCsvSection'),
      t('impactCsvItem'),
      t('impactCsvValue'),
      t('impactCsvExtra'),
      t('impactCsvExtraTwo'),
      t('impactCsvExtraThree'),
    ],
    [
      count(t('impactRegistered'), participation, view.participation.registered),
      count(t('impactAssessed'), participation, view.participation.assessed),
      count(t('impactCommitted'), participation, view.participation.committed),
      count(t('impactActive'), participation, view.participation.active),
      [
        participation,
        t('impactRate'),
        view.participation.participationRate ?? '',
        view.participation.previousParticipationRate ?? '',
        view.participation.accountsToDate,
        '',
      ],

      [
        byDepartment,
        t('impactDepartment'),
        t('impactRegistered'),
        t('impactAssessed'),
        t('impactCommitted'),
        t('impactActive'),
      ],
      ...view.byDepartment.map((row) => [
        byDepartment,
        row.department,
        row.registered,
        row.assessed,
        row.committed,
        row.active,
      ]),

      count(t('impactCoursesPassed'), learning, view.learning.coursesPassed),
      count(t('impactHours'), learning, toHours(view.learning.learningMinutes)),
      count(t('impactCourseCertificates'), learning, view.learning.certificatesCourse),
      count(t('impactPathsCompleted'), learning, view.learning.certificatesPath),

      [trend, t('impactPeriod'), t('impactLegendPasses'), t('impactLegendCertificates'), '', ''],
      ...view.trend.map((point) => [
        trend,
        format.monthYear(point.month),
        point.coursesPassed,
        point.certificates,
        '',
        '',
      ]),

      [
        t('impactTopCourses'),
        t('impactCsvItem'),
        t('impactCoursesPassed'),
        t('impactAverageGradeLabel'),
        '',
        '',
      ],
      ...view.topCourses.map((row) => [
        t('impactTopCourses'),
        row.title,
        row.passes,
        row.averageGrade ?? '',
        '',
        '',
      ]),

      [t('impactTopPaths'), t('impactCsvItem'), t('impactPathsCompleted'), '', '', ''],
      ...view.topPaths.map((row) => [t('impactTopPaths'), row.name, row.completions, '', '', '']),

      /* The path and the rung, spelled out: a level id in an Arabic report names
         nothing, which is the same reason the rest of this export carries names
         rather than keys. */
      ...view.placements.map((row) => [
        t('impactPlacements'),
        `${row.pathName} · ${row.levelName}`,
        row.employees,
        '',
        '',
        '',
      ]),
    ],
  );

  /* The period in the filename: two exports of the same tab are different
     reports, and a folder of `tamkeen-impact.csv (3)` is not an archive. */
  downloadFile(`tamkeen-impact-${days.from}_${days.to}.csv`, csv);
}
