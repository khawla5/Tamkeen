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

    describe('updateUser', () => {
      it('changes the name the LMS reports back', async () => {
        const provisioned = await lms.provisionUser({
          email: 'rename@ministry.gov.example',
          fullName: 'الاسم الأول',
          externalUserId: 'ext-rename',
        });

        await lms.updateUser({ lmsUserId: provisioned.lmsUserId, fullName: 'الاسم الجديد' });

        const found = await lms.findUserByEmail('rename@ministry.gov.example');
        expect(found?.fullName).toBe('الاسم الجديد');
      });

      it('is idempotent — writing the same name twice does not throw', async () => {
        const provisioned = await lms.provisionUser({
          email: 'rename-twice@ministry.gov.example',
          fullName: 'اسم ثابت',
          externalUserId: 'ext-rename-twice',
        });

        await lms.updateUser({ lmsUserId: provisioned.lmsUserId, fullName: 'اسم جديد' });

        await expect(
          lms.updateUser({ lmsUserId: provisioned.lmsUserId, fullName: 'اسم جديد' }),
        ).resolves.not.toThrow();
      });

      it('rejects an id nothing provisioned', async () => {
        /* The caller's contract, not this test's: a profile save must not
           reach this for a user with no moodle_user_id at all (§4.12). This
           only proves the adapter fails rather than silently no-opping if
           that rule is ever broken upstream. */
        await expect(
          lms.updateUser({ lmsUserId: 99_999_999, fullName: 'لا أحد' }),
        ).rejects.toThrow();
      });

      it('moves the email without re-deriving the username (D-038 addendum)', async () => {
        /*
         * The property a confirmed email change (§4.12) depends on: the
         * account stays keyed on the username derived from its *original*
         * address. Resolving it by the *new* address must fail exactly like
         * looking up an address Moodle was never told about — because under
         * D-038's least-privilege token, that is indistinguishable from
         * "no such account".
         */
        const provisioned = await lms.provisionUser({
          email: 're-email-a@ministry.gov.example',
          fullName: 'قبل التغيير',
          externalUserId: 'ext-re-email',
        });

        await lms.updateUser({
          lmsUserId: provisioned.lmsUserId,
          email: 're-email-b@ministry.gov.example',
        });

        const byOriginal = await lms.findUserByEmail('re-email-a@ministry.gov.example');
        expect(byOriginal?.lmsUserId).toBe(provisioned.lmsUserId);

        expect(await lms.findUserByEmail('re-email-b@ministry.gov.example')).toBeNull();
      });

      it('is idempotent for an email write — writing the same address twice does not throw', async () => {
        const provisioned = await lms.provisionUser({
          email: 're-email-twice@ministry.gov.example',
          fullName: 'ثابت',
          externalUserId: 'ext-re-email-twice',
        });

        await lms.updateUser({
          lmsUserId: provisioned.lmsUserId,
          email: 're-email-twice-new@ministry.gov.example',
        });

        await expect(
          lms.updateUser({
            lmsUserId: provisioned.lmsUserId,
            email: 're-email-twice-new@ministry.gov.example',
          }),
        ).resolves.not.toThrow();
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

    describe('createCourse', () => {
      const input = (
        overrides: Partial<{ title: string; summary: string; shortName: string }> = {},
      ) => ({
        title: 'دورة جديدة',
        summary: 'وصف الدورة',
        shortName: `contract-${Math.random().toString(36).slice(2, 10)}`,
        ...overrides,
      });

      it('returns a course with a usable id', async () => {
        const course = await lms.createCourse(input());

        expect(typeof course.lmsCourseId).toBe('number');
        expect(course.lmsCourseId).toBeGreaterThan(0);
      });

      it('carries the title and summary it was given', async () => {
        const course = await lms.createCourse(input({ title: 'إدارة المخاطر' }));

        expect(course.title).toBe('إدارة المخاطر');
      });

      it('makes the course findable through getCourse', async () => {
        /* The whole reason the shell lives in the LMS rather than only in our
           database (D-060): catalogue sync must be able to see it, or it would
           withdraw the row on its next run. */
        const created = await lms.createCourse(input());

        await expect(lms.getCourse(created.lmsCourseId)).resolves.toMatchObject({
          lmsCourseId: created.lmsCourseId,
        });
      });

      it('includes the new course in the catalogue', async () => {
        const created = await lms.createCourse(input());
        const catalogue = await lms.listCourses();

        expect(catalogue.map((course) => course.lmsCourseId)).toContain(created.lmsCourseId);
      });

      it('creates a course that is not yet completable', async () => {
        /*
         * The property the publish gate depends on (D-061). A newly created
         * course has no activities and no completion criteria until an entity
         * authors them in Moodle, so it must report as not completable — a
         * course that arrived ready to publish would make the gate untestable
         * and would let a real entity publish a dead end.
         */
        const created = await lms.createCourse(input());
        const summary = await lms.getCourseContentSummary(created.lmsCourseId);

        expect(summary?.completionConfigured).toBe(false);
      });

      it('does not reissue an id to a course made by a later instance', async () => {
        /*
         * A restart must not hand a new course an id an existing one already
         * holds. `courses.moodle_course_id` is UNIQUE, so when the mock counted
         * from a fixed base on every process start, any course row outliving its
         * process made the next creation fail on the constraint with a 500 —
         * found for real while testing Phase 4.
         *
         * A second port stands in for the restart. The real adapter has this for
         * free from Moodle's own database, which is precisely why it belongs in
         * the contract rather than in the mock's own tests.
         */
        const first = await lms.createCourse(input());
        const afterRestart = createPort();

        const second = await afterRestart.createCourse(input());

        expect(second.lmsCourseId).not.toBe(first.lmsCourseId);
      });

      it('refuses a duplicate short name', async () => {
        /* Moodle enforces this, so an implementation that did not would let a
           collision be discovered for the first time in production. */
        const shortName = `contract-dup-${Math.random().toString(36).slice(2, 10)}`;

        await lms.createCourse(input({ shortName }));

        await expect(lms.createCourse(input({ shortName }))).rejects.toThrow();
      });
    });

    describe('getCourseOutline', () => {
      it('is empty for a course that does not exist, and ordered pages with a URL for one that does', async () => {
        await expect(lms.getCourseOutline(99_999_999)).resolves.toEqual([]);

        const outline = await lms.getCourseOutline(101);
        for (const item of outline) {
          expect(item.lmsModuleId).toEqual(expect.any(Number));
          expect(item.url).toMatch(/^https?:\/\//);
          expect(item.url).not.toMatch(/wstoken/i);
          expect(item.kind).not.toBe('label');
        }
      });
    });

    describe('deleteCourse', () => {
      const input = () => ({
        title: 'دورة للحذف',
        summary: 'وصف',
        shortName: `contract-del-${Math.random().toString(36).slice(2, 10)}`,
      });

      it('removes the course from the catalogue', async () => {
        /* The property the whole feature rests on (§4C.5, TAM-134): if the
           course survived here, the next catalogue sync would rediscover it and
           re-enter it as an unowned draft — so "permanently deleted" would mean
           "back within minutes". */
        const created = await lms.createCourse(input());

        await lms.deleteCourse(created.lmsCourseId);

        await expect(lms.getCourse(created.lmsCourseId)).resolves.toBeNull();

        const catalogue = await lms.listCourses();
        expect(catalogue.map((course) => course.lmsCourseId)).not.toContain(created.lmsCourseId);
      });

      it('is a successful no-op for a course that is already gone', async () => {
        /* The caller deletes here first and in our database second, so a retry
           after a half-failure lands on exactly this case. It must succeed, or
           the retry can never finish what the first attempt started. */
        const created = await lms.createCourse(input());

        await lms.deleteCourse(created.lmsCourseId);

        await expect(lms.deleteCourse(created.lmsCourseId)).resolves.toBeUndefined();
      });

      it('is a successful no-op for an id the LMS never had', async () => {
        await expect(lms.deleteCourse(99_999_998)).resolves.toBeUndefined();
      });
    });

    describe('getCourseContentSummary', () => {
      it('returns null for a course that does not exist', async () => {
        await expect(lms.getCourseContentSummary(99_999_999)).resolves.toBeNull();
      });

      it('reports counts and flags rather than course content', async () => {
        /*
         * Deliberately a summary, not a content tree. We do not render Moodle's
         * material (D-000/D-045), so a richer shape would be data with no
         * consumer — and modelling Moodle's module structure here would leak the
         * schema across the boundary D-030 exists to hold.
         */
        const summary = await lms.getCourseContentSummary(101);

        expect(summary).toMatchObject({
          lmsCourseId: 101,
          activityCount: expect.any(Number) as number,
          hasQuiz: expect.any(Boolean) as boolean,
          completionConfigured: expect.any(Boolean) as boolean,
        });
      });

      it('leaks no Moodle field names', async () => {
        const summary = await lms.getCourseContentSummary(101);

        expect(Object.keys(summary ?? {}).sort()).toEqual([
          'activityCount',
          'completionConfigured',
          'hasQuiz',
          'lmsCourseId',
        ]);
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

      it('enrols an author, and an author is still enrolled', async () => {
        /*
         * `role` selects what a user is enrolled *as* (D-060). Whatever an
         * implementation does with it, an author must satisfy `isEnrolled` —
         * otherwise the launch path, which checks enrolment before minting a
         * handoff, would refuse an entity entry to its own course.
         */
        const user = await lms.provisionUser({
          email: 'author@authority.gov.example',
          fullName: 'مؤلف',
          externalUserId: 'ext-author',
        });
        const [course] = await lms.listCourses();

        await lms.enrol({
          lmsUserId: user.lmsUserId,
          lmsCourseId: course!.lmsCourseId,
          role: 'AUTHOR',
        });

        expect(await lms.isEnrolled(user.lmsUserId, course!.lmsCourseId)).toBe(true);
      });

      it('treats an absent role as LEARNER', async () => {
        /* Every Phase 1-3 caller omits it, and they all meant a learner. */
        const user = await lms.provisionUser({
          email: 'default-role@ministry.gov.example',
          fullName: 'متعلم',
          externalUserId: 'ext-default-role',
        });
        const [course] = await lms.listCourses();

        await expect(
          lms.enrol({ lmsUserId: user.lmsUserId, lmsCourseId: course!.lmsCourseId }),
        ).resolves.not.toThrow();
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

    describe('courseLaunchUrl', () => {
      it('builds an absolute URL', async () => {
        const user = await lms.provisionUser({
          email: 'launch@ministry.gov.example',
          fullName: 'متعلم',
          externalUserId: 'ext-launch',
        });

        expect(lms.courseLaunchUrl(user.lmsUserId, 101)).toMatch(/^https?:\/\//);
      });

      it('never carries the web-services token', async () => {
        /* Unlike `courseUrl` this URL DOES carry a credential — a short-lived,
           single-use handoff. That is deliberate. The web-services token is a
           different thing entirely: it is long-lived, grants the whole API, and
           must never reach a browser. */
        const user = await lms.provisionUser({
          email: 'launch-2@ministry.gov.example',
          fullName: 'متعلم',
          externalUserId: 'ext-launch-2',
        });
        const url = lms.courseLaunchUrl(user.lmsUserId, 101);

        expect(url).not.toMatch(/wstoken/i);
      });

      it('differs between learners', async () => {
        /* A launch URL is a login. If two learners got the same one, it would be
           a login to whichever account the LMS happened to resolve. */
        const [first, second] = await Promise.all([
          lms.provisionUser({
            email: 'launch-a@ministry.gov.example',
            fullName: 'أول',
            externalUserId: 'ext-launch-a',
          }),
          lms.provisionUser({
            email: 'launch-b@ministry.gov.example',
            fullName: 'ثاني',
            externalUserId: 'ext-launch-b',
          }),
        ]);

        expect(lms.courseLaunchUrl(first!.lmsUserId, 101)).not.toBe(
          lms.courseLaunchUrl(second!.lmsUserId, 101),
        );
      });

      it('carries the embed hint outside the credential, and stays fresh and token-free', async () => {
        /* TAM-129: the entity portal frames the course. The hint must reach the
           LMS on the URL, must not change any of the properties above, and must
           not be the same URL as the plain handoff — that one is spent already
           by the time a fallback needs a fresh one. */
        const user = await lms.provisionUser({
          email: 'launch-embed@ministry.gov.example',
          fullName: 'مؤلف',
          externalUserId: 'ext-launch-embed',
        });

        const framed = lms.courseLaunchUrl(user.lmsUserId, 101, { embed: 'author' });

        expect(framed).toMatch(/^https?:\/\//);
        expect(framed).toMatch(/[?&]embed=author(&|$)/);
        expect(framed).not.toMatch(/wstoken/i);
        expect(framed).not.toBe(lms.courseLaunchUrl(user.lmsUserId, 101, { embed: 'author' }));
        expect(lms.courseLaunchUrl(user.lmsUserId, 101)).not.toMatch(/embed=/);
      });

      it('is fresh on every call', async () => {
        /* A handoff is single-use by design, so returning the same URL twice
           would return an already-spent token the second time. Callers mint per
           click precisely because of this. */
        const user = await lms.provisionUser({
          email: 'launch-fresh@ministry.gov.example',
          fullName: 'متعلم',
          externalUserId: 'ext-launch-fresh',
        });

        expect(lms.courseLaunchUrl(user.lmsUserId, 101)).not.toBe(
          lms.courseLaunchUrl(user.lmsUserId, 101),
        );
      });

      it('differs between courses for one learner', async () => {
        const user = await lms.provisionUser({
          email: 'launch-3@ministry.gov.example',
          fullName: 'متعلم',
          externalUserId: 'ext-launch-3',
        });

        expect(lms.courseLaunchUrl(user.lmsUserId, 101)).not.toBe(
          lms.courseLaunchUrl(user.lmsUserId, 102),
        );
      });
    });
  });
}
