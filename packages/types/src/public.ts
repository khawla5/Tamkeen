import type { RiasecLetter } from './riasec';

/**
 * What an unauthenticated reader is allowed to know (TAM-150).
 *
 * A file of its own so the boundary is greppable. Every other contract in this
 * package is read behind a session; these shapes are served to anyone who loads
 * the ministry's front page, so the rule for adding a field here is different
 * from the rule everywhere else: it must be information the ministry would put
 * on a printed brochure.
 *
 * What is deliberately absent, and must stay absent: anything about people
 * (counts of learners, who chose what), the course titles themselves, path keys
 * and internal ordering. A visitor is being told what the ministry trains its
 * employees to do — not given the shape of its catalogue.
 */

/** One training path, as the public explorer presents it. */
export interface PublicPathSummary {
  id: string;
  name: string;
  /** Rendered as its Arabic type name; the letter itself is never shown. */
  riasecLetter: RiasecLetter;
  /** Two or three sentences on what the path develops. */
  description: string;
  /** Three to five capability nouns. Empty until the directorate writes them. */
  skillOutcomes: string[];
  /** How many courses the path offers to choose from — not their titles. */
  courseCount: number;
  /** Nominal effort for a typical selection; null when it is not estimated. */
  typicalDurationMinutes: number | null;
}
