import type { CvAutofill, CvProfile } from './cv';
import { CV_FORMAT_CONTEXT, formatDate, formatMonthYear, formatYear } from './format';
import type { RiasecLetter } from './riasec';

/**
 * The CV document itself — one renderer, used by both the live preview and the
 * exported PDF (§4.11, D-050).
 *
 * **Why this lives in `@tamkeen/types` rather than in either app.** §4.11 asks
 * for a live preview *and* a PDF export, and a preview that differs from the
 * export is worse than no preview: it promises the learner something the file
 * will not deliver. Two implementations of the same layout would drift on the
 * first change either side. This is the same reasoning that put `format.ts`
 * here (D-024) — "a certificate PDF disagreeing with the screen that announced
 * it is a real failure mode" — applied to the document as a whole rather than
 * just its dates.
 *
 * It stays within the package's charter: no runtime dependencies, no framework
 * code, one pure function from data to a string.
 *
 * **The document is English and LTR** (D-050). Proper nouns the system supplies
 * — the learner's name, their department, the path, RIASEC type names,
 * certificate titles — pass through in whatever language they were authored,
 * which in practice is Arabic. Arabic runs inside an English CV are expected
 * and correct; the PDF spike proved the pipeline renders them with the right
 * shaping and bidi placement before any of this was written.
 *
 * Every rule is scoped under `.cv-document` so the preview can inject this CSS
 * into a page that has styles of its own without either leaking into the other.
 */

export interface CvDocumentInput {
  profile: CvProfile;
  autofill: CvAutofill;
  /**
   * Arabic RIASEC type names, supplied by the caller.
   *
   * Not defined here: `riasec.ts` is deliberately free of Arabic copy, because
   * the letters are domain facts and the names are user-facing text. The web
   * passes them from the message catalogue; the API passes its own copy, the
   * way it already does for email and certificate templates.
   */
  riasecNames: Record<RiasecLetter, string>;
}

const NAVY = '#222e42';
const NAVY_2 = '#2e3a50';
const GOLD = '#a8863c';
const MUTED = '#5e6b85';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Scoped stylesheet. Identical in the preview and the PDF. */
export function cvDocumentCss(): string {
  return `
.cv-document {
  direction: ltr;
  text-align: left;
  color: ${NAVY};
  background: #ffffff;
  font-size: 12.5px;
  line-height: 1.55;
  padding: 16mm 18mm;
}
.cv-document * { box-sizing: border-box; margin: 0; padding: 0; }
.cv-document h1 { font-size: 25px; font-weight: 700; letter-spacing: -0.2px; }
.cv-document h2 {
  font-size: 11px; font-weight: 700; letter-spacing: 1.2px;
  text-transform: uppercase; color: ${GOLD}; margin-bottom: 8px;
}
.cv-document h3 { font-size: 14px; font-weight: 600; }
.cv-document .cv-header { border-bottom: 2px solid ${GOLD}; padding-bottom: 12px; margin-bottom: 18px; }
.cv-document .cv-role { margin-top: 6px; font-size: 13px; color: ${NAVY_2}; }
.cv-document .cv-contact { margin-top: 4px; font-size: 12px; color: ${MUTED}; }
.cv-document .cv-section { margin-bottom: 18px; }
.cv-document .cv-entry { margin-bottom: 14px; }
.cv-document .cv-entry:last-child { margin-bottom: 0; }
.cv-document .cv-entry-head {
  display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
}
.cv-document .cv-dates { font-size: 12px; color: ${MUTED}; white-space: nowrap; }
.cv-document .cv-org { font-size: 13px; color: ${NAVY_2}; margin: 2px 0 4px; }
.cv-document .cv-note { font-size: 12.5px; color: ${MUTED}; }
.cv-document .cv-body { font-size: 12.5px; color: ${NAVY_2}; }
.cv-document ul { list-style: none; }
.cv-document .cv-cert { margin-bottom: 9px; }
.cv-document .cv-cert-title { font-size: 13px; }
.cv-document .cv-cert-meta { font-size: 11.5px; color: ${MUTED}; }
.cv-document .cv-skills { font-size: 12.5px; color: ${NAVY_2}; line-height: 1.9; }
/* An Arabic run inside an English line: RTL internally, positioned by the
   surrounding LTR flow. Marking it explicitly rather than relying on the
   bidi algorithm alone keeps neutral characters — parentheses, commas —
   on the correct side of the run. */
.cv-document [lang='ar'] { direction: rtl; unicode-bidi: isolate; }
`.trim();
}

