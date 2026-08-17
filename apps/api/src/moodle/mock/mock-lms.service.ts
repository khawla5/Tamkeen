import { Injectable, Logger } from '@nestjs/common';

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
import { MOCK_COURSES, MOCK_LMS_BASE_URL } from './mock-lms.data';

/**
 * In-memory LMS, used until Phase 2 connects a real Moodle.
 *
 * It exists so Phase 1 can build the entire assessment → path → course flow
 * without an LMS, and so Phase 2 is a swap of *implementation only*. It is held
 * to the same contract test suite the real adapter will run
 * (`lms.contract.spec-helper.ts`), which is what makes that claim checkable
 * rather than aspirational.
 *
 * The simulation helpers at the bottom (`simulateCompletion`, `reset`, …) are
 * deliberately **not on `LmsPort`**: a real Moodle adapter could not implement
 * them, so putting them on the port would break the swap. They are for tests and
 * local development only.
 */
@Injectable()
export class MockLmsService implements LmsPort {
  private readonly logger = new Logger(MockLmsService.name);

  private readonly users = new Map<LmsUserId, LmsUserRef>();
  private readonly enrolments = new Set<string>();
  private readonly progress = new Map<string, LmsCourseProgress>();

  private key(lmsUserId: LmsUserId, lmsCourseId: LmsCourseId): string {
    return `${lmsUserId}:${lmsCourseId}`;
  }

  /**
   * A stable LMS id for an email address.
   *
   * This replaced an incrementing counter, and the reason is a defect the
   * end-to-end run surfaced. The counter restarted at 5001 with every API
   * process, but `users.moodle_user_id` in our database does not — so after a
   * restart the mock handed a *different* user the id an existing row already
   * held, and enrolment died on the unique constraint that exists precisely to
   * stop two users sharing one LMS account.
   *
   * A real Moodle gives an account the same id forever. Deriving the id from the
   * email reproduces that invariant, so the mock now fails in the same places
   * the real adapter would rather than in one of its own. FNV-1a: not a security
   * hash, just a well-spread deterministic one.
   */
  private idFor(email: string): LmsUserId {
    let hash = 0x811c9dc5;

    for (let index = 0; index < email.length; index += 1) {
      hash ^= email.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }

    /* Offset so ids never collide with the small numbers used in fixtures. */
    return 5001 + (hash % 1_000_000);
  }

  checkHealth(): Promise<LmsHealth> {
    return Promise.resolve({
      reachable: true,
      siteName: 'Tamkeen Mock LMS',
      lmsVersion: 'mock-0.0.0',
    });
  }

  provisionUser(input: ProvisionUserInput): Promise<LmsUserRef> {
    const email = input.email.trim().toLowerCase();

    /* Idempotent by email, exactly as the port requires: a retried
       registration must not create a second LMS account. */
    for (const existing of this.users.values()) {
      if (existing.email === email) {
        return Promise.resolve(existing);
      }
    }

    const reference: LmsUserRef = { lmsUserId: this.idFor(email), email };
    this.users.set(reference.lmsUserId, reference);

    return Promise.resolve(reference);
  }

  findUserByEmail(email: string): Promise<LmsUserRef | null> {
    const needle = email.trim().toLowerCase();

    for (const existing of this.users.values()) {
      if (existing.email === needle) {
        return Promise.resolve(existing);
      }
    }

    return Promise.resolve(null);
  }

  listCourses(): Promise<LmsCourse[]> {
    /* Copies, not references: a caller mutating a returned course must not
       corrupt the mock's state. A real adapter returns fresh objects anyway, so
       handing out shared references here would let a bug pass the mock and fail
       against Moodle. */
    return Promise.resolve(MOCK_COURSES.map((course) => ({ ...course })));
  }

  getCourse(lmsCourseId: LmsCourseId): Promise<LmsCourse | null> {
    const found = MOCK_COURSES.find((course) => course.lmsCourseId === lmsCourseId);

    return Promise.resolve(found ? { ...found } : null);
  }

  enrol(input: EnrolInput): Promise<void> {
    /* A Set makes this idempotent for free — re-enrolling is a no-op. */
    this.enrolments.add(this.key(input.lmsUserId, input.lmsCourseId));

    return Promise.resolve();
  }

  isEnrolled(lmsUserId: LmsUserId, lmsCourseId: LmsCourseId): Promise<boolean> {
    return Promise.resolve(this.enrolments.has(this.key(lmsUserId, lmsCourseId)));
  }

  getCourseProgress(
    lmsUserId: LmsUserId,
    lmsCourseId: LmsCourseId,
  ): Promise<LmsCourseProgress | null> {
    const key = this.key(lmsUserId, lmsCourseId);

    if (!this.enrolments.has(key)) {
      return Promise.resolve(null);
    }

    const recorded = this.progress.get(key);

    /* Enrolled but nothing attempted yet: not completed, no grade. `null` grade
       rather than 0 matters — 0 would look like a failed attempt to the
       threshold check, and would issue nothing while implying the quiz was
       taken. */
    return Promise.resolve(
      recorded ?? {
        lmsUserId,
        lmsCourseId,
        completed: false,
        completedAt: null,
        gradePercent: null,
      },
    );
  }

  async listProgressForUser(lmsUserId: LmsUserId): Promise<LmsCourseProgress[]> {
    const results: LmsCourseProgress[] = [];

    for (const key of this.enrolments) {
      const [userPart, coursePart] = key.split(':');
      if (Number(userPart) !== lmsUserId) {
        continue;
      }

      const progress = await this.getCourseProgress(lmsUserId, Number(coursePart));
      if (progress) {
        results.push(progress);
      }
    }

    return results;
  }

  courseUrl(lmsCourseId: LmsCourseId): string {
    return `${MOCK_LMS_BASE_URL}/course/view.php?id=${lmsCourseId}`;
  }

  // ── Simulation helpers — NOT part of LmsPort ────────────────────────────────
  // A real Moodle adapter cannot implement these, which is precisely why they
  // are not on the port. Tests and local development only.

  /**
   * Records a completion with a grade, as though the learner had finished the
   * course and its quiz in Moodle.
   *
   * Note it does not judge the grade: 45 is stored as 45, and whether that is a
   * pass is our threshold's business (D-007).
   */
  simulateCompletion(
    lmsUserId: LmsUserId,
    lmsCourseId: LmsCourseId,
    gradePercent: number,
    completedAt: Date = new Date(),
  ): void {
    this.progress.set(this.key(lmsUserId, lmsCourseId), {
      lmsUserId,
      lmsCourseId,
      completed: true,
      completedAt,
      gradePercent,
    });
  }

  /** Records an attempt that produced a grade without completing the course. */
  simulateAttempt(lmsUserId: LmsUserId, lmsCourseId: LmsCourseId, gradePercent: number): void {
    this.progress.set(this.key(lmsUserId, lmsCourseId), {
      lmsUserId,
      lmsCourseId,
      completed: false,
      completedAt: null,
      gradePercent,
    });
  }

  reset(): void {
    this.users.clear();
    this.enrolments.clear();
    this.progress.clear();
    this.logger.debug('Mock LMS state reset');
  }
}
