import { describe, expect, it } from 'vitest';

import { ENTITY_NAV } from './entity-nav-items';
import { NAV_ICONS, STEADY_STATE_NAV, navForState } from './nav-items';

/**
 * Which navigation a learner sees, and — the part that keeps being wrong — which
 * they do not.
 *
 * Two rules meet here. §4.2 (as amended by D-071) states one outright: before
 * the assessment the nav is Dashboard and Profile only — a new user has exactly
 * one thing to do, and a browsable catalogue competes with it. The other is
 * ours: an item appears only once the page behind it exists, because a link to
 * a 404 advertises something the product cannot do and costs a click to find
 * out.
 */

const keys = (state: Parameters<typeof navForState>[0]) => navForState(state).map((i) => i.key);

describe('navForState', () => {
  it('shows only Dashboard and Profile before the assessment (§4.2, D-071)', () => {
    expect(keys('PRE_ASSESSMENT')).toEqual(['dashboard', 'profile']);
  });

  it('adds Courses the moment the assessment is done, still without My Path', () => {
    /* My Path is not a destination when there is no path. */
    expect(keys('ASSESSED_NO_PATH')).toEqual(['dashboard', 'courses', 'profile']);
  });

  it('shows the full six once a path is active (§4)', () => {
    expect(keys('ACTIVE_PATH')).toEqual([
      'dashboard',
      'courses',
      'myPath',
      'certificates',
      'cv',
      'profile',
    ]);
  });

  it('shows Certificates even before one has been earned', () => {
    /* The gallery has a real empty state saying how the first certificate
       arrives, which is more useful than a menu item that materialises one day
       without explanation. */
    expect(keys('ACTIVE_PATH')).toContain('certificates');
  });

  it('keeps Certificates and the CV out of the pre-path states', () => {
    /* Both pages exist now (D-037 is closed), but neither is a destination for
       someone who has not started a path — §4.2 keeps that nav to three. */
    for (const state of ['PRE_ASSESSMENT', 'ASSESSED_NO_PATH'] as const) {
      expect(keys(state)).not.toContain('certificates');
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

describe('the entity portal navigation (§4B)', () => {
  it('has exactly the four destinations §4B names', () => {
    expect(ENTITY_NAV.map((item) => item.key)).toEqual([
      'entityDashboard',
      'entityCourses',
      'entityLearners',
      'entityProfile',
    ]);
  });

  it('shares no destination with the learner portal', () => {
    /*
     * The two lists are separate rather than one being a filtered view of the
     * other (D-065). An entity has no assessment, no path, no certificates and
     * no CV, so a shared list would imply a relationship that does not exist.
     */
    const learnerHrefs = new Set(STEADY_STATE_NAV.map((item) => item.href));

    for (const item of ENTITY_NAV) {
      expect(learnerHrefs.has(item.href)).toBe(false);
    }
  });

  it('uses only declared icon names', () => {
    /* The icon is a *name* crossing the server/client boundary, so an undeclared
       one fails at render rather than at compile time. */
    for (const item of ENTITY_NAV) {
      expect(NAV_ICONS).toContain(item.icon);
    }
  });

  it('offers no "add a course" destination', () => {
    /* Creating a course is the single primary action on two screens (§3), not a
       fifth place to navigate to. */
    expect(ENTITY_NAV.some((item) => item.href.includes('new'))).toBe(false);
  });
});
