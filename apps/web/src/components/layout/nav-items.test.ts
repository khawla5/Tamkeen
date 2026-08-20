import { describe, expect, it } from 'vitest';

import { STEADY_STATE_NAV, navForState } from './nav-items';

/**
 * Which navigation a learner sees, and — the part that keeps being wrong — which
 * they do not.
 *
 * Two rules meet here. §4.2 states one outright: before the assessment the nav
 * is Dashboard, Courses and Profile only. The other is ours: an item appears
 * only once the page behind it exists, because a link to a 404 advertises
 * something the product cannot do and costs a click to find out.
 */

const keys = (state: Parameters<typeof navForState>[0]) => navForState(state).map((i) => i.key);

describe('navForState', () => {
  it('shows only Dashboard, Courses and Profile before the assessment (§4.2)', () => {
    expect(keys('PRE_ASSESSMENT')).toEqual(['dashboard', 'courses', 'profile']);
  });

  it('still hides My Path once assessed but with no path chosen', () => {
    /* My Path is not a destination when there is no path. */
    expect(keys('ASSESSED_NO_PATH')).toEqual(['dashboard', 'courses', 'profile']);
  });

  it('adds My Path and Certificates once a path is active', () => {
    expect(keys('ACTIVE_PATH')).toEqual([
      'dashboard',
      'courses',
      'myPath',
      'certificates',
      'profile',
    ]);
  });

  it('shows Certificates even before one has been earned', () => {
    /* The gallery has a real empty state saying how the first certificate
       arrives, which is more useful than a menu item that materialises one day
       without explanation. */
    expect(keys('ACTIVE_PATH')).toContain('certificates');
  });

  it('still hides the CV, because the builder does not exist yet', () => {
    for (const state of ['PRE_ASSESSMENT', 'ASSESSED_NO_PATH', 'ACTIVE_PATH'] as const) {
      expect(keys(state)).not.toContain('cv');
    }
  });

  it('never exceeds the six steady-state items (§3)', () => {
    /* "Keep steady-state navigation to ~6 items." The full list is the ceiling;
       every state shows a subset of it. */
    expect(STEADY_STATE_NAV).toHaveLength(6);

    for (const state of ['PRE_ASSESSMENT', 'ASSESSED_NO_PATH', 'ACTIVE_PATH'] as const) {
      expect(navForState(state).length).toBeLessThanOrEqual(6);
    }
  });

  it('draws every item from the steady-state list rather than inventing one', () => {
    const known = new Set(STEADY_STATE_NAV.map((item) => item.key));

    for (const state of ['PRE_ASSESSMENT', 'ASSESSED_NO_PATH', 'ACTIVE_PATH'] as const) {
      for (const key of keys(state)) {
        expect(known.has(key)).toBe(true);
      }
    }
  });

  it('keeps the order of the steady-state list in every state', () => {
    /* Filtering preserves order; a hand-built array per state would drift, and
       navigation that reorders itself between states is disorienting. */
    const canonical = STEADY_STATE_NAV.map((item) => item.key);

    for (const state of ['PRE_ASSESSMENT', 'ASSESSED_NO_PATH', 'ACTIVE_PATH'] as const) {
      const shown = keys(state);
      expect(shown).toEqual(canonical.filter((key) => shown.includes(key)));
    }
  });
});
