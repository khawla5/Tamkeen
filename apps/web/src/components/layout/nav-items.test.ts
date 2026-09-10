import { describe, expect, it } from 'vitest';

import { ENTITY_NAV } from './entity-nav-items';
import {
  NAV_ICONS,
  STEADY_STATE_NAV,
  activeNavHref,
  navForState,
  navPathMatches,
} from './nav-items';

/**
 * Which navigation a learner sees, and — the part that keeps being wrong — which
 * they do not.
 *
 * Two rules meet here. D-071's, restated for the assigned model (D-134): an
 * employee with no path has exactly one thing to see, and a browsable catalogue
 * competes with it. The other is ours: an item appears only once the page behind
 * it has something to show, because a link to a 404 advertises something the
 * product cannot do and costs a click to find out.
 */

const keys = (state: Parameters<typeof navForState>[0]) => navForState(state).map((i) => i.key);

describe('navForState', () => {
  it('shows only Dashboard and Profile before the ministry assigns a path', () => {
    /* My Path and Courses are not destinations when there is no path. */
    expect(keys('NO_PATH')).toEqual(['dashboard', 'profile']);
  });

  it('shows the full six the moment a path is assigned, before the assessment', () => {
    /* The path page is where they go to sit it, so hiding My Path until they
       were placed would hide the one action they have. */
    expect(keys('AWAITING_PLACEMENT')).toEqual([
      'dashboard',
      'courses',
      'myPath',
      'certificates',
      'cv',
      'profile',
    ]);
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

  it('keeps Certificates and the CV out of the no-path state', () => {
    /* Both pages exist (D-037 is closed), but neither is a destination for
       somebody the ministry has not put on anything. */
    expect(keys('NO_PATH')).not.toContain('certificates');
    expect(keys('NO_PATH')).not.toContain('cv');
  });

  it('never exceeds the six steady-state items (§3)', () => {
    /* "Keep steady-state navigation to ~6 items." The full list is the ceiling;
       every state shows a subset of it. */
    expect(STEADY_STATE_NAV).toHaveLength(6);

    for (const state of ['NO_PATH', 'AWAITING_PLACEMENT', 'ACTIVE_PATH'] as const) {
      expect(navForState(state).length).toBeLessThanOrEqual(6);
    }
  });

  it('draws every item from the steady-state list rather than inventing one', () => {
    const known = new Set(STEADY_STATE_NAV.map((item) => item.key));

    for (const state of ['NO_PATH', 'AWAITING_PLACEMENT', 'ACTIVE_PATH'] as const) {
      for (const key of keys(state)) {
        expect(known.has(key)).toBe(true);
      }
    }
  });

  it('keeps the order of the steady-state list in every state', () => {
    /* Filtering preserves order; a hand-built array per state would drift, and
       navigation that reorders itself between states is disorienting. */
    const canonical = STEADY_STATE_NAV.map((item) => item.key);

    for (const state of ['NO_PATH', 'AWAITING_PLACEMENT', 'ACTIVE_PATH'] as const) {
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

describe('the active rail item (TAM-140)', () => {
  const ENTITY = ['/entity', '/entity/courses', '/entity/learners', '/entity/profile'];
  const LEARNER = ['/', '/courses', '/my-path', '/certificates', '/cv', '/profile'];

  it('gives the dashboard only its own page', () => {
    /* The bug: `/entity` was active on every entity page. */
    expect(activeNavHref('/entity', ENTITY)).toBe('/entity');
    expect(activeNavHref('/entity/learners', ENTITY)).toBe('/entity/learners');
    expect(activeNavHref('/', LEARNER)).toBe('/');
    expect(activeNavHref('/my-path', LEARNER)).toBe('/my-path');
  });

  it('keeps a nested page inside its section', () => {
    expect(activeNavHref('/entity/courses/abc/content', ENTITY)).toBe('/entity/courses');
    expect(activeNavHref('/courses/abc/player', LEARNER)).toBe('/courses');
  });

  it('is segment-aware, not a string prefix', () => {
    expect(navPathMatches('/entityx', '/entity')).toBe(false);
    expect(navPathMatches('/coursesx/1', '/courses')).toBe(false);
    expect(navPathMatches('/entity/courses/1', '/entity/courses')).toBe(true);
  });

  it('ignores a trailing slash', () => {
    expect(activeNavHref('/entity/', ENTITY)).toBe('/entity');
    expect(activeNavHref('/entity/learners/', ENTITY)).toBe('/entity/learners');
  });

  it('activates nothing on a page outside the rail', () => {
    expect(activeNavHref('/assessment', LEARNER)).toBe(null);
  });
});
