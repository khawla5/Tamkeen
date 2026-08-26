import { LmsOperationError, LmsUnavailableError } from '../lms.types';
import { deriveMoodleUsername } from './moodle-identity';
import { MoodleHttpService } from './moodle-http.service';
import { MoodleWsClient, MoodleWsError } from './moodle-ws.client';

/**
 * The adapter with its transport mocked. What is being asserted is the
 * translation and the idempotency logic — the HTTP protocol itself is covered in
 * `moodle-ws.client.spec.ts`, and the real end-to-end behaviour was proven
 * against a live Moodle in the spike.
 */

const EMAIL = 'ahmad.ali@ministry.gov.example';
const USERNAME = deriveMoodleUsername(EMAIL);

const STUDENT_ROLE_ID = 5;
/* Deliberately not Moodle's stock 3 and 1: a hardcoded default in the adapter
   would still pass a test that used the stock numbers (D-060). */
const TEACHER_ROLE_ID = 17;
const COURSE_CATEGORY_ID = 42;
const SSO_SECRET = 'a-test-secret-that-is-long-enough-000000';

type Handler = (wsfunction: string, params: Record<string, unknown>) => unknown;

interface CallLog {
  wsfunction: string;
  params: Record<string, unknown>;
}

function serviceWith(handler: Handler) {
  const calls: CallLog[] = [];

  const client = {
    call: (wsfunction: string, params: Record<string, unknown> = {}) => {
      calls.push({ wsfunction, params });

      try {
        return Promise.resolve(handler(wsfunction, params));
      } catch (error) {
        return Promise.reject(error);
      }
    },
  } as unknown as MoodleWsClient;

  return {
    service: new MoodleHttpService(
      'http://moodle.test',
      client,
      STUDENT_ROLE_ID,
      TEACHER_ROLE_ID,
      COURSE_CATEGORY_ID,
      SSO_SECRET,
      60,
    ),
    calls,
  };
}

const countOf = (calls: CallLog[], wsfunction: string) =>
  calls.filter((call) => call.wsfunction === wsfunction).length;

