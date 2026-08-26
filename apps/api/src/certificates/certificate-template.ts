import {
  DEFAULT_FORMAT_CONTEXT,
  type FormatContext,
  formatDate,
  formatNumber,
} from '@tamkeen/types';

import { ministryEmblemSvg } from './certificate-emblem';
import { CERTIFICATE_FONT_FAMILY, fontFaceCss } from './certificate-fonts';

/**
 * The certificate face (§3 brand, §4.10).
 *
 * Arabic-first and RTL, and deliberately austere: a credential earns nothing
 * from decoration. The one piece of artwork on it is the ministry's own emblem,
 * which is not decoration but the statement of who is attesting. Course and path certificates share this one
 * template and differ where §4.10 asks them to differ — the path certificate is
 * the larger award and is framed in gold rather than navy, with a filled seal
 * and the count of courses it took.
 *
 * **No grade appears anywhere.** A certificate states that a standard was met,
 * not by how much; the grade stays in My Path where it can be read in context.
 *
 * **Every date and number goes through `format.ts`** (D-018/D-024), including
 * the Hijri face, which is why both calendars can be printed without this file
 * knowing anything about calendars. A certificate that disagreed with the
 * screen that announced it would be a real failure, and one switch point is how
 * that is prevented.
 */

/* Platforms Code tokens (D-069) — mirrored from apps/web/src/lib/tokens.ts. */
const PRIMARY = '#1B8354';
const PRIMARY_DARK = '#14573A';
const TEXT = '#1F2A37';
const MUTED = '#6C727E';

const HIJRI: FormatContext = { ...DEFAULT_FORMAT_CONTEXT, calendar: 'islamic-umalqura' };

export interface CertificateTemplateInput {
  type: 'COURSE' | 'PATH';
  holderName: string;
  /** The course title or the path name, as it will be stored on the row. */
  subjectTitle: string;
  /** For a course, the path it sits in; for a path, how many courses it took. */
  pathName: string | null;
  courseCount: number | null;
  issuedAt: Date;
  verificationId: string;
  verificationUrl: string;
  /** Inline SVG. Vector so it stays scannable off paper at any size. */
  qrSvg: string;
  /**
   * The signature block and issuing body, as §4C.7 lets the ministry set them.
   *
   * Passed in rather than read here, because this function is pure and a
   * certificate's bytes are stored immutably (D-052) — the values that were in
   * force at issue are the ones printed on that document forever, and a template
   * that reached for the current settings would render a *historical*
   * certificate with today's signatory.
   */
  signatory: CertificateSignatory;
}

/** The ministry's signature block (§4C.7, D-073). */
export interface CertificateSignatory {
  /** Who signs. Empty until the ministry supplies a name. */
  name: string;
  /** Their title. Empty likewise. */
  title: string;
  /** The issuing body, printed under the signature. */
  issuingBody: string;
}

/**
 * Escapes values that did not originate in this file.
 *
 * Holder names come from registration and course titles from Moodle, so both
 * are outside our control. The output is a PDF rather than a page, so this is
 * not quite XSS — but unescaped markup in a credential could silently restyle
 * or displace the text stating what was earned, which is worse than a script.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderCertificateHtml(input: CertificateTemplateInput): string {
  const isPath = input.type === 'PATH';

  const frameColor = isPath ? PRIMARY_DARK : PRIMARY;
  const innerRule = isPath ? PRIMARY : PRIMARY_DARK;
  const heading = isPath ? 'شهادة إتمام مسار' : 'شهادة إتمام دورة';
  const leadIn = isPath ? 'قد أتمّ بنجاح جميع متطلبات مسار' : 'قد أتمّ بنجاح متطلبات دورة';

  const context = isPath
    ? input.courseCount !== null
      ? `باجتياز ${formatNumber(input.courseCount)} دورات ضمن المسار`
      : ''
    : input.pathName !== null
      ? `ضمن ${escapeHtml(input.pathName)}`
      : '';

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(input.subjectTitle)}</title>
<style>
${fontFaceCss()}

@page { size: A4 landscape; margin: 0; }

* { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  /* No fallback stack on purpose: if the embedded face fails to load, the page
     must look obviously broken rather than quietly reshape into something the
     ministry never approved. */
  font-family: '${CERTIFICATE_FONT_FAMILY}';
  -webkit-font-smoothing: antialiased;
  color: ${TEXT};
  background: #ffffff;
}

