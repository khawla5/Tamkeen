import { Injectable, Logger, NotImplementedException } from '@nestjs/common';

import type { LmsPort } from '../lms.port';
import {
  LmsOperationError,
  LmsUnavailableError,
  type CreateCourseInput,
  type EnrolInput,
  type LmsCourse,
  type LmsCourseContentSummary,
  type LmsCourseId,
  type LmsCourseProgress,
  type LmsHealth,
  type LmsUserId,
  type LmsUserRef,
  type ProvisionUserInput,
  type UpdateUserInput,
} from '../lms.types';
import {
  deriveMoodleUsername,
  generateUnusedPassword,
  joinFullName,
  normaliseEmail,
  splitFullName,
} from './moodle-identity';
import { mintHandoffToken } from './moodle-handoff';
import { MoodleWsClient, MoodleWsError } from './moodle-ws.client';

/**
 * The real Moodle adapter (Phase 2).
 *
 * Its whole job is translation: Moodle's web-service payloads in, our
 * `lms.types` vocabulary out. Every Moodle function name, field name and error
 * code lives in this file or in `moodle-ws.client.ts`; none of it may reach a
 * caller (D-030), and the contract suite asserts as much.
 *
 * Behaviour here is written against what a live Moodle **5.2.2** actually did in
 * the Phase 2 spike, not against the documentation. Where those two disagreed,
 * reality won, and the surprises are recorded in D-038 with the reasoning.
 *
 * Nothing is version-specific: the release string is read for reporting only, so
 * the production 4.5 LTS target and the 5.2 development instance run the same
 * code path.
 */

// ── Moodle payload shapes — confined to this file ───────────────────────────

interface MoodleSiteInfo {
  sitename?: string;
  release?: string;
  username?: string;
}

interface MoodleUser {
  id: number;
  username?: string;
  firstname?: string;
  lastname?: string;
}

interface MoodleCourse {
  id: number;
  fullname?: string;
  displayname?: string;
  summary?: string;
  /** Moodle sends 1/0 rather than a JSON boolean. */
  visible?: number | boolean;
  /** "site" marks the front page, which is not a course. */
  format?: string;
  /** Present only for a token holding the capability; see readCompletionEnabled. */
  enablecompletion?: number | boolean;
  customfields?: Array<{ shortname?: string; value?: unknown }>;
}

interface MoodleCreatedCourse {
  id?: number;
  shortname?: string;
}

interface MoodleCourseModule {
  modname?: string;
  /** COMPLETION_TRACKING_*: 0 none, 1 manual, 2 automatic. */
  completion?: number;
}

interface MoodleCourseSection {
  modules?: MoodleCourseModule[];
}

interface MoodleCoursesByField {
  courses?: MoodleCourse[];
}

interface MoodleEnrolledCourse {
  id: number;
}

interface MoodleCompletionCriterion {
  complete?: boolean;
  timecompleted?: number;
}

interface MoodleCompletionStatus {
  completed?: boolean;
  completions?: MoodleCompletionCriterion[];
}

interface MoodleCompletionResponse {
  completionstatus?: MoodleCompletionStatus;
}

interface MoodleGradeItem {
  itemtype?: string;
  itemmodule?: string | null;
  graderaw?: number | null;
  grademin?: number | null;
  grademax?: number | null;
}

interface MoodleGradeReport {
  usergrades?: Array<{ gradeitems?: MoodleGradeItem[] }>;
}

@Injectable()
export class MoodleHttpService implements LmsPort {
  private readonly logger = new Logger(MoodleHttpService.name);

  constructor(
    private readonly baseUrl: string,
    private readonly client: MoodleWsClient,
    /** Configurable: role ids are per-instance and we do not control the
     *  ministry's Moodle (D-039). */
    private readonly studentRoleId: number,
    /** `editingteacher`, for an entity authoring its own course (D-060). */
    private readonly authorRoleId: number,
    /** Where created courses are filed. Moodle demands one and numbers them
     *  per-instance, so guessing is not an option (D-060). */
    private readonly courseCategoryId: number,
    /** Shared with the `local_tamkeensso` plugin. Server-side only. */
    private readonly ssoSecret: string,
    private readonly ssoTtlSeconds: number,
  ) {}

