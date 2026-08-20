/**
 * Certificates (CLAUDE.md §2, §4.10, D-006, D-016).
 */

export const CERTIFICATE_TYPES = ['COURSE', 'PATH'] as const;

export type CertificateType = (typeof CERTIFICATE_TYPES)[number];

/**
 * A row in the learner's own gallery (§4.10).
 *
 * §4.10 is explicit about the contents — "title, date earned, view, download
 * (PDF). Nothing else" — so this carries no grade, no path context and no
 * verification id. The verification id is printed on the certificate itself,
 * which is where a holder shares it from; putting it in the gallery would be
 * one more thing on a screen the spec asks to keep bare.
 */
export interface CertificateSummary {
  id: string;
  type: CertificateType;
  /** The course title or path name, as printed on the certificate. */
  subjectTitle: string;
  /** ISO 8601. */
  issuedAt: string;
}

/**
 * What the **public** verification page is allowed to show (§2, D-016).
 *
 * This shape is a privacy boundary, not a convenience. A third party checking a
 * credential needs to know that it is real, who holds it, what it is for and
 * when it was issued — and nothing else. Employee id, email, department and the
 * quiz grade are all absent by construction, so widening the page means
 * widening this type, in a review, on purpose.
 *
 * The values are the ones **printed on the certificate**, copied at issue time
 * rather than joined from live rows: a renamed person or a re-synced course
 * title must never make this page contradict the paper it is verifying.
 */
export interface CertificateVerificationView {
  type: CertificateType;
  holderName: string;
  /** The course title or path name, as printed. */
  subjectTitle: string;
  /** ISO 8601. */
  issuedAt: string;
  /**
   * Always `true` when the record is returned at all — an unknown or revoked id
   * is a 404, never a payload saying "invalid". Present so the page renders a
   * positive statement rather than inferring validity from the absence of an
   * error, and so revocation (if the ministry ever asks for it) has somewhere
   * to land without changing the contract.
   */
  valid: true;
}
