/**
 * The single path from the browser to the API.
 *
 * Two things it centralises, both of which are easy to get wrong per-call:
 *
 *  - **Credentials.** `credentials: 'include'` on every request, because the
 *    session lives in an httpOnly cookie on a different origin. Omitting it on
 *    one call produces a mysterious 401.
 *  - **CSRF.** State-changing requests need the double-submit header. The token
 *    is fetched once and cached; a 403 CSRF_TOKEN_INVALID triggers exactly one
 *    refetch-and-retry, which covers the token expiring between page load and
 *    submission without risking a retry loop.
 *
 * The API returns error *codes*; translating them to Arabic is the caller's job
 * via the message catalogue (D-024), so no user-facing text lives here.
 */

import type {
  AdminDashboardView,
  AssessmentResultView,
  CertificateSummary,
  CvProfile,
  CvView,
  CertificateVerificationView,
  AssessmentSubmission,
  AssessmentView,
  CourseDetail,
  CourseLaunchView,
  CoursePlayerView,
  CourseLanguage,
  CoursePublication,
  CourseSummary,
  DashboardView,
  EntityAuthorLaunchView,
  EntityCourseContentView,
  EntityCourseDetail,
  EntityCourseSummary,
  EntityDashboardView,
  EntityLearnerRow,
  EntityProfileView,
  EntityUnpublishResult,
  MyPathView,
  PathDetail,
  PathRecommendations,
  UnreadNotificationsView,
} from '@tamkeen/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export class ApiError extends Error {
  constructor(
    /** Stable code from the API, e.g. INVALID_CREDENTIALS. */
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

/** Thrown when the request never reached the API at all. */
export class NetworkError extends Error {
  constructor() {
    super('NETWORK_ERROR');
    this.name = 'NetworkError';
  }
}

let csrfToken: string | null = null;

async function fetchCsrfToken(): Promise<string> {
  const response = await fetch(`${API_URL}/api/auth/csrf`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new ApiError('CSRF_UNAVAILABLE', response.status);
  }

  const body = (await response.json()) as { csrfToken: string };
  csrfToken = body.csrfToken;

  return body.csrfToken;
}

/**
 * Extracts the API's error code.
 *
 * Nest puts a single code in `message` for a thrown HttpException, but an array
 * of messages when the ValidationPipe rejects a body — the first is the useful
 * one for display.
 */
async function errorCodeOf(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    const message = body.message;

    if (Array.isArray(message)) {
      return message[0] ?? 'UNKNOWN_ERROR';
    }

    return message ?? 'UNKNOWN_ERROR';
  } catch {
    return 'UNKNOWN_ERROR';
  }
}

async function send(
  path: string,
  method: string,
  body: unknown,
  isRetry: boolean,
): Promise<Response> {
  const headers: Record<string, string> = {};

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (!SAFE_METHODS.has(method)) {
    headers['X-CSRF-Token'] = csrfToken ?? (await fetchCsrfToken());
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      credentials: 'include',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    /* fetch only rejects on a transport failure, so this is genuinely
       "the request did not arrive" rather than an error response. */
    throw new NetworkError();
  }

  if (response.status === 403 && !isRetry) {
    const code = await errorCodeOf(response);

    if (code === 'CSRF_TOKEN_INVALID') {
      /* The cached token went stale. Refresh once — never loop. */
      csrfToken = null;
      return send(path, method, body, true);
    }

    throw new ApiError(code, response.status);
  }

  return response;
}

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await send(path, method, body, false);

  if (!response.ok) {
    throw new ApiError(await errorCodeOf(response), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  /*
   * Nest sends a genuinely empty body (0 bytes, not the string "null" and not
   * "{}") when a handler returns `null` — "not assessed yet" and "no path yet"
   * both do this. `response.json()` calls `JSON.parse` on that empty body and
   * throws, which is what was actually reaching every caller as a generic
   * fetch failure instead of the null case they were written to expect.
   * Reading the raw text first and treating "" as `{}` restores the intended
   * empty-body -> null normalisation below, without changing it.
   */
  const text = await response.text();
  const parsed: unknown = text.length === 0 ? {} : JSON.parse(text);

  /*
   * Normalising Nest's empty-object-shaped "null" here means every caller can
   * test for null instead of each one remembering to check
   * `Object.keys(...).length` — which is the sort of thing exactly one caller
   * forgets.
   *
   * **Arrays are excluded deliberately.** `Object.keys([])` is also empty, so
   * without this guard an empty *list* would become `null` — and a view whose
   * `isEmpty` check reads `data?.length === 0` would then never show its empty
   * state, rendering a heading above nothing instead. That is precisely the bug
   * the catalogue e2e caught.
   */
  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    Object.keys(parsed).length === 0
  ) {
    return null as T;
  }

  return parsed as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, 'GET'),
  post: <T>(path: string, body?: unknown) => request<T>(path, 'POST', body),
  put: <T>(path: string, body?: unknown) => request<T>(path, 'PUT', body),
  /* PATCH rather than PUT for the entity metadata form: it saves one section at
     a time, and a PUT would silently clear whatever the caller did not
     resend. */
  patch: <T>(path: string, body?: unknown) => request<T>(path, 'PATCH', body),
};

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: 'EMPLOYEE' | 'ENTITY' | 'SUPER_ADMIN';
}

