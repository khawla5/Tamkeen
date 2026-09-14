import { PATH_BLOCKER, pathBlockers } from './path-readiness';

/**
 * Whether a path may be published (§4C.4, D-134).
 *
 * Small, and worth having because every failure it prevents is invisible from
 * every screen. A path with no assessment looks exactly like one with a
 * published bank: the ministry assigns it to a directorate, every one of those
 * people lands on «بانتظار تحديد المستوى», and nothing logs it, nothing alerts,
 * and they conclude the product is broken — which, for them, it is.
 */
describe('pathBlockers', () => {
  const ready = { levelCount: 3, hasActiveAssessment: true, selectableCourses: 6 };

  it('permits a path with rungs, an assessment and something placed', () => {
    expect(pathBlockers(ready)).toEqual([]);
  });

  it('refuses a path with no levels', () => {
    expect(pathBlockers({ ...ready, levelCount: 0 })).toContain(PATH_BLOCKER.NO_LEVELS);
  });

  it('refuses a path whose assessment is still a draft', () => {
    expect(pathBlockers({ ...ready, hasActiveAssessment: false })).toContain(
      PATH_BLOCKER.NO_ASSESSMENT,
    );
  });

  it('refuses a path whose courses are all unassigned', () => {
    /* Membership without placement reaches nobody (D-134), so this path is
       empty however many courses its list shows. */
    expect(pathBlockers({ ...ready, selectableCourses: 0 })).toContain(
      PATH_BLOCKER.NO_PLACED_COURSES,
    );
  });

  it('reports every blocker at once, so one pass fixes the path', () => {
    /* Which every path is at the moment it is created — hence creation always
       leaving it a draft. */
    expect(
      pathBlockers({ levelCount: 0, hasActiveAssessment: false, selectableCourses: 0 }),
    ).toEqual([PATH_BLOCKER.NO_LEVELS, PATH_BLOCKER.NO_ASSESSMENT, PATH_BLOCKER.NO_PLACED_COURSES]);
  });

  it('does not care how many courses a path offers beyond one', () => {
    /* The 5-10 rule went with the build flow. A path of one placed course is a
       short path, not an invalid one. */
    expect(pathBlockers({ ...ready, selectableCourses: 1 })).toEqual([]);
  });
});
