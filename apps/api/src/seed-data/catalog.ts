import type { RiasecLetter } from '@tamkeen/types';

/**
 * Paths, path membership, and the course metadata the LMS does not model.
 *
 * The split here is the §6 source-of-truth rule made concrete:
 *
 *  - **The LMS owns** a course's existence, title, summary and duration. Those
 *    arrive through `LmsPort.listCourses()` and are cached in `courses`.
 *  - **We own** which paths a course belongs to, its ordering, its RIASEC tag
 *    (via the path), and the objectives/prerequisites §4.7 requires.
 *
 * Objectives and prerequisites are ours rather than the LMS's on purpose.
 * Moodle has no first-class field for either, so adding them to `LmsPort` would
 * hand the Phase 2 adapter responsibility for data Moodle does not hold — it
 * would have to parse them out of a summary and would get it wrong. Phase 4
 * gives entities a screen to edit them; until then they are seeded.
 */

export interface SeedPath {
  /** Stable identifier for idempotent re-seeding. */
  key: string;
  name: string;
  description: string;
  /** Exactly one primary letter (§3A) — this is what drives gold. */
  riasecLetter: RiasecLetter;
  /** Nominal effort for a typical selection, shown on the §4.4 card. */
  typicalDurationMinutes: number;
  /** Curated order *within* a recommendation group. */
  displayOrder: number;
  /** LMS course ids, in the order they are offered on the build page. */
  courses: number[];
}

/**
 * Twelve paths, two per dimension.
 *
 * Two per letter rather than one because the gold rule sorts *within* a letter
 * as well as between letters — with one path per letter that ordering would
 * never be exercised, in the product or in a test.
 *
 * Every path offers 11-12 courses so that choosing 5-10 is a real decision. A
 * path offering exactly 5 would make the minimum a formality and the counter
 * meaningless.
 */
