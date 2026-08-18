/**
 * The RIASEC vocabulary and the pure logic built on it (CLAUDE.md §3A, D-011).
 *
 * This lives in `packages/types`, not in the API, for the same reason `format.ts`
 * does: **both apps need it and they must not be able to disagree.** The API is
 * authoritative — it computes and persists the profile — but the web sorts and
 * highlights path cards, and if "gold" meant something subtly different on each
 * side, the recommendation the user sees would not be the recommendation the
 * system recorded. One implementation removes that failure mode entirely.
 *
 * Deliberately free of Arabic copy. The letters and their ordering are domain
 * facts; the Arabic type names ("الواقعي", "البحثي" …) are user-facing text and
 * belong in the message catalogue (D-024), keyed by letter.
 */

/**
 * The six dimensions in **canonical Holland order** (R-I-A-S-E-C, the order of
 * the Holland hexagon).
 *
 * This order is not cosmetic: it is the deterministic tie-break for ranking
 * (see `rankDimensions`). Reordering this array silently changes every tied
 * result in the system.
 */
export const RIASEC_LETTERS = ['R', 'I', 'A', 'S', 'E', 'C'] as const;

export type RiasecLetter = (typeof RIASEC_LETTERS)[number];

export function isRiasecLetter(value: unknown): value is RiasecLetter {
  return typeof value === 'string' && (RIASEC_LETTERS as readonly string[]).includes(value);
}

/** How many letters form a Holland Code. Three, per §3A — not a tunable. */
export const HOLLAND_CODE_LENGTH = 3;

/** A raw per-dimension tally. Every letter is present, including zeros. */
export type RiasecScores = Record<RiasecLetter, number>;

export function emptyRiasecScores(): RiasecScores {
  return { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
}

export interface RiasecRankedDimension {
  letter: RiasecLetter;
  score: number;
  /** 1-based position in the ranked profile. Ties do **not** share a rank —
   *  the tie-break below makes the ordering total, so ranks are 1…6 exactly. */
  rank: number;
  /**
   * `score / maxScore` as 0-100, for the six-dimension visual in §4.4.
   * Zero when `maxScore` is zero, rather than NaN.
   */
  percent: number;
}

/**
 * The complete result of scoring: all six dimensions ranked, plus the derived
 * Holland Code.
 *
 * §3A is explicit that all six scores are stored, not just the code — the
 * ranking is what orders gold recommendations, and the full profile is what lets
 * the result be re-explained later.
 */
export interface RiasecProfile {
  scores: RiasecScores;
  /** Highest first. Length is always 6. */
  ranked: RiasecRankedDimension[];
  /** Top three letters in rank order, e.g. ['S','I','A']. */
  code: RiasecLetter[];
  /** The same three letters as a string, e.g. "SIA". */
  codeString: string;
  /** Maximum attainable score for a single dimension in the scored assessment. */
  maxScore: number;
}

const CANONICAL_INDEX: Record<RiasecLetter, number> = {
  R: 0,
  I: 1,
  A: 2,
  S: 3,
  E: 4,
  C: 5,
};

/**
 * Orders the six dimensions, highest score first.
 *
 * **Tie-break (locked, see decisions.md D-031):** equal scores fall back to
 * canonical R-I-A-S-E-C order. The alternative — leaving ties to `Array.sort`'s
 * ordering of equal elements — would make a user's Holland Code depend on the
 * order rows came back from the database, so the same answers could yield a
 * different code on a different day. A career recommendation must be
 * reproducible, so the ordering is made total here rather than left to chance.
 */
export function rankDimensions(scores: RiasecScores, maxScore: number): RiasecRankedDimension[] {
  return [...RIASEC_LETTERS]
    .sort((left, right) => {
      const byScore = scores[right] - scores[left];
      if (byScore !== 0) {
        return byScore;
      }
      return CANONICAL_INDEX[left] - CANONICAL_INDEX[right];
    })
    .map((letter, index) => ({
      letter,
      score: scores[letter],
      rank: index + 1,
      percent: maxScore > 0 ? (scores[letter] / maxScore) * 100 : 0,
    }));
}

/** The top three letters of a ranked profile, in rank order. */
export function deriveHollandCode(ranked: RiasecRankedDimension[]): RiasecLetter[] {
  return ranked.slice(0, HOLLAND_CODE_LENGTH).map((dimension) => dimension.letter);
}

/** Ranks, derives the code, and packages both with the raw scores. */
export function buildRiasecProfile(scores: RiasecScores, maxScore: number): RiasecProfile {
  const ranked = rankDimensions(scores, maxScore);
  const code = deriveHollandCode(ranked);

  return {
    scores,
    ranked,
    code,
    codeString: code.join(''),
    maxScore,
  };
}

/**
 * Where a path's letter sits in the user's Holland Code, or `null` if it is not
 * in the code at all.
 *
 * `0` is the user's #1 letter. This single number drives both halves of the gold
 * rule (§3A): non-null means "render gold", and the value orders gold paths
 * against each other.
 */
export function recommendationRankOf(
  letter: RiasecLetter,
  code: readonly RiasecLetter[],
): number | null {
  const index = code.indexOf(letter);

  return index === -1 ? null : index;
}

/** Gold is a highlight, never a filter — this only says how to *render*. */
export function isRecommended(letter: RiasecLetter, code: readonly RiasecLetter[]): boolean {
  return recommendationRankOf(letter, code) !== null;
}

/** The minimum a path must expose for the recommendation sort to work. */
export interface RecommendablePath {
  riasecLetter: RiasecLetter;
  /** Curated ordering within a recommendation group; lower comes first. */
  displayOrder: number;
  /** Final deterministic key, so the sort never depends on input order. */
  id: string;
}

export interface RecommendedPath<T extends RecommendablePath> {
  path: T;
  recommended: boolean;
  /** 0-2 for a recommended path, `null` otherwise. */
  recommendationRank: number | null;
}

/**
 * Applies the §3A recommendation rule to a list of paths.
 *
 * Gold paths first, ordered by how high their letter sits in the user's profile
 * (#1 letter's paths, then #2's, then #3's); everything else after, in curated
 * order, **still fully selectable**. Nothing is removed — "gold = recommendation,
 * not restriction" is enforced by this function returning every path it was
 * given, which a test asserts.
 *
 * With no code (the user has not been assessed), nothing is gold and the curated
 * order stands — which is exactly what the pre-assessment catalogue wants.
 */
export function rankPathsByRecommendation<T extends RecommendablePath>(
  paths: readonly T[],
  code: readonly RiasecLetter[],
): RecommendedPath<T>[] {
  return paths
    .map((path) => {
      const rank = recommendationRankOf(path.riasecLetter, code);

      return { path, recommended: rank !== null, recommendationRank: rank };
    })
    .sort((left, right) => {
      /* Recommended before not; then by the user's letter order. */
      const leftKey = left.recommendationRank ?? HOLLAND_CODE_LENGTH;
      const rightKey = right.recommendationRank ?? HOLLAND_CODE_LENGTH;
      if (leftKey !== rightKey) {
        return leftKey - rightKey;
      }

      if (left.path.displayOrder !== right.path.displayOrder) {
        return left.path.displayOrder - right.path.displayOrder;
      }

      return left.path.id.localeCompare(right.path.id);
    });
}
