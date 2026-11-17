import type { LevelRef } from './levels';

/**
 * Paths and courses as the API presents them (§4.4, §4.6, §4.7).
 */

/**
 * Whether a path is offered at all (D-134).
 *
 * Replaces `isActive`. A path is built — levels, then an assessment, then
 * courses placed onto the levels — before anybody can be assigned into it, and
 * DRAFT is where that happens.
 */
export const PATH_STATUSES = ['DRAFT', 'PUBLISHED'] as const;

export type PathStatus = (typeof PATH_STATUSES)[number];

/**
 * A course's effective visibility in our catalogue (§6, D-015) — **derived**,
 * never authored (D-059). It is computed from the entity's `CoursePublication`
 * decision and the LMS's own flags, so no single actor sets it.
 *
 * `HIDDEN_BUT_COMPLETABLE` is the rule that stops content being pulled out from
 * under a learner: a course inside somebody's assigned path may leave the
 * catalogue for new placements but must stay completable for those enrolled.
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
 * carry course text, without which an English title inside an RTL container has
 * its punctuation rearranged.
 */
export const COURSE_LANGUAGES = ['AR', 'EN'] as const;

export type CourseLanguage = (typeof COURSE_LANGUAGES)[number];

/** The text direction a course's own title and summary must be rendered in. */
export function directionForCourseLanguage(language: CourseLanguage | null): 'rtl' | 'ltr' {
  return language === 'EN' ? 'ltr' : 'rtl';
}

/**
 * Where a course sits inside a path — the derived state, never a stored one
 * (D-134).
 *
 * `UNASSIGNED` is in the path, in no level, and hidden from every learner.
 * `PLACED` is on a level and visible there. The pair is computed from
 * `level_id` being null or not, in one place, so no screen can invent a third
 * reading.
 */
export const PATH_COURSE_PLACEMENTS = ['UNASSIGNED', 'PLACED'] as const;

export type PathCoursePlacement = (typeof PATH_COURSE_PLACEMENTS)[number];

/** The path a course belongs to, as shown on a course card (§4.6). */
export interface CoursePathRef {
  id: string;
  name: string;
  /** The level it sits on in that path, or null while it is unassigned. */
  level: LevelRef | null;
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
  /** Only the paths this reader may see it through, and only where it is placed. */
  paths: CoursePathRef[];
}

/**
 * The single context-dependent action a course offers (§3, §4.7).
 *
 * Computed by the server from the learner's state, so the UI renders exactly one
 * button and never has to decide which rule applies. "Never all three" is a
 * product rule; making the server return one value is how it is enforced rather
 * than merely intended.
 *
 * `ADD_TO_PATH` is gone with the build flow (D-134): a learner no longer chooses
 * what their path contains, so there is nothing for them to add.
 */
export const COURSE_ACTIONS = [
  /** Not in any path assigned to this learner — browsing is allowed, acting is not. */
  'NONE',
  /** In an assigned path, at or above the learner's level, not yet complete. */
  'START_COURSE',
  /** Passed. */
  'COMPLETED',
  /** In an assigned path but below the learner's placed level — theirs to read,
   *  not theirs to do (D-134). */
  'BELOW_LEVEL',
  /** In an assigned path but no longer offered by the catalogue. */
  'UNAVAILABLE',
] as const;

export type CourseAction = (typeof COURSE_ACTIONS)[number];

/** A learner's own progress on one course, derived from `completions`. */
export const COURSE_PROGRESS_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] as const;

export type CourseProgressStatus = (typeof COURSE_PROGRESS_STATUSES)[number];

export interface CourseDetail extends CourseSummary {
  objectives: string[];
  prerequisites: string | null;
  action: CourseAction;
  /** Which assigned path this course is being read through; null when none is. */
  pathId: string | null;
  /**
   * The learner's own progress, when the course is in a path assigned to them;
   * null when it is not (§4.7, shared with the catalogue's card chip — one
   * resolution, not two).
   */
  personalStatus: CourseProgressStatus | null;
  /**
   * Set once `action` is `COMPLETED`, so the header action can link straight to
   * the certificate already earned. Null otherwise; a completed course with no
   * certificate yet issued is the sync job's concern, not this screen's.
   */
  certificateId: string | null;
}

