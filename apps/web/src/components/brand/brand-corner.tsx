import Link from 'next/link';

import { Logo } from './logo';
import { MinistryEmblem } from './ministry-emblem';

/**
 * The ministry lockup — emblem, then the Tamkeen wordmark — pinned to the
 * page's true top-right corner on every page of the site: the landing page,
 * every auth page (`AuthLayout`), and every authenticated portal
 * (`AppShell` — employee, entity and admin alike).
 *
 * Its own fixed corner rather than laid out inside whichever header row
 * happens to sit beneath it on a given page: three separate headers would
 * otherwise each have to reproduce the same positioning rule, and drift the
 * moment one of them changed. `z-50` sits above every header's own chrome
 * (`z-40` and below) so it stays on top through scroll; `pointer-events-none`
 * on the wrapper (with `-auto` restored on the lockup itself) so the empty
 * space around it never blocks a click meant for whatever sits underneath.
 *
 * `size="sm"` matches the authenticated portal's more compact chrome
 * (`AppShell` was already smaller than the marketing header before this);
 * `lg` is the landing/auth default.
 */
export function BrandCorner({
  homeHref = '/landing',
  size = 'lg',
}: {
  /** Where the wordmark links — `/landing` everywhere except inside an
   *  authenticated portal, which has no public landing to send a signed-in
   *  visitor back to. */
  homeHref?: string;
  size?: 'sm' | 'lg';
}) {
  const emblemHeight = size === 'lg' ? 72 : 36;
  const logoHeight = size === 'lg' ? 56 : 30;
  const rowHeight = size === 'lg' ? 'h-20' : 'h-[60px]';
  const dividerHeight = size === 'lg' ? 'h-12' : 'h-7';

  return (
    <div
      className={`pointer-events-none fixed top-0 start-0 z-50 flex ${rowHeight} items-center px-4 sm:px-6`}
    >
      <div className="pointer-events-auto flex items-center gap-3">
        <MinistryEmblem height={emblemHeight} priority />
        <span aria-hidden="true" className={`w-px bg-border ${dividerHeight}`} />
        <Link href={homeHref} className="flex items-center">
          <Logo height={logoHeight} priority />
        </Link>
      </div>
    </div>
  );
}