  // ── health ────────────────────────────────────────────────────────────────

  /**
   * Never throws, by contract: an unreachable LMS is an operational state a
   * dashboard reports, not an exception every call site must handle.
   */
  async checkHealth(): Promise<LmsHealth> {
    try {
      const info = await this.client.call<MoodleSiteInfo>('core_webservice_get_site_info');

      return {
        reachable: true,
        ...(info.sitename ? { siteName: info.sitename } : {}),
        ...(info.release ? { lmsVersion: info.release } : {}),
      };
    } catch (error) {
      return {
        reachable: false,
        failureCode:
          error instanceof LmsUnavailableError ? error.failureCode : 'UNEXPECTED_RESPONSE',
      };
    }
  }

  // ── identity ──────────────────────────────────────────────────────────────

  /**
   * Creates or re-finds the Moodle account for one of our users.
   *
   * **Lookup-then-create, never create-then-catch.** The spike showed a blind
   * re-create is rejected with `invalidparameter`, so relying on the error to
   * detect an existing account would work only by accident and would depend on
   * Moodle's choice of error code.
   *
   * The lookup is by the username we derive, not by email — see
   * `moodle-identity.ts` and D-038 for why an email lookup silently cannot work
   * under a least-privilege token.
   */
  async provisionUser(input: ProvisionUserInput): Promise<LmsUserRef> {
    const email = normaliseEmail(input.email);
    const username = deriveMoodleUsername(email);

    const existing = await this.findByUsername(username);
    if (existing) {
      return {
        lmsUserId: existing.id,
        email,
        fullName: joinFullName(existing.firstname ?? '', existing.lastname ?? ''),
      };
    }

    const { firstname, lastname } = splitFullName(input.fullName);

    try {
      const created = await this.client.call<MoodleUser[]>('core_user_create_users', {
        users: [
          {
            username,
            /* Generated and immediately discarded: the account is reachable only
               through our handoff, by construction rather than by setting. */
            password: generateUnusedPassword(),
            firstname,
            lastname,
            email,
            auth: 'manual',
          },
        ],
      });

      const first = created?.[0];

      if (!first || typeof first.id !== 'number') {
        this.logger.error('core_user_create_users returned no usable user id');
        throw new LmsUnavailableError('UNEXPECTED_RESPONSE');
      }

      return { lmsUserId: first.id, email, fullName: input.fullName };
    } catch (error) {
      if (error instanceof LmsUnavailableError) {
        throw error;
      }

      /*
       * Two callers can race to provision the same user — the confirm request
       * and a retry, say. The loser sees Moodle reject the duplicate username,
       * and the correct answer is the winner's account, not an error: this
       * method is contractually idempotent.
       *
       * A re-lookup that finds nothing means the refusal was genuine (most
       * likely a hand-created account already holding this email under a
       * different username — the accepted cost recorded in D-038).
       */
      const raced = await this.findByUsername(username);

      if (raced) {
        this.logger.warn(`Provisioning raced for ${username}; using the existing account`);
        return {
          lmsUserId: raced.id,
          email,
          fullName: joinFullName(raced.firstname ?? '', raced.lastname ?? ''),
        };
      }

      this.logger.error(
        `Moodle refused to create a user: ${
          error instanceof MoodleWsError ? error.errorcode : 'unknown'
        }`,
      );
      throw new LmsOperationError('PROVISION');
    }
  }

  /**
   * Present because the port declares it. Note it resolves through the derived
   * username rather than Moodle's email index, which is the only route that
   * works under our token — so it answers "the account *we* would have created
   * for this address", which is exactly what every caller means by it.
   */
  async findUserByEmail(email: string): Promise<LmsUserRef | null> {
    const normalised = normaliseEmail(email);
    const found = await this.findByUsername(deriveMoodleUsername(normalised));

    return found
      ? {
          lmsUserId: found.id,
          email: normalised,
          fullName: joinFullName(found.firstname ?? '', found.lastname ?? ''),
        }
      : null;
  }