/**
 * An Arabic proper noun passing through as authored (D-050).
 *
 * `dir="rtl"` is what makes this safe inside an English sentence: the HTML `dir`
 * attribute implies `unicode-bidi: isolate`, so the run is treated as a single
 * neutral object by the surrounding LTR flow. Neutrals *around* it — the
 * separators between RIASEC names, the full stop ending the sentence — then
 * resolve against the paragraph's LTR direction and land where an English
 * reader expects.
 *
 * Verified rather than assumed: rendered at size, `الاجتماعي · البحثي ·
 * المبادِر.` reads S, I, E left to right with the stop at the far right. An
 * explicit `&lrm;` after each run was tried and changed nothing, so it is not
 * here — isolation already does the work, and a redundant control character
 * would only look like it was load-bearing.
 */
function ar(value: string): string {
  return `<span dir="rtl" lang="ar">${escapeHtml(value)}</span>`;
}

function dateRange(start: string, end: string | null): string {
  const from = formatMonthYear(start);
  /* "Present" rather than an open dash: §4.11 names "current" as a state, and a
     CV that trails off reads as unfinished. */
  return `${from} – ${end ? formatMonthYear(end) : 'Present'}`;
}

function yearRange(start: number | null, end: number | null): string {
  if (start && end) return `${formatYear(start)} – ${formatYear(end)}`;
  if (end) return formatYear(end);
  if (start) return formatYear(start);
  return '';
}

function section(title: string, body: string): string {
  return body.trim().length === 0
    ? ''
    : `<section class="cv-section"><h2>${title}</h2>${body}</section>`;
}

