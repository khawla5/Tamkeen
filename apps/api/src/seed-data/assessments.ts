/**
 * Seeded placement banks (§4.3, §4C.3, D-134).
 *
 * **PLACEHOLDER CONTENT, and marked as such deliberately.** These are three
 * real, internally consistent Arabic banks — every item has one defensible
 * correct answer and is aimed at a named rung — written so the platform can be
 * run, demonstrated and tested end to end. They are *not* directorate-authored,
 * and the ticket that replaces them is not done until الإدارة العامة للتدريب has
 * signed off a bank per path. The same rule the landing copy lives under.
 *
 * **One per path, and every path has one.** A placement test's items must be
 * about the path's actual subject — there is no such thing as a generic item
 * with a correct answer — so a bank exists only where the subject is one this
 * repository can honestly write items for. Three language and communication
 * paths are exactly that; the moment a path arrives whose subject we cannot
 * write, it ships as a draft and the admin dashboard names it.
 *
 * **The English bank is written in Arabic, and asks about English.** The taker
 * is being placed *into* the English path, so an item they cannot read would
 * measure the wrong thing at the bottom rung and nothing at all at the top. The
 * English under test appears inside the item — the sentence to correct, the
 * phrase to choose — while the question about it is Arabic, which is the same
 * shape a ministry placement paper takes.
 *
 * **No bands are seeded.** With none configured, placement falls back to
 * `defaultPlacementBands` — an even split of the attainable range across the
 * rungs — which is the spec's stated default and is a reasonable starting point
 * for a bank of equal-weight items. §4C.3 is where the ministry tunes them.
 */

export interface SeedAssessmentOption {
  key: string;
  label: string;
}

export interface SeedAssessmentQuestion {
  /** Stable across wording edits, so revising an item does not orphan a response. */
  key: string;
  text: string;
  /** Which rung the item is aimed at, by the level's name in `SEED_PATHS`. */
  levelName: string;
  /** Free authoring grouping. Never read by scoring. */
  topic: string;
  marks: number;
  options: SeedAssessmentOption[];
  /** Index into `options`. Exactly one option is correct. */
  correctIndex: number;
}

export interface SeedAssessment {
  /** The path this bank belongs to, by `SeedPath.key`. */
  pathKey: string;
  title: string;
  description: string;
  questions: SeedAssessmentQuestion[];
}

const DESCRIPTION =
  'اختبار قصير لتحديد نقطة البداية المناسبة لك في هذا المسار. لا يؤثر على تقييمك الوظيفي، ويُجرى مرة واحدة.';