  /**
   * Writes a profile name change through to the LMS (§4.12).
   *
   * `core_user_update_users`, the counterpart of the create call `provisionUser`
   * uses. Idempotent by construction — resending the same names is a no-op
   * write in Moodle, not a second account or an error — which is what lets a
   * caller retry after an ambiguous failure the way it already does for
   * `enrol`.
   *
   * Failure here is the caller's to absorb, not this adapter's: a profile save
   * must not be undone because the LMS was briefly unreachable, and D-036's
   * reconciliation pattern is what owns catching this up later, not a retry
   * loop inside this method.
   */
  async updateUser(input: UpdateUserInput): Promise<void> {
    const { firstname, lastname } = splitFullName(input.fullName);

    try {
      await this.client.call('core_user_update_users', {
        users: [{ id: input.lmsUserId, firstname, lastname }],
      });
    } catch (error) {
      if (error instanceof LmsUnavailableError) {
        throw error;
      }

      this.logger.error(
        `Name update refused for LMS user ${input.lmsUserId}: ${
          error instanceof MoodleWsError ? error.errorcode : 'unknown'
        }`,
      );
      throw new LmsOperationError('UPDATE_USER');
    }
  }

  private async findByUsername(username: string): Promise<MoodleUser | null> {
    try {
      const users = await this.client.call<MoodleUser[]>('core_user_get_users_by_field', {
        field: 'username',
        values: [username],
      });

      return Array.isArray(users) && users.length > 0 ? (users[0] ?? null) : null;
    } catch (error) {
      if (error instanceof LmsUnavailableError) {
        throw error;
      }

      /* A *failed* lookup is not the same as "no such user". Returning null here
         would make provisioning create a duplicate on every transient fault —
         the exact failure D-038 exists to prevent. */
      this.logger.error(
        `User lookup failed: ${error instanceof MoodleWsError ? error.errorcode : 'unknown'}`,
      );
      throw new LmsOperationError('PROVISION');
    }
  }

  // ── catalogue, enrolment, progress — later checkpoints ────────────────────

  /**
   * The catalogue, for the sync into our cached `courses` table.
   *
   * Uses **`core_course_get_courses_by_field`**, not the more obvious
   * `core_course_get_courses`. The spike found that `get_courses` omits
   * `visible` and `enablecompletion` entirely: Moodle gates those behind
   * `moodle/course:update` on the caller, which a least-privilege integration
   * user must not hold. Our `courses.status` rule (D-015/D-035) is derived from
   * `visible`, so sync is impossible without it, and `..._by_field` returns it
   * under the same token (D-038).
   */
  async listCourses(): Promise<LmsCourse[]> {
    const payload = await this.catalogueCall({});

    return (payload.courses ?? []).filter((course) => !isSiteCourse(course)).map(toLmsCourse);
  }

  async getCourse(lmsCourseId: LmsCourseId): Promise<LmsCourse | null> {
    const payload = await this.catalogueCall({ field: 'id', value: lmsCourseId });
    const course = (payload.courses ?? [])[0];

    /* An unknown id comes back as an empty list with a warning, not as an
       error — so `null` is the honest answer and the contract's requirement. */
    return course && !isSiteCourse(course) ? toLmsCourse(course) : null;
  }

