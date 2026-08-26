<?php
// Arabic strings for local_tamkeensso. Arabic-first is a product rule (§2), and
// these messages are the only part of the handoff a learner can ever see.

defined('MOODLE_INTERNAL') || die();

$string['pluginname'] = 'تسجيل الدخول الموحّد لمنصة تمكين';
$string['privacy:metadata'] = 'لا يخزّن هذا الإضافة سوى معرّفات عشوائية للروابط المستخدمة، ولا تحتوي على بيانات شخصية.';
$string['secret'] = 'المفتاح المشترك';
$string['secret_desc'] = 'يجب أن يطابق MOODLE_SSO_SECRET في منصة تمكين، وبطول ٣٢ محرفًا على الأقل.';
$string['allowedframeancestor'] = 'الأصل المسموح له بالتضمين';
$string['allowedframeancestor_desc'] = 'أصل منصة تمكين (scheme://host[:port]) المسموح له بعرض هذا الموقع داخل إطار. يُرسل كترويسة Content-Security-Policy frame-ancestors في كل صفحة. فعّل أيضًا «السماح بتضمين الإطارات» في إعدادات أمان HTTP. تركه فارغًا لا يرسل أي سياسة.';
$string['error_disabled'] = 'لم يتم إعداد تسجيل الدخول الموحّد على هذا الموقع.';
$string['error_invalid'] = 'رابط الدخول غير صالح.';
$string['error_expired'] = 'انتهت صلاحية رابط الدخول. عُد إلى المنصة وافتح الدورة من جديد.';
$string['error_used'] = 'تم استخدام رابط الدخول من قبل. عُد إلى المنصة وافتح الدورة من جديد.';
$string['error_nouser'] = 'لا يطابق رابط الدخول حسابًا نشطًا.';