export const authApi = {
  register: (input: {
    email: string;
    password: string;
    fullName: string;
    employeeId: string;
    department: string;
  }) => api.post<{ status: string }>('/api/auth/register', input),

  verifyEmail: (token: string) => api.post<{ status: string }>('/api/auth/verify-email', { token }),

  resendVerification: (email: string) =>
    api.post<{ status: string }>('/api/auth/resend-verification', { email }),

  login: (input: { email: string; password: string }) =>
    api.post<{ user: CurrentUser }>('/api/auth/login', input),

  logout: () => api.post<{ status: string }>('/api/auth/logout'),

  me: () => api.get<CurrentUser>('/api/auth/me'),

  forgotPassword: (email: string) =>
    api.post<{ status: string }>('/api/auth/forgot-password', { email }),

  resetPassword: (token: string, password: string) =>
    api.post<{ status: string }>('/api/auth/reset-password', { token, password }),
};

/**
 * Phase 1 endpoints.
 *
 * Every response type comes from `@tamkeen/types`, the same declarations the API
 * returns, so a contract change is a compile error on both sides rather than a
 * runtime surprise on one.
 */
export const assessmentApi = {
  get: () => api.get<AssessmentView>('/api/assessment'),
  result: () => api.get<AssessmentResultView | null>('/api/assessment/result'),
  submit: (submission: AssessmentSubmission) =>
    api.post<AssessmentResultView>('/api/assessment/submit', submission),
};

export const pathsApi = {
  list: () => api.get<PathRecommendations>('/api/paths'),
  detail: (pathId: string) => api.get<PathDetail>(`/api/paths/${pathId}`),
};

export interface CourseFilters {
  q?: string;
  pathId?: string;
  maxDurationMinutes?: number;
}

export const coursesApi = {
  list: (filters: CourseFilters = {}) => {
    const query = new URLSearchParams();

    /* Only send filters that are actually set: the API rejects unknown and
       malformed parameters, so an empty `q=` would be a 400 rather than "no
       filter". */
    if (filters.q) query.set('q', filters.q);
    if (filters.pathId) query.set('pathId', filters.pathId);
    if (filters.maxDurationMinutes) {
      query.set('maxDurationMinutes', String(filters.maxDurationMinutes));
    }

    const suffix = query.toString();
    return api.get<CourseSummary[]>(`/api/courses${suffix ? `?${suffix}` : ''}`);
  },
  detail: (courseId: string) => api.get<CourseDetail>(`/api/courses/${courseId}`),
  player: (courseId: string) => api.get<CoursePlayerView>(`/api/courses/${courseId}/player`),
  /**
   * POST, though it reads like a fetch: it mints a short-lived credential, so it
   * must not be prefetched or cached, and as a POST it carries the CSRF token
   * every mutating request does (D-044).
   */
  launch: (courseId: string) => api.post<CourseLaunchView>(`/api/courses/${courseId}/launch`),
};

export const myPathApi = {
  get: () => api.get<MyPathView | null>('/api/my-path'),
  selectPath: (pathId: string) => api.post<void>('/api/my-path/select', { pathId }),
  setCourses: (courseIds: string[]) =>
    api.put<{ selectedCourseIds: string[] }>('/api/my-path/courses', { courseIds }),
  addCourse: (courseId: string) => api.post<void>('/api/my-path/courses', { courseId }),
  confirm: () => api.post<MyPathView>('/api/my-path/confirm'),
};

export const cvApi = {
  get: () => api.get<CvView>('/api/cv'),
  /** PUT: §4.11 asks for one save, and the document is written whole. */
  save: (profile: CvProfile) => api.put<CvView>('/api/cv', profile),
  /**
   * The export URL, not a fetch — the browser's own download handling beats
   * streaming bytes through JavaScript to re-offer them as a blob, and the
   * session cookie rides along as it does on any navigation.
   */
  exportUrl: () => `${API_URL}/api/cv/export`,
};

