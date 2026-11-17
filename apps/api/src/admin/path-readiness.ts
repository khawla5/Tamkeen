/**
 * Whether a path may be published (§4C.4, D-134).
 *
 * **A path is publishable when a learner assigned to it could actually get
 * somewhere.** That takes three things, and each of them fails silently without
 * this check:
 *
 *  - **Rungs.** With no levels there is nothing to place anybody on.
 *  - **A published assessment.** Without one, every learner assigned to the path
 *    sits at «بانتظار تحديد المستوى» forever, and nothing in the product says
 *    why. This is the blocker that matters most, because assigning is an
 *    administrative act that happens elsewhere — by the time somebody notices,
 *    a directorate has been assigned a path nobody can start.
 *  - **A placed course.** Membership alone reaches nobody: a course sitting in
 *    the path on no rung is invisible to every learner (D-134), so a path whose
 *    courses are all unassigned is an empty path wearing a full one's clothes.
 *
 * The check runs where the path becomes offerable — on publication, and on any
 * change that could drop a published path below it — rather than being left for
 * a learner to discover. Same shape as `publishBlockers` (D-061) and
 * `assessBank` (D-071): pure, over facts the service gathers, and the same
 * function answers both "may I do this" and "why is this path flagged".
 *
 * **Nothing checks how *many* courses a path offers.** The 5-10 rule went with
 * the build flow (D-134); a path's size is now curriculum design, not a
 * constraint the product enforces.
 */

export const PATH_BLOCKER = {
  /** No levels, so nobody can be placed. */
  NO_LEVELS: 'PATH_NO_LEVELS',
  /** No ACTIVE assessment version, so nobody can be placed. */
  NO_ASSESSMENT: 'PATH_NO_ASSESSMENT',
  /** Memberships exist but none is on a rung, so learners see nothing. */
  NO_PLACED_COURSES: 'PATH_NO_PLACED_COURSES',
} as const;

export type PathBlockerCode = (typeof PATH_BLOCKER)[keyof typeof PATH_BLOCKER];

export interface PathFacts {
  levelCount: number;
  hasActiveAssessment: boolean;
  /** Courses placed on a rung that a learner could actually reach now. */
  selectableCourses: number;
}

/** Empty when the path may be published. */
export function pathBlockers(facts: PathFacts): PathBlockerCode[] {
  const blockers: PathBlockerCode[] = [];

  if (facts.levelCount === 0) blockers.push(PATH_BLOCKER.NO_LEVELS);
  if (!facts.hasActiveAssessment) blockers.push(PATH_BLOCKER.NO_ASSESSMENT);
  if (facts.selectableCourses === 0) blockers.push(PATH_BLOCKER.NO_PLACED_COURSES);

  return blockers;
}