export const SEED_PATHS: readonly SeedPath[] = [
  // ── R — الواقعي ────────────────────────────────────────────────────────────
  {
    key: 'field-operations',
    name: 'العمليات الميدانية والسلامة',
    description:
      'مسار عملي لمن يعمل خارج المكتب: إدارة المواقع، والتعامل مع المخاطر والحوادث، وتطبيق إجراءات السلامة.',
    riasecLetter: 'R',
    typicalDurationMinutes: 1290,
    displayOrder: 1,
    courses: [109, 118, 113, 120, 114, 119, 104, 137, 105, 107, 126],
  },
  {
    key: 'facilities-logistics',
    name: 'المرافق والخدمات اللوجستية',
    description:
      'مسار لتشغيل المرافق وصيانتها وإدارة المستودعات والعهد، مع الجانب المالي والتنظيمي المرتبط بها.',
    riasecLetter: 'R',
    typicalDurationMinutes: 1305,
    displayOrder: 2,
    courses: [116, 117, 115, 118, 114, 109, 147, 107, 105, 104, 137],
  },

  // ── I — البحثي ─────────────────────────────────────────────────────────────
  {
    key: 'data-analytics',
    name: 'تحليل البيانات ودعم القرار',
    description:
      'مسار لتحويل البيانات إلى مؤشرات ولوحات تدعم اتخاذ القرار، من الأساسيات إلى العرض البصري.',
    riasecLetter: 'I',
    typicalDurationMinutes: 1590,
    displayOrder: 1,
    courses: [102, 121, 125, 122, 127, 126, 131, 148, 104, 107, 105],
  },
  {
    key: 'policy-research',
    name: 'البحوث وتقييم السياسات',
    description:
      'مسار لتصميم الدراسات وجمع الأدلة وقياس أثر السياسات العامة وعرض النتائج على صانع القرار.',
    riasecLetter: 'I',
    typicalDurationMinutes: 1620,
    displayOrder: 2,
    courses: [123, 124, 121, 127, 102, 122, 126, 108, 146, 103, 105],
  },

  // ── A — الفني ──────────────────────────────────────────────────────────────
  {
    key: 'digital-content',
    name: 'المحتوى الرقمي والتصميم',
    description:
      'مسار لإنتاج المواد البصرية والرقمية: الهوية، والعروض، والفيديو، وتصميم الخدمة حول المتعامل.',
    riasecLetter: 'A',
    typicalDurationMinutes: 1380,
    displayOrder: 1,
    courses: [128, 110, 131, 129, 130, 132, 133, 144, 103, 105, 126],
  },
  {
    key: 'institutional-communication',
    name: 'الاتصال المؤسسي والتوعية',
    description:
      'مسار لبناء الرسائل التوعوية والحملات، وإدارة الاتصال مع الجمهور والشركاء والإعلام.',
    riasecLetter: 'A',
    typicalDurationMinutes: 1275,
    displayOrder: 2,
    courses: [133, 103, 139, 130, 129, 144, 132, 110, 128, 105, 137],
  },

  // ── S — الاجتماعي ──────────────────────────────────────────────────────────
  {
    key: 'customer-service',
    name: 'خدمة المتعاملين',
    description:
      'مسار للتعامل المباشر مع الجمهور: استقبال الطلبات، ومعالجة الشكاوى، وخدمة أصحاب الهمم.',
    riasecLetter: 'S',
    typicalDurationMinutes: 1215,
    displayOrder: 1,
    courses: [111, 134, 138, 137, 136, 103, 148, 107, 104, 105, 126],
  },
  {
    key: 'training-development',
    name: 'التدريب وتنمية القدرات',
    description:
      'مسار لمن يدرّب زملاءه ويطوّر قدراتهم: إعداد الحقائب، والإلقاء، وقياس أثر التدريب.',
    riasecLetter: 'S',
    typicalDurationMinutes: 1425,
    displayOrder: 2,
    courses: [135, 136, 106, 137, 138, 139, 144, 131, 103, 126, 105],
  },

  // ── E — المبادِر ───────────────────────────────────────────────────────────
  {
    key: 'leadership',
    name: 'القيادة وإدارة الفرق',
    description:
      'مسار لشاغلي المواقع الإشرافية والمرشحين لها: قيادة الفريق، والتفاوض، وإدارة التغيير.',
    riasecLetter: 'E',
    typicalDurationMinutes: 1470,
    displayOrder: 1,
    courses: [140, 141, 142, 143, 144, 106, 137, 127, 103, 107, 126],
  },
  {
    key: 'project-management',
    name: 'إدارة المشاريع والمبادرات',
    description: 'مسار لتحويل المبادرات إلى مشاريع لها نطاق وموارد ومؤشرات، ومتابعتها حتى الإغلاق.',
    riasecLetter: 'E',
    typicalDurationMinutes: 1500,
    displayOrder: 2,
    courses: [101, 143, 142, 141, 140, 107, 146, 121, 122, 126, 105],
  },

  // ── C — التنظيمي ───────────────────────────────────────────────────────────
  {
    key: 'governance-compliance',
    name: 'الحوكمة والامتثال',
    description:
      'مسار للأطر التنظيمية والرقابة الداخلية وإدارة المخاطر وحماية البيانات والالتزام بالسياسات.',
    riasecLetter: 'C',
    typicalDurationMinutes: 1515,
    displayOrder: 1,
    courses: [108, 146, 148, 147, 145, 124, 104, 107, 103, 105, 126],
  },
  {
    key: 'records-administration',
    name: 'الإدارة المكتبية والسجلات',
    description:
      'مسار لتنظيم العمل المكتبي: الأرشفة الإلكترونية، والمراسلات، والعهد، والمتابعة المالية.',
    riasecLetter: 'C',
    typicalDurationMinutes: 1290,
    displayOrder: 2,
    courses: [145, 105, 148, 115, 147, 106, 104, 107, 103, 137, 146, 112],
  },
];

export interface SeedCourseMetadata {
  /** What the learner can do afterwards (§4.7). */
  objectives: string[];
  /** Free-text, Arabic. Null when the course assumes nothing. */
  prerequisites: string | null;
}

/**
 * Product metadata per LMS course id.
 *
 * Keyed by `moodleCourseId` rather than by our own uuid because that is the
 * bridge that survives a re-seed: our ids are generated, the LMS's are stable.
 */
