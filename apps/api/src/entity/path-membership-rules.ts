import type { RiasecLetter } from '@tamkeen/types';

/**
 * The rules for which paths a course may belong to (TAM-132).
 *
 * A course may sit in more than one path (§2 — a modelling fact so a shared
 * course is not duplicated), and until now the only rule was "at least one".
 * That left "all twelve" legal, which breaks three things at once: the
 * course's RIASEC letters are derived from its paths (D-066), so twelve paths
 * make it all six letters — no signal; every path's 5–10 build list then
 * carries the same generic course; and path membership is *path* content the
 * admin owns (§4C.4), yet one entity has just edited every path.
 *
 * Pure: the service loads the rows, this decides. Two limits, both product
 * settings:
 *  - `maxPaths`   — how many paths one course may be in (default 3).
 *  - `maxLetters` — how many distinct RIASEC letters those paths may span
 *                   (default 2). The cap alone does not protect the Holland
 *                   signal: three paths from R, S and C still smear it.
 *
 * **Grandfathering.** A course already outside the rules (seeded before them,
 * or the limits were lowered) keeps its memberships — learners may hold it in
 * confirmed paths, and D-002/D-040 forbid pulling it. It may *remove*
 * memberships but not add until it is back within the rules.
 *
 * A course the admin marked general («عامة») is exempt: it reaches every path
 * without memberships at all (§4C.5).
 */

export interface PathMembershipCandidate {
  id: string;
  riasecLetter: RiasecLetter;
}

export interface PathMembershipLimits {
  maxPaths: number;
  maxLetters: number;
}

export type PathMembershipVerdict =
  | { ok: true }
  | { ok: false; error: 'PATH_LIMIT_EXCEEDED' | 'PATH_MIX_INCOHERENT' | 'PATH_MEMBERSHIP_FROZEN' };

export function distinctLetters(paths: readonly PathMembershipCandidate[]): RiasecLetter[] {
  return [...new Set(paths.map((path) => path.riasecLetter))];
}

/** True when a membership set breaks either limit. */
export function exceedsLimits(
  paths: readonly PathMembershipCandidate[],
  limits: PathMembershipLimits,
): boolean {
  return paths.length > limits.maxPaths || distinctLetters(paths).length > limits.maxLetters;
}

/**
 * Decides whether `next` may replace `current` as the course's path set.
 *
 * Order matters and each branch is the whole reason it exists:
 *  1. A general course is exempt — its reach does not come from memberships.
 *  2. A course already over the limits is frozen to removals: `next` must be a
 *     subset of `current`. Refused with its own code, so the form can say
 *     "remove only" instead of a cap message that is not the entity's fault.
 *  3. Otherwise the cap, then coherence — the cap first because it is the
 *     simpler thing to fix and the message the entity will understand first.
 */
export function checkPathMembership(input: {
  current: readonly PathMembershipCandidate[];
  next: readonly PathMembershipCandidate[];
  limits: PathMembershipLimits;
  isGeneral: boolean;
}): PathMembershipVerdict {
  const { current, next, limits, isGeneral } = input;

  if (isGeneral) {
    return { ok: true };
  }

  if (exceedsLimits(current, limits)) {
    const currentIds = new Set(current.map((path) => path.id));
    const onlyRemovals = next.every((path) => currentIds.has(path.id));

    return onlyRemovals ? { ok: true } : { ok: false, error: 'PATH_MEMBERSHIP_FROZEN' };
  }

  if (next.length > limits.maxPaths) {
    return { ok: false, error: 'PATH_LIMIT_EXCEEDED' };
  }

  if (distinctLetters(next).length > limits.maxLetters) {
    return { ok: false, error: 'PATH_MIX_INCOHERENT' };
  }

  return { ok: true };
}
