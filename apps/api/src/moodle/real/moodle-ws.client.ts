import { Logger } from '@nestjs/common';

import { LmsUnavailableError } from '../lms.types';

/**
 * The Moodle Web Services transport — the only place that speaks HTTP to Moodle.
 *
 * Everything Moodle-shaped stops here: the single `server.php` endpoint, PHP's
 * nested form encoding, and the protocol's most dangerous quirk —
 *
 *   **core REST answers HTTP 200 even for errors**, putting `{errorcode,
 *   message, exception}` in the *body* instead. The Catalyst RESTful plugin is
 *   what would give real status codes, and it is not installed here.
 *
 * So the status line proves nothing and the body must be inspected on every
 * call. This was verified against a live Moodle 5.2.2 in the Phase 2 spike, not
 * taken from documentation. The client handles both worlds, so installing the
 * Catalyst plugin later changes nothing for callers.
 *
 * **The token never leaves this file.** It is posted in the request body and is
 * never logged, never interpolated into an error message, and never included in
 * anything thrown — a Moodle debug response can echo the request it received, so
 * no response body is ever put into an error either. Only its length is.
 */

/** Moodle errorcodes that mean "the token or its permissions are wrong". */
const UNAUTHORISED_CODES = new Set([
  'invalidtoken',
  'accessexception',
  'invalidlogin',
  'sitemaintenance',
  'servicenotavailable',
  'accessdenied',
  'nopermissions',
  'requireloginerror',
  'wsaccessuserdeleted',
  'wsaccessusersuspended',
  'wsaccessuserunconfirmed',
  'wsaccessusernologin',
]);

/**
 * A web-service call that failed for a *domain* reason — the user is not
 * enrolled, the course has no completion criteria, the parameter was rejected.
 *
 * Deliberately distinct from `LmsUnavailableError`: these are answers, not
 * outages, and the adapter translates several of them into ordinary values
 * (`usernotenroled` → `null`). It stays inside `src/moodle` — the `errorcode` is
 * Moodle vocabulary and must not reach a caller.
 */
export class MoodleWsError extends Error {
  constructor(
    readonly wsfunction: string,
    readonly errorcode: string,
  ) {
    super(`Moodle ${wsfunction} failed: ${errorcode}`);
    this.name = 'MoodleWsError';
  }
}

export interface MoodleWsClientOptions {
  baseUrl: string;
  token: string;
  timeoutMs: number;
  /** Injectable so unit tests can mock the HTTP layer without a server. */
  fetchImpl?: typeof fetch;
}

export class MoodleWsClient {
  private readonly logger = new Logger(MoodleWsClient.name);
  private readonly endpoint: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: MoodleWsClientOptions) {
    this.endpoint = `${options.baseUrl.replace(/\/+$/, '')}/webservice/rest/server.php`;
    this.token = options.token;
    this.timeoutMs = options.timeoutMs;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async call<T>(wsfunction: string, params: Record<string, unknown> = {}): Promise<T> {
    const body = new URLSearchParams({
      wstoken: this.token,
      wsfunction,
      moodlewsrestformat: 'json',
      ...encodeParams(params),
    });

    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      /* Timeouts and connection failures are the same operational fact to a
         caller: Moodle is not answering. The cause is logged, not thrown, so no
         connection detail reaches an HTTP response. */
      this.logger.warn(
        `Moodle ${wsfunction} unreachable: ${cause instanceof Error ? cause.name : 'unknown'}`,
      );
      throw new LmsUnavailableError('UNREACHABLE');
    }

    const text = await response.text();

    let payload: unknown;
    try {
      payload = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      /* Never echo the body — a PHP fatal error or debug dump can contain the
         token that was posted. The length is enough to diagnose with. */
      this.logger.error(
        `Moodle ${wsfunction} returned non-JSON: HTTP ${response.status}, ${text.length} bytes`,
      );
      throw new LmsUnavailableError('UNEXPECTED_RESPONSE');
    }

    const exception = readException(payload);

    if (exception) {
      if (UNAUTHORISED_CODES.has(exception.errorcode)) {
        /* The message is Moodle's, not ours, and can name the capability that is
           missing — useful in a log, never in a response. */
        this.logger.error(`Moodle ${wsfunction} rejected: ${exception.errorcode}`);
        throw new LmsUnavailableError('UNAUTHORISED');
      }

      /* Only the errorcode is carried. Moodle's human-readable `message` is an
         unbounded string from an external system that can echo the request it
         received — including the token — and nothing branches on it. Keeping it
         out makes "no credential in a thrown error" structural rather than a
         hope about Moodle's phrasing. */
      throw new MoodleWsError(wsfunction, exception.errorcode);
    }

    if (!response.ok) {
      /* Reached only with the Catalyst RESTful plugin installed, which gives real
         status codes. Without it Moodle answers 200 and the branch above caught
         the failure instead. Both paths must work so installing the plugin is
         not a behavioural change. */
      if (response.status === 401 || response.status === 403) {
        throw new LmsUnavailableError('UNAUTHORISED');
      }

      this.logger.error(`Moodle ${wsfunction} returned HTTP ${response.status}`);
      throw new LmsUnavailableError(response.status >= 500 ? 'UNREACHABLE' : 'UNEXPECTED_RESPONSE');
    }

    return payload as T;
  }
}

/** Moodle's error envelope, when the body carries one. */
function readException(payload: unknown): { errorcode: string; message: string } | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;

  if (!('exception' in record)) {
    return null;
  }

  return {
    errorcode: typeof record.errorcode === 'string' ? record.errorcode : 'unknown',
    message: typeof record.message === 'string' ? record.message : '',
  };
}

/**
 * Flattens to PHP's nested form syntax — `users[0][username]=…`.
 *
 * Moodle's REST server parses parameters out of `$_POST`, so a structured call
 * has to be expressed in PHP's array notation rather than as JSON.
 */
export function encodeParams(value: unknown, prefix = '', out: Record<string, string> = {}) {
  if (value === null || value === undefined) {
    return out;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      encodeParams(item, prefix ? `${prefix}[${index}]` : String(index), out),
    );
    return out;
  }

  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      encodeParams(item, prefix ? `${prefix}[${key}]` : key, out);
    }
    return out;
  }

  if (typeof value === 'boolean') {
    /* PHP reads "false" as truthy, so booleans must go over the wire as 1/0. */
    out[prefix] = value ? '1' : '0';
    return out;
  }

  out[prefix] = String(value);
  return out;
}
