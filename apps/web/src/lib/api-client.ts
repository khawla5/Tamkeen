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
  AdminAssessmentDraft,
  AdminAttachableCourse,
  AdminCoursePage,
  AdminCourseRow,
  AdminPathBounds,
  AdminAuditPage,
  AdminCertificateTemplateView,
  AdminReports,
  AdminSettingsView,
  AdminPathDetail,
  AdminPathRow,
  AdminAssessmentOverview,
  AdminAssessmentVersion,
  AdminDashboardView,
  AdminEntityRow,
  AdminInviteResult,
  AdminRegistrationPolicyView,
  AdminUserDetail,
  AdminUserPage,
  AdminUserRow,
  RiasecLetter,
  UserRole,
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
  CourseStatus,
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
  NumberFormat,
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
  /* Used only where something is genuinely removed. Nothing a *learner* touches
     is deletable — §2 forbids it for courses, D-033 for results — so this exists
     for the admin portal's drafts, which are the one thing in the product with
     no history worth keeping. */
  delete: <T>(path: string) => request<T>(path, 'DELETE'),
};

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  employeeId: string;
  department: string;
  role: 'EMPLOYEE' | 'ENTITY' | 'SUPER_ADMIN';
  /** The person's digits choice, or null to follow the system (§4.12). */
  numberFormat: NumberFormat | null;
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

  /** §4.12: change your own password, proving the current one. */
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) =>
    api.post<void>('/api/auth/change-password', {
      currentPassword,
      newPassword,
      confirmPassword,
    }),

  /**
   * §4.12: ask to move the account to a new address.
   *
   * Nothing changes until the link sent to the new inbox is opened — which is
   * why the response says "pending" rather than "done".
   */
  changeEmail: (newEmail: string, currentPassword: string) =>
    api.post<{ status: string }>('/api/auth/change-email', { newEmail, currentPassword }),

  /** §4.12: complete the move, from the link in the new inbox. */
  confirmEmailChange: (token: string) =>
    api.post<{ status: string }>('/api/auth/confirm-email-change', { token }),

  /** §4.12: which digits you read. Null follows the system default (D-018). */
  setNumberFormat: (numberFormat: NumberFormat | null) =>
    api.patch<void>('/api/auth/me/preferences', { numberFormat }),

  resetPassword: (token: string, password: string) =>
    api.post<{ status: string }>('/api/auth/reset-password', { token, password }),
};

