import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ApiClientModule = typeof import('./api-client');

/**
 * The client centralises credentials and CSRF, and both are the kind of detail
 * that silently breaks: a missing `credentials: 'include'` reads as a mysterious
 * 401, and a stale CSRF token as an unexplained 403.
 */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api-client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let authApi: ApiClientModule['authApi'];
  let ApiError: ApiClientModule['ApiError'];
  let NetworkError: ApiClientModule['NetworkError'];

  beforeEach(async () => {
    /* The CSRF token is cached at module scope — a deliberate optimisation in the
       browser, but it would leak between tests. Reload the module each time so
       every test starts with an empty cache. */
    vi.resetModules();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const loaded: ApiClientModule = await import('./api-client');
    authApi = loaded.authApi;
    ApiError = loaded.ApiError;
    NetworkError = loaded.NetworkError;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** First call answers the CSRF fetch; subsequent calls answer the real request. */
  function withCsrf(...responses: Response[]) {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'csrf-token-value' }));
    for (const response of responses) {
      fetchMock.mockResolvedValueOnce(response);
    }
  }

  it('sends credentials on every request', async () => {
    withCsrf(jsonResponse(200, { status: 'RESET_EMAIL_SENT' }));

    await authApi.forgotPassword('a@ministry.gov.example');

    for (const call of fetchMock.mock.calls) {
      expect(call[1]).toMatchObject({ credentials: 'include' });
    }
  });

  it('attaches the CSRF header to state-changing requests', async () => {
    withCsrf(jsonResponse(200, { status: 'ok' }));

    await authApi.forgotPassword('a@ministry.gov.example');

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post?.[1].headers).toMatchObject({ 'X-CSRF-Token': 'csrf-token-value' });
  });

  it('does not fetch a CSRF token for a GET', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: '1', role: 'EMPLOYEE' }));

    await authApi.me();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![1].headers).not.toHaveProperty('X-CSRF-Token');
  });

  it('throws ApiError carrying the code from the response', async () => {
    withCsrf(jsonResponse(401, { message: 'INVALID_CREDENTIALS' }));

    await expect(authApi.login({ email: 'a@b.co', password: 'x' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      status: 401,
    });
  });

  it('takes the first message when the ValidationPipe returns an array', async () => {
    withCsrf(jsonResponse(400, { message: ['PASSWORD_TOO_SHORT', 'EMAIL_INVALID'] }));

    await expect(
      authApi.register({
        email: 'a@b.co',
        password: 'x',
        fullName: 'n',
        employeeId: 'E-0001',
        department: 'd',
      }),
    ).rejects.toMatchObject({ code: 'PASSWORD_TOO_SHORT' });
  });

  it('retries once with a fresh token when the CSRF token is stale', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'stale' }));
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { message: 'CSRF_TOKEN_INVALID' }));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'fresh' }));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: 'ok' }));

    await expect(authApi.forgotPassword('a@ministry.gov.example')).resolves.toEqual({
      status: 'ok',
    });

    const sent = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'POST')
      .map(([, init]) => init.headers['X-CSRF-Token']);

    expect(sent).toEqual(['stale', 'fresh']);
  });

  it('does not retry a 403 that is not a CSRF failure', async () => {
    withCsrf(jsonResponse(403, { message: 'SELF_REGISTRATION_DISABLED' }));

    await expect(
      authApi.register({
        email: 'a@b.co',
        password: 'x'.repeat(12),
        fullName: 'n',
        employeeId: 'E-0001',
        department: 'd',
      }),
    ).rejects.toBeInstanceOf(ApiError);

    /* CSRF fetch + the single POST. No second attempt. */
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports a transport failure as NetworkError, not as an API error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'token' }));
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(authApi.forgotPassword('a@ministry.gov.example')).rejects.toBeInstanceOf(
      NetworkError,
    );
  });

  it('falls back to UNKNOWN_ERROR when the body is not JSON', async () => {
    withCsrf(new Response('<html>502</html>', { status: 502 }));

    await expect(authApi.forgotPassword('a@ministry.gov.example')).rejects.toMatchObject({
      code: 'UNKNOWN_ERROR',
    });
  });
});
