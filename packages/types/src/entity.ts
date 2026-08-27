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
  /**
   * Every path the course is attached to, including memberships still awaiting
   * the admin (TAM-141). Learners see only APPROVED ones.
   */
  paths: Array<{
    id: string;
    name: string;
    riasecLetter: RiasecLetter;
    status: PathMembershipStatus;
  }>;

  /** How many learners have this course among their selected path courses. */
  enrolledCount: number;
  /** How many of those have passed it. Null when nobody is enrolled — a rate
   *  over zero learners is not 0%, it is undefined, and printing 0% would read
   *  as failure rather than as "nobody has started". */
  completionRate: number | null;
}

/**
 * Why a course cannot be published yet (§4B.3, D-061).
 *
 * Returned as a list rather than as the first failure, so an entity fixes
 * everything in one pass instead of discovering the next problem each time they
 * click publish.
 */
export const PUBLISH_BLOCKERS = [
  /** No path membership: a learner has no route to the course at all. */
  'NO_PATH',
  /** §4.6's card cannot say what language the course is in (D-047). */
  'NO_LANGUAGE',
  /** §4.7 renders objectives; an empty section is a broken page. */
  'NO_OBJECTIVES',
  /** The catalogue card and the path duration both need it (D-039). */
  'NO_DURATION',
  /**
   * The LMS reports no completion criteria — the D-042 dead end. Nobody on this
   * course could ever pass it, so no certificate could ever be issued.
   */
  'NO_COMPLETION_CRITERIA',
  /**
   * The LMS could not be asked. Publishing is refused rather than allowed,
   * because "we could not confirm the course is completable" must fail in the
   * safe direction.
   */
  'LMS_UNREACHABLE',
] as const;

export type PublishBlocker = (typeof PUBLISH_BLOCKERS)[number];

/** §4B.4 — what Moodle holds, read back before publishing. */
export interface EntityCourseContentView {
  activityCount: number;
  hasQuiz: boolean;
  completionConfigured: boolean;
}

/** Whether an entity's path membership has been accepted by the admin (TAM-141). */
export type PathMembershipStatus = 'PENDING' | 'APPROVED';

/**
 * The membership rules the form enforces alongside the server (TAM-141) — sent
 * with the course so the numbers live in one place, the settings.
 */
export interface PathMembershipRules {
  /** At most this many paths. */
  maxPaths: number;
  /** Spanning at most this many distinct RIASEC letters. */
  maxLetters: number;
  /**
   * The course is already outside the rules (seeded before them, or the limits
   * were lowered). It may remove memberships but not add — grandfathered.
   */
  frozen: boolean;
  /** Whether a new membership waits for the admin, or takes effect at once. */
  approvalRequired: boolean;
}

/** §4B.3 — one course, as the entity manages it. */
export interface EntityCourseDetail extends EntityCourseSummary {
  /**
   * Admin-only (§4C.5): a cross-cutting course that reaches every path without
   * memberships and carries no letters. Read-only for the entity.
   */
  isGeneral: boolean;
  pathRules: PathMembershipRules;
  objectives: string[];
  prerequisites: string | null;

  /**
   * The RIASEC letters this course carries, **derived from its paths** rather
   * than authored separately (D-066). A course in no path has none.
   */
  riasecLetters: RiasecLetter[];

  /** Null when the LMS could not be reached; the blockers say so explicitly. */
  content: EntityCourseContentView | null;
  /** Empty when the course is ready to publish. */
  publishBlockers: PublishBlocker[];

  /**
   * How many learners currently hold this course in a path.
   *
   * Shown so unpublishing is an informed decision: a held course degrades to
   * HIDDEN_BUT_COMPLETABLE rather than being withdrawn (§2, D-059), and an
   * entity that was not told would believe it had removed something learners can
   * still take.
   */
  learnersHolding: number;

  /** Every path the entity may attach this course to, for the metadata form. */
  availablePaths: Array<{ id: string; name: string; riasecLetter: RiasecLetter }>;
}

/** The response to unpublishing — see `learnersHolding` above. */
export interface EntityUnpublishResult {
  publication: CoursePublication;
  /** What learners will actually see now. */
  status: CourseStatus;
  /** Non-zero means the course stayed completable for these learners. */
  learnersHolding: number;
}

/**
 * §4B.5 — one learner on one of this entity's courses.
 *
 * **What is absent is the specification** (D-064). No email, no employee ID, no
 * Holland Code, no path, no certificates: review requires identifying a
 * colleague and seeing how they did on *this* course, and nothing more. Email
 * and employee ID are the two identifiers that would make a leaked export
 * directly actionable elsewhere in the ministry, and neither helps a reviewer.
 */
export interface EntityLearnerRow {
  /** Our user id. Opaque, and needed to key a list. */
  userId: string;
  fullName: string;
  department: string;

  courseId: string;
  courseTitle: string;

  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  /** 0-100, or null when nothing has been attempted — never 0, which would read
   *  as a failed attempt. */
  gradePercent: number | null;
  /** Our verdict against the product threshold (D-007), never the LMS's. */
  passed: boolean;
  enrolledAt: string | null;
  completedAt: string | null;
}

/** §4B.1 — at a glance, and only what is actionable. */
export interface EntityDashboardView {
  entityName: string;

  publishedCourses: number;
  draftCourses: number;
  /** Withdrawn by the entity, or gone from the LMS. */
  withdrawnCourses: number;

  totalLearners: number;
  /** Across every course this entity owns. Null when nobody is enrolled. */
  completionRate: number | null;

  /**
   * Courses that cannot be published as they stand — the one thing on this
   * screen that is genuinely pending, and the reason the dashboard exists at all
   * rather than being a page of counts.
   */
  needsAttention: Array<{ id: string; title: string; blockers: PublishBlocker[] }>;
}

/** The response to an author launch — a URL, minted per click (D-044/D-060). */
export interface EntityAuthorLaunchView {
  url: string;
  /**
   * `embed`: meant for an iframe inside the entity portal — Moodle's chrome
   * hidden, editing on (TAM-129). `handoff`: the full-page navigation.
   */
  mode: 'embed' | 'handoff';
}
