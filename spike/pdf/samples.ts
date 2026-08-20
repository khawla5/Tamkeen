import {
  DEFAULT_FORMAT_CONTEXT,
  type FormatContext,
  formatDate,
  formatNumber,
  formatPercent,
} from '../../packages/types/src/format';
import { FONT_FAMILY, embeddedFontCss } from './fonts';

/**
 * The four cases the Phase 3 PDF pipeline has to survive, as standalone
 * documents. Nothing here is product code — it exists to make the pipeline
 * fail *now*, on a spike branch, rather than underneath a certificate.
 *
 *   A. Arabic RTL — letter shaping, positional forms, ligatures, diacritics.
 *   B. Arabic + Latin + numerals in one line, and the D-018 digit/calendar
 *      switch working *inside* a PDF rather than only in the browser.
 *   C. An English (LTR) document carrying inline Arabic proper nouns — the CV
 *      that D-050 requires, and the case a pure-Arabic spike would have missed.
 *   D. A QR code, on a draft certificate face so the whole composition is
 *      visible at once.
 */

const NAVY = '#222E42';
const NAVY_2 = '#2E3A50';
const GOLD = '#A8863C';
const GOLD_LIGHT = '#C9A85C';
const CREAM = '#F4F3F1';
const MUTED = '#5E6B85';

/* Fixed so a re-run produces byte-comparable output; the real thing uses now(). */
const ISSUED_AT = new Date('2026-08-19T09:30:00Z');

const HIJRI_CONTEXT: FormatContext = { ...DEFAULT_FORMAT_CONTEXT, calendar: 'islamic-umalqura' };
const ARABIC_INDIC_CONTEXT: FormatContext = {
  ...DEFAULT_FORMAT_CONTEXT,
  numberFormat: 'arabic-indic',
};

/**
 * The English date the CV needs (D-050), written the way `format.ts` writes
 * dates so the shape is already right.
 *
 * It lives here rather than in `format.ts` because `LOCALES` is currently
 * `['ar']` and widening it is a Phase 3 change to a file governed by D-018/D-024
 * — not something a spike should smuggle in. Phase 3 adds `'en'` and a CV format
 * context; this is the placeholder that proves the *rendering* works meanwhile.
 */
