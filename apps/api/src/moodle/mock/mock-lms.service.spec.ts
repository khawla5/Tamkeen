import { describeLmsContract } from '../lms.contract';
import { MockLmsService } from './mock-lms.service';

/**
 * The mock is held to the shared contract — the same suite Phase 2 will run
 * against the real Moodle adapter. That is what makes "the mock implements the
 * same contract" a checked fact rather than a claim.
 */
describeLmsContract('MockLmsService', () => new MockLmsService());

/**
 * Mock-specific behaviour: the simulation helpers, which exist so Phase 1 can
 * drive completion states without an LMS. Deliberately absent from LmsPort,
 * because a real Moodle adapter could not implement them.
 */
describe('MockLmsService simulation helpers', () => {
  let lms: MockLmsService;
  let userId: number;
  const courseId = 101;

  beforeEach(async () => {
    lms = new MockLmsService();
    const user = await lms.provisionUser({
      email: 'sim@ministry.gov.example',
      fullName: 'محاكاة',
      externalUserId: 'ext-sim',
    });
    userId = user.lmsUserId;
    await lms.enrol({ lmsUserId: userId, lmsCourseId: courseId });
  });

  it('records a completion with its grade', async () => {
    lms.simulateCompletion(userId, courseId, 85);

    expect(await lms.getCourseProgress(userId, courseId)).toMatchObject({
      completed: true,
      gradePercent: 85,
    });
  });

  it('does not judge the grade — a failing score is still stored verbatim', async () => {
    /* Whether 45 is a pass is the product threshold's business (D-007), so the
       LMS layer must not filter or reinterpret it. */
    lms.simulateCompletion(userId, courseId, 45);

    expect(await lms.getCourseProgress(userId, courseId)).toMatchObject({
      completed: true,
      gradePercent: 45,
    });
  });

  it('can record an attempt that produced a grade without completing', async () => {
    lms.simulateAttempt(userId, courseId, 30);

    expect(await lms.getCourseProgress(userId, courseId)).toMatchObject({
      completed: false,
      completedAt: null,
      gradePercent: 30,
    });
  });

  it('preserves the completion timestamp it was given', async () => {
    const when = new Date('2026-03-01T09:30:00.000Z');
    lms.simulateCompletion(userId, courseId, 90, when);

    expect((await lms.getCourseProgress(userId, courseId))?.completedAt).toEqual(when);
  });

  it('surfaces simulated completions through listProgressForUser', async () => {
    await lms.enrol({ lmsUserId: userId, lmsCourseId: 102 });
    lms.simulateCompletion(userId, courseId, 78);

    const progress = await lms.listProgressForUser(userId);

    expect(progress).toHaveLength(2);
    expect(progress.find((entry) => entry.lmsCourseId === courseId)).toMatchObject({
      completed: true,
      gradePercent: 78,
    });
    expect(progress.find((entry) => entry.lmsCourseId === 102)).toMatchObject({
      completed: false,
      gradePercent: null,
    });
  });

  it('repeated polling returns the same result — the sync job is idempotent', async () => {
    lms.simulateCompletion(userId, courseId, 88);

    const first = await lms.getCourseProgress(userId, courseId);
    const second = await lms.getCourseProgress(userId, courseId);

    expect(second).toEqual(first);
  });

  it('reset clears users, enrolments and progress', async () => {
    lms.simulateCompletion(userId, courseId, 85);
    lms.reset();

    expect(await lms.findUserByEmail('sim@ministry.gov.example')).toBeNull();
    expect(await lms.isEnrolled(userId, courseId)).toBe(false);
    expect(await lms.getCourseProgress(userId, courseId)).toBeNull();
  });
});
