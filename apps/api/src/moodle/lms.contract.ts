import type { LmsPort } from './lms.port';

/**
 * The LMS contract, as an executable test suite.
 *
 * This is the mechanism behind the Phase 0 requirement that "the mock must
 * implement the exact same interface/contract as the real `moodle` module".
 * A shared *interface* only proves the method names line up; it says nothing
 * about whether `enrol` is idempotent, whether an unenrolled user yields `null`,
 * or whether the port returns a raw grade instead of a pass/fail verdict. Those
 * are the behaviours callers actually rely on, and they are what this asserts.
 *
 * **Phase 2 usage:** create `real/moodle-http.contract.spec.ts` containing
 *
 *     describeLmsContract('MoodleHttpService', () => new MoodleHttpService(url, token));
 *
 * against a real Moodle instance. If it passes, the swap needs no caller change.
 * If it fails, either the adapter is wrong or the contract needs revising —
 * deliberately, in one place, rather than discovered as a production bug.
 *
 * Only port methods are used here. Nothing reaches for a mock-only helper, since
 * the real adapter could not provide one.
 */
export function describeLmsContract(name: string, createPort: () => LmsPort): void {
  describe(`${name} — LmsPort contract`, () => {
    let lms: LmsPort;

    beforeEach(() => {
      lms = createPort();
    });

    describe('checkHealth', () => {
      it('reports a health state instead of throwing', async () => {
        /* An unreachable LMS is an operational condition the Phase 5 dashboard
           displays, not an exception every call site must catch. */
        const health = await lms.checkHealth();

        expect(typeof health.reachable).toBe('boolean');
      });

      it('names the site when reachable', async () => {
        const health = await lms.checkHealth();

        if (health.reachable) {
          expect(health.siteName).toBeTruthy();
        } else {
          expect(health.failureCode).toBeTruthy();
        }
      });
    });

    describe('provisionUser', () => {
      const input = {
        email: 'contract-user@ministry.gov.example',
        fullName: 'مستخدم العقد',
        externalUserId: 'ext-contract-1',
      };

      it('returns an LMS user id', async () => {
        const reference = await lms.provisionUser(input);

        expect(typeof reference.lmsUserId).toBe('number');
        expect(reference.lmsUserId).toBeGreaterThan(0);
      });

      it('is idempotent — a retry returns the same user, not a duplicate', async () => {
        /* A registration that half-failed must be safely retryable. */
        const first = await lms.provisionUser(input);
        const second = await lms.provisionUser(input);

        expect(second.lmsUserId).toBe(first.lmsUserId);
      });

      it('treats the email case-insensitively', async () => {
        const lower = await lms.provisionUser(input);
        const upper = await lms.provisionUser({
          ...input,
          email: input.email.toUpperCase(),
        });

        expect(upper.lmsUserId).toBe(lower.lmsUserId);
      });

      it('gives the same account the same id across restarts', async () => {
        /*
         * A real LMS account keeps its id forever, and our `moodle_user_id`
         * column is unique — so an adapter whose ids depend on process state
         * hands a later user an id an existing row already holds. That is not
         * hypothetical: the mock's incrementing counter did exactly this, and
         * enrolment died on the constraint.
         */
        const first = await lms.provisionUser(input);
        const fresh = createPort();
        const second = await fresh.provisionUser(input);

        expect(second.lmsUserId).toBe(first.lmsUserId);
      });

      it('gives distinct users distinct ids', async () => {
        const first = await lms.provisionUser(input);
        const second = await lms.provisionUser({
          email: 'contract-other@ministry.gov.example',
          fullName: 'مستخدم آخر',
          externalUserId: 'ext-contract-2',
        });

        expect(second.lmsUserId).not.toBe(first.lmsUserId);
      });
    });

    describe('findUserByEmail', () => {
      it('returns null for an unknown address', async () => {
        expect(await lms.findUserByEmail('nobody@ministry.gov.example')).toBeNull();
      });

      it('finds a provisioned user', async () => {
        const created = await lms.provisionUser({
          email: 'findable@ministry.gov.example',
          fullName: 'قابل للبحث',
          externalUserId: 'ext-find',
        });

        expect(await lms.findUserByEmail('findable@ministry.gov.example')).toMatchObject({
          lmsUserId: created.lmsUserId,
        });
      });
    });

    describe('listCourses', () => {
      it('returns courses in our vocabulary, not the LMS payload shape', async () => {
        const courses = await lms.listCourses();

        expect(courses.length).toBeGreaterThan(0);

        for (const course of courses) {
          expect(typeof course.lmsCourseId).toBe('number');
          expect(typeof course.title).toBe('string');
          expect(typeof course.visible).toBe('boolean');
          /* Duration is nullable, never undefined: a missing value must be
             explicit so callers cannot mistake absence for zero. */
          expect(
            course.durationMinutes === null || typeof course.durationMinutes === 'number',
          ).toBe(true);
        }
      });

      it('leaks no LMS-native field names to callers', async () => {
        const [course] = await lms.listCourses();

        /* If Moodle's own keys appear here, the anti-corruption layer has
           leaked and every caller is coupled to Moodle's schema. */
        for (const moodleField of [
          'fullname',
          'shortname',
          'summaryformat',
          'enrolledusercount',
          'categoryid',
        ]) {
          expect(course).not.toHaveProperty(moodleField);
        }
      });

      it('includes courses the LMS is not currently showing', async () => {
        /* Catalogue sync needs to see them: our own status field decides what is
           offered, and a course hidden in the LMS may still be completable by an
           enrolled learner (§2 course-edit protection). */
        const courses = await lms.listCourses();

        expect(courses.some((course) => !course.visible)).toBe(true);
      });

      it('does not hand out shared mutable state', async () => {
        const first = await lms.listCourses();
        first[0]!.title = 'MUTATED';

        const second = await lms.listCourses();
        expect(second[0]!.title).not.toBe('MUTATED');
      });
    });

    describe('getCourse', () => {
      it('returns null for an unknown course rather than throwing', async () => {
        expect(await lms.getCourse(99_999_999)).toBeNull();
      });

      it('returns the same shape as listCourses', async () => {
        const [listed] = await lms.listCourses();
        const fetched = await lms.getCourse(listed!.lmsCourseId);

        expect(fetched).toMatchObject({ lmsCourseId: listed!.lmsCourseId, title: listed!.title });
      });
    });

    describe('enrol', () => {
      it('enrols a user in a course', async () => {
        const user = await lms.provisionUser({
          email: 'enrol@ministry.gov.example',
          fullName: 'متعلم',
          externalUserId: 'ext-enrol',
        });
        const [course] = await lms.listCourses();

        expect(await lms.isEnrolled(user.lmsUserId, course!.lmsCourseId)).toBe(false);

        await lms.enrol({ lmsUserId: user.lmsUserId, lmsCourseId: course!.lmsCourseId });

        expect(await lms.isEnrolled(user.lmsUserId, course!.lmsCourseId)).toBe(true);
      });

      it('is idempotent — enrolling twice succeeds and changes nothing', async () => {
        /* Confirming a path enrols 5–10 courses; a partial failure must be
           safely retryable without the second attempt erroring. */
        const user = await lms.provisionUser({
          email: 'enrol-twice@ministry.gov.example',
          fullName: 'متعلم',
          externalUserId: 'ext-enrol-2',
        });
        const [course] = await lms.listCourses();
        const input = { lmsUserId: user.lmsUserId, lmsCourseId: course!.lmsCourseId };

        await lms.enrol(input);
        await expect(lms.enrol(input)).resolves.not.toThrow();

        expect(await lms.isEnrolled(user.lmsUserId, course!.lmsCourseId)).toBe(true);
      });
    });

    describe('getCourseProgress', () => {
      it('returns null when the user is not enrolled', async () => {
        const user = await lms.provisionUser({
          email: 'not-enrolled@ministry.gov.example',
          fullName: 'غير مسجّل',
          externalUserId: 'ext-none',
        });
        const [course] = await lms.listCourses();

        expect(await lms.getCourseProgress(user.lmsUserId, course!.lmsCourseId)).toBeNull();
      });

      it('reports an enrolled-but-unattempted course as incomplete with a null grade', async () => {
        const user = await lms.provisionUser({
          email: 'fresh@ministry.gov.example',
          fullName: 'جديد',
          externalUserId: 'ext-fresh',
        });
        const [course] = await lms.listCourses();
        await lms.enrol({ lmsUserId: user.lmsUserId, lmsCourseId: course!.lmsCourseId });

        const progress = await lms.getCourseProgress(user.lmsUserId, course!.lmsCourseId);

        expect(progress).toMatchObject({ completed: false, completedAt: null });
        /* null, not 0 — a zero would read as a failed attempt to the threshold
           check, implying a quiz was taken when none was. */
        expect(progress?.gradePercent).toBeNull();
      });

      it('returns a raw grade and never a pass/fail verdict (D-007)', async () => {
        const user = await lms.provisionUser({
          email: 'grade-shape@ministry.gov.example',
          fullName: 'درجة',
          externalUserId: 'ext-grade',
        });
        const [course] = await lms.listCourses();
        await lms.enrol({ lmsUserId: user.lmsUserId, lmsCourseId: course!.lmsCourseId });

        const progress = await lms.getCourseProgress(user.lmsUserId, course!.lmsCourseId);

        /* The pass threshold is a product setting; if the LMS decided this,
           changing certification policy would mean editing Moodle. */
        expect(progress).not.toHaveProperty('passed');
        expect(progress).not.toHaveProperty('pass');
        expect(progress).toHaveProperty('gradePercent');
      });
    });

    describe('listProgressForUser', () => {
      it('returns one entry per enrolment', async () => {
        const user = await lms.provisionUser({
          email: 'many@ministry.gov.example',
          fullName: 'متعدد',
          externalUserId: 'ext-many',
        });
        const courses = (await lms.listCourses()).slice(0, 3);

        for (const course of courses) {
          await lms.enrol({ lmsUserId: user.lmsUserId, lmsCourseId: course.lmsCourseId });
        }

        const progress = await lms.listProgressForUser(user.lmsUserId);

        expect(progress).toHaveLength(3);
        expect(new Set(progress.map((entry) => entry.lmsCourseId))).toEqual(
          new Set(courses.map((course) => course.lmsCourseId)),
        );
      });

      it('returns an empty list for a user with no enrolments', async () => {
        const user = await lms.provisionUser({
          email: 'empty@ministry.gov.example',
          fullName: 'فارغ',
          externalUserId: 'ext-empty',
        });

        expect(await lms.listProgressForUser(user.lmsUserId)).toEqual([]);
      });

      it('does not leak other users’ progress', async () => {
        const [first, second] = await Promise.all([
          lms.provisionUser({
            email: 'iso-1@ministry.gov.example',
            fullName: 'أول',
            externalUserId: 'ext-iso-1',
          }),
          lms.provisionUser({
            email: 'iso-2@ministry.gov.example',
            fullName: 'ثاني',
            externalUserId: 'ext-iso-2',
          }),
        ]);
        const [course] = await lms.listCourses();

        await lms.enrol({ lmsUserId: first!.lmsUserId, lmsCourseId: course!.lmsCourseId });

        expect(await lms.listProgressForUser(second!.lmsUserId)).toEqual([]);
      });
    });

    describe('courseUrl', () => {
      it('builds an absolute URL', () => {
        expect(lms.courseUrl(101)).toMatch(/^https?:\/\//);
      });

      it('embeds no secret — the value is handed to a browser', () => {
        /* Seamless sign-in is a separate Phase 2 concern; a token in this URL
           would end up in browser history and referrer headers. */
        const url = lms.courseUrl(101);

        expect(url).not.toMatch(/token/i);
        expect(url).not.toMatch(/wstoken/i);
      });

      it('is stable for the same course', () => {
        expect(lms.courseUrl(101)).toBe(lms.courseUrl(101));
      });
    });
  });
}
