import { Injectable, Logger, NotImplementedException } from '@nestjs/common';

import type { LmsPort } from '../lms.port';
import type {
  EnrolInput,
  LmsCourse,
  LmsCourseId,
  LmsCourseProgress,
  LmsHealth,
  LmsUserId,
  LmsUserRef,
  ProvisionUserInput,
} from '../lms.types';

/**
 * The real Moodle adapter — **Phase 2**. Not implemented yet.
 *
 * It exists now, declared `implements LmsPort`, for two reasons:
 *
 *  1. **The compiler enforces the contract.** Adding a method to `LmsPort` breaks
 *     this file immediately, so the interface cannot drift ahead of the real
 *     adapter unnoticed.
 *  2. **`MOODLE_MODE=real` fails loudly.** Every method throws with a clear
 *     message. Wiring a real LMS by flipping config alone would otherwise appear
 *     to work and then behave as though every course were empty — silently wrong
 *     is far worse than an explicit refusal.
 *
 * Phase 2 replaces these bodies with Moodle Web Services (REST) calls, translating
 * Moodle's payloads into `lms.types`. Every Moodle function name and JSON shape
 * belongs inside this file; none of it may reach a caller.
 *
 * Phase 2 checklist for this class:
 *   - `core_webservice_get_site_info`                → checkHealth
 *   - `core_user_create_users` / `core_user_get_users_by_field` → provisionUser
 *   - `core_course_get_courses`                      → listCourses / getCourse
 *   - `enrol_manual_enrol_users`                     → enrol
 *   - `core_enrol_get_users_courses`                  → isEnrolled
 *   - `core_completion_get_course_completion_status`
 *     + `gradereport_user_get_grade_items`           → getCourseProgress
 *   - The WS token is read server-side only and must never appear in a response,
 *     a log line, or a thrown error.
 *   - Run the shared contract suite in `lms.contract.spec-helper.ts` against this
 *     class; if it passes, no caller needs to change.
 */
@Injectable()
export class MoodleHttpService implements LmsPort {
  private readonly logger = new Logger(MoodleHttpService.name);

  constructor(
    private readonly baseUrl: string,
    private readonly wsToken: string,
  ) {
    /* Never log the token or interpolate it into a message. */
    this.logger.warn(
      `Real Moodle adapter selected for ${this.baseUrl} but it is not implemented until Phase 2.`,
    );
  }

  private notYet(method: string): never {
    throw new NotImplementedException(
      `MOODLE_REAL_NOT_IMPLEMENTED: ${method} arrives in Phase 2. ` +
        'Set MOODLE_MODE=mock until then.',
    );
  }

  checkHealth(): Promise<LmsHealth> {
    /* The one method that does not throw: health is meant to report a bad state,
       so it reports this one honestly instead of crashing a dashboard. */
    return Promise.resolve({ reachable: false, failureCode: 'UNEXPECTED_RESPONSE' });
  }

  provisionUser(_input: ProvisionUserInput): Promise<LmsUserRef> {
    this.notYet('provisionUser');
  }

  findUserByEmail(_email: string): Promise<LmsUserRef | null> {
    this.notYet('findUserByEmail');
  }

  listCourses(): Promise<LmsCourse[]> {
    this.notYet('listCourses');
  }

  getCourse(_lmsCourseId: LmsCourseId): Promise<LmsCourse | null> {
    this.notYet('getCourse');
  }

  enrol(_input: EnrolInput): Promise<void> {
    this.notYet('enrol');
  }

  isEnrolled(_lmsUserId: LmsUserId, _lmsCourseId: LmsCourseId): Promise<boolean> {
    this.notYet('isEnrolled');
  }

  getCourseProgress(
    _lmsUserId: LmsUserId,
    _lmsCourseId: LmsCourseId,
  ): Promise<LmsCourseProgress | null> {
    this.notYet('getCourseProgress');
  }

  listProgressForUser(_lmsUserId: LmsUserId): Promise<LmsCourseProgress[]> {
    this.notYet('listProgressForUser');
  }

  courseUrl(lmsCourseId: LmsCourseId): string {
    /* Safe to implement now: it is pure URL construction against the configured
       base, carries no secret, and Phase 2's handoff will use exactly this. */
    return `${this.baseUrl.replace(/\/+$/, '')}/course/view.php?id=${lmsCourseId}`;
  }
}