describe('MoodleHttpService', () => {
  describe('checkHealth', () => {
    it('reports the site when Moodle answers', async () => {
      const { service } = serviceWith(() => ({
        sitename: 'Dockerized_Moodle',
        release: '5.2.2 (Build: 20260810)',
      }));

      await expect(service.checkHealth()).resolves.toEqual({
        reachable: true,
        siteName: 'Dockerized_Moodle',
        lmsVersion: '5.2.2 (Build: 20260810)',
      });
    });

    it('reports a failure code instead of throwing when Moodle is down', async () => {
      /* Contract: health exists to report bad states, so it must never be the
         thing that crashes the dashboard showing them. */
      const { service } = serviceWith(() => {
        throw new LmsUnavailableError('UNREACHABLE');
      });

      await expect(service.checkHealth()).resolves.toEqual({
        reachable: false,
        failureCode: 'UNREACHABLE',
      });
    });

    it('reports an unauthorised token as a health state, not an exception', async () => {
      const { service } = serviceWith(() => {
        throw new LmsUnavailableError('UNAUTHORISED');
      });

      await expect(service.checkHealth()).resolves.toMatchObject({
        reachable: false,
        failureCode: 'UNAUTHORISED',
      });
    });
  });

  describe('provisionUser', () => {
    const input = { email: EMAIL, fullName: 'أحمد علي', externalUserId: 'ext-1' };

    it('creates the account when none exists, keyed on the derived username', async () => {
      const { service, calls } = serviceWith((wsfunction) => {
        if (wsfunction === 'core_user_get_users_by_field') return [];
        if (wsfunction === 'core_user_create_users') return [{ id: 42 }];
        throw new Error(`unexpected ${wsfunction}`);
      });

      await expect(service.provisionUser(input)).resolves.toEqual({
        lmsUserId: 42,
        email: EMAIL,
        fullName: 'أحمد علي',
      });

      const create = calls.find((call) => call.wsfunction === 'core_user_create_users');
      const users = create!.params.users as Array<Record<string, unknown>>;

      expect(users[0]).toMatchObject({
        username: USERNAME,
        email: EMAIL,
        firstname: 'أحمد',
        lastname: 'علي',
        auth: 'manual',
      });
    });

    it('looks the user up BEFORE creating, never create-then-catch', async () => {
      /* The spike showed a blind re-create is rejected with `invalidparameter`,
         so detecting an existing account from the error would work only by
         accident and would couple us to Moodle's choice of code. */
      const { service, calls } = serviceWith((wsfunction) => {
        if (wsfunction === 'core_user_get_users_by_field') return [{ id: 7, username: USERNAME }];
        throw new Error('must not reach create');
      });

      await expect(service.provisionUser(input)).resolves.toEqual({
        lmsUserId: 7,
        email: EMAIL,
        /* No firstname/lastname in this stub's lookup response — an honest
           read-back of what Moodle actually returned, not a guess. */
        fullName: '',
      });
      expect(countOf(calls, 'core_user_create_users')).toBe(0);
    });

    it('is idempotent — a retry returns the same account and creates nothing', async () => {
      let created: { id: number } | null = null;

      const { service, calls } = serviceWith((wsfunction) => {
        if (wsfunction === 'core_user_get_users_by_field') return created ? [created] : [];
        if (wsfunction === 'core_user_create_users') {
          created = { id: 99 };
          return [created];
        }
        throw new Error(`unexpected ${wsfunction}`);
      });

      const first = await service.provisionUser(input);
      const second = await service.provisionUser(input);

      /* The id, not the whole object: the second call takes the lookup path,
         and this stub's lookup response carries no firstname/lastname, unlike
         a real Moodle account's — which is a limitation of the stub, not a
         behaviour under test here. The account identity is what idempotency
         is actually about. */
      expect(second.lmsUserId).toBe(first.lmsUserId);
      expect(countOf(calls, 'core_user_create_users')).toBe(1);
    });

    it('treats the email case-insensitively', async () => {
      let created: { id: number } | null = null;

      const { service, calls } = serviceWith((wsfunction) => {
        if (wsfunction === 'core_user_get_users_by_field') return created ? [created] : [];
        if (wsfunction === 'core_user_create_users') {
          created = { id: 55 };
          return [created];
        }
        throw new Error(`unexpected ${wsfunction}`);
      });

      const lower = await service.provisionUser(input);
      const upper = await service.provisionUser({ ...input, email: EMAIL.toUpperCase() });

      expect(upper.lmsUserId).toBe(lower.lmsUserId);
      expect(countOf(calls, 'core_user_create_users')).toBe(1);
    });

    it('resolves a lost provisioning race to the winner’s account', async () => {
      /* Two callers can provision the same user at once — a confirm and a retry.
         The loser sees Moodle reject the duplicate username, and the right answer
         is the existing account, because this method is contractually
         idempotent. */
      let exists = false;

      const { service } = serviceWith((wsfunction) => {
        if (wsfunction === 'core_user_get_users_by_field') {
          return exists ? [{ id: 500, username: USERNAME }] : [];
        }
        if (wsfunction === 'core_user_create_users') {
          exists = true; // the other caller won between our lookup and our create
          throw new MoodleWsError('core_user_create_users', 'invalidparameter');
        }
        throw new Error(`unexpected ${wsfunction}`);
      });

      await expect(service.provisionUser(input)).resolves.toEqual({
        lmsUserId: 500,
        fullName: '',
        email: EMAIL,
      });
    });

    it('surfaces a genuine refusal rather than inventing an account', async () => {
      /* The accepted cost in D-038: a hand-created Moodle account already
         holding this address under a different username. Nothing can resolve it
         automatically, so it must reach an operator. */
      const { service } = serviceWith((wsfunction) => {
        if (wsfunction === 'core_user_get_users_by_field') return [];
        throw new MoodleWsError('core_user_create_users', 'emailtaken');
      });

      await expect(service.provisionUser(input)).rejects.toBeInstanceOf(LmsOperationError);
    });

    it('never reports success when the lookup itself failed', async () => {
      /* A failed lookup is not "no such user". Treating it as absence would make
         every transient fault create a duplicate account — precisely the failure
         D-038 exists to prevent. */
      const { service, calls } = serviceWith((wsfunction) => {
        if (wsfunction === 'core_user_get_users_by_field') {
          throw new MoodleWsError('core_user_get_users_by_field', 'somethingwrong');
        }
        throw new Error('must not reach create');
      });

      await expect(service.provisionUser(input)).rejects.toBeInstanceOf(LmsOperationError);
      expect(countOf(calls, 'core_user_create_users')).toBe(0);
    });

    it('propagates an outage as an outage, distinctly from a refusal', async () => {
      const { service } = serviceWith(() => {
        throw new LmsUnavailableError('UNREACHABLE');
      });

      await expect(service.provisionUser(input)).rejects.toBeInstanceOf(LmsUnavailableError);
    });

    it('rejects a create that returns no usable id rather than storing a bad one', async () => {
      /* Moodle answered but the payload was unusable. That is an
         UNEXPECTED_RESPONSE, not a refusal: nothing was decided, so the right
         operational response is to retry rather than to summon a human. The
         distinction matters because `moodle_user_id` is written from this value
         and a wrong one is worse than none. */
      const { service } = serviceWith((wsfunction) => {
        if (wsfunction === 'core_user_get_users_by_field') return [];
        return [];
      });

      await expect(service.provisionUser(input)).rejects.toMatchObject({
        name: 'LmsUnavailableError',
        failureCode: 'UNEXPECTED_RESPONSE',
      });
    });
  });

  describe('findUserByEmail', () => {
    it('returns null for an address with no account', async () => {
      const { service } = serviceWith(() => []);

      await expect(service.findUserByEmail('nobody@ministry.gov.example')).resolves.toBeNull();
    });

    it('resolves through the derived username, since the email index is unusable', async () => {
      const { service, calls } = serviceWith(() => [{ id: 11, username: USERNAME }]);

      await expect(service.findUserByEmail(EMAIL)).resolves.toEqual({
        lmsUserId: 11,
        email: EMAIL,
        fullName: '',
      });

      expect(calls[0]!.params).toMatchObject({ field: 'username', values: [USERNAME] });
    });

    it('never queries Moodle by email — it silently returns nothing', async () => {
      const { service, calls } = serviceWith(() => []);
      await service.findUserByEmail(EMAIL);

      expect(calls.every((call) => call.params.field !== 'email')).toBe(true);
    });
  });

  describe('listCourses', () => {
    /* Payload fields replayed from a live Moodle 5.2.2. */
    const moodleCourse = (overrides: Record<string, unknown> = {}) => ({
      id: 2,
      fullname: 'أساسيات الأمن',
      summary: 'وصف',
      visible: 1,
      format: 'topics',
      ...overrides,
    });

    it('uses core_course_get_courses_by_field, not core_course_get_courses', async () => {
      /* get_courses omits , which Moodle gates behind
         moodle/course:update - a capability a least-privilege integration user
         must not hold. Our courses.status rule is derived from it (D-038). */
      const { service, calls } = serviceWith(() => ({ courses: [moodleCourse()] }));
      await service.listCourses();

      expect(calls[0]!.wsfunction).toBe('core_course_get_courses_by_field');
    });

    it('translates the Moodle payload into our vocabulary', async () => {
      const { service } = serviceWith(() => ({ courses: [moodleCourse()] }));

      await expect(service.listCourses()).resolves.toEqual([
        {
          lmsCourseId: 2,
          title: 'أساسيات الأمن',
          summary: 'وصف',
          durationMinutes: null,
          visible: true,
        },
      ]);
    });

    it('leaks no Moodle-native field names to callers', async () => {
      const { service } = serviceWith(() => ({ courses: [moodleCourse()] }));
      const [course] = await service.listCourses();

      for (const native of ['fullname', 'shortname', 'summaryformat', 'categoryid', 'format']) {
        expect(course).not.toHaveProperty(native);
      }
    });

    it('discards the site course, which is the front page and not a course', async () => {
      const { service } = serviceWith(() => ({
        courses: [moodleCourse({ id: 1, format: 'site' }), moodleCourse({ id: 2 })],
      }));

      const courses = await service.listCourses();

      expect(courses.map((course) => course.lmsCourseId)).toEqual([2]);
    });

    it('includes courses the LMS is hiding, which sync needs to see', async () => {
      /* A hidden course still has to reach us: our own status decides what is
         offered, and D-015 keeps it completable for whoever already has it. */
      const { service } = serviceWith(() => ({ courses: [moodleCourse({ visible: 0 })] }));

      await expect(service.listCourses()).resolves.toMatchObject([{ visible: false }]);
    });

    it('fails closed when visible is absent entirely', async () => {
      /* Its absence would signal a capability regression. Defaulting to visible
         would publish courses Moodle deliberately hides - silently. Defaulting
         to hidden is loud, recoverable and leaks nothing. */
      const { service } = serviceWith(() => ({ courses: [moodleCourse({ visible: undefined })] }));

      await expect(service.listCourses()).resolves.toMatchObject([{ visible: false }]);
    });

    it('reads a duration custom field when an instance defines one', async () => {
      const { service } = serviceWith(() => ({
        courses: [moodleCourse({ customfields: [{ shortname: 'duration', value: '120' }] })],
      }));

      await expect(service.listCourses()).resolves.toMatchObject([{ durationMinutes: 120 }]);
    });

    it('reports no duration rather than zero when Moodle has none', async () => {
      /* Moodle models no nominal-effort field (D-039). A zero would read as a
         real value in the catalogue. */
      const { service } = serviceWith(() => ({
        courses: [moodleCourse({ customfields: [{ shortname: 'other', value: 'x' }] })],
      }));

      await expect(service.listCourses()).resolves.toMatchObject([{ durationMinutes: null }]);
    });
  });

  describe('getCourse', () => {
    it('returns null for an unknown course rather than throwing', async () => {
      /* Moodle answers an unknown id with an empty list plus a warning, not an
         error, so null is both honest and what the contract requires. */
      const { service } = serviceWith(() => ({ courses: [], warnings: [] }));

      await expect(service.getCourse(9_999)).resolves.toBeNull();
    });

    it('asks Moodle for one course by id', async () => {
      const { service, calls } = serviceWith(() => ({
        courses: [{ id: 5, fullname: 'دورة', summary: '', visible: 1, format: 'topics' }],
      }));

      await expect(service.getCourse(5)).resolves.toMatchObject({ lmsCourseId: 5 });
      expect(calls[0]!.params).toMatchObject({ field: 'id', value: 5 });
    });
  });
  describe('createCourse', () => {
    const input = { title: 'إدارة المخاطر', summary: 'وصف', shortName: 'risk-101' };

    /** Answers creation, then the read-back `getCourse` does. */
    const created =
      (id: number): Handler =>
      (wsfunction) => {
        if (wsfunction === 'core_course_create_courses') {
          return [{ id, shortname: 'risk-101' }];
        }

        return { courses: [{ id, fullname: 'إدارة المخاطر', summary: 'وصف', visible: 1 }] };
      };

    it('files the course in the configured category rather than guessing one', async () => {
      /* Moodle demands a category and numbers them per-instance; defaulting to 1
         would file ministry courses under whatever that instance calls category
         one (D-060). */
      const { service, calls } = serviceWith(created(77));

      await service.createCourse(input);

      const create = calls.find((call) => call.wsfunction === 'core_course_create_courses')!;
      expect((create.params.courses as Array<Record<string, unknown>>)[0]).toMatchObject({
        categoryid: COURSE_CATEGORY_ID,
        shortname: 'risk-101',
        fullname: 'إدارة المخاطر',
      });
    });

    it('switches completion on at creation', async () => {
      /* `enablecompletion` is the prerequisite for configuring any criterion at
         all. Without it the entity has to find a setting they do not know they
         need — though it does not by itself make the course completable, which
         is why the publish gate reads the content summary (D-061). */
      const { service, calls } = serviceWith(created(77));

      await service.createCourse(input);

      const create = calls.find((call) => call.wsfunction === 'core_course_create_courses')!;
      expect((create.params.courses as Array<Record<string, unknown>>)[0]).toMatchObject({
        enablecompletion: 1,
      });
    });

    it('reads the course back rather than echoing the input', async () => {
      /*
       * Moodle normalises what it stores, and our `courses` row mirrors what the
       * LMS holds rather than what we asked for. Echoing the input would make
       * the two disagree from the first moment, and the next sync run would
       * "correct" a row nobody had changed.
       */
      const { service, calls } = serviceWith((wsfunction) => {
        if (wsfunction === 'core_course_create_courses') {
          return [{ id: 77 }];
        }

        return { courses: [{ id: 77, fullname: 'العنوان كما خزّنه مودل', visible: 1 }] };
      });

      const course = await service.createCourse(input);

      expect(course.title).toBe('العنوان كما خزّنه مودل');
      expect(calls.map((call) => call.wsfunction)).toContain('core_course_get_courses_by_field');
    });

    it('refuses a response with no usable course id', async () => {
      /* A 200 with no id is not success: a course row pointing at nothing would
         be withdrawn by the next sync and is unreachable in the meantime. */
      const { service } = serviceWith(() => [{}]);

      await expect(service.createCourse(input)).rejects.toBeInstanceOf(LmsOperationError);
    });

    it('refuses when the created course cannot be read back', async () => {
      const { service } = serviceWith((wsfunction) => {
        if (wsfunction === 'core_course_create_courses') {
          return [{ id: 77 }];
        }

        return { courses: [] };
      });

      await expect(service.createCourse(input)).rejects.toBeInstanceOf(LmsOperationError);
    });

    it('reports a refusal as an operation error, not as an outage', async () => {
      /* An outage is retried; a refusal needs a human (D-039). A duplicate
         shortname is the latter. */
      const { service } = serviceWith((wsfunction) => {
        if (wsfunction === 'core_course_create_courses') {
          throw new MoodleWsError('core_course_create_courses', 'shortnametaken');
        }
        return null;
      });

      await expect(service.createCourse(input)).rejects.toBeInstanceOf(LmsOperationError);
    });

    it('carries no Moodle error code out of the module', async () => {
      /* D-030: the errorcode is LMS vocabulary and stays in the log. */
      const { service } = serviceWith((wsfunction) => {
        if (wsfunction === 'core_course_create_courses') {
          throw new MoodleWsError('core_course_create_courses', 'shortnametaken');
        }
        return null;
      });

      await expect(service.createCourse(input)).rejects.toThrow('LMS_CREATE_COURSE_REJECTED');
    });
  });

  describe('getCourseContentSummary', () => {
    const contents =
      (modules: Array<Record<string, unknown>>, enablecompletion = 1): Handler =>
      (wsfunction) => {
        if (wsfunction === 'core_course_get_contents') {
          return [{ modules }];
        }

        return { courses: [{ id: 5, fullname: 'دورة', visible: 1, enablecompletion }] };
      };

    it('returns null for a course the LMS does not have', async () => {
      const { service } = serviceWith(() => ({ courses: [] }));

      await expect(service.getCourseContentSummary(5)).resolves.toBeNull();
    });

    it('counts activities across sections and spots a quiz', async () => {
      const { service } = serviceWith(
        contents([
          { modname: 'page', completion: 1 },
          { modname: 'quiz', completion: 2 },
        ]),
      );

      await expect(service.getCourseContentSummary(5)).resolves.toMatchObject({
        activityCount: 2,
        hasQuiz: true,
      });
    });

    it('reports a course with no completion criteria as not configured', async () => {
      /*
       * The D-042 failure, caught before publication rather than after. A course
       * whose activities all have `completion: 0` reports `completed: false`
       * forever, so nobody on it can pass and no certificate can ever issue —
       * with nothing in any log to explain it.
       */
      const { service } = serviceWith(
        contents([
          { modname: 'quiz', completion: 0 },
          { modname: 'page', completion: 0 },
        ]),
      );

      await expect(service.getCourseContentSummary(5)).resolves.toMatchObject({
        completionConfigured: false,
      });
    });

    it('reports completion switched off at course level as not configured', async () => {
      /* Both halves matter: criteria on the activities are useless when course
         completion is disabled outright. */
      const { service } = serviceWith(contents([{ modname: 'quiz', completion: 2 }], 0));

      await expect(service.getCourseContentSummary(5)).resolves.toMatchObject({
        completionConfigured: false,
      });
    });

    it('reports a properly configured course as completable', async () => {
      const { service } = serviceWith(contents([{ modname: 'quiz', completion: 2 }], 1));

      await expect(service.getCourseContentSummary(5)).resolves.toMatchObject({
        completionConfigured: true,
        hasQuiz: true,
      });
    });

    it('tolerates a section with no modules', async () => {
      const { service } = serviceWith((wsfunction) => {
        if (wsfunction === 'core_course_get_contents') {
          return [{}, { modules: [] }];
        }
        return { courses: [{ id: 5, fullname: 'دورة', visible: 1, enablecompletion: 1 }] };
      });

      await expect(service.getCourseContentSummary(5)).resolves.toMatchObject({
        activityCount: 0,
        completionConfigured: false,
      });
    });
  });

  describe('enrol', () => {
    const input = { lmsUserId: 4, lmsCourseId: 2 };

    it('enrols an author with the teacher role', async () => {
      /* An entity authoring its own course needs Moodle's editing capabilities
         (D-060), and the role id is configuration for the same reason the
         student one is — we do not control the ministry's Moodle. */
      const { service, calls } = serviceWith(() => null);

      await service.enrol({ ...input, role: 'AUTHOR' });

      expect(calls[0]!.params.enrolments).toEqual([
        { roleid: TEACHER_ROLE_ID, userid: 4, courseid: 2 },
      ]);
    });

    it('enrols with the configured role rather than a hardcoded one', async () => {
      /* Role ids are per-instance and we do not control the ministry's Moodle;
         a hardcoded 5 that meant something else there would enrol every learner
         with the wrong permissions (D-039). */
      const { service, calls } = serviceWith(() => null);

      await service.enrol(input);

      expect(calls[0]!.wsfunction).toBe('enrol_manual_enrol_users');
      expect(calls[0]!.params.enrolments).toEqual([
        { roleid: STUDENT_ROLE_ID, userid: 4, courseid: 2 },
      ]);
    });

    it('treats a failure as success when the enrolment is actually present', async () => {
      /* The spike found Moodle throwing "Message was not sent." from the
         course-welcome email AFTER the enrolment had committed. Believing the
         error would audit a successful enrolment as failed (D-036, D-038). */
      const { service } = serviceWith((wsfunction) => {
        if (wsfunction === 'enrol_manual_enrol_users') {
          throw new MoodleWsError('enrol_manual_enrol_users', 'Message was not sent.');
        }
        return [{ id: 2 }];
      });

      await expect(service.enrol(input)).resolves.toBeUndefined();
    });

    it('reports a failure when the enrolment really is absent', async () => {
      const { service } = serviceWith((wsfunction) => {
        if (wsfunction === 'enrol_manual_enrol_users') {
          throw new MoodleWsError('enrol_manual_enrol_users', 'wsusercannotassign');
        }
        return [];
      });

      await expect(service.enrol(input)).rejects.toBeInstanceOf(LmsOperationError);
    });

    it('verifies after a timeout too, since the request may well have landed', async () => {
      /* The genuinely ambiguous case: the transport gave up, but Moodle may have
         committed. Assuming failure would make the sync job re-enrol forever. */
      let attempted = false;

      const { service } = serviceWith((wsfunction) => {
        if (wsfunction === 'enrol_manual_enrol_users') {
          attempted = true;
          throw new LmsUnavailableError('UNREACHABLE');
        }
        return attempted ? [{ id: 2 }] : [];
      });

      await expect(service.enrol(input)).resolves.toBeUndefined();
    });

    it('keeps the outage error when verification cannot reach Moodle either', async () => {
      const { service } = serviceWith(() => {
        throw new LmsUnavailableError('UNREACHABLE');
      });

      await expect(service.enrol(input)).rejects.toBeInstanceOf(LmsUnavailableError);
    });

    it('is idempotent - a second enrol succeeds and changes nothing', async () => {
      const enrolled = new Set<number>();

      const { service } = serviceWith((wsfunction, params) => {
        if (wsfunction === 'enrol_manual_enrol_users') {
          const list = params.enrolments as Array<{ courseid: number }>;
          enrolled.add(list[0]!.courseid);
          return null;
        }
        return [...enrolled].map((id) => ({ id }));
      });

      await service.enrol(input);
      await expect(service.enrol(input)).resolves.toBeUndefined();
      await expect(service.isEnrolled(4, 2)).resolves.toBe(true);
    });
  });

  describe('isEnrolled', () => {
    it('is false for a course the user does not hold', async () => {
      const { service } = serviceWith(() => [{ id: 99 }]);

      await expect(service.isEnrolled(4, 2)).resolves.toBe(false);
    });

    it('is false for a user with no enrolments at all', async () => {
      const { service } = serviceWith(() => []);

      await expect(service.isEnrolled(4, 2)).resolves.toBe(false);
    });
  });

  describe('courseUrl', () => {
    it('embeds no token — this value is handed to a browser', () => {
      const { service } = serviceWith(() => null);

      expect(service.courseUrl(101)).toBe('http://moodle.test/course/view.php?id=101');
      expect(service.courseUrl(101)).not.toMatch(/token/i);
    });
  });

  describe('the boundary', () => {
    it('returns no Moodle-native field names to callers', async () => {
      /* If Moodle's own keys appear on a returned object, the anti-corruption
         layer has leaked and every caller is coupled to Moodle's schema. */
      const { service } = serviceWith(() => [
        { id: 3, username: USERNAME, auth: 'manual', confirmed: true, profileimageurl: 'x' },
      ]);

      const reference = await service.findUserByEmail(EMAIL);

      expect(Object.keys(reference!).sort()).toEqual(['email', 'fullName', 'lmsUserId']);
    });
  });
});