export const notificationsApi = {
  unread: () => api.get<UnreadNotificationsView>('/api/notifications/unread'),
  /** POST: it changes state, so it must not be prefetched or replayed. */
  markCertificatesRead: () => api.post<void>('/api/notifications/certificates/read'),
};

export const dashboardApi = {
  get: () => api.get<DashboardView>('/api/dashboard'),
};

export const certificatesApi = {
  /** The learner's own gallery (§4.10). */
  list: () => api.get<CertificateSummary[]>('/api/certificates'),

  /**
   * The URL of the stored PDF.
   *
   * A URL rather than a fetch: the browser's own PDF viewer and its download
   * handling are better than anything we would build, and streaming the bytes
   * through JavaScript to re-offer them as a blob would only add a way to get
   * it wrong. The session cookie rides along because it is a normal navigation.
   */
  fileUrl: (certificateId: string, disposition: 'inline' | 'attachment') =>
    `${API_URL}/api/certificates/${certificateId}/file${
      disposition === 'attachment' ? '?disposition=attachment' : ''
    }`,

  /**
   * The public verification lookup (§2, D-016).
   *
   * The only call here that works without a session. It still goes through this
   * client so it inherits one error shape and one place the API origin is
   * configured — `credentials: 'include'` is harmless on a route that ignores
   * the cookie, and diverging into a bare `fetch` would be a second way of
   * talking to the API for no gain.
   */
  verify: (verificationId: string) =>
    api.get<CertificateVerificationView>(
      `/api/certificates/verify/${encodeURIComponent(verificationId)}`,
    ),
};

/**
 * The entity / reviewer portal (§4B).
 *
 * Note what these calls do **not** take: no entity id anywhere. The server
 * resolves the caller's organisation from their session and filters every query
 * to it (D-062), so there is nothing for a client to pass — and nothing for a
 * modified client to pass in order to reach another entity's rows.
 */
export const entityApi = {
  profile: () => api.get<EntityProfileView | null>('/api/entity/me'),
  dashboard: () => api.get<EntityDashboardView>('/api/entity/dashboard'),

  listCourses: (filters: { q?: string; publication?: CoursePublication } = {}) => {
    const query = new URLSearchParams();

    /* Only send what is set: the API rejects unknown and malformed parameters,
       so an empty `q=` would be a 400 rather than "no filter". */
    if (filters.q) query.set('q', filters.q);
    if (filters.publication) query.set('publication', filters.publication);

    const suffix = query.toString();

    return api.get<EntityCourseSummary[]>(`/api/entity/courses${suffix ? `?${suffix}` : ''}`);
  },

  createCourse: (input: { title: string; summary: string; language?: CourseLanguage }) =>
    api.post<EntityCourseDetail>('/api/entity/courses', input),

  getCourse: (courseId: string) => api.get<EntityCourseDetail>(`/api/entity/courses/${courseId}`),

  updateCourse: (
    courseId: string,
    patch: {
      pathIds?: string[];
      durationMinutes?: number | null;
      objectives?: string[];
      prerequisites?: string | null;
      language?: CourseLanguage;
    },
  ) => api.patch<EntityCourseDetail>(`/api/entity/courses/${courseId}`, patch),

  content: (courseId: string) =>
    api.get<EntityCourseContentView | null>(`/api/entity/courses/${courseId}/content`),

  publish: (courseId: string) =>
    api.post<EntityCourseDetail>(`/api/entity/courses/${courseId}/publish`),

  unpublish: (courseId: string) =>
    api.post<EntityUnpublishResult>(`/api/entity/courses/${courseId}/unpublish`),

  /**
   * Mints the authoring handoff (D-060).
   *
   * A POST that returns a URL rather than a link the page could render: the URL
   * carries a live, single-use credential, so it must not sit in the DOM from
   * the moment the page loads (D-045). Called on the click, used immediately.
   */
  authorLaunch: (courseId: string) =>
    api.post<EntityAuthorLaunchView>(`/api/entity/courses/${courseId}/author-launch`),

  learners: (courseId?: string) =>
    api.get<EntityLearnerRow[]>(
      `/api/entity/learners${courseId ? `?courseId=${encodeURIComponent(courseId)}` : ''}`,
    ),
};

/**
 * The super-admin portal (§4C).
 *
 * A separate object from `entityApi` even though a super-admin may call some of
 * the entity routes (D-075). The two are different surfaces with different
 * guards, and merging them would make it hard to see, from the client alone,
 * which calls require which role.
 */
export const adminApi = {
  dashboard: () => api.get<AdminDashboardView>('/api/admin/dashboard'),
};