  /**
   * Creates an empty course (§4B.3, D-060).
   *
   * **`categoryid` is required configuration, not a guess.** Moodle demands a
   * category and every instance numbers them differently; defaulting to 1 would
   * file ministry courses under whatever that instance happens to call category
   * one. `MOODLE_COURSE_CATEGORY_ID` is validated at boot in real mode.
   *
   * **Created with completion switched on but no criteria.** `enablecompletion`
   * is the prerequisite for configuring any criterion at all, and a course
   * created without it forces the entity to find a setting they do not know they
   * need. It does *not* make the course completable on its own — criteria are
   * still absent — which is why the publish gate reads the content summary
   * rather than trusting this flag (D-061).
   *
   * Not idempotent, per the port: there is no natural key to reconcile on, so a
   * blind retry creates a second course. The shortname collision below is the
   * only protection, and it is Moodle's rather than ours.
   */
  async createCourse(input: CreateCourseInput): Promise<LmsCourse> {
    let created: MoodleCreatedCourse | undefined;

    try {
      const courses = await this.client.call<MoodleCreatedCourse[]>('core_course_create_courses', {
        courses: [
          {
            fullname: input.title,
            shortname: input.shortName,
            categoryid: this.courseCategoryId,
            summary: input.summary,
            summaryformat: 1,
            enablecompletion: 1,
            /* Visible in Moodle; whether a learner sees it in *our* catalogue is
               `publication`'s business (D-059), not the LMS's. */
            visible: 1,
          },
        ],
      });

      created = courses[0];
    } catch (error) {
      if (error instanceof LmsUnavailableError) {
        throw error;
      }

      this.logger.error(
        `Course creation failed: ${error instanceof MoodleWsError ? error.errorcode : 'unknown'}`,
      );
      throw new LmsOperationError('CREATE_COURSE');
    }

    if (!created?.id) {
      /* A 200 with no usable id is not success. Returning a course with id 0
         would put a row in our catalogue pointing at nothing. */
      this.logger.error('core_course_create_courses returned no usable course id');
      throw new LmsOperationError('CREATE_COURSE');
    }

    /*
     * Read the course back rather than synthesising it from the input.
     *
     * Moodle normalises what it stores — it may trim a name or rewrite a summary
     * — and our `courses` row is a mirror of what the LMS holds, not of what we
     * asked for. Returning our own input would make the two disagree from the
     * first moment, and the next sync run would silently "correct" a row nobody
     * had changed.
     */
    const course = await this.getCourse(created.id);

    if (!course) {
      this.logger.error(`Course ${created.id} was created but could not be read back`);
      throw new LmsOperationError('CREATE_COURSE');
    }

    return course;
  }

  /**
   * What the LMS holds inside a course (§4B.4, D-061).
   *
   * Two reads, because Moodle splits the answer. `core_course_get_contents`
   * gives the activities; whether *course completion* is configured lives on the
   * course record and in its criteria, which `core_completion_get_course_
   * completion_status` reports per user — so the presence of criteria is read
   * from `enablecompletion` plus the activity-level completion settings that
   * `get_contents` returns on each module.
   *
   * **A failure here is not fatal.** It is consulted to decide whether to allow
   * a publish, and an unreadable course must not be publishable — so the caller
   * treats null as "cannot confirm", which refuses. That is the safe direction.
   */
  async getCourseContentSummary(lmsCourseId: LmsCourseId): Promise<LmsCourseContentSummary | null> {
    const course = await this.getCourse(lmsCourseId);

    if (!course) {
      return null;
    }

    const completionEnabled = await this.readCompletionEnabled(lmsCourseId);

    let sections: MoodleCourseSection[];

    try {
      sections = await this.client.call<MoodleCourseSection[]>('core_course_get_contents', {
        courseid: lmsCourseId,
      });
    } catch (error) {
      if (error instanceof LmsUnavailableError) {
        throw error;
      }

      this.logger.error(
        `Course contents read failed: ${
          error instanceof MoodleWsError ? error.errorcode : 'unknown'
        }`,
      );
      throw new LmsOperationError('SYNC');
    }

    const modules = (sections ?? []).flatMap((section) => section.modules ?? []);

    /*
     * `completion` on a module is Moodle's COMPLETION_TRACKING_*: 0 none,
     * 1 manual, 2 automatic. Anything above 0 is a criterion a learner can
     * actually satisfy — which is the thing whose absence D-042 found makes a
     * course permanently incompletable.
     */
    const hasCriterion = modules.some((module) => (module.completion ?? 0) > 0);

    return {
      lmsCourseId,
      activityCount: modules.length,
      hasQuiz: modules.some((module) => module.modname === 'quiz'),
      /* Both halves, deliberately: completion switched on with no criterion is
         the same silent dead end as completion switched off. */
      completionConfigured: completionEnabled && hasCriterion,
    };
  }

