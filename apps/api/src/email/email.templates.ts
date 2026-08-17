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
