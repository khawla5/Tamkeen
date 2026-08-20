/**
 * Transactional email templates — Arabic-first, RTL (§2, D-001).
 *
 * Kept short and purely transactional per the §2 notifications rule: no
 * marketing, no engagement nagging. Inline styles with an explicit `dir="rtl"`
 * on the container, because email clients strip <style> blocks and do not
 * inherit document direction.
 *
 * The `<html lang="ar" dir="rtl">` wrapper matters as much as the copy: without
 * it, Outlook renders mixed Arabic/Latin content (a verification URL inside
 * Arabic text) with the punctuation in the wrong place.
 */

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

const BRAND_NAVY = '#222E42';
const BRAND_GOLD_LIGHT = '#C9A85C';
const BRAND_CREAM = '#F4F3F1';

function layout(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="ar" dir="rtl">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
  <body style="margin:0;padding:24px;background:${BRAND_CREAM};font-family:'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif;">
    <div dir="rtl" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
      <div style="background:${BRAND_NAVY};padding:20px 24px;">
        <span style="color:#ffffff;font-size:16px;font-weight:600;">منصة التدريب والتطوير المهني</span>
      </div>
      <div style="padding:24px;color:${BRAND_NAVY};font-size:15px;line-height:1.8;">
        <h1 style="margin:0 0 16px;font-size:19px;font-weight:700;">${heading}</h1>
        ${bodyHtml}
      </div>
    </div>
  </body>
</html>`;
}

function button(url: string, label: string): string {
  /* Navy on light gold: 6.01:1, the AA-safe achievement pairing from D-025. */
  return `<p style="margin:24px 0;">
    <a href="${url}" style="display:inline-block;background:${BRAND_GOLD_LIGHT};color:${BRAND_NAVY};
       text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">${label}</a>
  </p>
  <p style="margin:16px 0 0;font-size:13px;color:#5E6B85;">
    إذا لم يعمل الزر، انسخ هذا الرابط إلى المتصفح:<br />
    <span dir="ltr" style="word-break:break-all;">${url}</span>
  </p>`;
}

export function verificationEmail(url: string, expiryHours: number): EmailContent {
  return {
    subject: 'تأكيد بريدك الإلكتروني',
    html: layout(
      'تأكيد بريدك الإلكتروني',
      `<p style="margin:0;">لتفعيل حسابك، اضغط على الزر أدناه.</p>
       ${button(url, 'تأكيد البريد الإلكتروني')}
       <p style="margin:16px 0 0;font-size:13px;color:#5E6B85;">
         ينتهي هذا الرابط خلال ${expiryHours} ساعة. إذا لم تطلب إنشاء حساب، تجاهل هذه الرسالة.
       </p>`,
    ),
    text: [
      'تأكيد بريدك الإلكتروني',
      '',
      'لتفعيل حسابك، افتح الرابط التالي:',
      url,
      '',
      `ينتهي هذا الرابط خلال ${expiryHours} ساعة.`,
      'إذا لم تطلب إنشاء حساب، تجاهل هذه الرسالة.',
    ].join('\n'),
  };
}

export function passwordResetEmail(url: string, expiryMinutes: number): EmailContent {
  return {
    subject: 'إعادة تعيين كلمة المرور',
    html: layout(
      'إعادة تعيين كلمة المرور',
      `<p style="margin:0;">وصلنا طلب لإعادة تعيين كلمة مرور حسابك.</p>
       ${button(url, 'إعادة تعيين كلمة المرور')}
       <p style="margin:16px 0 0;font-size:13px;color:#5E6B85;">
         ينتهي هذا الرابط خلال ${expiryMinutes} دقيقة ويصلح لمرة واحدة.
         إذا لم تطلب ذلك، تجاهل هذه الرسالة ولن يتغيّر شيء.
       </p>`,
    ),
    text: [
      'إعادة تعيين كلمة المرور',
      '',
      'وصلنا طلب لإعادة تعيين كلمة مرور حسابك. افتح الرابط التالي:',
      url,
      '',
      `ينتهي هذا الرابط خلال ${expiryMinutes} دقيقة ويصلح لمرة واحدة.`,
      'إذا لم تطلب ذلك، تجاهل هذه الرسالة ولن يتغيّر شيء.',
    ].join('\n'),
  };
}

/**
 * "You passed a course" (§2 notifications — transactional only).
 *
 * **The certificate is folded into this message rather than sent as a second
 * one.** Passing and being certified for it are one event to the learner, and
 * §2 keeps notification minimal; two emails a second apart would read as a bug.
 * `certificateUrl` is nullable because issuance can fail while the pass stands —
 * in which case this says nothing about a certificate rather than linking to
 * one that is not there. The reconciliation pass will issue it, and the
 * in-app indicator will carry the news.
 *
 * The course title comes from our own catalogue, which is synced from the LMS —
 * so it is escaped before going into the HTML rather than trusted. A title is
 * authored by an entity in Phase 4, which makes it user-supplied content
 * arriving from another system.
 */
export function coursePassedEmail(
  courseTitle: string,
  myPathUrl: string,
  certificateUrl: string | null,
): EmailContent {
  const heading = 'اجتزت الدورة بنجاح';
  const named = courseTitle.trim().length > 0 ? escapeHtml(courseTitle.trim()) : 'الدورة';
  const plain = courseTitle.trim().length > 0 ? courseTitle.trim() : 'الدورة';

  /* One primary action per message (§3), so the certificate replaces the path
     link when there is one rather than competing with it. */
  const certified = certificateUrl !== null;

  return {
    subject: heading,
    html: layout(
      heading,
      `<p style="margin:0;">تهانينا، لقد اجتزت «${named}» بنجاح${
        certified ? '، وصدرت شهادتك' : ''
      }.</p>
       ${certified ? button(certificateUrl, 'عرض الشهادة') : button(myPathUrl, 'عرض مساري')}`,
    ),
    text: [
      heading,
      '',
      `تهانينا، لقد اجتزت «${plain}» بنجاح${certified ? '، وصدرت شهادتك' : ''}.`,
      '',
      certified ? 'عرض الشهادة:' : 'تابع تقدّمك:',
      certified ? certificateUrl : myPathUrl,
    ].join('\n'),
  };
}

/**
 * "You finished your path" (§2 notifications — transactional only).
 *
 * **This one does get its own message**, unlike the course certificate folded
 * into the pass email. Finishing a whole path is a distinct event from passing
 * the last course in it, and it happens once per learner under the one-path
 * rule (D-002) — folding it in would bury the larger award behind the smaller.
 *
 * `certificateUrl` is nullable for the same reason as the course email: the
 * path is finished whether or not the render succeeded, and announcing a
 * certificate that is not there would be worse than saying nothing about it.
 */
export function pathCompletedEmail(
  pathName: string,
  myPathUrl: string,
  certificateUrl: string | null,
): EmailContent {
  const heading = 'أتممت مسارك بنجاح';
  const named = pathName.trim().length > 0 ? escapeHtml(pathName.trim()) : 'مسارك';
  const plain = pathName.trim().length > 0 ? pathName.trim() : 'مسارك';
  const certified = certificateUrl !== null;

  return {
    subject: heading,
    html: layout(
      heading,
      `<p style="margin:0;">تهانينا، لقد أتممت جميع دورات «${named}» بنجاح${
        certified ? '، وصدرت شهادة إتمام المسار' : ''
      }.</p>
       ${certified ? button(certificateUrl, 'عرض شهادة المسار') : button(myPathUrl, 'عرض مساري')}`,
    ),
    text: [
      heading,
      '',
      `تهانينا، لقد أتممت جميع دورات «${plain}» بنجاح${
        certified ? '، وصدرت شهادة إتمام المسار' : ''
      }.`,
      '',
      certified ? 'عرض شهادة المسار:' : 'عرض مساري:',
      certified ? certificateUrl : myPathUrl,
    ].join('\n'),
  };
}

/**
 * Minimal HTML escaping for values that did not originate in this file.
 *
 * The other templates interpolate only URLs we built and numbers we computed;
 * a course title is neither, so it gets escaped rather than trusted.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
