import type { PathStatus, RiasecLetter } from '@tamkeen/types';

/**
 * Paths, their levels, what is placed on them, and the course metadata the LMS
 * does not model.
 *
 * The split here is the §6 source-of-truth rule made concrete:
 *
 *  - **The LMS owns** a course's existence, title, summary and duration. Those
 *    arrive through `LmsPort.listCourses()` and are cached in `courses`.
 *  - **We own** the ladder: which paths a course belongs to, which rung it sits
 *    on, in what order, and the objectives/prerequisites §4.7 requires.
 *
 * Objectives and prerequisites are ours rather than the LMS's on purpose.
 * Moodle has no first-class field for either, so adding them to `LmsPort` would
 * hand the Phase 2 adapter responsibility for data Moodle does not hold — it
 * would have to parse them out of a summary and would get it wrong. Phase 4
 * gives entities a screen to edit them; until then they are seeded.
 */

/** One rung, and what an administrator has placed on it. */
export interface SeedLevel {
  name: string;
  /** LMS course ids, in the order they are worked through. */
  courses: number[];
}

export interface SeedPath {
  /** Stable identifier for idempotent re-seeding. */
  key: string;
  name: string;
  description: string;
  /**
   * PLACEHOLDER pending directorate sign-off (TAM-150) — plausible for each
   * path's actual subject matter, so §4C.4 has something concrete to edit
   * rather than a templated blank, but not authored by the directorate and
   * not to be treated as final. The ticket is not done until these are
   * replaced with signed-off content, the same rule the landing copy already
   * lives under.
   */
  skillOutcomes: string[];
  /** Nominal effort for the whole path, shown on the §4.4 card. */
  typicalDurationMinutes: number;
  /** The ministry's own ordering of the catalogue. */
  displayOrder: number;
  /**
   * Drives the gold recommendation (TAM-147) — kept alongside D-134's own
   * ladder/placement below, not replaced by it. PLACEHOLDER pending
   * directorate sign-off, same as `skillOutcomes` above: plausible for each
   * path's subject, not yet an authored decision.
   */
  riasecLetter: RiasecLetter;
  /**
   * Only a path with an authored placement bank may be published (D-134):
   * without one, nobody assigned to it could ever be placed, and `pathBlockers`
   * refuses it. All three ship PUBLISHED because all three have a bank.
   */
  status: PathStatus;
  /** The ladder, bottom rung first. */
  levels: SeedLevel[];
  /**
   * In the path, on no rung — the state an entity's proposal lands in before an
   * administrator places it (D-134).
   *
   * Seeded deliberately rather than left empty: §4C.4's whole job is this queue,
   * and a screen that is empty on a fresh database teaches nothing about what it
   * is for. Each one is placed on a rung of *another* path, so nothing in the
   * catalogue is unreachable while the queue still has something in it.
   */
  unassignedCourses: number[];
}

/**
 * Three paths, each a three-rung ladder.
 *
 * Three rungs rather than two so that a placement can land *between* the ends —
 * a two-level path only ever answers "beginner or not", and every off-by-one in
 * the band arithmetic would be invisible in it.
 *
 * **The rungs are named in each subject's own vocabulary.** English carries the
 * CEFR bands, because that is what a language learner and an HR file both
 * already understand by "B1" — translating it into «متقدم» would throw away the
 * one label that is portable outside this platform. Arabic and communication
 * skills have no such external framework, so their rungs are simply the stages
 * they are: «المرحلة الأولى» and after it.
 *
 * All three ship PUBLISHED, each with an authored placement bank
 * (`SEED_ASSESSMENTS`), so a fresh database offers three paths a learner can
 * actually be assigned and placed on.
 */