export const COURSE_METADATA: Readonly<Record<number, SeedCourseMetadata>> = {
  101: {
    objectives: [
      'تحديد نطاق المشروع وأهدافه ومخرجاته.',
      'بناء خطة زمنية واقعية وتوزيع الأدوار.',
      'متابعة التنفيذ ورفع تقارير الحالة.',
    ],
    prerequisites: null,
  },
  102: {
    objectives: [
      'جمع البيانات من مصادرها وتنظيفها.',
      'حساب المؤشرات الأساسية وتفسيرها.',
      'عرض النتائج في جدول أو رسم واضح.',
    ],
    prerequisites: null,
  },
  103: {
    objectives: [
      'صياغة رسالة واضحة تناسب المتلقي.',
      'إدارة الاجتماعات وتوثيق قراراتها.',
      'التعامل مع سوء الفهم قبل تفاقمه.',
    ],
    prerequisites: null,
  },
  104: {
    objectives: [
      'التعرف على محاولات التصيّد والإبلاغ عنها.',
      'إدارة كلمات المرور والتحقق بخطوتين.',
      'التعامل الآمن مع الملفات ووسائط التخزين.',
    ],
    prerequisites: null,
  },
  105: {
    objectives: [
      'صياغة المذكرات والخطابات الرسمية.',
      'تنظيم التقرير بحيث تصل الخلاصة أولًا.',
      'تجنّب الحشو والغموض في النص الإداري.',
    ],
    prerequisites: null,
  },
  106: {
    objectives: [
      'فهم دورة حياة الموظف من التعيين حتى الانتهاء.',
      'تطبيق سياسات الإجازات والحضور.',
      'التعامل مع ملفات الموظفين بسرّية.',
    ],
    prerequisites: null,
  },
  107: {
    objectives: [
      'توصيف الإجراء الحالي وقياس زمن إنجازه.',
      'تحديد الخطوات التي لا تضيف قيمة وحذفها.',
      'متابعة أثر التحسين بمؤشرات محددة.',
    ],
    prerequisites: null,
  },
  108: {
    objectives: [
      'التمييز بين الحوكمة والإدارة والرقابة.',
      'قراءة السياسات وتطبيقها في العمل اليومي.',
      'التعرف على مسارات الإبلاغ عن المخالفات.',
    ],
    prerequisites: null,
  },
  109: {
    objectives: [
      'الاستعداد للنزول الميداني وتجهيز المعدات.',
      'تطبيق إجراءات السلامة أثناء العمل.',
      'توثيق ما تم في الموقع ورفعه.',
    ],
    prerequisites: null,
  },
  110: {
    objectives: [
      'بناء عرض تقديمي متدرج وواضح.',
      'استخدام الألوان والخطوط بما يخدم المحتوى.',
      'تبسيط البيانات في رسوم مفهومة.',
    ],
    prerequisites: null,
  },
  111: {
    objectives: [
      'استقبال المتعامل وفهم طلبه بدقة.',
      'إنجاز الطلب أو تحويله للجهة الصحيحة.',
      'قياس رضا المتعامل ومتابعة الملاحظات.',
    ],
    prerequisites: null,
  },
  112: {
    objectives: [
      'تصنيف الوثائق الورقية وترميزها.',
      'حفظ الملفات واسترجاعها يدويًا.',
      'إعداد محضر الإتلاف وفق المدد النظامية.',
    ],
    prerequisites: null,
  },
  113: {
    objectives: [
      'تنظيم فريق الموقع وتوزيع المهام.',
      'متابعة التنفيذ ومعالجة المعوقات.',
      'التنسيق مع الجهات الأخرى في الموقع.',
    ],
    prerequisites: null,
  },
  114: {
    objectives: [
      'تقييم الحالة وطلب المساعدة المناسبة.',
      'التعامل مع الإصابات والحروق الشائعة.',
      'استخدام حقيبة الإسعافات بشكل صحيح.',
    ],
    prerequisites: null,
  },
  115: {
    objectives: [
      'تشغيل الأجهزة المكتبية بأمان.',
      'إجراء الصيانة اليومية البسيطة.',
      'التعرف على الأعطال التي تستدعي المختص.',
    ],
    prerequisites: null,
  },
  116: {
    objectives: [
      'بناء جدول صيانة وقائية للمرفق.',
      'توثيق أعمال الصيانة ومتابعتها.',
      'تقدير العمر التشغيلي للأصول.',
    ],
    prerequisites: null,
  },
  117: {
    objectives: [
      'استلام الأصناف وفحصها وتخزينها.',
      'إدارة العهد وتسليمها واستردادها.',
      'تنفيذ الجرد الدوري ومعالجة الفروقات.',
    ],
    prerequisites: null,
  },
  118: {
    objectives: [
      'تحديد مخاطر بيئة العمل وتصنيفها.',
      'تطبيق وسائل الوقاية ومعدات الحماية.',
      'الإبلاغ عن الحوادث وأشباه الحوادث.',
    ],
    prerequisites: null,
  },
  119: {
    objectives: [
      'إجراء الفحص الدوري قبل التشغيل.',
      'الالتزام بقواعد استخدام المركبة الحكومية.',
      'التصرف السليم عند العطل أو الحادث.',
    ],
    prerequisites: 'رخصة قيادة سارية.',
  },
  120: {
    objectives: [
      'تفعيل خطة الاستجابة وتحديد الأدوار.',
      'إدارة الاتصال أثناء الأزمة.',
      'توثيق الحدث وإعداد تقرير الدروس المستفادة.',
    ],
    prerequisites: 'يُنصح بإكمال «السلامة المهنية والوقاية من المخاطر».',
  },
  121: {
    objectives: [
      'اختيار المقياس الإحصائي المناسب للسؤال.',
      'قراءة التشتت والاتجاه في البيانات.',
      'تجنّب الاستنتاجات المضللة من الأرقام.',
    ],
    prerequisites: 'يُنصح بإكمال «تحليل البيانات للمبتدئين».',
  },
  122: {
    objectives: [
      'اختيار المؤشرات التي تعبّر عن الأداء فعلًا.',
      'تصميم لوحة تُقرأ في دقيقة واحدة.',
      'ربط اللوحة بمصدر بيانات محدّث.',
    ],
    prerequisites: 'إلمام أساسي بجداول البيانات.',
  },
  123: {
    objectives: [
      'صياغة سؤال بحثي قابل للإجابة.',
      'اختيار المنهج وأداة جمع البيانات.',
      'التعامل مع أخلاقيات البحث وموافقة المشاركين.',
    ],
    prerequisites: null,
  },
  124: {
    objectives: [
      'تحديد أهداف السياسة ومؤشرات نجاحها.',
      'مقارنة النتائج المتحققة بالمستهدف.',
      'صياغة توصيات مبنية على الأدلة.',
    ],
    prerequisites: 'يُنصح بإكمال «مناهج البحث وتصميم الدراسات».',
  },
  125: {
    objectives: [
      'تنظيم البيانات في جداول مترابطة.',
      'كتابة استعلامات لاستخراج المعلومة.',
      'تجنّب تكرار البيانات وتعارضها.',
    ],
    prerequisites: null,
  },
  126: {
    objectives: [
      'تمييز أسباب المشكلة عن أعراضها.',
      'تقييم البدائل وفق معايير واضحة.',
      'اختبار الافتراضات قبل اعتمادها.',
    ],
    prerequisites: null,
  },
  127: {
    objectives: [
      'رصد الاتجاهات المؤثرة على القطاع.',
      'بناء سيناريوهات بديلة للمستقبل.',
      'ترجمة السيناريو إلى استعداد عملي.',
    ],
    prerequisites: null,
  },
  128: {
    objectives: [
      'تطبيق عناصر الهوية على المواد الرسمية.',
      'الحفاظ على اتساق الهوية عبر القنوات.',
      'إعداد ملفات جاهزة للطباعة والنشر.',
    ],
    prerequisites: null,
  },
  129: {
    objectives: [
      'كتابة سيناريو قصير لرسالة محددة.',
      'التصوير بإضاءة وصوت مقبولين.',
      'إجراء المونتاج وإخراج النسخة النهائية.',
    ],
    prerequisites: null,
  },
  130: {
    objectives: [
      'كتابة نص رقمي موجز وواضح.',
      'مخاطبة الجمهور المستهدف بلغته.',
      'مراجعة النص وتحريره قبل النشر.',
    ],
    prerequisites: null,
  },
  131: {
    objectives: [
      'رسم رحلة المتعامل وتحديد نقاط التعثّر.',
      'إعادة تصميم الخطوة حول احتياج المستخدم.',
      'اختبار التصميم مع مستخدمين حقيقيين.',
    ],
    prerequisites: null,
  },
  132: {
    objectives: [
      'ضبط الكاميرا للتصوير في الفعاليات.',
      'اختيار الزوايا التي تخدم الرسالة.',
      'معالجة الصور وأرشفتها للنشر.',
    ],
    prerequisites: null,
  },
  133: {
    objectives: [
      'بناء رسالة توعوية حول قصة واضحة.',
      'اختيار القناة المناسبة للجمهور.',
      'قياس وصول الحملة وأثرها.',
    ],
    prerequisites: null,
  },
  134: {
    objectives: [
      'التعامل مع الغضب دون تصعيد.',
      'تحويل الشكوى إلى حل قابل للتنفيذ.',
      'توثيق الحالة والمتابعة حتى الإغلاق.',
    ],
    prerequisites: 'يُنصح بإكمال «خدمة المتعاملين».',
  },
  135: {
    objectives: [
      'تصميم حقيبة تدريبية بأهداف قابلة للقياس.',
      'إدارة القاعة وإشراك المتدربين.',
      'قياس أثر التدريب بعد فترة من انتهائه.',
    ],
    prerequisites: 'خبرة عملية لا تقل عن سنة في مجال التخصص.',
  },
  136: {
    objectives: [
      'الاستماع الفعّال وفهم احتياج الزميل.',
      'التوجيه نحو مصادر الدعم المناسبة.',
      'الحفاظ على السرّية وحدود الدور.',
    ],
    prerequisites: null,
  },
  137: {
    objectives: [
      'بناء الثقة والاتفاق على قواعد العمل.',
      'معالجة الخلاف قبل أن يتحول إلى نزاع.',
      'إعطاء التغذية الراجعة وتلقيها.',
    ],
    prerequisites: null,
  },
  138: {
    objectives: [
      'استخدام المفردات الأساسية في الخدمة.',
      'استقبال المتعامل من أصحاب الهمم دون وسيط.',
      'تهيئة بيئة الخدمة لتكون ميسّرة.',
    ],
    prerequisites: null,
  },
  139: {
    objectives: [
      'تصميم برنامج توعوي لفئة محددة.',
      'التنسيق مع الشركاء المجتمعيين.',
      'قياس مشاركة المجتمع وأثر البرنامج.',
    ],
    prerequisites: null,
  },
  140: {
    objectives: [
      'تحديد الأهداف وتفويض المهام بوضوح.',
      'إدارة الأداء والتغذية الراجعة.',
      'تحفيز الفريق ومعالجة ضعف الأداء.',
    ],
    prerequisites: 'مخصصة لشاغلي المواقع الإشرافية أو المرشحين لها.',
  },
  141: {
    objectives: [
      'الاستعداد للتفاوض وتحديد البدائل.',
      'إدارة توقعات الأطراف المختلفة.',
      'الوصول إلى اتفاق قابل للتنفيذ وتوثيقه.',
    ],
    prerequisites: null,
  },
  142: {
    objectives: [
      'تهيئة الموظفين للتغيير والتواصل بشأنه.',
      'فهم أسباب المقاومة ومعالجتها.',
      'ترسيخ التغيير في الإجراءات اليومية.',
    ],
    prerequisites: null,
  },
  143: {
    objectives: [
      'تحويل الفكرة إلى مبادرة لها نطاق وموارد.',
      'بناء حالة عمل مقنعة لأصحاب القرار.',
      'تحديد مؤشرات النجاح ومتابعتها.',
    ],
    prerequisites: null,
  },
  144: {
    objectives: [
      'بناء العرض حول رسالة واحدة واضحة.',
      'الإلقاء بلغة جسد وصوت يدعمان المحتوى.',
      'إدارة الأسئلة والاعتراضات بثقة.',
    ],
    prerequisites: null,
  },
  145: {
    objectives: [
      'تصنيف الوثائق وفق دليل موحّد.',
      'الأرشفة الإلكترونية والاسترجاع السريع.',
      'تطبيق مدد الحفظ والإتلاف النظامية.',
    ],
    prerequisites: null,
  },
  146: {
    objectives: [
      'تحديد المخاطر وتقدير أثرها واحتمالها.',
      'تصميم الضوابط الرقابية المناسبة.',
      'متابعة فاعلية الضوابط وتحديث السجل.',
    ],
    prerequisites: 'يُنصح بإكمال «مقدمة في الحوكمة والامتثال».',
  },
  147: {
    objectives: [
      'إعداد الميزانية التشغيلية وتقدير البنود.',
      'متابعة الصرف وتحليل الانحرافات.',
      'إعداد التقارير المالية الدورية.',
    ],
    prerequisites: null,
  },
  148: {
    objectives: [
      'تطبيق مبدأ جمع أقل قدر من البيانات.',
      'التعامل مع طلبات أصحاب البيانات.',
      'التعرف على حالات التسريب والإبلاغ عنها.',
    ],
    prerequisites: null,
  },
};
