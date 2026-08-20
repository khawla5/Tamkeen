import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCountUp } from './use-count-up';

/**
 * The hero's figures animate on load. Three properties are worth holding onto,
 * and none of them is "it looks nice":
 *
 *   1. Reduced motion is honoured (WCAG 2.3.3). CSS is what hides the counting
 *      figure in `HeroStatFigure`, so this is the hook's own second line of
 *      defence — it matters wherever the hook is used without that markup.
 *   2. It lands exactly on the target. An easing function that never quite
 *      reaches 1, or a rounding slip, leaves the page advertising "1,246"
 *      forever, and nobody would notice in review.
 *   3. It starts at zero, so the server's first paint and the animation's first
 *      frame agree. Starting at the target instead made the figure snap
 *      backwards ~700ms after paint, when hydration finally ran.
 */

/** Captures scheduled frames so a test can drive time by hand. */
function stubAnimationFrames() {
  const frames: FrameRequestCallback[] = [];

  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});

  return {
    /** Runs the frame that is currently queued, at `timestamp` milliseconds. */
    advanceTo(timestamp: number) {
      const next = frames.shift();
      if (next) act(() => next(timestamp));
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useCountUp', () => {
  it('leaves the value at the target when the reader prefers reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const { advanceTo } = stubAnimationFrames();

    const { result } = renderHook(() => useCountUp(1247));

    expect(result.current).toBe(1247);

    /* And no frame was scheduled to move it afterwards. */
    advanceTo(0);
    expect(result.current).toBe(1247);
  });

  it('starts the count from zero once motion is allowed', () => {
    stubAnimationFrames();

    const { result } = renderHook(() => useCountUp(1247));

    expect(result.current).toBe(0);
  });

  it('lands exactly on the target rather than near it', () => {
    const { advanceTo } = stubAnimationFrames();

    const { result } = renderHook(() => useCountUp(1247));

    advanceTo(0);
    /* Well past the animation's duration: progress clamps to 1. */
    advanceTo(10_000);

    expect(result.current).toBe(1247);
  });

  it('passes through the intermediate values on the way up', () => {
    const { advanceTo } = stubAnimationFrames();

    const { result } = renderHook(() => useCountUp(100));

    advanceTo(0);
    advanceTo(700);

    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(100);
  });

  it('survives an environment with no animation frames at all', () => {
    vi.stubGlobal('requestAnimationFrame', undefined);

    const { result } = renderHook(() => useCountUp(312));

    expect(result.current).toBe(312);
  });
});
