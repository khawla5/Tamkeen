import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Long enough to read as a count, short enough not to delay the headline. */
const DURATION_MS = 1400;

/** Decelerating: fast at the start, settling onto the final figure. */
const easeOutCubic = (progress: number) => 1 - (1 - progress) ** 3;

/**
 * `useLayoutEffect` runs before the browser paints, so the reduced-motion and
 * no-frames paths can correct the value without it being painted at zero
 * first. On the server it is a no-op and React warns about it, so the plain
 * effect stands in there.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Counts up to `target` once, on mount.
 *
 * THE INITIAL STATE IS ZERO, and that is the whole design. The first version
 * started at `target` so the server-rendered HTML would carry the real figure —
 * which was correct markup and a visibly broken effect: the browser paints the
 * server's HTML long before React hydrates, so the reader saw "1,247", then it
 * snapped to zero when hydration ran, then it counted back up. Measured in
 * Chromium, that snap landed ~700ms after paint. Starting at zero means the
 * first paint and the animation's first frame agree, and the number only ever
 * moves upward.
 *
 * The cost is that the *animated* copy is wrong until hydration, so it is not
 * the only copy. `HeroStatFigure` renders three: this one, a `motion-reduce`
 * twin that CSS shows instead when the reader asked for less motion (right from
 * the first paint, with no JavaScript involved — WCAG 2.3.3), and a
 * visually-hidden twin carrying the final figure for assistive technology. Only
 * the last of those is in the accessibility tree.
 *
 * The reduced-motion check below is therefore a second line of defence rather
 * than the mechanism: CSS has already hidden this copy in that case. It is kept
 * so the hook is correct on its own terms wherever else it is used.
 */
export function useCountUp(target: number): number {
  const [value, setValue] = useState(0);
  const frame = useRef(0);

  useIsomorphicLayoutEffect(() => {
    if (typeof requestAnimationFrame !== 'function' || prefersReducedMotion()) {
      setValue(target);
      return;
    }

    let startedAt: number | null = null;

    const step = (now: number) => {
      startedAt ??= now;

      const progress = Math.min(1, (now - startedAt) / DURATION_MS);
      setValue(Math.round(target * easeOutCubic(progress)));

      if (progress < 1) frame.current = requestAnimationFrame(step);
    };

    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [target]);

  return value;
}
