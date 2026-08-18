import { LmsUnavailableError } from '../lms.types';
import { MoodleWsClient, MoodleWsError, encodeParams } from './moodle-ws.client';

/**
 * The HTTP layer is mocked throughout (§2B): these assert how the client reacts
 * to Moodle's protocol, which is a property of our code, not of any server.
 * The shapes replayed here were captured from a live Moodle 5.2.2 in the spike.
 */

const TOKEN = 'super-secret-ws-token';

interface Recorded {
  url: string;
  body: URLSearchParams;
}

function clientReturning(
  responses: Array<{ status?: number; body: string }>,
  recorder: Recorded[] = [],
) {
  let call = 0;

  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    recorder.push({
      url: String(url),
      body: new URLSearchParams(String(init?.body ?? '')),
    });

    const next = responses[Math.min(call, responses.length - 1)]!;
    call += 1;

    return {
      ok: (next.status ?? 200) >= 200 && (next.status ?? 200) < 300,
      status: next.status ?? 200,
      text: () => Promise.resolve(next.body),
    } as Response;
  }) as unknown as typeof fetch;

  return {
    client: new MoodleWsClient({
      baseUrl: 'http://moodle.test/',
      token: TOKEN,
      timeoutMs: 1_000,
      fetchImpl,
    }),
    recorder,
  };
}

