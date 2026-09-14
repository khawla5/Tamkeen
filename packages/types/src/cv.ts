import type { CertificateType } from './certificates';

/**
 * The CV builder (§4.11, D-050).
 *
 * **The CV is an English (LTR) document.** The builder's chrome stays
 * Arabic-first like the rest of the product, but what the learner types and
 * what the PDF renders are English. System-injected proper nouns — their name,
 * department, path name, RIASEC type names, certificate and course titles —
 * **pass through as authored**, which in practice means Arabic. That is normal
 * and correct on an English CV, and it is why the PDF pipeline had to prove an
 * English body with inline Arabic runs before any of this was built.
 *
 * The split below is the important part of the model:
 *
 *  - `CvProfile` is what the learner **authors**, and is stored.
 *  - `CvAutofill` is what the system **knows**, and is never stored — it is
 *    read fresh from the certificates, the profile and the assessment on every
 *    load. Copying it into the saved document would let a learner's CV claim a
 *    certificate they no longer hold, or drift from their real record.
 */

/* Bounds are part of the contract, not just server hygiene: the builder shows
   the same limits, and unbounded user-authored JSON is a storage and rendering
   hazard in a document that gets rendered by a browser. */
export const CV_MAX_EXPERIENCE = 20;
export const CV_MAX_EDUCATION = 10;
export const CV_MAX_SKILLS = 40;
export const CV_MAX_EXTERNAL_CERTIFICATIONS = 20;
export const CV_MAX_SHORT_TEXT = 120;
export const CV_MAX_SUMMARY = 800;
export const CV_MAX_DESCRIPTION = 600;

export interface CvExperienceEntry {
  /** Client-generated, stable across reorders so React keys and edits behave. */
  id: string;
  role: string;
  organization: string;
  /** `YYYY-MM`. Formatted for display through `format.ts`, never by the caller. */
  startDate: string;
  /** `YYYY-MM`, or null for "current". */
  endDate: string | null;
  description: string;
}

export interface CvEducationEntry {
  id: string;
  qualification: string;
  institution: string;
  startYear: number | null;
  endYear: number | null;
}

/** A certification the learner earned elsewhere and typed in themselves. */
export interface CvExternalCertification {
  id: string;
  title: string;
  issuer: string;
  /** `YYYY-MM`, or null when they do not recall the month. */
  issuedOn: string | null;
}

/** Everything the learner authors. Persisted as one document per user. */
export interface CvProfile {
  /**
   * Pre-filled from the account but editable — a learner writing an English CV
   * may want a Latin form of a name the ministry holds in Arabic (D-050).
   */
  fullName: string;
  jobTitle: string;
  department: string;
  email: string;
  phone: string;
  summary: string;
  experience: CvExperienceEntry[];
  education: CvEducationEntry[];
  skills: string[];
  externalCertifications: CvExternalCertification[];
  /**
   * §4.11 lets the learner switch off the career-orientation line. The
   * underlying result is not hidden or changed — only whether the CV prints it.
   */
  showCareerProfile: boolean;
}

/** A certificate this platform issued. Read-only on the CV. */
export interface CvPlatformCertification {
  certificateId: string;
  type: CertificateType;
  /** As printed on the certificate. */
  title: string;
  /** ISO 8601. */
  issuedAt: string;
}

/**
 * What the system contributes, recomputed on every load.
 *
 * A learner may choose not to print the career-profile line, and may hide
 * nothing else: platform certifications are the CV's core value precisely
 * because they are not self-reported, so they are neither editable nor
 * removable here.
 */
export interface CvAutofill {
  /** From the account, offered as the starting point for the fields above. */
  accountFullName: string;
  accountDepartment: string;
  accountEmail: string;
  /** Every certificate the learner holds, newest first. */
  certifications: CvPlatformCertification[];
  /** Null until the ministry assigns them a path. */
  careerProfile: CvCareerProfile | null;
}

/**
 * What the platform can say about this person's training (§4.11, D-134).
 *
 * The Holland profile is gone with the instrument that produced it. What
 * replaces it is the thing a CV reader can actually use: which paths the
 * ministry put them on, what level they were placed at, and whether they
 * finished. Empty while they hold no path.
 */
export interface CvCareerProfile {
  paths: Array<{
    name: string;
    /** The rung they were placed on; null while the assessment is untaken. */
    levelName: string | null;
    /** Finished — the difference between "completed" and "on". */
    completed: boolean;
  }>;
}

/** What the builder loads and the preview renders. */
export interface CvView {
  profile: CvProfile;
  autofill: CvAutofill;
  /** Null until the learner saves for the first time. ISO 8601. */
  savedAt: string | null;
}

/**
 * The starting document for a learner who has never saved one.
 *
 * Built here rather than in the API so the builder can render an unsaved CV
 * identically to a saved one — there is no "empty" state to design, only a
 * document that has not been edited yet.
 */
export function emptyCvProfile(autofill: {
  accountFullName: string;
  accountDepartment: string;
  accountEmail: string;
}): CvProfile {
  return {
    fullName: autofill.accountFullName,
    jobTitle: '',
    department: autofill.accountDepartment,
    email: autofill.accountEmail,
    phone: '',
    summary: '',
    experience: [],
    education: [],
    skills: [],
    externalCertifications: [],
    showCareerProfile: true,
  };
}
