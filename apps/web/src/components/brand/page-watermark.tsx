import Image from 'next/image';

/*
 * The Ministry of Interior emblem again, but as a faint background mark
 * rather than the small identifying logo `MinistryEmblem` already is in the
 * header. Purely decorative: it says whose platform this is without
 * competing with the content in front of it, so it is `aria-hidden` (the
 * header emblem already carries the accessible name) and never intercepts a
 * click — `pointer-events-none` on a layer the content simply paints over.
 */
export function PageWatermark() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Centring is symmetric, so plain physical offsets are fine here even
          though the rest of the app uses logical properties throughout. */}
      <Image
        src="/brand/MOI.svg"
        alt=""
        width={1200}
        height={1200}
        /* SVG is served as-is: the optimiser would rasterise vector artwork. */
        unoptimized
        className="absolute top-1/2 left-1/2 size-[85vmin] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-[0.035]"
      />
    </div>
  );
}