describe('MoodleWsClient', () => {
  describe('the HTTP-200-with-exception protocol', () => {
    it('treats a 200 carrying an exception as a failure, not as data', () => {
      /* The single most dangerous property of core REST without the Catalyst
         plugin. A client that trusted the status line would hand callers an
         error envelope as though it were a result. */
      const { client } = clientReturning([
        {
          status: 200,
          body: JSON.stringify({
            exception: 'moodle_exception',
            errorcode: 'usernotenroled',
            message: 'User is not enrolled in this course',
          }),
        },
      ]);

      return expect(client.call('core_completion_get_course_completion_status')).rejects.toThrow(
        MoodleWsError,
      );
    });

    it('carries the errorcode so the adapter can translate it', async () => {
      const { client } = clientReturning([
        {
          body: JSON.stringify({
            exception: 'moodle_exception',
            errorcode: 'nocriteriaset',
            message: 'No completion criteria set for this course',
          }),
        },
      ]);

      await expect(client.call('x')).rejects.toMatchObject({ errorcode: 'nocriteriaset' });
    });

    it('maps token and permission failures to UNAUTHORISED', async () => {
      for (const errorcode of ['invalidtoken', 'accessexception', 'nopermissions']) {
        const { client } = clientReturning([
          { body: JSON.stringify({ exception: 'moodle_exception', errorcode, message: '' }) },
        ]);

        await expect(client.call('x')).rejects.toMatchObject({
          name: 'LmsUnavailableError',
          failureCode: 'UNAUTHORISED',
        });
      }
    });

    it('still honours real HTTP status codes, so installing the Catalyst plugin changes nothing', async () => {
      /* With the plugin, failures arrive as 4xx/5xx instead. Both paths must
         work or adding the plugin later becomes a behavioural change. */
      const unauthorised = clientReturning([{ status: 403, body: '{}' }]);
      await expect(unauthorised.client.call('x')).rejects.toMatchObject({
        failureCode: 'UNAUTHORISED',
      });

      const down = clientReturning([{ status: 502, body: '{}' }]);
      await expect(down.client.call('x')).rejects.toMatchObject({ failureCode: 'UNREACHABLE' });
    });

    it('returns the payload unchanged on success', async () => {
      const { client } = clientReturning([{ body: JSON.stringify([{ id: 7 }]) }]);

      await expect(client.call('core_user_get_users_by_field')).resolves.toEqual([{ id: 7 }]);
    });

    it('does not mistake a legitimate array for an error envelope', async () => {
      /* `exception` is only meaningful on an object. An array of courses that
         happened to contain the key must not be read as a failure. */
      const { client } = clientReturning([
        { body: JSON.stringify([{ exception: 'not-an-error' }]) },
      ]);

      await expect(client.call('x')).resolves.toEqual([{ exception: 'not-an-error' }]);
    });
  });

  describe('transport failures', () => {
    it('reports an unreachable Moodle rather than leaking the network error', async () => {
      const fetchImpl = (() =>
        Promise.reject(
          new Error('connect ECONNREFUSED 127.0.0.1:8080'),
        )) as unknown as typeof fetch;

      const client = new MoodleWsClient({
        baseUrl: 'http://moodle.test',
        token: TOKEN,
        timeoutMs: 10,
        fetchImpl,
      });

      await expect(client.call('x')).rejects.toBeInstanceOf(LmsUnavailableError);
      await expect(client.call('x')).rejects.toMatchObject({ failureCode: 'UNREACHABLE' });
    });

    it('treats a non-JSON body as an unexpected response, never parsing it', async () => {
      /* A PHP fatal error returns HTML. Reporting it as a normal failure keeps
         the body — which can echo the request — out of everything. */
      const { client } = clientReturning([{ body: '<html>Fatal error: …</html>' }]);

      await expect(client.call('x')).rejects.toMatchObject({
        failureCode: 'UNEXPECTED_RESPONSE',
      });
    });
  });

  describe('the token', () => {
    it('is sent in the request body, never in the URL', async () => {
      const { client, recorder } = clientReturning([{ body: '{}' }]);
      await client.call('core_webservice_get_site_info');

      expect(recorder[0]!.url).toBe('http://moodle.test/webservice/rest/server.php');
      expect(recorder[0]!.url).not.toContain(TOKEN);
      expect(recorder[0]!.body.get('wstoken')).toBe(TOKEN);
    });

    it('never appears in a thrown error, for any failure mode', async () => {
      const failures = [
        { body: JSON.stringify({ exception: 'e', errorcode: 'invalidtoken', message: TOKEN }) },
        { body: JSON.stringify({ exception: 'e', errorcode: 'nocriteriaset', message: TOKEN }) },
        { body: `<html>debug: wstoken=${TOKEN}</html>` },
        { status: 500, body: TOKEN },
      ];

      for (const failure of failures) {
        const { client } = clientReturning([failure]);

        /* Moodle can echo the request it received in a debug response, so an
           error built from the body would carry the credential into logs and
           possibly into an HTTP response. Serialising every own property, not
           just `message`, is the point: this test is what forced `MoodleWsError`
           to stop carrying Moodle's raw message. */
        const error: unknown = await client.call('x').catch((caught: unknown) => caught);
        const serialised = `${String(error)} ${JSON.stringify(
          error,
          Object.getOwnPropertyNames(error as object),
        )}`;

        expect(serialised).not.toContain(TOKEN);
      }
    });
  });

  it('normalises a base URL with a trailing slash', async () => {
    const { client, recorder } = clientReturning([{ body: '{}' }]);
    await client.call('x');

    expect(recorder[0]!.url).not.toContain('//webservice');
  });
});

describe('encodeParams', () => {
  it('uses PHP’s nested array notation, which is what Moodle parses', () => {
    expect(encodeParams({ users: [{ username: 'a', email: 'a@b.c' }] })).toEqual({
      'users[0][username]': 'a',
      'users[0][email]': 'a@b.c',
    });
  });

  it('encodes booleans as 1/0', () => {
    /* PHP reads the string "false" as truthy, so sending it verbatim would
       invert the meaning of every boolean parameter. */
    expect(encodeParams({ visible: false, active: true })).toEqual({
      visible: '0',
      active: '1',
    });
  });

  it('flattens a scalar list', () => {
    expect(encodeParams({ values: ['x', 'y'] })).toEqual({
      'values[0]': 'x',
      'values[1]': 'y',
    });
  });

  it('omits null and undefined rather than sending the string "null"', () => {
    expect(encodeParams({ a: null, b: undefined, c: 1 })).toEqual({ c: '1' });
  });
});