.sheet { position: relative; width: 297mm; height: 210mm; overflow: hidden; }
.frame-outer { position: absolute; inset: 0; border: 9mm solid ${frameColor}; }
.frame-inner { position: absolute; inset: 11mm; border: 0.6mm solid ${innerRule}; }

.content {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 20mm 30mm 16mm;
}

/* The ministry's own artwork, at the size the placeholder mark held (TAM-136).
   Sized here rather than on the SVG so the file stays exactly as supplied. */
.emblem { width: ${isPath ? '26mm' : '22mm'}; height: ${isPath ? '26mm' : '22mm'}; }
.emblem svg { width: 100%; height: 100%; display: block; }

.platform { font-size: 10pt; color: ${MUTED}; margin-top: 4mm; }

/* Takes the slack, so the award sits optically centred whatever the title
   length — rather than the whole block riding at the top of the sheet. */
.body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }

.heading { font-size: ${isPath ? '30pt' : '26pt'}; font-weight: 700; }
.rule { width: 46mm; height: 0.8mm; background: ${PRIMARY}; margin: 4mm 0 6mm; }
.attest { font-size: 11pt; color: ${MUTED}; }
.holder { font-size: 22pt; font-weight: 600; margin: 3mm 0; }
.subject { font-size: ${isPath ? '19pt' : '17pt'}; font-weight: 600; color: ${PRIMARY_DARK}; margin-top: 3mm; }
.context { font-size: 10.5pt; color: ${MUTED}; margin-top: 2.5mm; }

/* Three equal columns with a shared baseline — the footer is where a
   certificate looks amateurish if the blocks float at different heights. */
.footer {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  align-items: end;
  gap: 8mm;
}

.qr { width: 24mm; height: 24mm; margin: 0 auto; }
.qr svg { width: 100%; height: 100%; display: block; }
.verify-label { font-size: 7pt; color: ${MUTED}; margin-top: 1.5mm; }
.verify-id { font-size: 6pt; color: ${MUTED}; word-break: break-all; line-height: 1.5; }

.date-label { font-size: 9pt; color: ${MUTED}; }
.date-value { font-size: 11pt; margin-top: 1.5mm; }

/* No rule above the name (TAM-136, ministry direction). A signature line is
   drawn for someone to sign *on*; this block prints a name the ministry has
   already given, so the rule was furniture pretending to be a place to sign. */
.sign-line { padding-top: 2mm; }
.sign-name { font-size: 10.5pt; font-weight: 600; }
.sign-title { font-size: 8.5pt; color: ${MUTED}; margin-top: 1mm; }
</style>
</head>
<body>
<div class="sheet">
  <div class="frame-outer"></div>
  <div class="frame-inner"></div>

  <div class="content">
    <!-- The ministry emblem, in the slot the placeholder mark held (TAM-136).
         The seal and the signatory's signature are still owed (D-051). -->
    <div class="emblem">${ministryEmblemSvg()}</div>
    <div class="platform">منصة التدريب والتطوير المهني</div>

    <div class="body">
      <h1 class="heading">${heading}</h1>
      <div class="rule"></div>

      <div class="attest">تشهد وزارة الداخلية بأن</div>
      <div class="holder">${escapeHtml(input.holderName)}</div>
      <div class="attest">${leadIn}</div>
      <div class="subject">${escapeHtml(input.subjectTitle)}</div>
      ${context.length > 0 ? `<div class="context">${context}</div>` : ''}
    </div>

    <div class="footer">
      <div>
        <div class="qr">${input.qrSvg}</div>
        <div class="verify-label">للتحقق من صحة الشهادة</div>
        <div class="verify-id" dir="ltr">${escapeHtml(input.verificationId)}</div>
      </div>

      <div>
        <div class="date-label">تاريخ الإصدار</div>
        <!-- Both calendars on the face (Q3), both from format.ts. -->
        <div class="date-value">${formatDate(input.issuedAt, HIJRI)} هـ</div>
        <div class="date-value">${formatDate(input.issuedAt)} م</div>
      </div>

      <!--
        The signature block, filled from §4C.7's settings.
        The placeholder wording is what shows until the ministry names a
        signatory — the block has always held its position so that supplying one
        is not a layout change (D-051), and now supplying one is a screen rather
        than a deployment.
      -->
      <div>
        <div class="sign-line">
          <div class="sign-name">${escapeHtml(input.signatory.name || 'الاسم')}</div>
          ${
            input.signatory.title
              ? `<div class="sign-title">${escapeHtml(input.signatory.title)}</div>`
              : ''
          }
          <div class="sign-title">${escapeHtml(input.signatory.issuingBody)}</div>
        </div>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;
}
