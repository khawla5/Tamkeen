'use client';

import { ArrowLeft, TrendingDown, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { InteractiveSaudiMap } from '@/components/brand/interactive-saudi-map';
import { SAUDI_REGIONS } from '@/components/brand/saudi-map-paths';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useFormat } from '@/i18n/format-provider';
import {
  BAND_HIGH_FROM,
  BAND_MID_FROM,
  SAMPLE_READINESS,
  summarize,
  type ReadinessBand,
  type ReadinessTarget,
} from '@/lib/impact-readiness';
import { cn } from '@/lib/utils';

/**
 * «قياس الأثر» — has the need been met?
 *
 * The proposal deck's slide 6 as a screen: one target, then the four questions
 * a responsible officer asks of it — how much of the need is met (the KPIs and
 * the jobs), where the gaps are and which to close first (the map and the
 * ranking), how long it took against the date (the timeline), and what it
 * changed on the ground (the indicators).
 *
 * **Illustrative.** The platform records no targets, no region or unit on an
 * account and no field indicators yet, so this renders `SAMPLE_READINESS` and
 * every block says so with a «أرقام تجريبية» tag. The calculations are
 * `summarize()`'s and the layout is final; what changes the day there is data is
 * the one `source` it is handed.
 *
 * **Colour is never the only carrier.** Each band is a word («أولوية عالية»), a
 * percentage printed on the map, and a bar with its value in text — the tint
 * only repeats it (WCAG 1.4.1).
 */

const REGION_NAME = Object.fromEntries(SAUDI_REGIONS.map((region) => [region.id, region.name]));

/**
 * The fill of a meter, by band — the same three states the map uses, and all of
 * them the platform's one green, in three depths: the less ready, the paler. No
 * red, no amber: the screen is a single colour and says what a band *means* in
 * words (the priority tag, the percentage beside every bar), never in hue.
 *
 * The palest step carries a hairline of the mid green, because pale-on-pale is
 * how a short bar on a neutral track goes missing.
 */
const BAND_BAR: Record<ReadinessBand, string> = {
  low: 'bg-primary-200 ring-1 ring-inset ring-primary-600/70',
  mid: 'bg-primary-600',
  high: 'bg-primary-800',
};

/** The priority tag, in the same three depths: the most urgent is the deepest. */
const PRIORITY_TAG: Record<ReadinessBand, string> = {
  low: 'border-primary-800 bg-primary-800 text-white',
  mid: 'border-primary-600 bg-primary-100 text-primary-800',
  high: 'border-primary-200 bg-primary-50 text-primary-700',
};

/** The legend swatches — written out in full because Tailwind reads class names, not templates. */
const BAND_SWATCH: Record<ReadinessBand, string> = {
  low: 'bg-primary-600/15',
  mid: 'bg-primary-600/40',
  high: 'bg-primary-600/75',
};

