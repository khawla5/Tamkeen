import type { UserPathCourseStatus } from './journey';
import type { RiasecLetter } from './riasec';

/**
 * Paths and courses as the API presents them (CLAUDE.md §4.4, §4.6, §4.7).
 */

/**
 * The 5–10 rule (§2), in one place.
 *
 * Shared rather than duplicated because §2B requires it enforced on **both**
 * client and server: the button-disabling logic and the confirm-endpoint
 * validation must be the same two numbers, or one of them is wrong.
 * The server remains the authority — the client copy only avoids offering an
 * action that would be rejected.
 */
export const PATH_MIN_COURSES = 5;
export const PATH_MAX_COURSES = 10;

/**
 * A course's effective visibility in our catalogue (§6, D-015) — **derived**,
 * never authored (D-059). It is computed from the entity's `CoursePublication`
 * decision and the LMS's own flags, so no single actor sets it.
 *
 * `HIDDEN_BUT_COMPLETABLE` is the rule that stops content being pulled out from
 * under a learner: a course already inside someone's confirmed path may leave the
 * catalogue for *new* selections but must stay completable for those enrolled.
 *
 * `DRAFT` is where a course sits between its LMS shell existing and its product
 * metadata being finished. Invisible to learners exactly as `RETIRED` is, but
 * reversibly so.
 */
export const COURSE_STATUSES = ['DRAFT', 'AVAILABLE', 'HIDDEN_BUT_COMPLETABLE', 'RETIRED'] as const;

export type CourseStatus = (typeof COURSE_STATUSES)[number];

/**
 * The entity's publishing decision (§4B.3, D-059).
 *
 * Ours entirely — catalogue sync reads it as an input to the status derivation
 * and may never write it. That is what makes an entity's decision to withdraw a
 * course survive the next sync run.
 */
export const COURSE_PUBLICATIONS = ['DRAFT', 'PUBLISHED', 'UNPUBLISHED'] as const;

export type CoursePublication = (typeof COURSE_PUBLICATIONS)[number];

/**
 * The single language a course was authored in (§4A, D-047).
 *
 * A course exists in one language as its entity wrote it; we do not maintain a
 * bilingual title and summary per course. The app chrome stays Arabic-first
 * regardless — this drives the `dir`/`lang` attributes on the elements that
 * carry course text, without which an English title inside an RTL container
 * has its punctuation rearranged.
 */
export const COURSE_LANGUAGES = ['AR', 'EN'] as const;

export type CourseLanguage = (typeof COURSE_LANGUAGES)[number];

/** The text direction a course's own title and summary must be rendered in. */
export function directionForCourseLanguage(language: CourseLanguage | null): 'rtl' | 'ltr' {
  return language === 'EN' ? 'ltr' : 'rtl';
}

/** The path a course belongs to, as shown on a course card (§4.6). */
export interface CoursePathRef {
  id: string;
  name: string;
  riasecLetter: RiasecLetter;
}

export interface CourseSummary {
  id: string;
  /** The only bridge to the LMS (§1). Exposed because the course player needs
   *  it; it identifies a course, not a person. */
  moodleCourseId: number;
  title: string;
  summary: string;
  durationMinutes: number | null;
  status: CourseStatus;
  /** Which language the title and summary above are in (D-047). Null for a
   *  course discovered in the LMS that no entity has claimed yet. */
  language: CourseLanguage | null;
  paths: CoursePathRef[];
}

/**
 * The single context-dependent action a course offers (§3, §4.7).
 *
 * Computed by the server from the user's state, so the UI renders exactly one
 * button and never has to decide which rule applies. "Never all three" is a
 * product rule; making the server return one value is how it is enforced rather
 * than merely intended.
 */
export const COURSE_ACTIONS = [
  /** No path yet, or the course is not part of the user's path — browsing is
   *  allowed, acting is not (§4.6). */
  'NONE',
  /** In the user's path and selectable: they are still building, or they have
   *  confirmed but are under the maximum (§4.9's quiet add). */
  'ADD_TO_PATH',
  /** Already selected, but the path has not been confirmed — nothing to start
   *  yet, so the only thing to offer is a way back to the build page. */
  'IN_PATH',
  /** In the confirmed path, not yet complete. */
  'START_COURSE',
  /** Passed. */
  'COMPLETED',
  /** In the user's path but not addable — no longer offered, or already at the
   *  maximum of ten. */
  'UNAVAILABLE',
] as const;

export type CourseAction = (typeof COURSE_ACTIONS)[number];

export interface CourseDetail extends CourseSummary {
  objectives: string[];
  prerequisites: string | null;
  action: CourseAction;
  /** Set when `action` is `ADD_TO_PATH`, so the card can link to the build page. */
  buildablePathId: string | null;
  /**
   * The user's own progress on this course, when it is in their path; null
   * when it is not (§4.7, shared with TAM-127's card chip — one resolution,
   * not two). Distinguishes `START_COURSE`'s two underlying situations —
   * confirmed-but-not-yet-attempted and actually in progress — which `action`
   * alone cannot, since both resolve to the same single action.
   */
  personalStatus: UserPathCourseStatus | null;
  /**
   * Set once `action` is `COMPLETED`, so the header action can link straight
   * to the certificate already earned — the same field TAM-126 adds to
   * my-path. Null otherwise; a completed course with no certificate yet
   * issued is not this ticket's concern (the sync job's).
   */
  certificateId: string | null;
}

