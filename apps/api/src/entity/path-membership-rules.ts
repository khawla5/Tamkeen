/**
 * The rules for which paths a course may belong to (TAM-141, D-134).
 *
 * A course may sit in more than one path (§2 — a modelling fact so a shared
 * course is not duplicated), and the only rule left is a cap on how many. That
 * cap is what stops one course becoming every path's filler: without it, "all
 * twelve" is legal, every ladder carries the same generic item, and path
 * membership — which is *path* content the admin owns (§4C.4) — has been edited
 * wholesale by one supplier.
 *
 * **The letter-coherence rule went with RIASEC** (D-134). It existed to stop a
 * course's derived letters being smeared across three dimensions; with no
 * letters to derive, the cap alone carries the rule.
 *
 * Pure: the service loads the rows, this decides.
 *
 * **Grandfathering.** A course already over the cap (seeded before it, or the
 * limit was lowered) keeps its memberships — learners may hold it through an
 * assigned path, and D-002/D-040 forbid pulling it. It may *remove* memberships
 * but not add, until it is back within the rules.
 */

export interface PathMembershipCandidate {
  id: string;
}

export interface PathMembershipLimits {
  /** How many paths one course may be in (default 3). */
  maxPaths: number;
}

export type PathMembershipVerdict =
  { ok: true } | { ok: false; error: 'PATH_LIMIT_EXCEEDED' | 'PATH_MEMBERSHIP_FROZEN' };

/** True when a membership set breaks the cap. */
export function exceedsLimits(
  paths: readonly PathMembershipCandidate[],
  limits: PathMembershipLimits,
): boolean {
  return paths.length > limits.maxPaths;
}

/**
 * Decides whether `next` may replace `current` as the course's path set.
 *
 * Order matters and each branch is the whole reason it exists:
 *  1. A course already over the cap is frozen to removals: `next` must be a
 *     subset of `current`. Refused with its own code, so the form can say
 *     "remove only" instead of a cap message that is not the entity's fault.
 *  2. Otherwise the cap.
 */
export function checkPathMembership(input: {
  current: readonly PathMembershipCandidate[];
  next: readonly PathMembershipCandidate[];
  limits: PathMembershipLimits;
}): PathMembershipVerdict {
  const { current, next, limits } = input;

  if (exceedsLimits(current, limits)) {
    const currentIds = new Set(current.map((path) => path.id));
    const onlyRemovals = next.every((path) => currentIds.has(path.id));

    return onlyRemovals ? { ok: true } : { ok: false, error: 'PATH_MEMBERSHIP_FROZEN' };
  }

  if (next.length > limits.maxPaths) {
    return { ok: false, error: 'PATH_LIMIT_EXCEEDED' };
  }

  return { ok: true };
}
