'use client';

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { LABEL_PLACEMENT, LABEL_SIZE } from './saudi-map';
import { SAUDI_MAP_VIEWBOX, SAUDI_REGIONS, type MapRegion } from './saudi-map-paths';

/*
 * The Kingdom's map as something to use rather than look at: hover lifts a
 * region and shows a tooltip beside the cursor, a click (or Enter/Space)
 * selects it — and, when asked, zooms in on it — and a second click on the same
 * region, or the reset button, clears it.
 *
 * Same geometry as the landing page's `SaudiMap` (one source of region paths),
 * but a separate component: that one is decorative, animated and `aria-hidden`;
 * this one is a control, so every region is a real `button` with a name, a
 * pressed state and a visible focus ring, and nothing moves until it is used.
 *
 * It owns no data. The caller says which region is selected, which is
 * highlighted from outside (a hovered row of a list beside it), which are
 * dimmed, and what the tooltip says — and hears about selection and hover.
 * What those *mean* is the page's.
 */

/** How a region is shaded when the map is showing data. */
export type MapBand = 'low' | 'mid' | 'high';

export interface InteractiveSaudiMapProps {
  /** The selected region's id (`SA01`…), or null for none. */
  selectedId: string | null;
  onSelect: (region: MapRegion | null) => void;
  /** Names the map for assistive technology. */
  label: string;
  /**
   * Shade regions by band (region id → band). Without it the map is plain and a
   * selection fills the region; with it the fill belongs to the data, so a
   * selection is shown by outline alone — a selected region must not stop
   * saying how ready it is.
   */
  bands?: Record<string, MapBand>;
  /**
   * A short line printed under each region's name (region id → text), e.g. its
   * percentage. It is what makes a shaded map readable without colour
   * (WCAG 1.4.1), and it is also read out as part of the region's name.
   */
  captions?: Record<string, string>;
  /** What the tooltip says about a region. Defaults to its name. */
  tooltip?: (region: MapRegion) => ReactNode;
  /** A region lit from outside the map — the hovered row of a list beside it. */
  highlightId?: string | null;
  /** Told when the pointer or keyboard focus enters or leaves a region. */
  onHoverChange?: (regionId: string | null) => void;
  /** Regions to fade back (a filter is active and they are not in it). */
  dimmed?: (regionId: string) => boolean;
  /** Zoom to the selected region, and back out when it is cleared. */
  zoomToSelected?: boolean;
  /** The reset button's text; required with `zoomToSelected`. */
  resetLabel?: string;
  className?: string;
}

/**
 * One green, three depths — the less ready a region, the paler. The percentage
 * printed on every region is what carries the meaning (WCAG 1.4.1); the shade
 * only lets the eye find the pale ones first.
 */
const BAND_FILL: Record<MapBand, string> = {
  low: 'fill-primary-600/15',
  mid: 'fill-primary-600/40',
  high: 'fill-primary-600/75',
};

/** The selected region's larger name (plain map only). */
const SELECTED_LABEL_SIZE = 28;

const size = (placement?: { size?: number }): number => placement?.size ?? LABEL_SIZE;

/* ── Zoom ───────────────────────────────────────────────────────────────── */

type ViewBox = readonly [x: number, y: number, width: number, height: number];

const FULL: ViewBox = SAUDI_MAP_VIEWBOX.split(' ').map(Number) as unknown as ViewBox;
const RATIO = FULL[2] / FULL[3];
/** Breathing room around a zoomed region, as a share of its own size. */
const PAD = 0.2;
/** Never closer than this: Al Bahah is small, and a map of one village helps nobody. */
const MIN_WIDTH = 300;
const ZOOM_MS = 480;

