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
