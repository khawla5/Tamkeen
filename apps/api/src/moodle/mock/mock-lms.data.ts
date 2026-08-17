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
 *
 * Phase 1 grew this from 12 to 48. Twelve could not support twelve paths each
 * offering a genuine 5-10 choice, so the build page would have been a formality
 * rather than a decision. The *shape* of the data is unchanged — this is still
 * only what an LMS knows about a course.
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
    title: 'الأرشفة الورقية التقليدية',
    summary: 'دورة لم تعد معروضة للمتعلمين الجدد بعد التحول الرقمي.',
    durationMinutes: 90,
    visible: false,
  },

  // ── Field and facilities ──────────────────────────────────────────────────
  {
    lmsCourseId: 113,
    title: 'إدارة المواقع الميدانية',
    summary: 'تنظيم فرق العمل في الموقع وتوزيع المهام ومتابعة التنفيذ.',
    durationMinutes: 200,
    visible: true,
  },
  {
    lmsCourseId: 114,
    title: 'الإسعافات الأولية في بيئة العمل',
    summary: 'التصرف الصحيح في الإصابات الشائعة حتى وصول المختصين.',
    durationMinutes: 120,
    visible: true,
  },
  {
    lmsCourseId: 115,
    title: 'تشغيل الأجهزة والمعدات المكتبية',
    summary: 'الاستخدام الآمن للأجهزة وصيانتها اليومية البسيطة.',
    durationMinutes: 135,
    visible: true,
  },
  {
    lmsCourseId: 116,
    title: 'الصيانة الوقائية للمرافق',
    summary: 'جدولة أعمال الصيانة ومنع الأعطال قبل وقوعها.',
    durationMinutes: 240,
    visible: true,
  },
  {
    lmsCourseId: 117,
    title: 'إدارة المستودعات والعهد',
    summary: 'استلام الأصناف وتخزينها وجرد العهد وتسليمها.',
    durationMinutes: 210,
    visible: true,
  },
  {
    lmsCourseId: 118,
    title: 'السلامة المهنية والوقاية من المخاطر',
    summary: 'تحديد مخاطر بيئة العمل وتطبيق إجراءات الوقاية منها.',
    durationMinutes: 180,
    visible: true,
  },
  {
    lmsCourseId: 119,
    title: 'القيادة الآمنة للمركبات الحكومية',
    summary: 'قواعد الاستخدام والفحص الدوري والتعامل مع الطوارئ.',
    durationMinutes: 150,
    visible: true,
  },
  {
    lmsCourseId: 120,
    title: 'إدارة الأزمات الميدانية',
    summary: 'التنسيق والاتصال واتخاذ القرار أثناء الحوادث.',
    durationMinutes: 225,
    visible: true,
  },

  // ── Research and analysis ─────────────────────────────────────────────────
  {
    lmsCourseId: 121,
    title: 'الإحصاء التطبيقي للقطاع الحكومي',
    summary: 'المقاييس الإحصائية وقراءتها في تقارير الأداء.',
    durationMinutes: 270,
    visible: true,
  },
  {
    lmsCourseId: 122,
    title: 'لوحات المؤشرات وتصور البيانات',
    summary: 'بناء لوحات مؤشرات تعرض الأداء بوضوح لصانع القرار.',
    durationMinutes: 240,
    visible: true,
  },
  {
    lmsCourseId: 123,
    title: 'مناهج البحث وتصميم الدراسات',
    summary: 'صياغة سؤال البحث واختيار المنهج وجمع الأدلة.',
    durationMinutes: 300,
    visible: true,
  },
  {
    lmsCourseId: 124,
    title: 'تقييم أثر السياسات العامة',
    summary: 'قياس نتائج السياسات ومقارنتها بالأهداف المعلنة.',
    durationMinutes: 285,
    visible: true,
  },
  {
    lmsCourseId: 125,
    title: 'أساسيات قواعد البيانات والاستعلامات',
    summary: 'تنظيم البيانات في جداول واستخراج المعلومات منها.',
    durationMinutes: 255,
    visible: true,
  },
  {
    lmsCourseId: 126,
    title: 'التفكير النقدي وحل المشكلات',
    summary: 'تحليل المشكلة وتمييز الأسباب عن الأعراض واختيار الحل.',
    durationMinutes: 165,
    visible: true,
  },
  {
    lmsCourseId: 127,
    title: 'استشراف المستقبل والتخطيط بالسيناريوهات',
    summary: 'قراءة الاتجاهات وبناء سيناريوهات بديلة للتخطيط.',
    durationMinutes: 210,
    visible: true,
  },

  // ── Design and communication ──────────────────────────────────────────────
  {
    lmsCourseId: 128,
    title: 'تصميم الهوية البصرية للجهات الحكومية',
    summary: 'عناصر الهوية وتطبيقها على المواد الرسمية.',
    durationMinutes: 225,
    visible: true,
  },
  {
    lmsCourseId: 129,
    title: 'إنتاج الفيديو القصير للتواصل الحكومي',
    summary: 'التخطيط والتصوير والمونتاج لرسائل قصيرة ومؤثرة.',
    durationMinutes: 195,
    visible: true,
  },
  {
    lmsCourseId: 130,
    title: 'كتابة المحتوى الرقمي',
    summary: 'صياغة نصوص واضحة للمنصات الرقمية تناسب الجمهور.',
    durationMinutes: 150,
    visible: true,
  },
  {
    lmsCourseId: 131,
    title: 'تجربة المستخدم وتصميم الخدمات',
    summary: 'فهم رحلة المتعامل وإعادة تصميم الخدمة حول احتياجه.',
    durationMinutes: 240,
    visible: true,
  },
  {
    lmsCourseId: 132,
    title: 'التصوير الفوتوغرافي المؤسسي',
    summary: 'تغطية الفعاليات وإخراج صور تصلح للنشر الرسمي.',
    durationMinutes: 135,
    visible: true,
  },
  {
    lmsCourseId: 133,
    title: 'رواية القصص في الحملات التوعوية',
    summary: 'بناء رسالة توعوية مؤثرة تصل إلى الجمهور المستهدف.',
    durationMinutes: 180,
    visible: true,
  },

  // ── People and service ────────────────────────────────────────────────────
  {
    lmsCourseId: 134,
    title: 'التعامل مع الحالات الصعبة للمتعاملين',
    summary: 'امتصاص الغضب وإدارة الشكاوى والوصول إلى حل.',
    durationMinutes: 165,
    visible: true,
  },
  {
    lmsCourseId: 135,
    title: 'مهارات التدريب وإعداد المدربين',
    summary: 'تصميم الحقيبة التدريبية وإلقاؤها وقياس أثرها.',
    durationMinutes: 270,
    visible: true,
  },
  {
    lmsCourseId: 136,
    title: 'الإرشاد المهني والدعم في بيئة العمل',
    summary: 'مساندة الزملاء مهنيًا وتوجيههم نحو مصادر المساعدة.',
    durationMinutes: 210,
    visible: true,
  },
  {
    lmsCourseId: 137,
    title: 'العمل الجماعي وإدارة الاختلاف',
    summary: 'بناء الثقة داخل الفريق ومعالجة الخلافات بشكل بنّاء.',
    durationMinutes: 150,
    visible: true,
  },
  {
    lmsCourseId: 138,
    title: 'لغة الإشارة للتواصل مع أصحاب الهمم',
    summary: 'مفردات أساسية لخدمة أصحاب الهمم دون وسيط.',
    durationMinutes: 180,
    visible: true,
  },
  {
    lmsCourseId: 139,
    title: 'التوعية المجتمعية وبناء الشراكات',
    summary: 'تصميم برامج توعوية والتنسيق مع الشركاء المجتمعيين.',
    durationMinutes: 195,
    visible: true,
  },

  // ── Leadership and initiative ─────────────────────────────────────────────
  {
    lmsCourseId: 140,
    title: 'القيادة الفعّالة للفرق الحكومية',
    summary: 'توجيه الفريق نحو الأهداف وتفويض المهام وتحفيز الأداء.',
    durationMinutes: 255,
    visible: true,
  },
  {
    lmsCourseId: 141,
    title: 'التفاوض وإدارة أصحاب المصلحة',
    summary: 'الاستعداد للتفاوض وإدارة توقعات الأطراف والوصول إلى اتفاق.',
    durationMinutes: 210,
    visible: true,
  },
  {
    lmsCourseId: 142,
    title: 'إدارة التغيير المؤسسي',
    summary: 'تهيئة الموظفين للتغيير ومعالجة مقاومته وترسيخه.',
    durationMinutes: 225,
    visible: true,
  },
  {
    lmsCourseId: 143,
    title: 'ريادة المبادرات الحكومية',
    summary: 'تحويل الفكرة إلى مبادرة لها نطاق وموارد ومؤشرات.',
    durationMinutes: 240,
    visible: true,
  },
  {
    lmsCourseId: 144,
    title: 'العرض والإقناع أمام الجمهور',
    summary: 'إعداد العرض وإلقاؤه والتعامل مع الأسئلة بثقة.',
    durationMinutes: 165,
    visible: true,
  },

  // ── Governance and administration ─────────────────────────────────────────
  {
    lmsCourseId: 145,
    title: 'إدارة السجلات والأرشفة الإلكترونية',
    summary: 'تصنيف الوثائق وحفظها واسترجاعها وفق دورة حياة واضحة.',
    durationMinutes: 195,
    visible: true,
  },
  {
    lmsCourseId: 146,
    title: 'الرقابة الداخلية وإدارة المخاطر',
    summary: 'تحديد المخاطر وتصميم الضوابط ومتابعة فاعليتها.',
    durationMinutes: 255,
    visible: true,
  },
  {
    lmsCourseId: 147,
    title: 'إعداد الميزانيات والمتابعة المالية',
    summary: 'بناء الميزانية التشغيلية ومتابعة الصرف والانحرافات.',
    durationMinutes: 270,
    visible: true,
  },
  {
    lmsCourseId: 148,
    title: 'حماية البيانات الشخصية والخصوصية',
    summary: 'التعامل مع بيانات الأفراد وفق مبدأ أقل قدر من البيانات.',
    durationMinutes: 180,
    visible: true,
  },
];

/** Fixed base so handoff URLs are stable and assertable in tests. */
export const MOCK_LMS_BASE_URL = 'http://localhost:8080';
