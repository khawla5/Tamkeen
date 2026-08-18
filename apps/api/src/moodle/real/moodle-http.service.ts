import { Injectable, Logger, NotImplementedException } from '@nestjs/common';

import type { LmsPort } from '../lms.port';
import {
  LmsOperationError,
  LmsUnavailableError,
  type EnrolInput,
  type LmsCourse,
  type LmsCourseId,
  type LmsCourseProgress,
  type LmsHealth,
  type LmsUserId,
  type LmsUserRef,
  type ProvisionUserInput,
} from '../lms.types';
import {
  deriveMoodleUsername,
  generateUnusedPassword,
  normaliseEmail,
  splitFullName,
} from './moodle-identity';
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
  customfields?: Array<{ shortname?: string; value?: unknown }>;
}

interface MoodleCoursesByField {
  courses?: MoodleCourse[];
}

interface MoodleEnrolledCourse {
  id: number;
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
      return { lmsUserId: existing.id, email };
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

      return { lmsUserId: first.id, email };
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
        return { lmsUserId: raced.id, email };
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

    return found ? { lmsUserId: found.id, email: normalised } : null;
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
            roleid: this.studentRoleId,
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

  getCourseProgress(
    _lmsUserId: LmsUserId,
    _lmsCourseId: LmsCourseId,
  ): Promise<LmsCourseProgress | null> {
    return this.notYet('getCourseProgress');
  }

  listProgressForUser(_lmsUserId: LmsUserId): Promise<LmsCourseProgress[]> {
    return this.notYet('listProgressForUser');
  }

  courseUrl(lmsCourseId: LmsCourseId): string {
    /* Pure URL construction against the configured base. Carries no token: this
       value is handed to a browser, where it would land in history and referrer
       headers. Seamless sign-in is a separate mechanism. */
    return `${this.baseUrl.replace(/\/+$/, '')}/course/view.php?id=${lmsCourseId}`;
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
