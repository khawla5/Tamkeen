import { cn } from '@/lib/utils';

import { SAUDI_MAP_VIEWBOX, SAUDI_REGIONS } from './saudi-map-paths';

/*
 * The Kingdom's map, each administrative region named, as the hero panel's
 * visual beneath the ministry emblem.
 *
 * Decorative (`aria-hidden`): the names are orientation, not content — the
 * platform is for the whole ministry, not a region. Two small motions, both in
 * CSS (`.map-region` in globals.css) so the global reduced-motion rule
 * silences them: the regions reveal in sequence on load, then a slow highlight
 * drifts across them — ambient, not attention-seeking.
 */
const REVEAL_STEP_MS = 70;
const DRIFT_STEP_MS = 600;
const LABEL_SIZE = 24;

/**
 * Where the source's label anchor does not fit the name, a better interior
 * point — and for the two regions too small for the standard size, a smaller
 * one. Names always sit inside their region; the map is sized so they fit.
 * Coordinates are viewBox units.
 */
const LABEL_PLACEMENT: Record<string, { x: number; y: number; size?: number }> = {
  /* Long name: into the region's body, off the Jawf border. */
  SA08: { x: 405, y: 112 },
  /* Off the Tabuk border. */
  SA03: { x: 262, y: 398 },
  /* Al Bahah: small region, small label at its widest point. */
  SA11: { x: 324, y: 604, size: 15 },
  /* Jazan: the coastal strip's widest stretch. */
  SA09: { x: 376, y: 700, size: 15 },
};

export function SaudiMap({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox={SAUDI_MAP_VIEWBOX}
      className={cn('h-auto w-full overflow-visible', className)}
      fill="none"
    >
      {SAUDI_REGIONS.map((region, index) => {
        const placement = LABEL_PLACEMENT[region.id];
        const x = placement?.x ?? region.labelX;
        const y = placement?.y ?? region.labelY;

        return (
          <g
            key={region.id}
            className="map-region"
            style={{ animationDelay: `${index * REVEAL_STEP_MS}ms, ${index * DRIFT_STEP_MS}ms` }}
          >
            <path
              data-region={region.id}
              d={region.d}
              className="stroke-primary-deep"
              strokeWidth={2.5}
              strokeLinejoin="round"
            />
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={placement?.size ?? LABEL_SIZE}
              /* The halo (paint-order + a light stroke) keeps a name legible
                 where it brushes a border. */
              className="fill-primary-900 stroke-primary-50 stroke-[5px] font-sans font-semibold [paint-order:stroke]"
            >
              {region.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