  /**
   * Whether course completion is switched on.
   *
   * Read through the same `..._by_field` call the catalogue uses, because
   * `core_course_get_courses` omits `enablecompletion` for a least-privilege
   * token exactly as it omits `visible` (D-038).
   */
  private async readCompletionEnabled(lmsCourseId: LmsCourseId): Promise<boolean> {
    const payload = await this.catalogueCall({ field: 'id', value: lmsCourseId });

    return Boolean((payload.courses ?? [])[0]?.enablecompletion);
  }

  private async catalogueCall(params: Record<string, unknown>): Promise<MoodleCoursesByField> {
    try {
      return await this.client.call<MoodleCoursesByField>(
        'core_course_get_courses_by_field',
        params,
      );
    } catch (error) {
      if (error instanceof LmsUnavailableError) {
        throw error;
      }

      this.logger.error(
        `Catalogue read failed: ${error instanceof MoodleWsError ? error.errorcode : 'unknown'}`,
      );
      throw new LmsOperationError('SYNC');
    }
  }

  /**
   * Enrols a user in a course, then **verifies before believing its own error**.
   *
   * This is the rule the spike forced (D-038). Moodle threw
   * `Message was not sent.` — the course-welcome email failing — *after* the
   * enrolment had already committed, and reading the enrolments back showed it
   * present, both times. An adapter that trusted the exception would report a
   * successful enrolment as failed; under D-036, where enrolment is best-effort
   * and the audit log is its only trace, that is a silently wrong operational
   * record and the sync job would keep "repairing" something already correct.
   *
   * The same reasoning covers a timeout, which is the genuinely ambiguous case:
   * the request may well have landed. So every failure is checked against
   * reality rather than assumed, and only a real absence is a failure.
   *
   * Idempotent, as the contract requires: Moodle treats re-enrolling an
   * already-enrolled user as a no-op.
   */
  async enrol(input: EnrolInput): Promise<void> {
    try {
      await this.client.call('enrol_manual_enrol_users', {
        enrolments: [
          {
            roleid: input.role === 'AUTHOR' ? this.authorRoleId : this.studentRoleId,
            userid: input.lmsUserId,
            courseid: input.lmsCourseId,
          },
        ],
      });

      return;
    } catch (error) {
      /* The verification is itself allowed to fail — if Moodle is unreachable we
         cannot learn anything, and the original error stands. */
      const enrolled = await this.isEnrolled(input.lmsUserId, input.lmsCourseId).catch(() => false);

      if (enrolled) {
        this.logger.warn(
          `Moodle reported a failure enrolling user ${input.lmsUserId} in course ` +
            `${input.lmsCourseId}, but the enrolment is present; treating as success`,
        );
        return;
      }

      if (error instanceof LmsUnavailableError) {
        throw error;
      }

      this.logger.error(
        `Enrolment refused: ${error instanceof MoodleWsError ? error.errorcode : 'unknown'}`,
      );
      throw new LmsOperationError('ENROL');
    }
  }

  async isEnrolled(lmsUserId: LmsUserId, lmsCourseId: LmsCourseId): Promise<boolean> {
    const courses = await this.enrolmentsFor(lmsUserId);

    return courses.some((course) => course.id === lmsCourseId);
  }

  private async enrolmentsFor(lmsUserId: LmsUserId): Promise<MoodleEnrolledCourse[]> {
    try {
      const courses = await this.client.call<MoodleEnrolledCourse[]>(
        'core_enrol_get_users_courses',
        { userid: lmsUserId },
      );

      return Array.isArray(courses) ? courses : [];
    } catch (error) {
      if (error instanceof LmsUnavailableError) {
        throw error;
      }

      this.logger.error(
        `Enrolment read failed: ${error instanceof MoodleWsError ? error.errorcode : 'unknown'}`,
      );
      throw new LmsOperationError('SYNC');
    }
  }

