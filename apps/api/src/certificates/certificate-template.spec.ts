import { renderCertificateHtml, type CertificateTemplateInput } from './certificate-template';

const BASE: CertificateTemplateInput = {
  type: 'COURSE',
  holderName: 'عبدالله بن محمد الدماطي',
  subjectTitle: 'أساسيات القيادة الإدارية',
  pathName: 'مسار القيادة الإدارية',
  courseCount: null,
  issuedAt: new Date('2026-08-19T09:30:00Z'),
  verificationId: 'k7Qz2Xr9TfLmA4vN8bYcJ1sWdEpHgU6oRt3iZnQxKvM',
  verificationUrl: 'https://tamkeen.gov.example/verify/k7Qz2Xr9TfLmA4vN8bYcJ1sWdEpHgU6oRt3iZnQxKvM',
  qrSvg: '<svg data-test="qr"></svg>',
  /* The empty signatory is the shipping state: the ministry has not named one,
     and printing an invented signature on a credential would be worse than
     printing none (D-051, D-073). */
  signatory: { name: '', title: '', issuingBody: 'الجهة المصدرة: وزارة الداخلية' },
};

/** What a reader of the printed certificate would actually see. */
function visibleText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

describe('certificate template', () => {
  it('is Arabic and right-to-left (§2, D-001)', () => {
    expect(renderCertificateHtml(BASE)).toContain('<html lang="ar" dir="rtl">');
  });

  it('embeds the typeface rather than referencing one', () => {
    /* A container has no Arabic system font. An unembedded face does not
       degrade gracefully — it degrades to tofu, or to unshaped letters. */
    const html = renderCertificateHtml(BASE);

    expect(html).toContain('@font-face');
    expect(html).toContain('data:font/woff2;base64,');
    expect(html).not.toMatch(/https?:\/\/fonts\./);
  });

  it('prints both the Hijri and Gregorian dates, through format.ts', () => {
    /* Both calendars on the face of a formal ministry credential, and neither
       hardcoded — the switch is D-018's, so the certificate cannot disagree
       with the screen that announced it. */
    const html = renderCertificateHtml(BASE);

    expect(html).toContain('19 أغسطس 2026 م');
    expect(html).toContain('6 ربيع الأول 1448 هـ');
  });

  it('shows no grade anywhere', () => {
    /* A certificate states that a standard was met, not by how much. The grade
       stays in My Path, where it can be read in context.

       Asserted against the visible text rather than the markup: the stylesheet
       is full of percentages, and a test that cannot tell `width: 100%` from a
       printed score would be satisfied by nothing at all. */
    expect(visibleText(renderCertificateHtml({ ...BASE, subjectTitle: 'دورة' }))).not.toMatch(
      /%|الدرجة|النتيجة|علامة/,
    );
  });

  it('carries the issuer line, a signature slot and the QR', () => {
    const html = renderCertificateHtml(BASE);

    expect(html).toContain('الجهة المصدرة: وزارة الداخلية');
    expect(html).toContain('class="sign-line"');
    expect(html).toContain('<svg data-test="qr"></svg>');
    expect(html).toContain(BASE.verificationId);
  });

  it('escapes values that came from outside this file', () => {
    /* Holder names come from registration and course titles from Moodle.
       Unescaped markup in a credential could displace the text stating what was
       earned — the output is a PDF, so this is worse than a script. */
    const html = renderCertificateHtml({
      ...BASE,
      holderName: '<script>alert(1)</script>',
      subjectTitle: 'دورة "المخاطر" & <b>الأمن</b>',
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('&amp;');
  });

  describe('course versus path', () => {
    const course = renderCertificateHtml(BASE);
    const path = renderCertificateHtml({
      ...BASE,
      type: 'PATH',
      subjectTitle: 'مسار القيادة الإدارية',
      pathName: null,
      courseCount: 7,
    });

    it('names the award differently', () => {
      expect(course).toContain('شهادة إتمام دورة');
      expect(path).toContain('شهادة إتمام مسار');
    });

    it('renders the path certificate as the larger award (§4.10)', () => {
      /* Gold frame and a filled seal rather than navy, so the two are
         distinguishable at a glance in the gallery and on paper. */
      expect(course).toContain('border: 9mm solid #222E42');
      expect(path).toContain('border: 9mm solid #A8863C');
    });

    it('sites a course inside its path, and a path by the courses it took', () => {
      expect(course).toContain('ضمن مسار القيادة الإدارية');
      expect(path).toContain('باجتياز 7 دورات ضمن المسار');
    });

    it('omits the context line rather than printing an empty one', () => {
      /* A course reached outside the user's path has no path to name. */
      const orphan = renderCertificateHtml({ ...BASE, pathName: null });

      expect(orphan).not.toContain('class="context"');
    });
  });
});

describe('the signature block (§4C.7)', () => {
  it('prints the signatory the ministry named', () => {
    const html = renderCertificateHtml({
      ...BASE,
      signatory: {
        name: 'أحمد بن سالم القحطاني',
        title: 'وكيل الوزارة للتطوير',
        issuingBody: 'وزارة الداخلية',
      },
    });

    expect(visibleText(html)).toContain('أحمد بن سالم القحطاني');
    expect(visibleText(html)).toContain('وكيل الوزارة للتطوير');
  });

  it('falls back to a placeholder rather than an empty line', () => {
    /* The block holds its position either way, so supplying a real signatory
       later is not a layout change (D-051). */
    expect(visibleText(renderCertificateHtml(BASE))).toContain('الاسم');
  });

  it('omits the title line entirely when there is no title', () => {
    /* An empty line under a name reads as a missing field on a credential. */
    const html = renderCertificateHtml({
      ...BASE,
      signatory: { name: 'اسم', title: '', issuingBody: 'وزارة الداخلية' },
    });

    expect(html).not.toContain('<div class="sign-title"></div>');
  });

  it('escapes a signatory name, which arrives from a settings form', () => {
    const html = renderCertificateHtml({
      ...BASE,
      signatory: { name: '<script>x</script>', title: '', issuingBody: 'وزارة' },
    });

    /* Not quite XSS — the output is a PDF — but unescaped markup in a credential
       could restyle or displace the text stating what was earned. */
    expect(html).not.toContain('<script>x</script>');
  });
});
