import type { LmsCourse } from '../lms.types';

/**
 * Canned catalogue for the mock LMS.
 *
 * Titles are Arabic because every downstream consumer — the catalogue page, the
 * course card, the certificate — is Arabic-first, and mock data in English would
 * hide RTL layout problems until Phase 2.
 *
 * Deliberately *not* organised by career path or tagged with a RIASEC letter:
 * that is product metadata our own database layers on top (CLAUDE.md §6), and
 * putting it here would imply the LMS owns it. These are just courses.
 */
export const MOCK_COURSES: readonly LmsCourse[] = [
  {
    lmsCourseId: 101,
    title: 'مقدمة في إدارة المشاريع',
    summary: 'أساسيات تخطيط المشاريع وتنفيذها ومتابعتها في القطاع الحكومي.',
    durationMinutes: 240,
    visible: true,
  },
  {
    lmsCourseId: 102,
    title: 'تحليل البيانات للمبتدئين',
    summary: 'جمع البيانات وتنظيمها واستخلاص المؤشرات الأساسية منها.',
    durationMinutes: 300,
    visible: true,
  },
  {
    lmsCourseId: 103,
    title: 'مهارات التواصل المؤسسي',
    summary: 'التواصل الفعّال داخل الفريق ومع الجهات الأخرى.',
    durationMinutes: 180,
    visible: true,
  },
  {
    lmsCourseId: 104,
    title: 'أمن المعلومات الأساسي',
    summary: 'حماية البيانات وكلمات المرور والتعامل مع محاولات التصيّد.',
    durationMinutes: 150,
    visible: true,
  },
  {
    lmsCourseId: 105,
    title: 'الكتابة الإدارية',
    summary: 'صياغة المذكرات والتقارير الرسمية بلغة واضحة.',
    durationMinutes: 120,
    visible: true,
  },
  {
    lmsCourseId: 106,
    title: 'أساسيات الموارد البشرية',
    summary: 'دورة حياة الموظف والسياسات المرتبطة بها.',
    durationMinutes: 210,
    visible: true,
  },
  {
    lmsCourseId: 107,
    title: 'الجودة وتحسين الإجراءات',
    summary: 'قياس الإجراءات وتبسيطها وتقليل زمن الإنجاز.',
    durationMinutes: 270,
    visible: true,
  },
  {
    lmsCourseId: 108,
    title: 'مقدمة في الحوكمة والامتثال',
    summary: 'الأطر التنظيمية والرقابة الداخلية والالتزام بها.',
    durationMinutes: 240,
    visible: true,
  },
  {
    lmsCourseId: 109,
    title: 'العمل الميداني والسلامة',
    summary: 'إجراءات السلامة والتعامل مع المواقف الميدانية.',
    durationMinutes: 180,
    visible: true,
  },
  {
    lmsCourseId: 110,
    title: 'التصميم البصري للعروض',
    summary: 'إعداد عروض تقديمية واضحة ومتناسقة.',
    durationMinutes: 150,
    visible: true,
  },
  {
    lmsCourseId: 111,
    title: 'خدمة المتعاملين',
    summary: 'استقبال الطلبات ومعالجتها ورفع مستوى الرضا.',
    durationMinutes: 165,
    visible: true,
  },
  {
    /* One hidden course on purpose: catalogue sync in Phase 2 must handle a
       course the LMS is not currently showing, and a mock where everything is
       visible would never exercise that branch. */
    lmsCourseId: 112,
    title: 'دورة قديمة (مخفية)',
    summary: 'دورة لم تعد معروضة للمتعلمين الجدد.',
    durationMinutes: 90,
    visible: false,
  },
];

/** Fixed base so handoff URLs are stable and assertable in tests. */
export const MOCK_LMS_BASE_URL = 'http://localhost:8080';
