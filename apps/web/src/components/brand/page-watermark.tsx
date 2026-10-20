import Image from 'next/image';

import { cn } from '@/lib/utils';

/*
 * The Ministry of Interior emblem again, but as a faint background mark
 * rather than the small identifying logo `MinistryEmblem` already is in the
 * header. Purely decorative: it says whose platform this is without
 * competing with the content in front of it, so it is `aria-hidden` (the
 * header emblem already carries the accessible name) and never intercepts a
 * click — `pointer-events-none` on a layer the content simply paints over.
 *
 * `opacityClassName` defaults to the calibration proven against a plain page
 * (3.5%, e.g. the auth pages). Deliberately never placed over a photo (the
 * landing hero was tried and dropped, user-directed): a busy backdrop needs
 * either a much stronger mark or none at all, and none read better.
 */
export function PageWatermark({ opacityClassName = 'opacity-[0.035]' }: { opacityClassName?: string }) {
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
        className={cn(
          'absolute top-1/2 left-1/2 size-[85vmin] max-w-none -translate-x-1/2 -translate-y-1/2',
          opacityClassName,
        )}
      />
    </div>
  );
}
