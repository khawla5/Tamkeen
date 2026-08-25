import { Injectable, Logger } from '@nestjs/common';

import type { LmsPort } from '../lms.port';
import {
  LmsOperationError,
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
import { deriveMoodleUsername } from '../real/moodle-identity';
import { MOCK_COURSES, MOCK_LMS_BASE_URL } from './mock-lms.data';

/**
 * FNV-1a, used to derive a stable id from a natural key.
 *
 * Not a security hash — just a well-spread deterministic one. It exists so that
 * both of the mock's ids survive a process restart, which is the invariant a
 * real Moodle has for free and which this mock has now had to learn twice.
 */
function fnv1a(value: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash;
}

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

  /**
   * Keyed by `lmsUserId`, holding `derivedUsername` alongside the port's
   * `LmsUserRef` fields — the mock's mirror of D-038: a real Moodle account
   * is found by a username derived once, at provisioning, never by an email
   * lookup. Storing it lets `findUserByEmail` and `provisionUser` resolve the
   * same way the real adapter does, so an email change that must **not**
   * relocate the account under a new lookup key fails the same way in tests
   * as it would against a real Moodle.
   */
  private readonly users = new Map<LmsUserId, LmsUserRef & { derivedUsername: string }>();
  private readonly enrolments = new Set<string>();
  /** Which of those enrolments carry editing capabilities (D-060). */
  private readonly authorEnrolments = new Set<string>();
  private readonly progress = new Map<string, LmsCourseProgress>();
  /** Courses an entity created this process, on top of the seeded catalogue. */
  private readonly created: LmsCourse[] = [];
  /** Moodle rejects a duplicate shortname; so does this. */
  private readonly shortNames = new Set<string>();
  /** What `simulateAuthoring` has been told about a course's contents. */
  private readonly authoring = new Map<LmsCourseId, Omit<LmsCourseContentSummary, 'lmsCourseId'>>();
  /** Makes each stand-in handoff URL distinct; see `courseLaunchUrl`. */
  private launchCounter = 0;

  /**
   * Ids for created courses, from a range the seeded catalogue never uses.
   *
   * **Derived from the shortname, not counted** — and the reason is the same
   * defect `idFor` below already records, found a second time in the same class.
   * The counter restarted at 900_001 with every API process, but
   * `courses.moodle_course_id` in our database does not and is UNIQUE. So any
   * course row outliving the process that made it — an interrupted test run, a
   * course created while developing — made the next `createCourse` hand out an
   * id already taken, and creation died on the constraint with a 500.
   *
   * A real Moodle never reissues a course id. The shortname is the natural key
   * it enforces uniqueness on, and the caller already generates a fresh random
   * one per course (see `EntityCourseManagementService.create`), so deriving
   * from it reproduces that invariant across restarts.
   */
  private nextCourseId(shortName: string): LmsCourseId {
    return 900_001 + (fnv1a(shortName) % 1_000_000);
  }

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
    /* Offset so ids never collide with the small numbers used in fixtures. */
    return 5001 + (fnv1a(email) % 1_000_000);
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
    const derivedUsername = deriveMoodleUsername(email);

    /* Idempotent by the derived username, exactly as the real adapter is
       (D-038): a retried registration must not create a second LMS account. */
    for (const existing of this.users.values()) {
      if (existing.derivedUsername === derivedUsername) {
        return Promise.resolve({
          lmsUserId: existing.lmsUserId,
          email,
          fullName: existing.fullName,
        });
      }
    }

    const reference = {
      lmsUserId: this.idFor(email),
      email,
      fullName: input.fullName,
      derivedUsername,
    };
    this.users.set(reference.lmsUserId, reference);

    return Promise.resolve({ lmsUserId: reference.lmsUserId, email, fullName: reference.fullName });
  }

  /**
   * Overwrites the stored name and/or email, the same effect
   * `core_user_update_users` has on a real Moodle account. Unknown ids are
   * refused rather than silently accepted, so a caller that raced a real
   * outage sees the same shape of failure here as it would there.
   *
   * **`derivedUsername` is never touched here (D-038 addendum).** A real
   * Moodle account is found by the username `provisionUser` derived once;
   * writing a new `email` changes what the account displays, not the key it
   * is found by. This is what makes a stale lookup by the *old* address
   * still resolve after an email change, and a lookup by the *new* address
   * resolve to nothing — the same shape of "invisible" the real adapter has
   * under a least-privilege token that cannot read Moodle's email index.
   *
   * `async`, like `createCourse` and for the same reason: a synchronous throw
   * from a method typed to return a `Promise` never reaches a caller's
   * `.catch()`, so the mock would be easier to satisfy than reality.
   */
  async updateUser(input: UpdateUserInput): Promise<void> {
    const existing = this.users.get(input.lmsUserId);

    if (!existing) {
      throw new LmsOperationError('UPDATE_USER');
    }

    this.users.set(input.lmsUserId, {
      ...existing,
      ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
      ...(input.email !== undefined ? { email: input.email.trim().toLowerCase() } : {}),
    });
  }

  /**
   * Resolves by the username `email` derives to, not by a stored email field
   * (D-038): the real adapter has no email index to search, only the
   * username it computes from whatever address it is asked to find. Returns
   * the *queried* address on a match, exactly as the real adapter echoes its
   * input rather than reading anything back — which is also why an address
   * `updateUser` wrote is never what this returns.
   */
  findUserByEmail(email: string): Promise<LmsUserRef | null> {
    const needle = email.trim().toLowerCase();
    const derivedUsername = deriveMoodleUsername(needle);

    for (const existing of this.users.values()) {
      if (existing.derivedUsername === derivedUsername) {
        return Promise.resolve({
          lmsUserId: existing.lmsUserId,
          email: needle,
          fullName: existing.fullName,
        });
      }
    }

    return Promise.resolve(null);
  }

  /** The seeded catalogue plus anything an entity created this process. */
  private get catalogue(): readonly LmsCourse[] {
    return [...MOCK_COURSES, ...this.created];
  }

  listCourses(): Promise<LmsCourse[]> {
    /* Copies, not references: a caller mutating a returned course must not
       corrupt the mock's state. A real adapter returns fresh objects anyway, so
       handing out shared references here would let a bug pass the mock and fail
       against Moodle. */
    return Promise.resolve(this.catalogue.map((course) => ({ ...course })));
  }

  getCourse(lmsCourseId: LmsCourseId): Promise<LmsCourse | null> {
    const found = this.catalogue.find((course) => course.lmsCourseId === lmsCourseId);

    return Promise.resolve(found ? { ...found } : null);
  }

  /**
   * Creates an empty course (§4B.3, D-060).
   *
   * **It arrives with nothing in it, and that is the honest simulation.** A real
   * Moodle course created through `core_course_create_courses` has no activities
   * and no completion criteria until somebody authors them, so
   * `getCourseContentSummary` reports it as not completable — which is precisely
   * the state the publish gate (D-061) has to refuse. A mock that handed back a
   * ready-to-publish course would make that gate untestable and would be easier
   * to satisfy than reality, which is the failure D-036 and D-045 each recorded
   * once already.
   *
   * **Created visible.** Moodle's default is a visible course, and our own
   * `publication` (D-059) is what keeps it out of the learner catalogue — so
   * making the mock hide it would put the product rule in the wrong layer.
   *
   * **`async`, unlike its neighbours here, and the contract suite is what forced
   * it.** A synchronous `throw` from a promise-returning method escapes a
   * caller's `.catch()` entirely; the real adapter rejects, so a mock that threw
   * would once again have been easier to satisfy than reality.
   */
  async createCourse(input: CreateCourseInput): Promise<LmsCourse> {
    if (this.shortNames.has(input.shortName)) {
      /* Moodle rejects a duplicate shortname, so the mock must too — otherwise
         the collision is discovered for the first time in production. */
      throw new LmsOperationError('CREATE_COURSE');
    }

    this.shortNames.add(input.shortName);

    const course: LmsCourse = {
      lmsCourseId: this.nextCourseId(input.shortName),
      title: input.title,
      summary: input.summary,
      durationMinutes: null,
      visible: true,
    };

    this.created.push(course);

    return { ...course };
  }

  getCourseContentSummary(lmsCourseId: LmsCourseId): Promise<LmsCourseContentSummary | null> {
    if (!this.catalogue.some((course) => course.lmsCourseId === lmsCourseId)) {
      return Promise.resolve(null);
    }

    const authored = this.authoring.get(lmsCourseId);

    if (authored) {
      return Promise.resolve({ lmsCourseId, ...authored });
    }

    /*
     * A course the mock seeded is fully configured; one an entity just created
     * is empty. The seeded catalogue has to report as completable because the
     * Phase 1-3 journey tests take those courses through to a pass, and a course
     * nobody can complete would make that impossible.
     */
    const isSeeded = MOCK_COURSES.some((course) => course.lmsCourseId === lmsCourseId);

    return Promise.resolve({
      lmsCourseId,
      activityCount: isSeeded ? 3 : 0,
      hasQuiz: isSeeded,
      completionConfigured: isSeeded,
    });
  }

  enrol(input: EnrolInput): Promise<void> {
    const key = this.key(input.lmsUserId, input.lmsCourseId);

    /* A Set makes this idempotent for free — re-enrolling is a no-op. */
    this.enrolments.add(key);

    /* Recorded so a test can assert an author was enrolled *as an author*.
       Re-enrolling with a wider role upgrades rather than being ignored, which
       is what Moodle's manual enrolment does when a second role is assigned. */
    if (input.role === 'AUTHOR') {
      this.authorEnrolments.add(key);
    }

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

  /**
   * A stand-in handoff URL, deliberately **not** signed — the mock has no shared
   * secret, and inventing one would suggest this value is safe to trust.
   *
   * It does reproduce the properties callers depend on: absolute, distinct per
   * learner and per course, no web-services token, and **fresh on every call**.
   * That last one costs a counter and is worth it for the same reason the mock's
   * user ids stopped coming from a process counter (D-036): a mock that is
   * easier to satisfy than reality lets a bug pass here and fail in production.
   * A handoff is single-use, so handing out the same URL twice would be handing
   * out an already-spent token.
   */
  courseLaunchUrl(lmsUserId: LmsUserId, lmsCourseId: LmsCourseId): string {
    this.launchCounter += 1;

    return (
      `${MOCK_LMS_BASE_URL}/local/tamkeensso/login.php` +
      `?mockuser=${lmsUserId}&mockcourse=${lmsCourseId}&mocknonce=${this.launchCounter}`
    );
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

  /**
   * Stands in for an entity authoring content inside Moodle (D-046).
   *
   * Mock-only, like `simulateCompletion`: the real adapter cannot make an entity
   * write a quiz, so this must never reach `LmsPort`. It exists because the
   * publish gate (D-061) refuses a course with no completion criteria, and a
   * test of the *successful* publish needs some way to say "the entity has now
   * configured it" without a browser and a real Moodle.
   */
  simulateAuthoring(
    lmsCourseId: LmsCourseId,
    summary: Partial<Omit<LmsCourseContentSummary, 'lmsCourseId'>> = {},
  ): void {
    this.authoring.set(lmsCourseId, {
      activityCount: summary.activityCount ?? 4,
      hasQuiz: summary.hasQuiz ?? true,
      completionConfigured: summary.completionConfigured ?? true,
    });
  }

  /** Whether an enrolment carries editing capabilities. Mock-only. */
  isAuthorEnrolment(lmsUserId: LmsUserId, lmsCourseId: LmsCourseId): boolean {
    return this.authorEnrolments.has(this.key(lmsUserId, lmsCourseId));
  }

  reset(): void {
    this.users.clear();
    this.enrolments.clear();
    this.authorEnrolments.clear();
    this.progress.clear();
    this.created.length = 0;
    this.shortNames.clear();
    this.authoring.clear();
    this.logger.debug('Mock LMS state reset');
  }
}