export const SEED_ASSESSMENTS: readonly SeedAssessment[] = [
  {
    pathKey: 'english',
    title: 'تحديد المستوى — اللغة الإنجليزية',
    description: DESCRIPTION,
    questions: [
      {
        key: 'en-01',
        text: 'أيّ الجمل الآتية صحيحة نحويًا؟',
        levelName: 'مبتدئ (A1–A2)',
        topic: 'القواعد الأساسية',
        marks: 1,
        options: [
          { key: 'a', label: 'She works in the finance department.' },
          { key: 'b', label: 'She work in the finance department.' },
          { key: 'c', label: 'She working in the finance department.' },
          { key: 'd', label: 'She is work in the finance department.' },
        ],
        correctIndex: 0,
      },
      {
        key: 'en-02',
        text: 'اتصل بك زميل وطلب التحدث إلى مديرك وهو مشغول. ما الردّ الأنسب؟',
        levelName: 'مبتدئ (A1–A2)',
        topic: 'المحادثة الوظيفية',
        marks: 1,
        options: [
          { key: 'a', label: 'He is in a meeting right now. Can I take a message?' },
          { key: 'b', label: 'He is not here. Goodbye.' },
          { key: 'c', label: 'You call him after.' },
          { key: 'd', label: 'No, he is busy man today.' },
        ],
        correctIndex: 0,
      },
      {
        key: 'en-03',
        text: 'ما الكلمة الصحيحة لإكمال الجملة: «The meeting ___ at nine o’clock yesterday.»؟',
        levelName: 'مبتدئ (A1–A2)',
        topic: 'الأزمنة',
        marks: 1,
        options: [
          { key: 'a', label: 'started' },
          { key: 'b', label: 'starts' },
          { key: 'c', label: 'is starting' },
          { key: 'd', label: 'will start' },
        ],
        correctIndex: 0,
      },
      {
        key: 'en-04',
        text: 'قرأت في رسالة: «Please find the report attached.» ما المقصود؟',
        levelName: 'متوسط (B1–B2)',
        topic: 'المراسلات',
        marks: 1,
        options: [
          { key: 'a', label: 'التقرير مرفق مع الرسالة' },
          { key: 'b', label: 'التقرير سيُرسل لاحقًا' },
          { key: 'c', label: 'المطلوب البحث عن التقرير وإرساله' },
          { key: 'd', label: 'التقرير حُذف من الرسالة' },
        ],
        correctIndex: 0,
      },
      {
        key: 'en-05',
        text: 'أيّ العبارات الآتية أنسب لرسالة رسمية إلى جهة أخرى؟',
        levelName: 'متوسط (B1–B2)',
        topic: 'درجة الرسمية',
        marks: 1,
        options: [
          { key: 'a', label: 'We would appreciate your response by Thursday.' },
          { key: 'b', label: 'Reply to me before Thursday.' },
          { key: 'c', label: 'I need your answer, thanks a lot!' },
          { key: 'd', label: 'Answer fast please.' },
        ],
        correctIndex: 0,
      },
      {
        key: 'en-06',
        text: 'ما الجملة التي تعبّر عن شرط لم يتحقق في الماضي؟',
        levelName: 'متوسط (B1–B2)',
        topic: 'التراكيب',
        marks: 1,
        options: [
          {
            key: 'a',
            label: 'If we had received the file earlier, we would have finished on time.',
          },
          { key: 'b', label: 'If we receive the file earlier, we finish on time.' },
          { key: 'c', label: 'If we will receive the file, we finished on time.' },
          { key: 'd', label: 'If we receiving the file earlier, we would finish.' },
        ],
        correctIndex: 0,
      },
      {
        key: 'en-07',
        text: 'في تقرير رسمي، أيّ صياغة أدقّ للتعبير عن نتيجة غير مؤكدة؟',
        levelName: 'متقدم (C1)',
        topic: 'الكتابة التقريرية',
        marks: 1,
        options: [
          { key: 'a', label: 'The delay may have contributed to the shortfall.' },
          { key: 'b', label: 'The delay caused the shortfall for sure.' },
          { key: 'c', label: 'Maybe the delay is the reason, we think.' },
          { key: 'd', label: 'The shortfall happened because of delay, probably yes.' },
        ],
        correctIndex: 0,
      },
      {
        key: 'en-08',
        text: 'ما معنى «to escalate an issue» في سياق العمل؟',
        levelName: 'متقدم (C1)',
        topic: 'المصطلح المهني',
        marks: 1,
        options: [
          { key: 'a', label: 'رفع المسألة إلى مستوى أعلى لاتخاذ قرار فيها' },
          { key: 'b', label: 'تضخيم المشكلة أمام الفريق' },
          { key: 'c', label: 'تأجيل المسألة إلى اجتماع لاحق' },
          { key: 'd', label: 'إغلاق المسألة دون حل' },
        ],
        correctIndex: 0,
      },
      {
        key: 'en-09',
        text: 'أيّ الجمل الآتية الأوضح والأقل حشوًا في تقرير؟',
        levelName: 'متقدم (C1)',
        topic: 'الأسلوب',
        marks: 1,
        options: [
          { key: 'a', label: 'The committee approved the proposal.' },
          {
            key: 'b',
            label: 'It was decided by the committee that approval of the proposal should be given.',
          },
          { key: 'c', label: 'Approval was what the committee gave to the proposal in question.' },
          { key: 'd', label: 'The proposal, it was approved by the committee members.' },
        ],
        correctIndex: 0,
      },
    ],
  },
  {
    pathKey: 'arabic',
    title: 'تحديد المستوى — اللغة العربية',
    description: DESCRIPTION,
    questions: [
      {
        key: 'ar-01',
        text: 'أيّ الكلمات الآتية كُتبت كتابة صحيحة؟',
        levelName: 'المرحلة الأولى',
        topic: 'الإملاء',
        marks: 1,
        options: [
          { key: 'a', label: 'إنشاء' },
          { key: 'b', label: 'انشاء' },
          { key: 'c', label: 'أنشاء' },
          { key: 'd', label: 'إنشآء' },
        ],
        correctIndex: 0,
      },
      {
        key: 'ar-02',
        text: 'أيّ الجمل الآتية جملة اسمية؟',
        levelName: 'المرحلة الأولى',
        topic: 'بناء الجملة',
        marks: 1,
        options: [
          { key: 'a', label: 'التقريرُ جاهزٌ للاعتماد.' },
          { key: 'b', label: 'اعتمد المديرُ التقريرَ.' },
          { key: 'c', label: 'يُراجع الفريقُ التقريرَ.' },
          { key: 'd', label: 'أرسلنا التقريرَ أمس.' },
        ],
        correctIndex: 0,
      },
      {
        key: 'ar-03',
        text: 'أين توضع الفاصلة في الجملة: «راجعنا التقرير ثم اعتمدناه وأرسلناه إلى الإدارة»؟',
        levelName: 'المرحلة الأولى',
        topic: 'الترقيم',
        marks: 1,
        options: [
          { key: 'a', label: 'بعد «التقرير» وبعد «اعتمدناه»، لفصل الأفعال المتتابعة' },
          { key: 'b', label: 'قبل «راجعنا» فقط' },
          { key: 'c', label: 'بعد «الإدارة» في نهاية الجملة' },
          { key: 'd', label: 'لا تحتاج الجملة إلى فاصلة إطلاقًا' },
        ],
        correctIndex: 0,
      },
      {
        key: 'ar-04',
        text: 'أيّ الصيغ الآتية أنسب لافتتاح خطاب رسمي إلى جهة حكومية؟',
        levelName: 'المرحلة الثانية',
        topic: 'المراسلات',
        marks: 1,
        options: [
          { key: 'a', label: 'إشارةً إلى خطابكم رقم (…) وتاريخ (…)، نفيدكم بالآتي:' },
          { key: 'b', label: 'بخصوص الموضوع المذكور أعلاه، نود إعلامكم بأننا…' },
          { key: 'c', label: 'تحية طيبة وبعد، أردنا أن نقول لكم إن…' },
          { key: 'd', label: 'نكتب إليكم اليوم لكي نخبركم بأمر مهم جدًا.' },
        ],
        correctIndex: 0,
      },
      {
        key: 'ar-05',
        text: 'في محضر اجتماع، أيّ العبارات الآتية توثيق سليم لقرار؟',
        levelName: 'المرحلة الثانية',
        topic: 'المحاضر',
        marks: 1,
        options: [
          {
            key: 'a',
            label:
              'قرّرت اللجنة تأجيل البند إلى اجتماعها القادم، وكُلّفت الإدارة المالية بإعداد التقدير.',
          },
          { key: 'b', label: 'دار نقاش طويل حول البند ولم يُعجب الأعضاء الطرح.' },
          { key: 'c', label: 'يبدو أن اللجنة ستؤجل البند على الأرجح.' },
          { key: 'd', label: 'اتُّفق على شيء بخصوص البند المالي.' },
        ],
        correctIndex: 0,
      },
      {
        key: 'ar-06',
        text: 'أيّ الجمل الآتية أوجز دون إخلال بالمعنى؟',
        levelName: 'المرحلة الثانية',
        topic: 'الأسلوب',
        marks: 1,
        options: [
          { key: 'a', label: 'نأمل اعتماد المرفق.' },
          { key: 'b', label: 'نأمل من سعادتكم التكرم بالاطلاع على المرفق ومن ثم اعتماده.' },
          { key: 'c', label: 'المطلوب هو أن يتم الاعتماد للمرفق المرفق طيه.' },
          { key: 'd', label: 'نرجو التكرم بالنظر في إمكانية اعتماد ما هو مرفق.' },
        ],
        correctIndex: 0,
      },
      {
        key: 'ar-07',
        text: 'أيّ الجمل الآتية ضُبط آخرها ضبطًا صحيحًا؟',
        levelName: 'المرحلة الثالثة',
        topic: 'النحو التطبيقي',
        marks: 1,
        options: [
          { key: 'a', label: 'إنّ الموظفينَ مُلتزمونَ بالدوام.' },
          { key: 'b', label: 'إنّ الموظفونَ مُلتزمينَ بالدوام.' },
          { key: 'c', label: 'إنّ الموظفينَ مُلتزمينَ بالدوام.' },
          { key: 'd', label: 'إنّ الموظفونَ مُلتزمونَ بالدوام.' },
        ],
        correctIndex: 0,
      },
      {
        key: 'ar-08',
        text: 'في نص لائحة، أيّ صياغة لا تحتمل أكثر من معنى؟',
        levelName: 'المرحلة الثالثة',
        topic: 'النص التنظيمي',
        marks: 1,
        options: [
          { key: 'a', label: 'يُقدَّم الطلب خلال خمسة أيام عمل من تاريخ الإشعار.' },
          { key: 'b', label: 'يُقدَّم الطلب في وقت مناسب بعد الإشعار.' },
          { key: 'c', label: 'يُقدَّم الطلب خلال مدة قصيرة من الإشعار.' },
          { key: 'd', label: 'يُقدَّم الطلب بأسرع ما يمكن.' },
        ],
        correctIndex: 0,
      },
      {
        key: 'ar-09',
        text: 'راجعتَ نصًّا فوجدت المصطلح نفسه مكتوبًا بصيغتين مختلفتين. ما التصرف الأول؟',
        levelName: 'المرحلة الثالثة',
        topic: 'التدقيق اللغوي',
        marks: 1,
        options: [
          { key: 'a', label: 'توحيد الصيغة في النص كله وفق المعتمد لدى الجهة' },
          { key: 'b', label: 'ترك الصيغتين لأن المعنى واضح' },
          { key: 'c', label: 'حذف المصطلح من المواضع المكررة' },
          { key: 'd', label: 'اختيار الصيغة الأطول لأنها أوضح' },
        ],
        correctIndex: 0,
      },
    ],
  },
  {
    pathKey: 'communication-skills',
    title: 'تحديد المستوى — مهارات التواصل',
    description: DESCRIPTION,
    questions: [
      {
        key: 'cm-01',
        text: 'تحتاج إلى قرار عاجل من ثلاث إدارات. ما القناة الأنسب؟',
        levelName: 'المرحلة الأولى',
        topic: 'قنوات التواصل',
        marks: 1,
        options: [
          { key: 'a', label: 'اجتماع قصير يجمعهم، يليه محضر مكتوب بالقرار' },
          { key: 'b', label: 'رسالة في مجموعة العمل وانتظار الردود' },
          { key: 'c', label: 'خطاب رسمي إلى كل إدارة على حدة' },
          { key: 'd', label: 'الاتصال بكل مدير على انفراد دون توثيق' },
        ],
        correctIndex: 0,
      },
      {
        key: 'cm-02',
        text: 'قاطعك زميل قبل أن تُنهي شرحك. ما التصرف الأنسب؟',
        levelName: 'المرحلة الأولى',
        topic: 'الإنصات',
        marks: 1,
        options: [
          { key: 'a', label: 'الاستماع إلى نقطته ثم طلب إكمال ما بدأته' },
          { key: 'b', label: 'رفع الصوت لإكمال الشرح' },
          { key: 'c', label: 'إنهاء الحديث والانصراف' },
          { key: 'd', label: 'تجاهل ما قاله والاستمرار كأن شيئًا لم يكن' },
        ],
        correctIndex: 0,
      },
      {
        key: 'cm-03',
        text: 'متعامل يطلب إنجاز معاملة تحتاج أسبوعًا. ماذا تقول له؟',
        levelName: 'المرحلة الأولى',
        topic: 'إدارة التوقعات',
        marks: 1,
        options: [
          { key: 'a', label: 'تحديد المدة المتوقعة وسبب طولها وموعد الرد التالي' },
          { key: 'b', label: 'الوعد بإنجازها غدًا لتهدئته' },
          { key: 'c', label: 'إخباره بأن الأمر ليس بيدك' },
          { key: 'd', label: 'مطالبته بالمتابعة معك يوميًا' },
        ],
        correctIndex: 0,
      },
      {
        key: 'cm-04',
        text: 'اجتماع خرج عن موضوعه ولم يبقَ إلا عشر دقائق. ما تصرّف رئيس الاجتماع؟',
        levelName: 'المرحلة الثانية',
        topic: 'إدارة الاجتماعات',
        marks: 1,
        options: [
          {
            key: 'a',
            label: 'إعادة النقاش إلى البند وتأجيل ما خرج عنه إلى قائمة مستقلة',
          },
          { key: 'b', label: 'ترك النقاش حتى ينتهي وحده' },
          { key: 'c', label: 'تمديد الاجتماع ساعة إضافية' },
          { key: 'd', label: 'إنهاء الاجتماع دون قرار' },
        ],
        correctIndex: 0,
      },
      {
        key: 'cm-05',
        text: 'تعرض مقترحًا على لجنة تهتم بالكلفة. بمَ تبدأ؟',
        levelName: 'المرحلة الثانية',
        topic: 'العرض والإقناع',
        marks: 1,
        options: [
          { key: 'a', label: 'بالأثر المالي المتوقع والمقارنة بالوضع الحالي' },
          { key: 'b', label: 'بتاريخ المشروع وخلفيته التفصيلية' },
          { key: 'c', label: 'بشكر اللجنة والثناء على اهتمامها' },
          { key: 'd', label: 'بعرض التفاصيل التقنية أولًا' },
        ],
        correctIndex: 0,
      },
      {
        key: 'cm-06',
        text: 'اعترض أحد الحضور على رقم في عرضك ولم يكن معك مصدره. ما الأنسب؟',
        levelName: 'المرحلة الثانية',
        topic: 'التعامل مع الاعتراض',
        marks: 1,
        options: [
          { key: 'a', label: 'الإقرار بأنك ستتحقق من الرقم وتوافيه به، ومواصلة العرض' },
          { key: 'b', label: 'الدفاع عن الرقم دون تحقق' },
          { key: 'c', label: 'تجاهل الاعتراض والانتقال إلى الشريحة التالية' },
          { key: 'd', label: 'سحب العرض كله لمراجعته' },
        ],
        correctIndex: 0,
      },
      {
        key: 'cm-07',
        text: 'في تفاوض، تمسّك الطرف الآخر بموقفه. ما الخطوة الأجدى؟',
        levelName: 'المرحلة الثالثة',
        topic: 'التفاوض',
        marks: 1,
        options: [
          { key: 'a', label: 'البحث عن المصلحة وراء الموقف وطرح بديل يخدمها' },
          { key: 'b', label: 'التمسك بموقفك بالقوة نفسها' },
          { key: 'c', label: 'التنازل عن مطلبك لإنهاء النقاش' },
          { key: 'd', label: 'تعليق التفاوض إلى أجل غير مسمى' },
        ],
        correctIndex: 0,
      },
      {
        key: 'cm-08',
        text: 'تأخّر مشروع وسيتأثر متعاملون. متى تُبلغهم وبِمَ؟',
        levelName: 'المرحلة الثالثة',
        topic: 'التواصل في الأزمات',
        marks: 1,
        options: [
          { key: 'a', label: 'فور تأكد التأخير: ما حدث، وأثره عليهم، وما يُفعل، وموعد التحديث' },
          { key: 'b', label: 'بعد حل المشكلة، حتى لا يقلقوا' },
          { key: 'c', label: 'عند سؤالهم فقط' },
          { key: 'd', label: 'إبلاغهم بأن كل شيء تحت السيطرة دون تفصيل' },
        ],
        correctIndex: 0,
      },
      {
        key: 'cm-09',
        text: 'موضوع في مجموعة العمل تجاوز عشرين رسالة دون قرار. ما التصرف؟',
        levelName: 'المرحلة الثالثة',
        topic: 'التواصل الرقمي',
        marks: 1,
        options: [
          { key: 'a', label: 'نقله إلى اجتماع قصير ثم إعادة القرار مكتوبًا إلى المجموعة' },
          { key: 'b', label: 'إعادة صياغة السؤال ورفعه في المجموعة مرة أخرى' },
          { key: 'c', label: 'ترك الموضوع حتى يحسمه أحدهم' },
          { key: 'd', label: 'مخاطبة كل عضو على انفراد' },
        ],
        correctIndex: 0,
      },
    ],
  },
];
