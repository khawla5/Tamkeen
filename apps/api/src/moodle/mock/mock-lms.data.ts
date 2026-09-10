import type { LmsCourse } from '../lms.types';

/**
 * Canned catalogue for the mock LMS.
 *
 * Titles are Arabic because every downstream consumer — the catalogue page, the
 * course card, the certificate — is Arabic-first, and mock data in English would
 * hide RTL layout problems until Phase 2. That holds for the English-language
 * courses too: a ministry names its training in Arabic whatever language the
 * training is *in*, and «الإنجليزية للمراسلات الرسمية» is the real shape of
 * that row.
 *
 * Deliberately *not* organised by path or rung: that is product metadata our own
 * database layers on top (CLAUDE.md §6), and putting it here would imply the LMS
 * owns it. These are just courses.
 *
 * **Twenty-seven, not forty-eight.** The catalogue was a broad sweep of ministry
 * operations while twelve paths needed filling. It now serves three — English,
 * Arabic and communication skills — so it is the courses those three are made
 * of and nothing else. A catalogue carrying subjects no path teaches is content
 * no learner can be routed to, which is exactly what the seed's own tests
 * refuse.
 */
export const MOCK_COURSES: readonly LmsCourse[] = [
  /* ── English (مسار اللغة الإنجليزية) ──────────────────────────────────── */
  {
    lmsCourseId: 101,
    title: 'الإنجليزية للمبتدئين: الأصوات والحروف',
    summary: 'نطق الحروف والأصوات وقراءة الكلمات القصيرة، لمن يبدأ من الصفر.',
    durationMinutes: 240,
    visible: true,
  },
  {
    lmsCourseId: 102,
    title: 'الإنجليزية اليومية في بيئة العمل',
    summary: 'عبارات التحية والتعريف بالنفس وطلب المساعدة داخل المكتب.',
    durationMinutes: 180,
    visible: true,
  },
  {
    lmsCourseId: 103,
    title: 'القواعد الأساسية: الأزمنة البسيطة',
    summary: 'المضارع والماضي والمستقبل البسيط وبناء جملة صحيحة بها.',
    durationMinutes: 210,
    visible: true,
  },
  {
    lmsCourseId: 104,
    title: 'المحادثة الوظيفية للمبتدئين',
    summary: 'حوارات قصيرة: استقبال زائر، تحويل مكالمة، تحديد موعد.',
    durationMinutes: 150,
    visible: true,
  },
  {
    lmsCourseId: 105,
    title: 'القراءة والاستيعاب — المستوى المتوسط',
    summary: 'قراءة نصوص إدارية قصيرة واستخراج المعلومة المطلوبة منها.',
    durationMinutes: 240,
    visible: true,
  },
  {
    lmsCourseId: 106,
    title: 'المراسلات والبريد الإلكتروني بالإنجليزية',
    summary: 'صياغة رسائل عمل واضحة ومهذّبة والردّ عليها.',
    durationMinutes: 210,
    visible: true,
  },
  {
    lmsCourseId: 107,
    title: 'الاستماع وتدوين الملاحظات بالإنجليزية',
    summary: 'متابعة اجتماع أو عرض بالإنجليزية وتدوين ما يلزم منه.',
    durationMinutes: 180,
    visible: true,
  },
  {
    lmsCourseId: 108,
    title: 'العروض التقديمية بالإنجليزية',
    summary: 'إعداد عرض قصير وتقديمه والإجابة عن الأسئلة بالإنجليزية.',
    durationMinutes: 240,
    visible: true,
  },
  {
    lmsCourseId: 109,
    title: 'الكتابة التقريرية المتقدمة بالإنجليزية',
    summary: 'تقارير ومذكرات مطوّلة بلغة دقيقة وبنية منطقية.',
    durationMinutes: 300,
    visible: true,
  },
  {
    /* Hidden on purpose: §2/D-015 distinguishes "available to add" from "still
       completable if already enrolled", and a mock where everything is visible
       would never exercise that branch. */
    lmsCourseId: 110,
    title: 'الترجمة التحريرية من الإنجليزية وإليها',
    summary: 'دورة لم تعد معروضة للمتدربين الجدد بعد مراجعة الخطة التدريبية.',
    durationMinutes: 270,
    visible: false,
  },

  /* ── Arabic (مسار اللغة العربية) ──────────────────────────────────────── */
  {
    lmsCourseId: 111,
    title: 'الإملاء وعلامات الترقيم',
    summary: 'الهمزات والتاء المربوطة والمفتوحة، ومواضع الفاصلة والنقطة.',
    durationMinutes: 180,
    visible: true,
  },
  {
    lmsCourseId: 112,
    title: 'بناء الجملة العربية السليمة',
    summary: 'الجملة الاسمية والفعلية وترتيب عناصرها ووضوح معناها.',
    durationMinutes: 210,
    visible: true,
  },
  {
    lmsCourseId: 113,
    title: 'النحو التطبيقي: المرفوعات والمنصوبات',
    summary: 'إعراب ما يرد في النصوص الإدارية، لا في أمثلة الكتب.',
    durationMinutes: 300,
    visible: true,
  },
  {
    lmsCourseId: 114,
    title: 'الكتابة الإدارية والمراسلات الرسمية',
    summary: 'صياغة المذكرات والخطابات الرسمية بلغة واضحة ومختصرة.',
    durationMinutes: 240,
    visible: true,
  },
  {
    lmsCourseId: 115,
    title: 'تحرير التقارير والمحاضر',
    summary: 'كتابة محضر اجتماع وتقرير دوري يقرؤهما غير الحاضر ويفهمهما.',
    durationMinutes: 210,
    visible: true,
  },
  {
    lmsCourseId: 116,
    title: 'الأسلوب العربي: الإيجاز والوضوح',
    summary: 'اختصار الجملة الطويلة وحذف الحشو دون فقدان المعنى.',
    durationMinutes: 180,
    visible: true,
  },
  {
    lmsCourseId: 117,
    title: 'التدقيق اللغوي للنصوص',
    summary: 'مراجعة نص قبل اعتماده وتصحيح ما فيه لغويًا وأسلوبيًا.',
    durationMinutes: 240,
    visible: true,
  },
  {
    lmsCourseId: 118,
    title: 'صياغة الأنظمة واللوائح',
    summary: 'لغة النص التنظيمي: الدقة، وتجنّب الاحتمال، والإحالة الصحيحة.',
    durationMinutes: 330,
    visible: true,
  },
  {
    lmsCourseId: 119,
    title: 'الإلقاء والخطابة بالعربية الفصحى',
    summary: 'إعداد كلمة رسمية وإلقاؤها أمام جمهور بلغة سليمة.',
    durationMinutes: 210,
    visible: true,
  },

  /* ── Communication skills (مسار مهارات التواصل) ───────────────────────── */
  {
    lmsCourseId: 120,
    title: 'أساسيات التواصل المؤسسي',
    summary: 'قنوات التواصل داخل الجهة ومتى تُستخدم كلٌّ منها.',
    durationMinutes: 150,
    visible: true,
  },
  {
    lmsCourseId: 121,
    title: 'الإنصات الفعّال وطرح الأسئلة',
    summary: 'فهم ما يقوله الطرف الآخر فعلًا قبل الردّ عليه.',
    durationMinutes: 120,
    visible: true,
  },
  {
    lmsCourseId: 122,
    title: 'التواصل مع المتعاملين',
    summary: 'استقبال الطلب وإدارة التوقعات وإغلاق المعاملة بوضوح.',
    durationMinutes: 180,
    visible: true,
  },
  {
    lmsCourseId: 123,
    title: 'إدارة الاجتماعات وتوثيقها',
    summary: 'جدول أعمال، إدارة النقاش، وقرارات مكتوبة يمكن تتبّعها.',
    durationMinutes: 210,
    visible: true,
  },
  {
    lmsCourseId: 124,
    title: 'العرض والإقناع أمام الجمهور',
    summary: 'بناء رسالة مقنعة وتقديمها والتعامل مع الاعتراض.',
    durationMinutes: 240,
    visible: true,
  },
  {
    lmsCourseId: 125,
    title: 'التفاوض وإدارة الخلاف',
    summary: 'الوصول إلى اتفاق دون تصعيد، وحفظ العلاقة بعد الخلاف.',
    durationMinutes: 270,
    visible: true,
  },
  {
    lmsCourseId: 126,
    title: 'التواصل في الأزمات والمواقف الصعبة',
    summary: 'ما يُقال ومتى ولمن حين يكون الخبر سيئًا والوقت ضيقًا.',
    durationMinutes: 240,
    visible: true,
  },
  {
    lmsCourseId: 127,
    title: 'التواصل الكتابي عبر القنوات الرقمية',
    summary: 'الرسائل القصيرة ومجموعات العمل: نبرة مناسبة ورسالة واحدة واضحة.',
    durationMinutes: 150,
    visible: true,
  },
];

/** Fixed base so handoff URLs are stable and assertable in tests. */
export const MOCK_LMS_BASE_URL = 'http://localhost:8080';
