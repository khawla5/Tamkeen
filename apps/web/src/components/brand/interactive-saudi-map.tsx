'use client';

import { useState, type MouseEvent } from 'react';

import { cn } from '@/lib/utils';

import { LABEL_PLACEMENT, LABEL_SIZE } from './saudi-map';
import { SAUDI_MAP_VIEWBOX, SAUDI_REGIONS, type MapRegion } from './saudi-map-paths';

/*
 * The Kingdom's map as something to use rather than look at: hover lifts a
 * region and shows its name beside the cursor, a click (or Enter/Space)
 * selects it, and a second click on the same region — or the caller's reset —
 * clears it.
 *
 * Same geometry as the landing page's `SaudiMap` (one source of region paths),
 * but a separate component: that one is decorative, animated and `aria-hidden`;
 * this one is a control, so every region is a real `button` with a name, a
 * pressed state and a visible focus ring, and nothing animates on its own.
 *
 * It owns no data. The caller says which region is selected and hears about
 * changes — what a selection *means* (a filter, a detail card) is the page's.
 */

export interface InteractiveSaudiMapProps {
  /** The selected region's id (`SA01`…), or null for none. */
  selectedId: string | null;
  onSelect: (region: MapRegion | null) => void;
  /** Names the map for assistive technology. */
  label: string;
  className?: string;
}

/** The two regions too small for the standard label size, and the selected one. */
const SELECTED_LABEL_SIZE = 28;

export function InteractiveSaudiMap({
  selectedId,
  onSelect,
  label,
  className,
}: InteractiveSaudiMapProps) {
  const [hovered, setHovered] = useState<MapRegion | null>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });

  /* Positioned against the wrapper rather than the page, so the tooltip stays
     with the map when the page scrolls or the card moves. */
  const track = (event: MouseEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    setCursor({ x: event.clientX - box.left, y: event.clientY - box.top - 10 });
  };

  return (
    <div className={cn('relative w-full', className)} onMouseMove={track}>
      <svg
        role="group"
        aria-label={label}
        viewBox={SAUDI_MAP_VIEWBOX}
        className="h-auto w-full overflow-visible"
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
          const isHovered = region.id === hovered?.id;
          const placement = LABEL_PLACEMENT[region.id];

          return (
            <g key={region.id}>
              <path
                data-region={region.id}
                d={region.d}
                role="button"
                tabIndex={0}
                aria-label={region.name}
                aria-pressed={isSelected}
                filter={isHovered && !isSelected ? 'url(#region-lift)' : undefined}
                onMouseEnter={() => setHovered(region)}
                onMouseLeave={() => setHovered(null)}
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
                  'cursor-pointer outline-none transition-[fill,stroke,stroke-width] duration-200 focus-visible:stroke-primary-800 focus-visible:[stroke-width:5px]',
                  isSelected
                    ? 'fill-primary-600 stroke-primary-800 [stroke-width:4px]'
                    : isHovered
                      ? 'fill-primary-200 stroke-primary-600 [stroke-width:3px]'
                      : 'fill-neutral-200 stroke-neutral-300 [stroke-width:2px]',
                )}
              />
              <text
                x={placement?.x ?? region.labelX}
                y={placement?.y ?? region.labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={isSelected ? SELECTED_LABEL_SIZE : (placement?.size ?? LABEL_SIZE)}
                /* The halo keeps a name legible where it brushes a border; the
                   label never takes the pointer, so the region beneath does. */
                className={cn(
                  'pointer-events-none select-none font-sans font-semibold transition-[fill] duration-200 [paint-order:stroke]',
                  isSelected
                    ? 'fill-white stroke-primary-800 stroke-[5px]'
                    : isHovered
                      ? 'fill-primary-800 stroke-neutral-50 stroke-[5px]'
                      : 'fill-neutral-700 stroke-neutral-50 stroke-[5px]',
                )}
                aria-hidden="true"
              >
                {region.name}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Follows the cursor over a region it is not already showing. Decorative
          for assistive technology — the region button is already named, and a
          floating box that appeared on hover only would be a second, lesser
          way to learn the same thing. */}
      {hovered !== null && hovered.id !== selectedId ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-10"
          style={{ left: cursor.x, top: cursor.y, transform: 'translate(-50%, -100%)' }}
        >
          <div className="rounded-lg bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white shadow-lg">
            {hovered.name}
          </div>
          <div className="mx-auto -mt-1 h-2.5 w-2.5 rotate-45 bg-neutral-800" />
        </div>
      ) : null}
    </div>
  );
}