  /**
   * Completion and grade for one enrolment, or `null` when the user is not
   * enrolled.
   *
   * Two Moodle error codes are **answers, not failures**, and translating them
   * is most of this method's job:
   *
   *  - `usernotenroled` → `null`. Moodle checks enrolment before anything else,
   *    which is why one call can answer "is this person even on the course".
   *  - `nocriteriaset` → not complete. The course defines no completion
   *    criteria, so it cannot be complete — but the user *is* enrolled (the
   *    enrolment check already passed), and a grade may still exist. Treating
   *    this as an error would make every not-yet-configured course look like an
   *    outage.
   */
  async getCourseProgress(
    lmsUserId: LmsUserId,
    lmsCourseId: LmsCourseId,
  ): Promise<LmsCourseProgress | null> {
    let status: MoodleCompletionStatus | null;

    try {
      const payload = await this.client.call<MoodleCompletionResponse>(
        'core_completion_get_course_completion_status',
        { courseid: lmsCourseId, userid: lmsUserId },
      );

      status = payload?.completionstatus ?? null;
    } catch (error) {
      if (error instanceof LmsUnavailableError) {
        throw error;
      }

      const errorcode = error instanceof MoodleWsError ? error.errorcode : 'unknown';

      if (errorcode === 'usernotenroled') {
        return null;
      }

      if (errorcode !== 'nocriteriaset') {
        this.logger.error(`Completion read failed: ${errorcode}`);
        throw new LmsOperationError('SYNC');
      }

      status = null;
    }

    return {
      lmsUserId,
      lmsCourseId,
      completed: status?.completed ?? false,
      completedAt: readCompletedAt(status),
      gradePercent: await this.readCourseGrade(lmsUserId, lmsCourseId),
    };
  }

  /**
   * Progress across every enrolment of one user — what the sync job needs.
   *
   * Necessarily N+1: Moodle exposes no bulk equivalent, so this is one call to
   * list the enrolments plus completion and grade per course. Bounded in
   * practice by the 5-10 course rule (§2), and the sync job is scheduled rather
   * than serving a request, so latency here costs nobody a page load.
   */
  async listProgressForUser(lmsUserId: LmsUserId): Promise<LmsCourseProgress[]> {
    const enrolments = await this.enrolmentsFor(lmsUserId);
    const progress: LmsCourseProgress[] = [];

    for (const course of enrolments) {
      const entry = await this.getCourseProgress(lmsUserId, course.id);

      /* null means "not enrolled", which contradicts the list we just read —
         an enrolment removed mid-loop. Skipping is right: reporting it would
         invent progress for a course the user no longer has. */
      if (entry) {
        progress.push(entry);
      }
    }

    return progress;
  }

  /**
   * The course-total grade as a percentage, or `null` when nothing is graded.
   *
   * **The course total, always** — never a quiz item. The spike found Moodle
   * returning *only* the course total under our token, so preferring a quiz item
   * "when present" would silently change the grade source between instances.
   * It is also the right product semantics: D-007 and §5.5 speak of a course
   * being passed, not a quiz.
   *
   * `null` rather than 0 for an unattempted course: a zero would read as a
   * failed attempt to the threshold check, implying a quiz was taken when none
   * was.
   */
  private async readCourseGrade(
    lmsUserId: LmsUserId,
    lmsCourseId: LmsCourseId,
  ): Promise<number | null> {
    let report: MoodleGradeReport;

    try {
      report = await this.client.call<MoodleGradeReport>('gradereport_user_get_grade_items', {
        courseid: lmsCourseId,
        userid: lmsUserId,
      });
    } catch (error) {
      if (error instanceof LmsUnavailableError) {
        throw error;
      }

      this.logger.error(
        `Grade read failed: ${error instanceof MoodleWsError ? error.errorcode : 'unknown'}`,
      );
      throw new LmsOperationError('SYNC');
    }

    const item = report?.usergrades?.[0]?.gradeitems?.find((entry) => entry.itemtype === 'course');

    if (!item || item.graderaw === null || item.graderaw === undefined) {
      return null;
    }

    const min = Number(item.grademin ?? 0);
    const max = Number(item.grademax ?? 100);

    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      return null;
    }

    const percent = ((Number(item.graderaw) - min) / (max - min)) * 100;

    if (!Number.isFinite(percent)) {
      return null;
    }

