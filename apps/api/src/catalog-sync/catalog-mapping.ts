import type { LmsCourse } from '../moodle/lms.types';

/**
 * The rules that decide what a course's catalogue state is, and what a sync run
 * may write.
 *
 * Pure functions, deliberately. Four callers now mirror or mutate `courses` —
 * the sync job, the seed runner, and the entity portal's publish and metadata
 * paths — and if any two of them disagreed about what "hidden" means or about
 * who owns `durationMinutes`, the same course would be described differently
 * depending on which one touched it last. Keeping the rules here means there is
 * one answer, and it is testable without a database or an LMS.
 */

export type CourseStatusValue = 'DRAFT' | 'AVAILABLE' | 'HIDDEN_BUT_COMPLETABLE' | 'RETIRED';

export type CoursePublicationValue = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';

/**
 * Everything `effectiveCourseStatus` needs, and nothing else.
 *
 * Note the ownership of each field, because it is the whole point of D-059:
 * `publication` is **ours** and only an entity or admin writes it; `lmsPresent`
 * and `lmsVisible` are **the LMS's** and only sync writes them; `heldByAnyLearner`
 * is a fact about our own `user_path_courses`.
 */
export interface CourseVisibilityInputs {
  publication: CoursePublicationValue;
  /** Whether the LMS still returns this course at all. */
  lmsPresent: boolean;
  /** The LMS's own visibility flag. Distinct from our catalogue status. */
  lmsVisible: boolean;
  /** Whether any learner has this course among their selected path courses. */
  heldByAnyLearner: boolean;
  /**
   * Whether *now* falls inside the availability window the ministry set
   * (§4C.5, TAM-134). `true` when there is no window at all, which is the case
   * for every course that predates the field.
   *
   * A boolean rather than the two dates, so this function stays pure and has no
   * clock in it: `isWithinAvailabilityWindow` reads the clock once, at the call
   * site, and a test can state "the window has ended" without inventing a date.
   */
  withinAvailabilityWindow: boolean;
}

/** The bounds as they are stored — either or both may be absent. */
export interface AvailabilityWindow {
  availableFrom: Date | null;
  availableUntil: Date | null;
}

/**
 * Whether a course's availability window is open at `now`.
 *
 * Inclusive of both bounds, which is what an administrator means by "from the
 * first to the thirtieth": the bounds are written as the first instant and the
 * last instant of the chosen days (see `availabilityWindowFrom`/`Until`), so a
 * plain comparison is already the inclusive one.
 */
export function isWithinAvailabilityWindow(window: AvailabilityWindow, now: Date): boolean {
  if (window.availableFrom !== null && now < window.availableFrom) {
    return false;
  }

  if (window.availableUntil !== null && now > window.availableUntil) {
    return false;
  }

  return true;
}

/**
 * A course's effective visibility in our catalogue (D-059).
 *
 * **This is the only place `courses.status` is decided.** Nothing assigns that
 * column directly; every writer calls this. Before Phase 4 the status was
 * recomputed from the LMS's `visible` flag on every sync run, which meant an
 * entity that hid a course had it flipped back to AVAILABLE minutes later, with
 * their decision recorded nowhere. Splitting the LMS's facts from our decision
 * and deriving the result from both is what makes that impossible.
 *
 * **The property worth stating outright: there is no combination of inputs for
 * which a course a learner holds becomes invisible to that learner.** Read the
 * `heldByAnyLearner` branches — every one of them lands on
 * HIDDEN_BUT_COMPLETABLE rather than RETIRED. §2/D-015's course-edit protection
 * is therefore structural here, not a check somebody has to remember to write at
 * each call site.
 */
export function effectiveCourseStatus(inputs: CourseVisibilityInputs): CourseStatusValue {
  /* A draft is not in the catalogue whatever the LMS says about it. It is the
     state between a Moodle shell existing and its product metadata being
     finished, and it must be reversible — which RETIRED, an end state, is not. */
  if (inputs.publication === 'DRAFT') {
    return 'DRAFT';
  }

  /* Withdrawn by the entity, or gone from the LMS. Either way it leaves the
     catalogue — but only completely if nobody is working through it. */
  if (inputs.publication === 'UNPUBLISHED' || !inputs.lmsPresent) {
    return inputs.heldByAnyLearner ? 'HIDDEN_BUT_COMPLETABLE' : 'RETIRED';
  }

  /*
   * Outside its availability window (§4C.5, TAM-134).
   *
   * **HIDDEN_BUT_COMPLETABLE whether or not anybody holds it, and that is the
   * deliberate difference from a withdrawal above.** RETIRED is an end state:
   * it is what a course reaches when the LMS no longer has it, and nothing in
   * the product brings it back. A window that has ended is the opposite — it is
   * a date an administrator typed and can retype, so retiring the course would
   * make a reversible decision look permanent, and would need a human to undo
   * something no human did. Hidden from new selections, still completable for
   * anyone mid-path, and open again the moment the dates say so.
   */
  if (!inputs.withinAvailabilityWindow) {
    return 'HIDDEN_BUT_COMPLETABLE';
  }

  /* Published and present, so the LMS's visibility flag decides. A hidden
     course is never RETIRED: the LMS still holds it and may show it again, so
     treating it as an end state would need a human to undo something no human
     did. */
  return inputs.lmsVisible ? 'AVAILABLE' : 'HIDDEN_BUT_COMPLETABLE';
}

