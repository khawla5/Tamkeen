/**
 * Client-side mirror of the server's password policy.
 *
 * The server is authoritative — `PASSWORD_MIN_LENGTH` is validated there and
 * rejection is enforced there. This exists only so the form can *tell the user
 * the rule up front* instead of letting them discover it by failing a
 * submission. A mismatch degrades the hint, never the enforcement.
 *
 * Not fetched from the API: that would mean a round trip before the form can
 * render its own label, for a value that changes about once a decade.
 */
export const PASSWORD_MIN_LENGTH = 12;

/**
 * Client-side mirror of the server's employee-id shape (`EMPLOYEE_ID_PATTERN`
 * in the API's environment; the default is below). Same status as the password
 * rule above: the server is authoritative, this only lets the form say so
 * before a round trip. Must be kept in step with the deployed value.
 */
export const EMPLOYEE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{3,19}$/;

/** A full name shorter than this cannot be a name. */
export const FULL_NAME_MIN_LENGTH = 3;

/**
 * The ministry's departments, as the registration dropdown offers them.
 * PLACEHOLDER until the ministry supplies the official list (tracked in
 * progress.md). The server still accepts any non-empty department string;
 * tightening it to this list is a server change for when the list is real.
 */
export const DEPARTMENTS: readonly string[] = [
  'الإدارة العامة للتدريب',
  'الأمن العام',
  'المديرية العامة للجوازات',
  'الأحوال المدنية',
  'المديرية العامة للدفاع المدني',
  'الإدارة العامة للمرور',
  'تقنية المعلومات',
  'الموارد البشرية',
  'الشؤون المالية',
  'الشؤون القانونية',
];