    /* Clamped: Moodle permits grades above the maximum through overrides, and a
       107% would be a surprising thing to hand a caller. */
    return Math.min(100, Math.max(0, percent));
  }

  courseUrl(lmsCourseId: LmsCourseId): string {
    /* Pure URL construction against the configured base. Carries no token: this
       value is handed to a browser, where it would land in history and referrer
       headers. Seamless sign-in is a separate mechanism. */
    return `${this.baseUrl.replace(/\/+$/, '')}/course/view.php?id=${lmsCourseId}`;
  }

  /**
   * Mints the signed handoff and points it at the plugin (D-044).
   *
   * Called per click rather than per render, so the token's short life begins
   * when the learner actually goes to the course.
   */
  courseLaunchUrl(lmsUserId: LmsUserId, lmsCourseId: LmsCourseId): string {
    const token = mintHandoffToken(
      { moodleUserId: lmsUserId, moodleCourseId: lmsCourseId },
      this.ssoSecret,
      this.ssoTtlSeconds,
    );

    return `${this.baseUrl.replace(/\/+$/, '')}/local/tamkeensso/login.php?token=${encodeURIComponent(token)}`;
  }

  private notYet(method: string): never {
    throw new NotImplementedException(
      `MOODLE_REAL_NOT_IMPLEMENTED: ${method} lands in a later Phase 2 checkpoint.`,
    );
  }
}

// ── translation: Moodle's course payload → our vocabulary ───────────────────

/** Course custom fields a Moodle instance might use to express nominal effort. */
const DURATION_FIELD_NAMES = new Set(['duration', 'durationminutes', 'duration_minutes']);

/**
 * Moodle's front page is a row in the courses table (id 1, `format: "site"`).
 * It is not a course and must never reach our catalogue.
 */
function isSiteCourse(course: MoodleCourse): boolean {
  return course.format === 'site';
}

function toLmsCourse(course: MoodleCourse): LmsCourse {
  return {
    lmsCourseId: course.id,
    title: course.fullname ?? course.displayname ?? '',
    summary: course.summary ?? '',
    durationMinutes: readDurationMinutes(course),
    visible: readVisible(course),
  };
}

/**
 * Fails **closed**: an absent `visible` means the course does not enter the
 * catalogue as available.
 *
 * The field's absence would signal a capability regression on the integration
 * token. Defaulting to visible would then publish courses Moodle is deliberately
 * hiding — a content-governance failure that is silent. Defaulting to hidden
 * takes the catalogue out of *new* selections while leaving enrolled learners
 * untouched (D-015), which is loud, recoverable and leaks nothing.
 */
function readVisible(course: MoodleCourse): boolean {
  if (course.visible === undefined) {
    return false;
  }

  return Boolean(course.visible);
}

/**
 * Duration is **our** product metadata (D-039) — Moodle models no such field, and
 * the spike confirmed `customfields` empty with only calendar `startdate`/
 * `enddate` available. This reads a custom field when an instance happens to
 * define one, so the port stays honest without our catalogue depending on it;
 * the sync prefers our own authored value regardless.
 */
function readDurationMinutes(course: MoodleCourse): number | null {
  for (const field of course.customfields ?? []) {
    if (!DURATION_FIELD_NAMES.has((field.shortname ?? '').toLowerCase())) {
      continue;
    }

    const parsed = Number.parseInt(String(field.value ?? ''), 10);

    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

/**
 * When the course was completed.
 *
 * There is **no `completionstatus.timecompleted`** — the obvious-looking field
 * does not exist. The timestamps live on the individual criteria, so the course
 * completion time is the latest satisfied one. Reading the obvious path returns
 * `null` on a course that is demonstrably complete, which would have written a
 * null timestamp for every learner (D-038).
 */
function readCompletedAt(status: MoodleCompletionStatus | null): Date | null {
  if (!status?.completed) {
    return null;
  }

  const stamps = (status.completions ?? [])
    .filter((criterion) => criterion.complete && criterion.timecompleted)
    .map((criterion) => Number(criterion.timecompleted));

  if (stamps.length === 0) {
    return null;
  }

  /* Seconds in Moodle, milliseconds in JavaScript. */
  return new Date(Math.max(...stamps) * 1000);
}