export interface PathSummary {
  id: string;
  name: string;
  description: string;
  riasecLetter: RiasecLetter;
  typicalDurationMinutes: number | null;
  /** How many courses this path offers to choose from (§4.4 card content). */
  courseCount: number;
  displayOrder: number;
  /** True when `riasecLetter` is in the user's Holland Code (§3A). */
  recommended: boolean;
  /** 0-2 — the position of this path's letter in the user's code; null if absent. */
  recommendationRank: number | null;
}

export interface PathDetail extends PathSummary {
  courses: CourseSummary[];
  /** Which of this path's courses the user has selected so far (§4.5). */
  selectedCourseIds: string[];
  /** False once any path is confirmed — one path per user, no switching (D-002). */
  canBuild: boolean;
}

/** §4.4 — the code plus every path, gold first. */
export interface PathRecommendations {
  /** Null before the assessment is taken; the catalogue is still browsable. */
  code: RiasecLetter[] | null;
  paths: PathSummary[];
}

/**
 * The course view / player (§4.8).
 *
 * Deliberately thin. Moodle owns the content, the quiz and the grading; this
 * page owns only the context around them — where the learner is in their path,
 * what happened last time, and the single action that applies now. Rebuilding
 * Moodle's chrome here would duplicate the LMS badly and put the product in the
 * business of rendering course material it does not own (D-000).
 */
export interface CoursePlayerView {
  courseId: string;
  title: string;
  summary: string;
  durationMinutes: number | null;

  /** Path context for the header. Null when the course is not in a path. */
  pathName: string | null;
  /** Position within the learner's chosen courses, for "الدورة ٣ من ٧". */
  orderInPath: number | null;
  totalInPath: number | null;

  status: UserPathCourseStatus;
  /** Mirrored from the LMS by the sync job; null until something is attempted. */
  gradePercent: number | null;
  /** Our verdict against the product threshold (D-007), never the LMS's. */
  passed: boolean;
  /** Shown so a failing learner knows what they are aiming at. */
  passThreshold: number;

  /**
   * Whether entering the course is possible at all. False before the path is
   * confirmed — nothing is enrolled until the commitment gate (§4.5), so an
   * enabled button would be one that cannot do what it says.
   */
  canLaunch: boolean;

  /** Where "continue" goes after passing. Null when this was the last one. */
  nextCourseId: string | null;
}

/**
 * The response to a launch request.
 *
 * A URL rather than a redirect so the client controls the navigation, and
 * minted per request rather than embedded in a page: it carries a short-lived
 * credential, so its life must start when the learner actually clicks (D-044).
 */
/** The framed player's previous / next (D-119): the course's activities in order. */
export interface CourseOutlineView {
  items: Array<{
    /** The LMS's module id — what the frame reports it is showing. */
    moduleId: number;
    name: string;
    kind: string;
    /** The activity's page; navigable inside an already signed-in frame. */
    url: string;
  }>;
}

export interface CourseLaunchView {
  url: string;
  /** `embed`: meant for the player's iframe (D-118); `handoff`: full page. */
  mode: 'embed' | 'handoff';
}

/**
 * The two words the super-admin portal uses for a course (§4C.5, ministry
 * direction 2026-08-25).
 *
 * **A vocabulary, not a second state.** `CourseStatus` above stays exactly as it
 * is — it is what the derivation produces and what the entity portal and the
 * learner-facing gates read. What the ministry asked for is that the *admin*
 * screens stop asking an administrator to distinguish four states when only one
 * question is being asked of them: can an employee choose this course right now,
 * or not. So `AVAILABLE` is «متاحة» and everything else is «مخفية».
 *
 * Shared here rather than written into the page, on D-034's reasoning: the
 * admin list's filter is applied in SQL and its badge is rendered in React, and
 * if those two disagreed about which statuses count as hidden the filter would
 * quietly return rows the badge contradicts.
 *
 * **Why the underlying status is still carried on the row.** Collapsing the
 * vocabulary must not collapse the *explanation* — "hidden" is the answer, and
 * an administrator looking at a course nobody can see still needs to know
 * whether that is a withdrawal, a draft, an expired availability window or the
 * LMS having dropped it. The row keeps `status` and the LMS flags for exactly
 * that, and the page prints the reason under the badge.
 */
export const COURSE_VISIBILITIES = ['AVAILABLE', 'HIDDEN'] as const;

export type CourseVisibility = (typeof COURSE_VISIBILITIES)[number];

/** The one mapping from the derived status to the administrator's vocabulary. */
export function courseVisibility(status: CourseStatus): CourseVisibility {
  return status === 'AVAILABLE' ? 'AVAILABLE' : 'HIDDEN';
}

/**
 * The statuses a given visibility covers — the filter's half of the mapping.
 *
 * Derived from `courseVisibility` rather than listed a second time, so the two
 * cannot drift: adding a status to `COURSE_STATUSES` places it on whichever
 * side the mapping says, in the badge and in the query, together.
 */
export function courseStatusesFor(visibility: CourseVisibility): CourseStatus[] {
  return COURSE_STATUSES.filter((status) => courseVisibility(status) === visibility);
}