/** What a course row already holds, or null when it is new to us. */
export interface ExistingCourseRow {
  /** Our authored value. Owned by us (D-039), not by the LMS. */
  durationMinutes: number | null;
}

/**
 * The LMS-owned fields to write for a course the LMS still publishes.
 *
 * **What is absent from this return type is the point.** It carries no
 * `status`, no `publication`, no `objectives`, no `prerequisites`, no
 * `language`, no owner and no path membership. Moodle is the source of truth for
 * a course existing, for its title and summary, and for whether it is shown;
 * everything else on the row is ours (D-040 rule 3, D-059). A sync that returned
 * a status here is exactly the defect Phase 4 removed.
 *
 * `durationMinutes` we already hold always wins. It is our product metadata
 * (D-039), and letting the LMS's `null` overwrite an authored value would erase
 * the catalogue's durations on the first sync — quietly, since nothing errors
 * when a nullable column becomes null.
 */
export interface SyncedCourseFields {
  title: string;
  summary: string;
  lmsVisible: boolean;
  lmsPresent: boolean;
  durationMinutes: number | null;
}

export function fieldsForPublishedCourse(
  lmsCourse: LmsCourse,
  existing: ExistingCourseRow | null,
): SyncedCourseFields {
  return {
    title: lmsCourse.title,
    summary: lmsCourse.summary,
    lmsVisible: lmsCourse.visible,
    lmsPresent: true,
    durationMinutes: existing?.durationMinutes ?? lmsCourse.durationMinutes ?? null,
  };
}

/**
 * Whether a sync result is safe to act on.
 *
 * An empty catalogue is treated as a fault, not as "every course was deleted".
 * The difference matters enormously: acting on it would mark the entire
 * catalogue vanished in one pass, and the most likely causes — a token that lost
 * a capability, a half-configured instance, a Moodle mid-upgrade — are all
 * transient. The seed runner already refuses an empty catalogue for the same
 * reason.
 */
export function isUsableCatalogue(lmsCourses: readonly LmsCourse[]): boolean {
  return lmsCourses.length > 0;
}

/**
 * The ministry's clock, for turning a calendar day into an instant.
 *
 * Arabia Standard Time is UTC+3 and observes no daylight saving, so a fixed
 * offset is not an approximation here — it is the whole rule. Named and stated
 * rather than inlined, because the failure it prevents is silent: reading the
 * administrator's dates as UTC would open a course at 03:00 local and close it
 * at 02:59 the next morning, which nobody would report as a bug and everybody
 * would experience as one.
 */
const MINISTRY_UTC_OFFSET = '+03:00';

/** `YYYY-MM-DD`, as the administrator's date field produces and consumes it. */
export type CalendarDay = string;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDay(value: string): value is CalendarDay {
  if (!DAY_PATTERN.test(value)) {
    return false;
  }

  /*
   * Shape *and* reality: `2026-02-31` matches the pattern and is not a date.
   *
   * The check is a round trip rather than `!Number.isNaN(Date.parse(…))`,
   * because V8 does not reject an out-of-range day — it rolls it over, so
   * February the thirty-first parses happily as the third of March. Comparing
   * the day it comes back as is what catches that, and it was a real assertion
   * failure here before it could be a stored window nobody chose.
   */
  const parsed = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** The first instant of that day, ministry time. */
export function availabilityWindowFrom(day: CalendarDay | null): Date | null {
  return day === null ? null : new Date(`${day}T00:00:00.000${MINISTRY_UTC_OFFSET}`);
}

/**
 * The last instant of that day, ministry time.
 *
 * End-of-day rather than start-of-day, because «متاحة حتى ٣٠ سبتمبر» means the
 * thirtieth is a day the course is available. Taking the bound literally as
 * midnight would close it a day early, every time.
 */
export function availabilityWindowUntil(day: CalendarDay | null): Date | null {
  return day === null ? null : new Date(`${day}T23:59:59.999${MINISTRY_UTC_OFFSET}`);
}

/** The stored instant, back as the calendar day the administrator chose. */
export function availabilityDay(value: Date | null): CalendarDay | null {
  if (value === null) {
    return null;
  }

  const shifted = new Date(value.getTime() + 3 * 60 * 60 * 1000);

  return shifted.toISOString().slice(0, 10);
}
