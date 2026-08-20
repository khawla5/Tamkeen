import Image from 'next/image';

/**
 * The hero's background illustration, as the reference frontend renders it
 * (`master`): one full-bleed image with a legibility wash over the text side.
 *
 * It replaces a hand-drawn SVG sky that approximated this from screenshots.
 * The artwork is the brand's, not something to reproduce shape by shape, and
 * an approximation that has to be re-tuned every time the real one changes is
 * a maintenance cost with no upside (D-042).
 *
 * Two direction rules, and they point opposite ways on purpose:
 *
 *   - The IMAGE is drawn for a left-to-right layout, with its subject on the
 *     right, away from the text. Arabic puts the text column on the right
 *     instead, so the image is mirrored under `rtl:` — the opposite of the SVG
 *     it replaces, which was drawn for Arabic and flipped for English.
 *   - The WASH always covers the text side, so its gradient runs toward the
 *     start of the line: leftward in Arabic, rightward in English. Without it
 *     the headline sits on whatever the photograph happens to put behind it,
 *     and no contrast guarantee survives that.
 *
 * `next/image` rather than a CSS background: the source PNG is 1.7 MB, and this
 * is the first paint an unauthenticated visitor gets. `priority` opts it out of
 * lazy-loading because it is the LCP element.
 */
export function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-cream">
      <Image
        src="/brand/landing_page_hbackground.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-center rtl:-scale-x-100"
      />

      <div className="absolute inset-0 bg-linear-to-r from-surface/85 via-surface/40 to-transparent rtl:bg-linear-to-l" />
    </div>
  );
}