function spikeEnglishDate(value: Date): string {
  return new Intl.DateTimeFormat('en-GB-u-nu-latn-ca-gregory', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(value);
}

function document_(options: {
  title: string;
  dir: 'rtl' | 'ltr';
  lang: string;
  pageCss: string;
  bodyCss: string;
  body: string;
}): string {
  const { css } = embeddedFontCss();

  return `<!doctype html>
<html lang="${options.lang}" dir="${options.dir}">
<head>
<meta charset="utf-8" />
<title>${options.title}</title>
<style>
${css}

@page { ${options.pageCss} }

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  /* No system-font fallback on purpose: if the embedded face fails to load the
     page must look obviously broken, not quietly reshape into something else. */
  font-family: '${FONT_FAMILY}';
  -webkit-font-smoothing: antialiased;
  ${options.bodyCss}
}
</style>
</head>
<body>
${options.body}
</body>
</html>`;
}

/* ── A. Arabic RTL shaping ────────────────────────────────────────────────── */

export function arabicShapingSample(): string {
  const row = (label: string, value: string, size = 28) =>
    `<tr>
       <td style="color:${MUTED};font-size:12px;padding:10px 0;width:190px;" dir="ltr">${label}</td>
       <td style="font-size:${size}px;font-weight:500;color:${NAVY};padding:10px 0;">${value}</td>
     </tr>`;

  return document_({
    title: 'Arabic shaping proof',
    dir: 'rtl',
    lang: 'ar',
    pageCss: 'size: A4 portrait; margin: 18mm;',
    bodyCss: `background:#ffffff;color:${NAVY};`,
    body: `
<h1 style="font-size:26px;font-weight:700;margin:0 0 4px;">إثبات تشكيل الحروف العربية</h1>
<p style="color:${MUTED};font-size:13px;margin:0 0 24px;" dir="ltr">
  Case A — connected forms, ligatures, diacritics, RTL paragraph flow.
</p>

<h2 style="font-size:15px;color:${GOLD};margin:24px 0 4px;">١ — الأشكال الموضعية للحرف (ع)</h2>
<p style="color:${MUTED};font-size:12px;margin:0 0 8px;" dir="ltr">
  The same letter must draw four different glyphs by position. Four identical
  shapes means shaping never ran.
</p>
<table style="width:100%;border-collapse:collapse;">
  ${row('initial — عمل', 'عمل')}
  ${row('medial — معلم', 'معلم')}
  ${row('final — مجتمع', 'مجتمع')}
  ${row('isolated — ع', 'ع')}
</table>

<h2 style="font-size:15px;color:${GOLD};margin:28px 0 4px;">٢ — تراكيب لام‑ألف</h2>
<p style="color:${MUTED};font-size:12px;margin:0 0 8px;" dir="ltr">
  Lam + alef is a mandatory ligature. Two separate letters here is a failure.
</p>
<table style="width:100%;border-collapse:collapse;">
  ${row('lam-alef — لا', 'لا')}
  ${row('in a word — طلاب', 'طلاب')}
  ${row('with hamza — الأخلاق', 'الأخلاق')}
  ${row('definite article — الإدارة', 'الإدارة')}
</table>

<h2 style="font-size:15px;color:${GOLD};margin:28px 0 4px;">٣ — النصوص الفعلية للمنتج</h2>
<table style="width:100%;border-collapse:collapse;">
  ${row('platform', 'منصة التدريب والتطوير المهني', 24)}
  ${row('issuer', 'الجهة المصدرة: وزارة الداخلية', 24)}
  ${row('certificate', 'شهادة إتمام دورة', 24)}
  ${row('path', 'مسار القيادة الإدارية', 24)}
  ${row('riasec', 'اجتماعي / بحثي / فني', 24)}
</table>

<h2 style="font-size:15px;color:${GOLD};margin:28px 0 4px;">٤ — التشكيل</h2>
<table style="width:100%;border-collapse:collapse;">
  ${row('diacritics', 'مَنَصَّةُ التَّدْرِيبِ وَالتَّطْوِيرِ الْمِهْنِيِّ', 24)}
</table>

<h2 style="font-size:15px;color:${GOLD};margin:28px 0 4px;">٥ — فقرة متصلة</h2>
<p style="font-size:15px;line-height:2;margin:0;text-align:justify;">
  تشهد وزارة الداخلية بأن الموظف المذكور أعلاه قد أتمّ بنجاح جميع متطلبات هذه
  الدورة التدريبية ضمن مساره المهني على منصة التدريب والتطوير المهني، وأنه
  اجتاز التقييم النهائي وفقاً للحد الأدنى المعتمد للنجاح. تُمنح هذه الشهادة
  بناءً على سجل الإنجاز الموثّق في المنصة، ويمكن التحقق من صحتها إلكترونياً عبر
  الرابط المرفق أو برمز الاستجابة السريعة.
</p>
`,
  });
}

/* ── B. Mixed Arabic + Latin + numerals ───────────────────────────────────── */

export function mixedScriptSample(): string {
  const cell = (value: string, dir: 'rtl' | 'ltr' = 'rtl') =>
    `<td dir="${dir}" style="font-size:17px;padding:9px 0;color:${NAVY};">${value}</td>`;

  const label = (value: string) =>
    `<td dir="ltr" style="color:${MUTED};font-size:12px;padding:9px 0;width:230px;">${value}</td>`;

  return document_({
    title: 'Mixed script and numerals',
    dir: 'rtl',
    lang: 'ar',
    pageCss: 'size: A4 portrait; margin: 18mm;',
    bodyCss: `background:#ffffff;color:${NAVY};`,
    body: `
<h1 style="font-size:26px;font-weight:700;margin:0 0 4px;">أرقام وتواريخ ونصوص مختلطة</h1>
<p style="color:${MUTED};font-size:13px;margin:0 0 24px;" dir="ltr">
  Case B — bidi runs, and the D-018 digit/calendar switch evaluated inside the PDF.
</p>

<h2 style="font-size:15px;color:${GOLD};margin:20px 0 4px;">التواريخ عبر format.ts</h2>
<table style="width:100%;border-collapse:collapse;">
  <tr>${label('formatDate — gregory')}${cell(formatDate(ISSUED_AT))}</tr>
  <tr>${label('formatDate — islamic-umalqura')}${cell(formatDate(ISSUED_AT, HIJRI_CONTEXT))}</tr>
  <tr>${label('both, as the certificate prints')}${cell(
    `${formatDate(ISSUED_AT, HIJRI_CONTEXT)} هـ &nbsp;·&nbsp; ${formatDate(ISSUED_AT)} م`,
  )}</tr>
</table>

<h2 style="font-size:15px;color:${GOLD};margin:28px 0 4px;">الأرقام عبر format.ts</h2>
<table style="width:100%;border-collapse:collapse;">
  <tr>${label('formatPercent — western (default)')}${cell(formatPercent(85))}</tr>
  <tr>${label('formatPercent — arabic-indic')}${cell(formatPercent(85, ARABIC_INDIC_CONTEXT))}</tr>
  <tr>${label('formatNumber — western')}${cell(formatNumber(1248))}</tr>
  <tr>${label('formatNumber — arabic-indic')}${cell(formatNumber(1248, ARABIC_INDIC_CONTEXT))}</tr>
</table>

<h2 style="font-size:15px;color:${GOLD};margin:28px 0 4px;">أسطر ثنائية الاتجاه</h2>
<p style="font-size:16px;line-height:2.1;margin:0;">
  تم إصدار الشهادة رقم <span dir="ltr">CERT-2026-0001</span> بتاريخ
  ${formatDate(ISSUED_AT)}.<br />
  اجتاز المتدرب دورة <span dir="ltr">Moodle 4.5 LTS Administration</span> بدرجة
  ${formatPercent(85)}.<br />
  الحد الأدنى للنجاح ${formatPercent(70)}، وعدد الدورات في المسار
  ${formatNumber(7)}.<br />
  رمز هولاند: <span dir="ltr">SIA</span> — اجتماعي / بحثي / فني.
</p>

<h2 style="font-size:15px;color:${GOLD};margin:28px 0 4px;">فقرة تحتوي على مصطلحات لاتينية</h2>
<p style="font-size:15px;line-height:2;margin:0;text-align:justify;">
  تعتمد المنصة على نظام <span dir="ltr">Moodle</span> لإدارة التعلم، وتتم مزامنة
  حالة الإتمام كل <span dir="ltr">5</span> دقائق عبر خدمة
  <span dir="ltr">REST</span>، ثم تُصدر الشهادة تلقائياً عند تجاوز الحد الأدنى
  المعتمد وقدره ${formatPercent(70)}.
</p>
`,
  });
}

/* ── C. English (LTR) CV carrying inline Arabic proper nouns ──────────────── */

export function englishCvSample(): string {
  const ar = (value: string) => `<span dir="rtl" lang="ar">${value}</span>`;

  const entry = (
    role: string,
    org: string,
    from: string,
    to: string,
    description: string,
  ) => `<div style="margin:0 0 16px;">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;">
      <span style="font-weight:600;font-size:14px;color:${NAVY};">${role}</span>
      <span style="font-size:12px;color:${MUTED};white-space:nowrap;">${from} – ${to}</span>
    </div>
    <div style="font-size:13px;color:${NAVY_2};margin:2px 0 4px;">${org}</div>
    <div style="font-size:12.5px;color:${MUTED};line-height:1.7;">${description}</div>
  </div>`;

  const certificate = (title: string, kind: string, date: string) =>
    `<li style="margin:0 0 9px;line-height:1.6;">
       <span style="font-size:13px;color:${NAVY};">${title}</span><br />
       <span style="font-size:11.5px;color:${MUTED};">${kind} · Issued ${date}</span>
     </li>`;

  return document_({
    title: 'Curriculum Vitae',
    dir: 'ltr',
    lang: 'en',
    pageCss: 'size: A4 portrait; margin: 16mm 18mm;',
    bodyCss: `background:#ffffff;color:${NAVY};`,
    body: `
<header style="border-bottom:2px solid ${GOLD};padding-bottom:12px;margin-bottom:18px;">
  <h1 style="font-size:25px;font-weight:700;margin:0;letter-spacing:-0.2px;">
    Abdullah Al-Damati &nbsp;<span style="font-weight:500;color:${NAVY_2};">${ar('عبدالله الدماطي')}</span>
  </h1>
  <p style="margin:6px 0 0;font-size:13px;color:${NAVY_2};">
    Training &amp; Development Officer · ${ar('وزارة الداخلية')} (Ministry of Internal Affairs)
  </p>
  <p style="margin:4px 0 0;font-size:12px;color:${MUTED};">
    Department: ${ar('إدارة الموارد البشرية')} &nbsp;·&nbsp; abdullah.damati@ministry.gov.example
  </p>
</header>

<section style="margin-bottom:18px;">
  <h2 style="font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:${GOLD};margin:0 0 7px;">Profile</h2>
  <p style="font-size:12.5px;line-height:1.75;margin:0;color:${NAVY_2};">
    Training officer with seven years in the public sector, focused on workforce
    development programmes and learner assessment. Completed the
    ${ar('مسار القيادة الإدارية')} career path on the ministry training platform,
    with a Holland profile of <strong>SIA</strong> — ${ar('اجتماعي')} (Social),
    ${ar('بحثي')} (Investigative), ${ar('فني')} (Artistic).
  </p>
</section>

<section style="margin-bottom:18px;">
  <h2 style="font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:${GOLD};margin:0 0 9px;">Experience</h2>
  ${entry(
    'Training &amp; Development Officer',
    `${ar('وزارة الداخلية')} — Human Resources Directorate`,
    'March 2021',
    'Present',
    'Designed and ran internal development programmes for 400+ staff. Introduced the RIASEC-based career-path model now used across the directorate.',
  )}
  ${entry(
    'Learning Coordinator',
    `${ar('معهد الإدارة العامة')} (Institute of Public Administration)`,
    'June 2019',
    'February 2021',
    'Coordinated instructor-led and blended courses; managed the Moodle course catalogue and learner completion reporting.',
  )}
</section>

<section style="margin-bottom:18px;">
  <h2 style="font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:${GOLD};margin:0 0 9px;">Certifications</h2>
  <ul style="margin:0;padding:0 0 0 16px;">
    ${certificate(ar('شهادة إتمام مسار القيادة الإدارية'), 'Path certificate', spikeEnglishDate(ISSUED_AT))}
    ${certificate(ar('أساسيات القيادة الإدارية'), 'Course certificate', spikeEnglishDate(new Date('2026-07-02')))}
    ${certificate(ar('إدارة الفرق والتواصل الفعّال'), 'Course certificate', spikeEnglishDate(new Date('2026-06-11')))}
    ${certificate('Project Management Professional (PMP)', 'External certification', spikeEnglishDate(new Date('2024-11-20')))}
  </ul>
</section>

<section style="margin-bottom:18px;">
  <h2 style="font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:${GOLD};margin:0 0 9px;">Education</h2>
  ${entry(
    'BSc, Business Administration',
    `${ar('جامعة الملك سعود')} (King Saud University)`,
    '2013',
    '2017',
    'Graduated with distinction.',
  )}
</section>

<section>
  <h2 style="font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:${GOLD};margin:0 0 9px;">Skills</h2>
  <p style="font-size:12.5px;line-height:1.9;margin:0;color:${NAVY_2};">
    Learning &amp; development · Curriculum design · Moodle administration ·
    Competency assessment · Arabic (native) · English (professional)
  </p>
</section>
`,
  });
}

/* ── D. Draft certificate face with a QR code ─────────────────────────────── */

export function certificateSample(options: {
  qrSvg: string;
  verificationId: string;
  verificationUrl: string;
}): string {
  return document_({
    title: 'Certificate draft',
    dir: 'rtl',
    lang: 'ar',
    pageCss: 'size: A4 landscape; margin: 0;',
    bodyCss: `background:${CREAM};color:${NAVY};`,
    body: `
<div style="position:relative;width:297mm;height:210mm;background:#ffffff;padding:14mm;">
  <div style="position:absolute;inset:0;border:10px solid ${NAVY};"></div>
  <div style="position:absolute;inset:7mm;border:1.5px solid ${GOLD};"></div>

  <div style="position:relative;height:100%;display:flex;flex-direction:column;
              align-items:center;padding:12mm 18mm;text-align:center;">

    <!-- Logo slot: a neutral placeholder mark until the ministry seal arrives (Q2). -->
    <div style="width:22mm;height:22mm;border:1.5px solid ${GOLD};border-radius:50%;
                display:flex;align-items:center;justify-content:center;margin-bottom:5mm;">
      <div style="width:13mm;height:13mm;border:1.5px solid ${GOLD_LIGHT};
                  transform:rotate(45deg);"></div>
    </div>

    <div style="font-size:13px;color:${MUTED};letter-spacing:0.5px;">
      منصة التدريب والتطوير المهني
    </div>

    <h1 style="font-size:40px;font-weight:700;color:${NAVY};margin:6mm 0 0;">
      شهادة إتمام دورة
    </h1>
    <div style="width:52mm;height:2px;background:${GOLD};margin:4mm 0 6mm;"></div>

    <div style="font-size:15px;color:${MUTED};">تشهد وزارة الداخلية بأن</div>
    <div style="font-size:32px;font-weight:600;color:${NAVY};margin:3mm 0;">
      عبدالله بن محمد الدماطي
    </div>
    <div style="font-size:15px;color:${MUTED};">قد أتمّ بنجاح متطلبات دورة</div>
    <div style="font-size:23px;font-weight:600;color:${GOLD};margin:3mm 0 0;">
      أساسيات القيادة الإدارية
    </div>
    <div style="font-size:14px;color:${MUTED};margin:2mm 0 0;">
      ضمن مسار القيادة الإدارية
    </div>

    <div style="margin-top:auto;width:100%;display:flex;align-items:flex-end;
                justify-content:space-between;gap:10mm;">

      <!-- Verification: QR + the id it encodes. -->
      <div style="text-align:center;width:44mm;">
        <div style="width:26mm;height:26mm;margin:0 auto;">${options.qrSvg}</div>
        <div style="font-size:8.5px;color:${MUTED};margin-top:1.5mm;line-height:1.5;">
          للتحقق من صحة الشهادة
          <div dir="ltr" style="font-size:7.5px;word-break:break-all;color:${MUTED};">
            ${options.verificationId}
          </div>
        </div>
      </div>

      <!-- Both calendars, via format.ts (Q3). -->
      <div style="text-align:center;">
        <div style="font-size:12px;color:${MUTED};">تاريخ الإصدار</div>
        <div style="font-size:14px;color:${NAVY};margin-top:1.5mm;">
          ${formatDate(ISSUED_AT, HIJRI_CONTEXT)} هـ
        </div>
        <div style="font-size:14px;color:${NAVY};">
          ${formatDate(ISSUED_AT)} م
        </div>
      </div>

      <!-- Signature block slot: name + title, to be filled by the ministry. -->
      <div style="text-align:center;width:64mm;">
        <div style="height:12mm;"></div>
        <div style="border-top:1px solid ${NAVY_2};padding-top:2mm;">
          <div style="font-size:13px;color:${NAVY};font-weight:600;">الاسم</div>
          <div style="font-size:11px;color:${MUTED};margin-top:1mm;">
            الجهة المصدرة: وزارة الداخلية
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
`,
  });
}

export const VERIFICATION_URL_FOR_SPIKE = (id: string) => `http://localhost:3000/verify/${id}`;