/** §4.12 — an employee's own profile: name and department, saved together. */
export const profileApi = {
  update: (input: { fullName: string; department: string }) =>
    api.patch<CurrentUser>('/api/me/profile', input),
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
  /** §4B.6 — the account's own name and the organisation's contact, one save. */
  updateProfile: (input: { fullName: string; contactName: string; contactEmail: string }) =>
    api.patch<EntityProfileView>('/api/entity/me', input),
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

  // §4C.2 — users and organisations
  listUsers: (
    filters: {
      q?: string;
      role?: UserRole;
      status?: 'ACTIVE' | 'SUSPENDED';
      entityId?: string;
      unverified?: boolean;
      page?: number;
    } = {},
  ) => {
    const query = new URLSearchParams();

    /* Only what is set. The API rejects unknown and malformed parameters, so an
       empty `q=` would be a 400 rather than "no filter". */
    if (filters.q) query.set('q', filters.q);
    if (filters.role) query.set('role', filters.role);
    if (filters.status) query.set('status', filters.status);
    if (filters.entityId) query.set('entityId', filters.entityId);
    if (filters.unverified) query.set('unverified', 'true');
    if (filters.page && filters.page > 1) query.set('page', String(filters.page));

    const suffix = query.toString();

    return api.get<AdminUserPage>(`/api/admin/users${suffix ? `?${suffix}` : ''}`);
  },

  getUser: (userId: string) => api.get<AdminUserDetail>(`/api/admin/users/${userId}`),

  /** Provisions an account. Returns an invitation, never a password. */
  createUser: (input: {
    email: string;
    fullName: string;
    employeeId: string;
    department: string;
    role: UserRole;
    entityId?: string;
  }) => api.post<AdminInviteResult>('/api/admin/users', input),

  reinvite: (userId: string) =>
    api.post<AdminInviteResult>(`/api/admin/users/${userId}/invite`, {}),

  setUserStatus: (userId: string, status: 'ACTIVE' | 'SUSPENDED') =>
    api.patch<AdminUserRow>(`/api/admin/users/${userId}/status`, { status }),

  setUserRole: (userId: string, role: UserRole, entityId?: string) =>
    api.patch<AdminUserRow>(`/api/admin/users/${userId}/role`, { role, entityId }),

  registrationPolicy: () => api.get<AdminRegistrationPolicyView>('/api/admin/registration-policy'),

  listEntities: (q?: string) =>
    api.get<AdminEntityRow[]>(`/api/admin/entities${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  createEntity: (input: {
    key: string;
    name: string;
    contactName?: string;
    contactEmail?: string;
  }) => api.post<AdminEntityRow>('/api/admin/entities', input),

  updateEntity: (
    entityId: string,
    patch: {
      name?: string;
      contactName?: string;
      contactEmail?: string;
      status?: 'ACTIVE' | 'SUSPENDED';
    },
  ) => api.patch<AdminEntityRow>(`/api/admin/entities/${entityId}`, patch),

  // §4C.3 — the assessment
  assessmentOverview: () => api.get<AdminAssessmentOverview>('/api/admin/assessment'),

  /**
   * The draft bank, weights included.
   *
   * The one call in this client that receives RIASEC weightings. It answers only
   * to a SUPER_ADMIN session; the learner's `assessmentApi.getActive()` returns
   * the same questions with the weights stripped (D-034), and an integration
   * test greps that response to keep it that way.
   */
  assessmentDraft: () => api.get<AdminAssessmentDraft>('/api/admin/assessment/draft'),

  createAssessmentDraft: () => api.post<AdminAssessmentDraft>('/api/admin/assessment/draft', {}),

  discardAssessmentDraft: () => api.delete<void>('/api/admin/assessment/draft'),

  updateAssessmentDraft: (patch: { title?: string; description?: string }) =>
    api.patch<AdminAssessmentDraft>('/api/admin/assessment/draft', patch),

  addDraftQuestion: (input: { text: string; letter: RiasecLetter }) =>
    api.post<AdminAssessmentDraft>('/api/admin/assessment/draft/questions', input),

  updateDraftQuestion: (questionId: string, patch: { text?: string }) =>
    api.patch<AdminAssessmentDraft>(`/api/admin/assessment/draft/questions/${questionId}`, patch),

  removeDraftQuestion: (questionId: string) =>
    api.delete<AdminAssessmentDraft>(`/api/admin/assessment/draft/questions/${questionId}`),

  reorderDraft: (questionIds: string[]) =>
    api.patch<AdminAssessmentDraft>('/api/admin/assessment/draft/order', { questionIds }),

  updateDraftOption: (
    optionId: string,
    patch: { label?: string; weights?: Partial<Record<RiasecLetter, number>> },
  ) => api.patch<AdminAssessmentDraft>(`/api/admin/assessment/draft/options/${optionId}`, patch),

  publishAssessment: () =>
    api.post<AdminAssessmentVersion>('/api/admin/assessment/draft/publish', {}),

  assessmentVersion: (assessmentId: string) =>
    api.get<AdminAssessmentDraft>(`/api/admin/assessment/versions/${assessmentId}`),

  // §4C.4 — study paths
  listPaths: () => api.get<AdminPathRow[]>('/api/admin/paths'),

  /** The 5-10 rule. Read-only: there is no endpoint that writes it (D-074). */
  pathBounds: () => api.get<AdminPathBounds>('/api/admin/paths/bounds'),

  getPath: (pathId: string) => api.get<AdminPathDetail>(`/api/admin/paths/${pathId}`),

  /** Courses not already in the path — drafts and hidden ones included. */
  attachableCourses: (pathId: string, q?: string) =>
    api.get<AdminAttachableCourse[]>(
      `/api/admin/paths/${pathId}/attachable${q ? `?q=${encodeURIComponent(q)}` : ''}`,
    ),

  createPath: (input: {
    key: string;
    name: string;
    description: string;
    riasecLetter: RiasecLetter;
    typicalDurationMinutes?: number;
  }) => api.post<AdminPathDetail>('/api/admin/paths', input),

  updatePath: (
    pathId: string,
    patch: {
      name?: string;
      description?: string;
      riasecLetter?: RiasecLetter;
      typicalDurationMinutes?: number;
      displayOrder?: number;
      isActive?: boolean;
    },
  ) => api.patch<AdminPathDetail>(`/api/admin/paths/${pathId}`, patch),

  /** Permanent removal, refused for any path somebody ever chose (§4C.4). */
  deletePath: (pathId: string) => api.delete<void>(`/api/admin/paths/${pathId}`),

  attachPathCourse: (pathId: string, courseId: string) =>
    api.post<AdminPathDetail>(`/api/admin/paths/${pathId}/courses`, { courseId }),

  detachPathCourse: (pathId: string, courseId: string) =>
    api.delete<AdminPathDetail>(`/api/admin/paths/${pathId}/courses/${courseId}`),

  reorderPathCourses: (pathId: string, courseIds: string[]) =>
    api.patch<AdminPathDetail>(`/api/admin/paths/${pathId}/courses/order`, { courseIds }),

  // §4C.5 — course oversight
  listCourses: (
    filters: {
      q?: string;
      publication?: CoursePublication;
      status?: CourseStatus;
      entityId?: string;
      unowned?: boolean;
      page?: number;
    } = {},
  ) => {
    const query = new URLSearchParams();

    if (filters.q) query.set('q', filters.q);
    if (filters.publication) query.set('publication', filters.publication);
    if (filters.status) query.set('status', filters.status);
    if (filters.entityId) query.set('entityId', filters.entityId);
    if (filters.unowned) query.set('unowned', 'true');
    if (filters.page && filters.page > 1) query.set('page', String(filters.page));

    const suffix = query.toString();

    return api.get<AdminCoursePage>(`/api/admin/courses${suffix ? `?${suffix}` : ''}`);
  },

  /** Hide, restore, or place a course with an organisation. Never sets status. */
  interveneCourse: (
    courseId: string,
    patch: { publication?: CoursePublication; ownerEntityId?: string | null },
  ) => api.patch<AdminCourseRow>(`/api/admin/courses/${courseId}`, patch),

  // §4C.6 — system settings
  settings: () => api.get<AdminSettingsView>('/api/admin/settings'),

  updateSetting: (key: string, value: string) =>
    api.patch<AdminSettingsView>(`/api/admin/settings/${key}`, { value }),

  /** Returns a knob to the environment's value. */
  resetSetting: (key: string) => api.delete<AdminSettingsView>(`/api/admin/settings/${key}`),

  /**
   * §4C.7 — the certificate face and a rendered preview of it.
   *
   * Read-only: the signature block is three settings, and `updateSetting` above
   * is the one writer for those rows (D-072).
   */
  certificateTemplate: () =>
    api.get<AdminCertificateTemplateView>('/api/admin/certificate-template'),

  // §4C.8 — audit and reports
  auditLog: (
    filters: { action?: string; outcome?: 'SUCCESS' | 'FAILURE'; before?: string } = {},
  ) => {
    const query = new URLSearchParams();

    if (filters.action) query.set('action', filters.action);
    if (filters.outcome) query.set('outcome', filters.outcome);
    if (filters.before) query.set('before', filters.before);

    const suffix = query.toString();

    return api.get<AdminAuditPage>(`/api/admin/audit${suffix ? `?${suffix}` : ''}`);
  },

  reports: () => api.get<AdminReports>('/api/admin/reports'),

  /**
   * Where the CSV exports live.
   *
   * Plain URLs rather than a fetch-and-blob: the session is an httpOnly cookie
   * on the API's origin, so an ordinary link carries it and the browser handles
   * the download — while a fetched blob would need the bytes in memory and a
   * synthetic anchor to save them.
   */
  reportsCsvUrl: () => `${API_URL}/api/admin/reports.csv`,

  auditCsvUrl: (filters: { action?: string; outcome?: 'SUCCESS' | 'FAILURE' } = {}) => {
    const query = new URLSearchParams();

    if (filters.action) query.set('action', filters.action);
    if (filters.outcome) query.set('outcome', filters.outcome);

    const suffix = query.toString();

    return `${API_URL}/api/admin/audit.csv${suffix ? `?${suffix}` : ''}`;
  },
};