/** The view that frames `box`, in the map's own aspect ratio. */
function frame(box: { x: number; y: number; width: number; height: number }): ViewBox {
  let width = box.width * (1 + PAD * 2);
  let height = box.height * (1 + PAD * 2);

  if (width / height < RATIO) width = height * RATIO;
  else height = width / RATIO;

  if (width < MIN_WIDTH) {
    width = MIN_WIDTH;
    height = width / RATIO;
  }

  if (width >= FULL[2]) return FULL;

  const x = box.x + box.width / 2 - width / 2;
  const y = box.y + box.height / 2 - height / 2;

  /* Kept on the map, so a coastal region is not centred on empty sea. */
  return [
    Math.min(Math.max(x, FULL[0]), FULL[0] + FULL[2] - width),
    Math.min(Math.max(y, FULL[1]), FULL[1] + FULL[3] - height),
    width,
    height,
  ];
}

const ease = (t: number): number => 1 - Math.pow(1 - t, 3);

export function InteractiveSaudiMap({
  selectedId,
  onSelect,
  label,
  bands,
  captions,
  tooltip,
  highlightId = null,
  onHoverChange,
  dimmed,
  zoomToSelected = false,
  resetLabel,
  className,
}: InteractiveSaudiMapProps) {
  const [hovered, setHovered] = useState<MapRegion | null>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [view, setView] = useState<ViewBox>(FULL);

  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef<ViewBox>(FULL);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  /* Glide to the selected region (or back out) whenever the selection changes. */
  useEffect(() => {
    if (!zoomToSelected) return;

    let target: ViewBox = FULL;

    if (selectedId !== null) {
      const path = svgRef.current?.querySelector<SVGGraphicsElement>(
        `path[data-region="${selectedId}"]`,
      );

      /* `getBBox` is the browser's; where it is absent (a test DOM) the map simply
         stays put rather than guessing a frame. */
      if (path && typeof path.getBBox === 'function') target = frame(path.getBBox());
    }

    const from = viewRef.current;

    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setView(target);

      return;
    }

    const start = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ZOOM_MS);
      const k = ease(t);

      setView([
        from[0] + (target[0] - from[0]) * k,
        from[1] + (target[1] - from[1]) * k,
        from[2] + (target[2] - from[2]) * k,
        from[3] + (target[3] - from[3]) * k,
      ]);

      frameRef.current = t < 1 ? requestAnimationFrame(step) : null;
    };

    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [selectedId, zoomToSelected]);

  /* Positioned against the wrapper rather than the page, so the tooltip stays
     with the map when the page scrolls or the card moves. */
  const track = (event: MouseEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    setCursor({ x: event.clientX - box.left, y: event.clientY - box.top - 10 });
  };

  const enter = (region: MapRegion) => {
    setHovered(region);
    onHoverChange?.(region.id);
  };

  const leave = () => {
    setHovered(null);
    onHoverChange?.(null);
  };

  const zoomed = view[2] < FULL[2] - 1;

  return (
    <div className={cn('relative w-full', className)} onMouseMove={track}>
      <svg
        ref={svgRef}
        role="group"
        aria-label={label}
        viewBox={view.join(' ')}
        /* Clipped only while zoomed: at full size a label may run past the box,
           but a zoomed view would otherwise draw the neighbours over the page. */
        className={cn('h-auto w-full', zoomed ? 'overflow-hidden rounded-xl' : 'overflow-visible')}
        fill="none"
      >
        <defs>
          <filter id="region-lift" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow
              dx="0"
              dy="3"
              stdDeviation="4"
              floodColor="var(--color-primary-600)"
              floodOpacity="0.3"
            />
          </filter>
        </defs>

        {SAUDI_REGIONS.map((region) => {
          const isSelected = region.id === selectedId;
          const isHovered = region.id === hovered?.id || region.id === highlightId;
          const placement = LABEL_PLACEMENT[region.id];
          const isDimmed = dimmed?.(region.id) ?? false;

          return (
            <g
              key={region.id}
              className={cn('transition-opacity duration-200', isDimmed && 'opacity-25')}
            >
              <path
                data-region={region.id}
                d={region.d}
                role="button"
                tabIndex={0}
                aria-label={
                  captions?.[region.id] ? `${region.name}، ${captions[region.id]}` : region.name
                }
                aria-pressed={isSelected}
                filter={isHovered && !isSelected ? 'url(#region-lift)' : undefined}
                onMouseEnter={() => enter(region)}
                onMouseLeave={leave}
                onFocus={() => onHoverChange?.(region.id)}
                onBlur={() => onHoverChange?.(null)}
                onClick={() => onSelect(isSelected ? null : region)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(isSelected ? null : region);
                  }
                }}
                strokeLinejoin="round"
                /* Hover and selection are never colour alone: a selected region
                   also gets the heavier outline and a larger name, and focus its
                   own ring. */
                className={cn(
                  'cursor-pointer outline-none transition-[fill,stroke,stroke-width] duration-200 focus-visible:stroke-neutral-800 focus-visible:[stroke-width:5px]',
                  bands
                    ? [
                        BAND_FILL[bands[region.id] ?? 'mid'],
                        isSelected
                          ? 'stroke-neutral-800 [stroke-width:5px]'
                          : isHovered
                            ? 'stroke-primary-800 [stroke-width:4px]'
                            : 'stroke-neutral-300 [stroke-width:2px]',
                      ]
                    : isSelected
                      ? 'fill-primary-600 stroke-primary-800 [stroke-width:4px]'
                      : isHovered
                        ? 'fill-primary-200 stroke-primary-600 [stroke-width:3px]'
                        : 'fill-neutral-200 stroke-neutral-300 [stroke-width:2px]',
                )}
              />
              <text
                x={placement?.x ?? region.labelX}
                y={
                  (placement?.y ?? region.labelY) -
                  (captions?.[region.id] ? size(placement) * 0.55 : 0)
                }
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={isSelected && !bands ? SELECTED_LABEL_SIZE : size(placement)}
                /* The halo keeps a name legible where it brushes a border; the
                   label never takes the pointer, so the region beneath does. */
                className={cn(
                  'pointer-events-none select-none font-sans font-semibold transition-[fill] duration-200 [paint-order:stroke]',
                  isSelected && !bands
                    ? 'fill-white stroke-primary-800 stroke-[5px]'
                    : isHovered && !bands
                      ? 'fill-primary-800 stroke-neutral-50 stroke-[5px]'
                      : 'fill-neutral-800 stroke-neutral-50 stroke-[5px]',
                )}
                aria-hidden="true"
              >
                {region.name}
              </text>
              {captions?.[region.id] ? (
                <text
                  x={placement?.x ?? region.labelX}
                  y={(placement?.y ?? region.labelY) + size(placement) * 0.7}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={size(placement) * 0.95}
                  className="pointer-events-none select-none fill-neutral-800 stroke-neutral-50 stroke-[5px] font-sans font-bold [paint-order:stroke]"
                  aria-hidden="true"
                >
                  {captions[region.id]}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      {/* Back out to the whole map. Only while a region is chosen and the map has
          zoomed on it: a control that does nothing on a map nobody touched is
          noise (§3). */}
      {zoomToSelected && selectedId !== null && resetLabel ? (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="absolute end-2 top-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary-600/50"
        >
          {resetLabel}
        </button>
      ) : null}

      {/* Follows the cursor over a region. Decorative for assistive technology —
          the region button already carries the name and the caption, and a box
          that appeared on hover only would be a second, lesser way to learn the
          same thing. */}
      {hovered !== null ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-10"
          style={{ left: cursor.x, top: cursor.y, transform: 'translate(-50%, -100%)' }}
        >
          <div className="min-w-32 rounded-lg bg-neutral-800 px-3 py-2 text-sm text-white shadow-lg">
            {tooltip ? tooltip(hovered) : <span className="font-medium">{hovered.name}</span>}
          </div>
          <div className="mx-auto -mt-1 h-2.5 w-2.5 rotate-45 bg-neutral-800" />
        </div>
      ) : null}
    </div>
  );
}
