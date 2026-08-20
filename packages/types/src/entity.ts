import type { CourseLanguage, CoursePublication, CourseStatus } from './catalog';
import type { RiasecLetter } from './riasec';

/**
 * The entity / reviewer portal (CLAUDE.md §4B).
 *
 * Every shape here is already scoped by the time it reaches a client: the server
 * filters to the caller's own organisation (D-062), so there is no `entityId` on
 * a course for a client to filter by and no way to ask for another entity's.
 */

/** §4B.6 — the organisation, kept minimal. */
export interface EntityProfileView {
  id: string;
  name: string;
  contactName: string;
  contactEmail: string;
}

/**
 * A course as its owning entity sees it (§4B.2).
 *
 * Note what this carries that the learner-facing `CourseSummary` does not:
 * `publication`, the entity's own decision, alongside the derived `status`.
 * Both are shown because they answer different questions — "what did I decide"
 * and "what can a learner actually see right now" — and the gap between them is
 * exactly what an entity needs to notice when the LMS has hidden a course they
 * believe is published (D-059).
 */
export interface EntityCourseSummary {
  id: string;
  moodleCourseId: number;
  title: string;
  summary: string;
  durationMinutes: number | null;
  language: CourseLanguage | null;

  /** The entity's decision. */
  publication: CoursePublication;
  /** What that decision plus the LMS's state actually produces for a learner. */
  status: CourseStatus;

  /** Paths this course belongs to, as product metadata the entity set. */
  paths: Array<{ id: string; name: string; riasecLetter: RiasecLetter }>;

  /** How many learners have this course among their selected path courses. */
  enrolledCount: number;
  /** How many of those have passed it. Null when nobody is enrolled — a rate
   *  over zero learners is not 0%, it is undefined, and printing 0% would read
   *  as failure rather than as "nobody has started". */
  completionRate: number | null;
}
