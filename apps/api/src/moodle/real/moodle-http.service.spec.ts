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

  return { service: new MoodleHttpService('http://moodle.test', client), calls };
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

      await expect(service.provisionUser(input)).resolves.toEqual({ lmsUserId: 7, email: EMAIL });
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

      expect(second).toEqual(first);
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
      });

      expect(calls[0]!.params).toMatchObject({ field: 'username', values: [USERNAME] });
    });

    it('never queries Moodle by email — it silently returns nothing', async () => {
      const { service, calls } = serviceWith(() => []);
      await service.findUserByEmail(EMAIL);

      expect(calls.every((call) => call.params.field !== 'email')).toBe(true);
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

      expect(Object.keys(reference!).sort()).toEqual(['email', 'lmsUserId']);
    });
  });
});