export interface PathSummary {
  id: string;
  name: string;
  description: string;
  typicalDurationMinutes: number | null;
  /** How many courses are **placed** in this path. Unassigned ones are not offered. */
  courseCount: number;
  levelCount: number;
  displayOrder: number;
  /** The rung this learner starts on, or null before they take the assessment. */
  placedLevel: LevelRef | null;
  /** True once every course at or above their level is passed. */
  completed: boolean;
}

/** One rung of a path as a learner sees it (§4.5, D-134). */
export interface PathLevelView {
  id: string;
  name: string;
  position: number;
  /**
   * Where this rung stands relative to the learner's placement. All levels are
   * returned, so the learner sees the whole ladder and where they joined it.
   */
  standing: 'BELOW' | 'PLACED' | 'ABOVE';
  courses: CourseSummary[];
}

export interface PathDetail extends PathSummary {
  levels: PathLevelView[];
  /** Whether this learner has been assigned this path. Reading is wider than doing. */
  assigned: boolean;
  /** The assessment they must take before anything is startable, when they have not. */
  pendingAssessmentId: string | null;
}

/** §4.4 — the paths the ministry assigned to this learner. */
export interface AssignedPaths {
  paths: PathSummary[];
}

/**
 * §1's landing explorer — every published path, unauthenticated (TAM-150).
 *
 * Deliberately narrower than `PathSummary`: nothing about a learner, because
 * there is no learner yet, and nothing from `courses` beyond a count.
 * `skillOutcomes` is the whole reason this type exists — the explorer's one job
 * is showing what a path *produces*.
 */
export interface PublicPathSummary {
  id: string;
  name: string;
  description: string;
  /** Three to five short noun phrases, directorate-authored (§4C.4). */
  skillOutcomes: string[];
  courseCount: number;
  levelCount: number;
  typicalDurationMinutes: number | null;
}

/**
 * The course view / player (§4.8).
 *
 * Deliberately thin. Moodle owns the content, the quiz and the grading; this
 * page owns only the context around them — where the learner is in their path,
 * what happened last time, and the single action that applies now.
 */
export interface CoursePlayerView {
  courseId: string;
  title: string;
  summary: string;
  durationMinutes: number | null;

  /** Path context for the header. Null when the course is not in an assigned path. */
  pathName: string | null;
  levelName: string | null;
  /** Position within the level's placed courses, for "الدورة ٣ من ٧". */
  orderInLevel: number | null;
  totalInLevel: number | null;

  status: CourseProgressStatus;
  /** Mirrored from the LMS by the sync job; null until something is attempted. */
  gradePercent: number | null;
  /** Our verdict against the product threshold (D-007), never the LMS's. */
  passed: boolean;
  /** Shown so a failing learner knows what they are aiming at. */
  passThreshold: number;

  /**
   * Whether entering the course is possible at all. False when the learner has
   * not been placed yet, or the course sits below their level — an enabled
   * button would be one that cannot do what it says.
   */
  canLaunch: boolean;

  /** Where "continue" goes after passing. Null when this was the last one. */
  nextCourseId: string | null;
}

/** The framed player's previous / next (D-122): the course's activities in order. */
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

/**
 * The response to a launch request.
 *
 * A URL rather than a redirect so the client controls the navigation, and minted
 * per request rather than embedded in a page: it carries a short-lived
 * credential, so its life must start when the learner actually clicks (D-044).
 */
export interface CourseLaunchView {
  url: string;
  /** `embed`: meant for the player's iframe (D-121); `handoff`: full page. */
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
 * question is being asked of them: can an employee reach this course right now,
 * or not. So `AVAILABLE` is «متاحة» and everything else is «مخفية».
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
 * cannot drift: adding a status to `COURSE_STATUSES` places it on whichever side
 * the mapping says, in the badge and in the query, together.
 */
export function courseStatusesFor(visibility: CourseVisibility): CourseStatus[] {
  return COURSE_STATUSES.filter((status) => courseVisibility(status) === visibility);
}