export const SEED_PATHS: readonly SeedPath[] = [
  {
    key: 'english',
    name: 'مسار اللغة الإنجليزية',
    description:
      'مسار متدرج في اللغة الإنجليزية من المستوى المبتدئ إلى المتقدم، موجّه لاستخدامها في العمل: المراسلة، والاجتماعات، والتقارير.',
    skillOutcomes: [
      'المراسلة بالإنجليزية في العمل الرسمي',
      'متابعة اجتماع أو عرض بالإنجليزية',
      'كتابة تقرير بالإنجليزية بلغة دقيقة',
    ],
    typicalDurationMinutes: 2220,
    displayOrder: 1,
    riasecLetter: 'S',
    status: 'PUBLISHED',
    levels: [
      { name: 'مبتدئ (A1–A2)', courses: [101, 102, 103, 104] },
      { name: 'متوسط (B1–B2)', courses: [105, 106, 107, 108] },
      { name: 'متقدم (C1)', courses: [109, 110] },
    ],
    /* Placed on the first rung of «مهارات التواصل»: listening is the same skill
       in either language, and the queue is where an administrator decides
       whether this path wants it too. */
    unassignedCourses: [121],
  },
  {
    key: 'arabic',
    name: 'مسار اللغة العربية',
    description:
      'مسار في العربية المكتوبة والمنطوقة كما تُستخدم في الجهة: الإملاء والنحو التطبيقي، ثم المراسلات والتقارير، ثم صياغة النصوص التنظيمية.',
    skillOutcomes: [
      'الكتابة الإدارية بلغة سليمة',
      'تحرير التقارير والمحاضر',
      'تدقيق النصوص قبل اعتمادها',
    ],
    typicalDurationMinutes: 2100,
    displayOrder: 2,
    riasecLetter: 'C',
    status: 'PUBLISHED',
    levels: [
      { name: 'المرحلة الأولى', courses: [111, 112, 113] },
      { name: 'المرحلة الثانية', courses: [114, 115, 116] },
      { name: 'المرحلة الثالثة', courses: [117, 118, 119] },
    ],
    unassignedCourses: [124],
  },
  {
    key: 'communication-skills',
    name: 'مسار مهارات التواصل',
    description:
      'مسار في التواصل داخل الجهة ومع المتعاملين: الإنصات وإدارة الاجتماعات، ثم العرض والإقناع، ثم التفاوض والتواصل في المواقف الصعبة.',
    skillOutcomes: [
      'إدارة اجتماع وتوثيق قراراته',
      'العرض والإقناع أمام جمهور',
      'التعامل مع الخلاف والمواقف الصعبة',
    ],
    typicalDurationMinutes: 1560,
    displayOrder: 3,
    riasecLetter: 'E',
    status: 'PUBLISHED',
    levels: [
      { name: 'المرحلة الأولى', courses: [120, 121, 122] },
      { name: 'المرحلة الثانية', courses: [123, 124] },
      { name: 'المرحلة الثالثة', courses: [125, 126, 127] },
    ],
    /* Both belong to another path's ladder and are offered here as well —
       written communication and presenting are the two places these three
       subjects genuinely overlap (D-003). */
    unassignedCourses: [114, 108],
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
  /* ── English ──────────────────────────────────────────────────────────── */
  101: {
    objectives: [
      'نطق الحروف والأصوات الإنجليزية نطقًا مفهومًا.',
      'قراءة الكلمات القصيرة وكتابتها.',
      'تقديم النفس بجملة أو جملتين.',
    ],
    prerequisites: null,
  },
  102: {
    objectives: [
      'استخدام عبارات التحية والتعريف في المكتب.',
      'طلب المساعدة وتوجيه سؤال بسيط.',
      'فهم التعليمات القصيرة المتكررة في العمل.',
    ],
    prerequisites: null,
  },
  103: {
    objectives: [
      'التمييز بين المضارع والماضي والمستقبل البسيط.',
      'بناء جملة صحيحة في كل زمن منها.',
      'تصحيح الأخطاء الشائعة في تصريف الفعل.',
    ],
    prerequisites: null,
  },
  104: {
    objectives: [
      'إدارة حوار قصير لاستقبال زائر أو تحويل مكالمة.',
      'تحديد موعد والاتفاق على وقته.',
      'إعادة صياغة ما لم يُفهم بدل إنهاء الحوار.',
    ],
    prerequisites: 'إتمام «الإنجليزية اليومية في بيئة العمل» أو ما يعادله.',
  },
  105: {
    objectives: [
      'قراءة نص إداري قصير واستخراج المطلوب منه.',
      'تخمين معنى الكلمة من سياقها قبل القاموس.',
      'التمييز بين الفكرة الرئيسية والتفصيل.',
    ],
    prerequisites: null,
  },
  106: {
    objectives: [
      'كتابة رسالة عمل واضحة بطلب واحد محدد.',
      'اختيار درجة الرسمية المناسبة للمخاطَب.',
      'الردّ على رسالة والاعتذار عن طلب بلباقة.',
    ],
    prerequisites: null,
  },
  107: {
    objectives: [
      'متابعة اجتماع بالإنجليزية دون فقدان الخيط.',
      'تدوين القرارات والمهام أثناء الحديث.',
      'طلب الإعادة أو التوضيح عند اللزوم.',
    ],
    prerequisites: null,
  },
  108: {
    objectives: [
      'إعداد عرض قصير بالإنجليزية ببنية واضحة.',
      'تقديمه بلغة بسيطة ومفهومة.',
      'الإجابة عن أسئلة الحضور والتعامل مع ما لا تعرفه.',
    ],
    prerequisites: null,
  },
  109: {
    objectives: [
      'كتابة تقرير مطوّل ببنية منطقية متماسكة.',
      'استخدام لغة دقيقة تحتمل معنى واحدًا.',
      'مراجعة النص وتحريره قبل اعتماده.',
    ],
    prerequisites: 'إتقان الإنجليزية عند المستوى المتوسط (B2) أو ما يعادله.',
  },
  110: {
    objectives: [
      'ترجمة نص إداري قصير ترجمة أمينة.',
      'التعامل مع المصطلح الذي لا مقابل مباشر له.',
      'مراجعة الترجمة مقابل أصلها.',
    ],
    prerequisites: 'إتقان الإنجليزية عند المستوى المتقدم (C1).',
  },

  /* ── Arabic ───────────────────────────────────────────────────────────── */
  111: {
    objectives: [
      'كتابة الهمزات والتاءين كتابة صحيحة.',
      'وضع الفاصلة والنقطة في مواضعها.',
      'مراجعة نص قصير وتصحيح إملائه.',
    ],
    prerequisites: null,
  },
  112: {
    objectives: [
      'التمييز بين الجملة الاسمية والفعلية.',
      'ترتيب عناصر الجملة بما يوضح المعنى.',
      'تفكيك الجملة الطويلة إلى جملتين مفهومتين.',
    ],
    prerequisites: null,
  },
  113: {
    objectives: [
      'إعراب ما يرد في النصوص الإدارية من مرفوعات ومنصوبات.',
      'تصحيح الخطأ النحوي الشائع في المراسلات.',
      'ضبط أواخر الكلمات حين يلزم الضبط.',
    ],
    prerequisites: 'إتمام «بناء الجملة العربية السليمة» أو ما يعادله.',
  },
  114: {
    objectives: [
      'صياغة مذكرة رسمية بطلب واحد واضح.',
      'اختيار الصيغة المناسبة للمخاطَب ودرجته.',
      'اختصار الخطاب دون إخلال بمضمونه.',
    ],
    prerequisites: null,
  },
  115: {
    objectives: [
      'كتابة محضر اجتماع يفهمه من لم يحضره.',
      'إعداد تقرير دوري يفصل الواقعة عن الرأي.',
      'عرض الأرقام في التقرير عرضًا مقروءًا.',
    ],
    prerequisites: null,
  },
  116: {
    objectives: [
      'حذف الحشو دون فقدان المعنى.',
      'استبدال العبارة الطويلة بأخرى أدق.',
      'مراجعة نص جاهز واختصاره إلى نصفه.',
    ],
    prerequisites: null,
  },
  117: {
    objectives: [
      'مراجعة نص لغويًا قبل اعتماده.',
      'التمييز بين الخطأ والاختيار الأسلوبي.',
      'توحيد المصطلح والرسم عبر النص الواحد.',
    ],
    prerequisites: null,
  },
  118: {
    objectives: [
      'صياغة مادة تنظيمية لا تحتمل أكثر من معنى.',
      'الإحالة إلى مواد أخرى إحالة صحيحة.',
      'مراجعة اللائحة بحثًا عن التعارض والتكرار.',
    ],
    prerequisites: 'إتمام «النحو التطبيقي: المرفوعات والمنصوبات».',
  },
  119: {
    objectives: [
      'إعداد كلمة رسمية قصيرة ومتماسكة.',
      'إلقاؤها بلغة سليمة ونبرة مناسبة.',
      'التعامل مع التلعثم والوقفات أثناء الإلقاء.',
    ],
    prerequisites: null,
  },

  /* ── Communication skills ─────────────────────────────────────────────── */
  120: {
    objectives: [
      'اختيار قناة التواصل المناسبة للرسالة.',
      'صياغة رسالة برسالة واحدة واضحة.',
      'التمييز بين ما يُكتب وما يُقال.',
    ],
    prerequisites: null,
  },
  121: {
    objectives: [
      'الإنصات حتى نهاية الحديث قبل الرد.',
      'طرح سؤال يوضّح بدل سؤال يُربك.',
      'إعادة صياغة ما سمعته للتأكد من فهمه.',
    ],
    prerequisites: null,
  },
  122: {
    objectives: [
      'استقبال طلب المتعامل وفهمه بدقة.',
      'إدارة توقعاته بشأن المدة والنتيجة.',
      'إغلاق المعاملة بإجابة واضحة لا بوعد مفتوح.',
    ],
    prerequisites: null,
  },
  123: {
    objectives: [
      'إعداد جدول أعمال يحدد ما يُقرَّر.',
      'إدارة النقاش وإعادته إلى موضوعه.',
      'توثيق القرارات والمهام بصيغة قابلة للمتابعة.',
    ],
    prerequisites: null,
  },
  124: {
    objectives: [
      'بناء رسالة مقنعة تبدأ بما يهم المستمع.',
      'تقديمها بثقة وبإيقاع مناسب.',
      'التعامل مع الاعتراض دون مواجهة.',
    ],
    prerequisites: null,
  },
  125: {
    objectives: [
      'تحضير موقفك وبدائلك قبل التفاوض.',
      'الوصول إلى اتفاق دون تصعيد.',
      'حفظ العلاقة بعد انتهاء الخلاف.',
    ],
    prerequisites: 'إتمام «الإنصات الفعّال وطرح الأسئلة».',
  },
  126: {
    objectives: [
      'تحديد ما يُقال ومتى ولمن في الموقف الصعب.',
      'إبلاغ الخبر السيئ بوضوح ومسؤولية.',
      'تجنّب الوعد الذي لا يمكن الوفاء به.',
    ],
    prerequisites: null,
  },
  127: {
    objectives: [
      'كتابة رسالة قصيرة برسالة واحدة واضحة.',
      'اختيار النبرة المناسبة لمجموعة العمل.',
      'معرفة متى ينتقل الموضوع من الرسالة إلى الاجتماع.',
    ],
    prerequisites: null,
  },
};
