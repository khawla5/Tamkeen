import { coursePassedEmail, pathCompletedEmail } from './email.templates';

/**
 * The two achievement emails, and the rule they share: never announce a
 * certificate that was not issued.
 *
 * Issuance can fail while the pass or the path completion stands — rendering
 * needs Chromium and a writable disk, and neither is worth failing a sync over.
 * A message linking to a certificate that does not exist would send the learner
 * to an empty gallery to find out.
 */

const CERT_URL = 'https://tamkeen.gov.example/certificates';
const PATH_URL = 'https://tamkeen.gov.example/my-path';

describe('coursePassedEmail', () => {
  it('is Arabic and right-to-left', () => {
    const email = coursePassedEmail('دورة الأمن', PATH_URL, null);

    expect(email.html).toContain('<html lang="ar" dir="rtl">');
    expect(email.subject).toBe('اجتزت الدورة بنجاح');
  });

  it('folds the certificate in rather than sending a second message (Q5)', () => {
    const email = coursePassedEmail('دورة الأمن', PATH_URL, CERT_URL);

    expect(email.html).toContain('وصدرت شهادتك');
    expect(email.html).toContain(CERT_URL);
    expect(email.html).toContain('عرض الشهادة');
  });

  it('says nothing about a certificate when issuance failed', () => {
    const email = coursePassedEmail('دورة الأمن', PATH_URL, null);

    expect(email.html).not.toContain('شهاد');
    expect(email.text).not.toContain('شهاد');
    expect(email.html).toContain(PATH_URL);
  });

  it('offers exactly one action (§3)', () => {
    /* The certificate replaces the path link rather than competing with it. */
    const certified = coursePassedEmail('دورة الأمن', PATH_URL, CERT_URL);

    expect(certified.html.match(/<a href=/g)).toHaveLength(1);
  });

  it('escapes a course title that came from the LMS', () => {
    const email = coursePassedEmail('<b>دورة</b> & "الأمن"', PATH_URL, null);

    expect(email.html).not.toContain('<b>دورة</b>');
    expect(email.html).toContain('&lt;b&gt;');
  });

  it('falls back to a generic noun rather than printing an empty title', () => {
    const email = coursePassedEmail('   ', PATH_URL, null);

    expect(email.html).toContain('«الدورة»');
  });
});

describe('pathCompletedEmail', () => {
  it('is its own message, not folded into the course email', () => {
    /* Finishing a path is a distinct event from passing the last course in it,
       and under the one-path rule (D-002) it happens once per learner. */
    const email = pathCompletedEmail('مسار القيادة الإدارية', PATH_URL, CERT_URL);

    expect(email.subject).toBe('أتممت مسارك بنجاح');
    expect(email.html).toContain('مسار القيادة الإدارية');
    expect(email.html).toContain('عرض شهادة المسار');
  });

  it('says nothing about a certificate when issuance failed', () => {
    const email = pathCompletedEmail('مسار القيادة الإدارية', PATH_URL, null);

    expect(email.html).not.toContain('شهاد');
    expect(email.text).not.toContain('شهاد');
    expect(email.html).toContain(PATH_URL);
  });

  it('offers exactly one action (§3)', () => {
    const email = pathCompletedEmail('مسار القيادة الإدارية', PATH_URL, CERT_URL);

    expect(email.html.match(/<a href=/g)).toHaveLength(1);
  });

  it('escapes a path name', () => {
    const email = pathCompletedEmail('<script>x</script>', PATH_URL, null);

    expect(email.html).not.toContain('<script>x</script>');
  });
});