/** The document body, without the `.cv-document` wrapper. */
export function cvDocumentBody(input: CvDocumentInput): string {
  const { profile, autofill } = input;

  const contact = [profile.email, profile.phone].filter((part) => part.trim().length > 0);
  const departmentLine = profile.department.trim().length > 0 ? ar(profile.department) : '';

  const careerLine =
    profile.showCareerProfile && autofill.careerProfile ? careerProfileSentence(input) : '';

  const profileBody = [
    profile.summary.trim().length > 0
      ? `<p class="cv-body">${escapeHtml(profile.summary)}</p>`
      : '',
    careerLine,
  ]
    .filter(Boolean)
    .join('');

  const experience = profile.experience
    .map(
      (entry) => `<div class="cv-entry">
  <div class="cv-entry-head">
    <h3>${escapeHtml(entry.role)}</h3>
    <span class="cv-dates">${dateRange(entry.startDate, entry.endDate)}</span>
  </div>
  <div class="cv-org">${ar(entry.organization)}</div>
  ${
    entry.description.trim().length > 0
      ? `<div class="cv-note">${escapeHtml(entry.description)}</div>`
      : ''
  }
</div>`,
    )
    .join('');

  const education = profile.education
    .map(
      (entry) => `<div class="cv-entry">
  <div class="cv-entry-head">
    <h3>${escapeHtml(entry.qualification)}</h3>
    <span class="cv-dates">${yearRange(entry.startYear, entry.endYear)}</span>
  </div>
  <div class="cv-org">${ar(entry.institution)}</div>
</div>`,
    )
    .join('');

  /* Platform certificates first: they are the part of this CV that is not
     self-reported, which is the whole reason §4.11 calls them its core value. */
  const certifications = [
    ...autofill.certifications.map(
      (certificate) => `<li class="cv-cert">
  <div class="cv-cert-title">${ar(certificate.title)}</div>
  <div class="cv-cert-meta">${
    certificate.type === 'PATH' ? 'Path certificate' : 'Course certificate'
  } · Issued ${formatDate(new Date(certificate.issuedAt), CV_FORMAT_CONTEXT)}</div>
</li>`,
    ),
    ...profile.externalCertifications.map(
      (certificate) => `<li class="cv-cert">
  <div class="cv-cert-title">${escapeHtml(certificate.title)}</div>
  <div class="cv-cert-meta">${[
    certificate.issuer.trim().length > 0
      ? escapeHtml(certificate.issuer)
      : 'External certification',
    certificate.issuedOn ? `Issued ${formatMonthYear(certificate.issuedOn)}` : '',
  ]
    .filter(Boolean)
    .join(' · ')}</div>
</li>`,
    ),
  ].join('');

  const skills =
    profile.skills.length > 0
      ? `<p class="cv-skills">${profile.skills.map(escapeHtml).join(' · ')}</p>`
      : '';

  return `<header class="cv-header">
  <h1>${escapeHtml(profile.fullName)}</h1>
  ${
    profile.jobTitle.trim().length > 0 || departmentLine
      ? `<p class="cv-role">${[escapeHtml(profile.jobTitle), departmentLine]
          .filter((part) => part.length > 0)
          .join(' · ')}</p>`
      : ''
  }
  ${contact.length > 0 ? `<p class="cv-contact">${contact.map(escapeHtml).join(' · ')}</p>` : ''}
</header>
${section('Profile', profileBody)}
${section('Experience', experience)}
${section('Certifications', certifications.length > 0 ? `<ul>${certifications}</ul>` : '')}
${section('Education', education)}
${section('Skills', skills)}`;
}

/**
 * The career-orientation line (§4.11) — "distinctive to this platform".
 *
 * The Holland letters are the internationally-legible part and stay Latin; the
 * type names pass through in Arabic as D-050 requires, rather than being
 * translated into an English gloss.
 */
function careerProfileSentence(input: CvDocumentInput): string {
  const career = input.autofill.careerProfile;
  if (!career) return '';

  const code = career.hollandCode.join('');
  const names = career.hollandCode
    .map((letter) => input.riasecNames[letter])
    .filter((name) => typeof name === 'string' && name.length > 0)
    .map((name) => ar(name))
    .join(' · ');

  const pathClause = career.pathName
    ? `${career.pathCompleted ? 'Completed the' : 'Enrolled on the'} ${ar(
        career.pathName,
      )} career path on the ministry training platform. `
    : '';

  const codeClause =
    code.length > 0
      ? `Holland profile: <strong>${escapeHtml(code)}</strong>${names ? ` — ${names}` : ''}.`
      : '';

  const sentence = `${pathClause}${codeClause}`.trim();

  return sentence.length > 0 ? `<p class="cv-body">${sentence}</p>` : '';
}

/**
 * A complete, standalone HTML document — what the PDF renderer prints.
 *
 * `fontCss` is supplied by the caller because the two consumers load the
 * typeface differently: the browser already has it from `next/font`, while the
 * API must inline it as base64 since a container has no Arabic system font.
 */
export function cvDocumentHtml(input: CvDocumentInput, options: { fontCss: string }): string {
  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(input.profile.fullName)}</title>
<style>
${options.fontCss}

@page { size: A4 portrait; margin: 0; }
html, body { margin: 0; padding: 0; background: #ffffff; }
body { font-family: 'IBM Plex Sans Arabic'; -webkit-font-smoothing: antialiased; }

${cvDocumentCss()}
</style>
</head>
<body>
<div class="cv-document">
${cvDocumentBody(input)}
</div>
</body>
</html>`;
}