export function ImpactReadiness({
  source = SAMPLE_READINESS,
  now,
}: {
  source?: ReadinessTarget;
  /** Injected so a test can fix the clock; the page leaves it to "now". */
  now?: Date;
}) {
  const t = useTranslations('admin');
  const format = useFormat();

  const [fallbackNow] = useState(() => new Date());
  const summary = useMemo(() => summarize(source, now ?? fallbackNow), [source, now, fallbackNow]);
  const { timeline } = summary;

  const sample = <Badge variant="dark">{t('impactSampleShort')}</Badge>;

  const paceKnown = Number.isFinite(timeline.aheadDays);
  const ahead = timeline.aheadDays >= 0;

  return (
    <div className="space-y-6">
      <Card edge="primary" className="p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold text-foreground">
            {t('readyTarget', { title: source.title })}
          </h2>
          <Badge variant="dark">{t('impactSample')}</Badge>
        </div>
        <p className="mt-2 text-base font-medium text-foreground">{source.need}</p>
        <p className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <span>{t('readyMetaPath', { path: source.path })}</span>
          <span>{t('readyMetaDue', { date: format.date(summary.due) })}</span>
          <span>{t('readyMetaRequired', { count: format.number(summary.target) })}</span>
        </p>
      </Card>

      <section
        aria-label={t('readyKpisLabel')}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Card edge="primary" className="p-6">
          <p className="text-sm text-muted-foreground">{t('readyNeedMet')}</p>
          <p className="mt-1 text-4xl font-bold leading-tight text-foreground">
            {format.percent(summary.percent)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('readyNeedMetSub', {
              qualified: format.number(summary.qualified),
              total: format.number(summary.target),
            })}
          </p>
        </Card>

        <Kpi label={t('readyGap')} value={format.number(summary.gap)} sub={t('readyGapSub')} />
        <Kpi
          label={t('readyDaysLeft')}
          value={t('readyDaysValue', { days: format.number(timeline.daysLeft) })}
          sub={t('readyDaysSub')}
        />
        <Kpi
          label={t('readyPace')}
          value={
            paceKnown
              ? t(ahead ? 'readyPaceAhead' : 'readyPaceBehind', {
                  days: format.number(Math.abs(timeline.aheadDays)),
                })
              : t('readyPaceUnknown')
          }
          valueClassName={paceKnown ? (ahead ? 'text-primary-700' : 'text-neutral-700') : undefined}
          sub={t('readyPaceSub')}
        />
      </section>

      <GeoCard summary={summary} sample={sample} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-foreground">{t('readyJobsTitle')}</h2>
            {sample}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t('readyJobsHint')}</p>
          <ul aria-label={t('readyJobsTitle')} className="mt-5 space-y-4">
            {summary.jobs.map((job) => (
              <li key={job.name}>
                <Meter
                  title={job.name}
                  detail={t('readyRow', {
                    percent: format.percent(job.percent),
                    qualified: format.number(job.qualified),
                    total: format.number(job.target),
                  })}
                  percent={job.percent}
                  band={job.band}
                />
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-foreground">{t('readyTimeTitle')}</h2>
            {sample}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t('readyTimeHint')}</p>

          {/* The achieved share against the share of time gone: ahead of the plan
              when the fill passes the plan's tick. */}
          <div
            role="img"
            aria-label={t('readyTimelineLabel', {
              planned: format.percent(timeline.plannedPercent),
              achieved: format.percent(summary.percent),
            })}
            className="relative mx-2 mb-14 mt-12 h-4 rounded-full bg-neutral-200"
          >
            <div
              className="absolute inset-y-0 start-0 rounded-full bg-primary-600"
              style={{ width: `${summary.percent}%` }}
            />
            <Tick percent={timeline.plannedPercent} above>
              {t('readyTickPlan', { percent: format.percent(timeline.plannedPercent) })}
            </Tick>
            <Tick percent={summary.percent}>
              {t('readyTickAchieved', { percent: format.percent(summary.percent) })}
            </Tick>
          </div>

          <div className="mx-2 flex justify-between gap-4 text-sm text-muted-foreground">
            <span>{t('readyAnnounced', { date: format.date(summary.announced) })}</span>
            <span>{t('readyDue', { date: format.date(summary.due) })}</span>
          </div>

          <p className="mt-5 font-semibold text-foreground">
            {paceKnown
              ? t(ahead ? 'readyVerdictAhead' : 'readyVerdictBehind', {
                  days: format.number(Math.abs(timeline.aheadDays)),
                })
              : t('readyVerdictUnknown')}
          </p>
          {paceKnown ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {t('readyProjected', { date: format.date(timeline.projected) })}
            </p>
          ) : null}
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold text-foreground">{t('readyPerfTitle')}</h2>
          {sample}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t('readyPerfHint')}</p>

        {/* One card per indicator: where it was, where it is, how far it moved.
            The table this replaced said the same four things in four columns; the
            before and after are the point, so they are set beside each other
            with the movement named underneath and drawn as two bars on one
            scale. The sign is spelled out and the change is worded («تحسّن» /
            «تراجع») — colour and the arrow only echo it (WCAG 1.4.1). */}
        <ul aria-label={t('readyPerfTitle')} className="mt-4 grid gap-4 md:grid-cols-2">
          {summary.indicators.map((row) => {
            const scale = Math.max(row.before, row.after, 1);
            const Trend = row.change < 0 ? TrendingDown : TrendingUp;

            return (
              <li key={row.name} className="rounded-xl border border-border bg-card p-4">
                <p className="font-medium text-foreground">{row.name}</p>

                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('readyPerfBefore')}</p>
                    <p className="text-2xl font-medium text-neutral-700">
                      {format.number(row.before)}
                    </p>
                  </div>

                  <ArrowLeft aria-hidden="true" className="mb-2 size-5 shrink-0 text-neutral-400" />

                  <div>
                    <p className="text-xs text-muted-foreground">{t('readyPerfAfter')}</p>
                    <p
                      className={cn(
                        'text-2xl font-semibold',
                        row.improved ? 'text-primary-700' : 'text-foreground',
                      )}
                    >
                      {format.number(row.after)}
                    </p>
                  </div>
                </div>

                {/* Before and after on one scale, so the gap between them is the
                    thing you see. */}
                <span aria-hidden="true" className="mt-3 flex flex-col gap-1">
                  <span className="block h-1.5 overflow-hidden rounded-full bg-neutral-100">
                    <span
                      className="block h-full rounded-full bg-neutral-400"
                      style={{ width: `${(row.before / scale) * 100}%` }}
                    />
                  </span>
                  <span className="block h-1.5 overflow-hidden rounded-full bg-neutral-100">
                    <span
                      className={cn(
                        'block h-full rounded-full',
                        row.improved ? 'bg-primary-600' : 'bg-neutral-600',
                      )}
                      style={{ width: `${(row.after / scale) * 100}%` }}
                    />
                  </span>
                </span>

                <p
                  className={cn(
                    'mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold',
                    row.improved
                      ? 'bg-primary-50 text-primary-700'
                      : 'bg-neutral-100 text-neutral-700',
                  )}
                >
                  <Trend aria-hidden="true" className="size-4 shrink-0" />
                  {/* The sign leads the number, which only reads correctly left to
                      right — inside the RTL card it would otherwise land after it
                      and turn a fall into what looks like a rise. */}
                  <span dir="ltr" className="inline-block">
                    {row.change > 0 ? '+' : row.change < 0 ? '−' : ''}
                    {row.isRate
                      ? t('readyPerfPoints', { value: format.number(Math.abs(row.change)) })
                      : format.percent(Math.abs(row.change))}
                  </span>
                  <span>({t(row.improved ? 'readyPerfBetter' : 'readyPerfWorse')})</span>
                </p>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  valueClassName,
}: {
  label: string;
  value: string;
  sub: string;
  valueClassName?: string;
}) {
  return (
    <Card className="p-6">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-3xl font-bold leading-tight text-foreground', valueClassName)}>
        {value}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{sub}</p>
    </Card>
  );
}

function Tick({
  percent,
  above = false,
  children,
}: {
  percent: number;
  above?: boolean;
  children: string;
}) {
  return (
    <div
      className="absolute -top-1.5 h-7 w-0.5 bg-neutral-800"
      style={{ insetInlineStart: `${percent}%` }}
    >
      <span
        className={cn(
          'absolute -translate-x-1/2 whitespace-nowrap text-xs text-muted-foreground rtl:translate-x-1/2',
          above ? '-top-6' : 'top-9',
        )}
      >
        {children}
      </span>
    </div>
  );
}

/**
 * A labelled bar whose value is also written out.
 *
 * Own anatomy rather than `Progress`: that one is single-tone and prints its
 * text beneath, and this one's fill has to carry the band as well as the share.
 */
function Meter({
  title,
  detail,
  percent,
  band,
  extra,
}: {
  title: string;
  detail: string;
  percent: number;
  band: ReadinessBand;
  extra?: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <span dir="auto" className="font-medium text-foreground">
          {title}
          {extra}
        </span>
        <span className="text-muted-foreground">{detail}</span>
      </div>
      <div
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={detail}
        className="h-2.5 overflow-hidden rounded-full bg-neutral-200"
      >
        <div
          className={cn('h-full rounded-full', BAND_BAR[band])}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  );
}

function GeoCard({
  summary,
  sample,
}: {
  summary: ReturnType<typeof summarize>;
  sample: React.ReactNode;
}) {
  const t = useTranslations('admin');
  const format = useFormat();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  /* One hovered region, whichever side lit it — the map or a row of the ranking —
     so the two always show the same thing. */
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [bandFilter, setBandFilter] = useState<ReadinessBand | null>(null);

  const bands = Object.fromEntries(summary.regions.map((region) => [region.regionId, region.band]));
  const captions = Object.fromEntries(
    summary.regions.map((region) => [region.regionId, format.percent(region.percent)]),
  );
  const byId = Object.fromEntries(summary.regions.map((region) => [region.regionId, region]));
  const selected = byId[selectedId ?? ''] ?? null;

  const priorityLabel: Record<ReadinessBand, string> = {
    low: t('readyPrioHigh'),
    mid: t('readyPrioMid'),
    high: t('readyPrioLow'),
  };

  const listed = summary.priorities.filter(
    (region) => bandFilter === null || region.band === bandFilter,
  );

  const toggle = (regionId: string) =>
    setSelectedId((current) => (current === regionId ? null : regionId));

  const legend: Array<{ band: ReadinessBand; swatch: string; text: string }> = [
    {
      band: 'low',
      swatch: BAND_SWATCH.low,
      text: t('readyBandLow', { limit: format.percent(BAND_MID_FROM) }),
    },
    {
      band: 'mid',
      swatch: BAND_SWATCH.mid,
      text: t('readyBandMid', {
        from: format.percent(BAND_MID_FROM),
        to: format.percent(BAND_HIGH_FROM),
      }),
    },
    {
      band: 'high',
      swatch: BAND_SWATCH.high,
      text: t('readyBandHigh', { limit: format.percent(BAND_HIGH_FROM) }),
    },
  ];

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-foreground">{t('readyGeoTitle')}</h2>
        {sample}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t('readyGeoHint')}</p>

      <div className="mt-5 grid items-start gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <InteractiveSaudiMap
            label={t('readyMapLabel')}
            selectedId={selectedId}
            onSelect={(region) => setSelectedId(region?.id ?? null)}
            bands={bands}
            captions={captions}
            highlightId={hoveredId}
            onHoverChange={setHoveredId}
            dimmed={(regionId) => bandFilter !== null && bands[regionId] !== bandFilter}
            zoomToSelected
            resetLabel={t('readyResetMap')}
            tooltip={(region) => {
              const stat = byId[region.id];

              return stat ? (
                <span className="block space-y-0.5">
                  <span className="block font-semibold">{region.name}</span>
                  <span className="block text-neutral-200">
                    {t('readyRow', {
                      percent: format.percent(stat.percent),
                      qualified: format.number(stat.qualified),
                      total: format.number(stat.target),
                    })}
                  </span>
                  <span className="block text-neutral-200">
                    {t('readyTipGap', { gap: format.number(stat.gap) })} ·{' '}
                    {priorityLabel[stat.band]}
                  </span>
                </span>
              ) : (
                region.name
              );
            }}
          />

          {/* The legend is also the filter: choosing a band fades the other regions
              and narrows the ranking to it; choosing it again lifts the filter. */}
          <div
            role="group"
            aria-label={t('readyFilterLabel')}
            className="mt-4 flex flex-wrap gap-2"
          >
            {legend.map((item) => (
              <button
                key={item.band}
                type="button"
                aria-pressed={bandFilter === item.band}
                onClick={() =>
                  setBandFilter((current) => (current === item.band ? null : item.band))
                }
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary-600/50',
                  bandFilter === item.band
                    ? 'border-neutral-800 bg-neutral-100 font-semibold text-foreground'
                    : 'border-border bg-surface text-muted-foreground hover:bg-neutral-50',
                )}
              >
                <i
                  className={cn('inline-block size-3.5 rounded border border-border', item.swatch)}
                />
                {item.text}
              </button>
            ))}
          </div>

          <div aria-live="polite" className="mt-4 min-h-24 rounded-xl bg-neutral-100 p-4">
            {selected === null ? (
              <p className="text-sm text-muted-foreground">{t('readyDetailNone')}</p>
            ) : (
              <>
                <h3 className="font-semibold text-foreground">
                  {t('readyDetailTitle', { name: REGION_NAME[selected.regionId] ?? '' })}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('readyDetailLine', {
                    percent: format.percent(selected.percent),
                    qualified: format.number(selected.qualified),
                    total: format.number(selected.target),
                    gap: format.number(selected.gap),
                  })}
                </p>
                <ul className="mt-3 space-y-3">
                  {selected.units.map((unit) => (
                    <li key={unit.name}>
                      <Meter
                        title={unit.name}
                        detail={t('readyRow', {
                          percent: format.percent(unit.percent),
                          qualified: format.number(unit.qualified),
                          total: format.number(unit.target),
                        })}
                        percent={unit.percent}
                        band={unit.band}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-base font-semibold text-foreground">{t('readyPriorityTitle')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t('readyPriorityHint')}</p>

          {listed.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t('readyFilterEmpty')}</p>
          ) : (
            <ul aria-label={t('readyPriorityTitle')} className="mt-4 space-y-1">
              {listed.map((region) => {
                const active = region.regionId === selectedId;
                const lit = region.regionId === hoveredId;

                return (
                  <li key={region.regionId}>
                    {/* The row is the region's other handle: hovering it lights the
                        region on the map, and choosing it selects (and zooms to) it. */}
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggle(region.regionId)}
                      onMouseEnter={() => setHoveredId(region.regionId)}
                      onMouseLeave={() => setHoveredId(null)}
                      onFocus={() => setHoveredId(region.regionId)}
                      onBlur={() => setHoveredId(null)}
                      className={cn(
                        'block w-full rounded-lg border px-3 py-2 text-start transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary-600/50',
                        active
                          ? 'border-neutral-800 bg-neutral-100'
                          : lit
                            ? 'border-primary-600 bg-primary-50'
                            : 'border-transparent hover:bg-neutral-50',
                      )}
                    >
                      <Meter
                        title={REGION_NAME[region.regionId] ?? ''}
                        extra={
                          <Badge
                            variant="primary"
                            className={cn('ms-2', PRIORITY_TAG[region.band])}
                          >
                            {priorityLabel[region.band]}
                          </Badge>
                        }
                        detail={t('readyPriorityRow', {
                          qualified: format.number(region.qualified),
                          total: format.number(region.target),
                          gap: format.number(region.gap),
                        })}
                        percent={region.percent}
                        band={region.band}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
