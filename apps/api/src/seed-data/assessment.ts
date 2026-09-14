import type { RiasecLetter } from '@tamkeen/types';

/**
 * The RIASEC question bank, as seedable content (CLAUDE.md §3A, Phase 1).
 *
 * **This is data, not code.** It is seeded into `assessment_questions` /
 * `assessment_options` and read from there at runtime, so Phase 5's
 * assessment-management screens can edit questions and option weightings in the
 * database without a deployment, and the ministry can revise the Arabic wording
 * without touching a component. Nothing in the UI hardcodes a question.
 *
 * It sits under `src/` rather than beside `prisma/seed.ts` for a practical
 * reason: `tsconfig.json` includes only `src` and `test`, so content placed next
 * to the seed script would be neither typechecked nor reachable by the test
 * runner — and the balance property below is exactly the kind of thing that must
 * fail CI rather than be noticed later.
 *
 * Format: 30 five-point Likert items, five per dimension (D-032). Each item
 * states an interest; the chosen agreement level is the number of points it
 * contributes to that item's single dimension. The schema supports options
 * weighted across several dimensions — a later scenario-style bank could use the
 * same tables — but this bank keeps one dimension per item because that is what
 * makes it **balanced**: every dimension can attain exactly 20 points, so
 * comparing raw scores across dimensions is fair. `isBalancedBank` asserts it.
 *
 * The Arabic wording is a first draft, deliberately easy to revise: change the
 * `text` and re-run the seed. Keys are stable, so edits do not orphan responses.
 */

/**
 * The five agreement levels, shared by every item.
 *
 * Weights run 0-4 rather than 1-5 so that "does not apply to me at all"
 * contributes nothing. On a 1-5 scale a user who rejected every Realistic item
 * would still accumulate Realistic points purely for having answered, and the
 * floor would shift with the number of items rather than reflecting interest.
 */
export const LIKERT_LEVELS: readonly { key: string; label: string; weight: number }[] = [
  { key: 'l0', label: 'لا ينطبق عليّ إطلاقًا', weight: 0 },
  { key: 'l1', label: 'ينطبق عليّ قليلًا', weight: 1 },
  { key: 'l2', label: 'ينطبق عليّ إلى حدٍّ ما', weight: 2 },
  { key: 'l3', label: 'ينطبق عليّ كثيرًا', weight: 3 },
  { key: 'l4', label: 'ينطبق عليّ تمامًا', weight: 4 },
];

export interface SeedQuestion {
  /** Stable across wording edits — responses reference this, not the text. */
  key: string;
  letter: RiasecLetter;
  text: string;
}

/**
 * Items grouped by dimension for authoring; `ASSESSMENT_QUESTIONS` below
 * interleaves them for presentation.
 */
const ITEMS: Record<RiasecLetter, string[]> = {
  // الواقعي — العمل اليدوي والميداني والأجهزة والنتائج الملموسة
  R: [
    'أستمتع بالعمل الميداني أكثر من العمل المكتبي.',
    'أفضّل تشغيل الأجهزة والمعدات والتعامل معها بنفسي.',
    'يشدّني إصلاح الأعطال عمليًا أكثر من مناقشتها نظريًا.',
    'أرتاح للمهام التي تعتمد على مهارة يدوية أو جهد بدني.',
    'أفضّل المهام التي تُنجَز على أرض الواقع وتظهر نتيجتها مباشرة.',
  ],
  // البحثي — التحليل والبحث والاستدلال المنطقي
  I: [
    'أستمتع بتحليل البيانات واستخلاص النتائج منها.',
    'أبحث عن أسباب المشكلة قبل أن أقترح حلًا لها.',
    'أحب قراءة التقارير والدراسات المتخصصة.',
    'أفضّل المهام التي تتطلب تفكيرًا منطقيًا ودقة في الاستنتاج.',
    'يستهويني تجريب طرق جديدة لقياس أداء إجراء ما.',
  ],
  // الفني — التصميم والابتكار والتعبير
  A: [
    'أستمتع بتصميم العروض والمواد البصرية.',
    'أفضّل المهام التي تتيح لي التعبير بأسلوبي الخاص.',
    'يشدّني ابتكار أفكار جديدة غير مألوفة.',
    'أستمتع بصياغة النصوص والمحتوى بلغة مؤثرة.',
    'أرتاح للعمل الذي لا يلتزم بخطوات ثابتة محددة مسبقًا.',
  ],
  // الاجتماعي — المساعدة والتدريب والعمل مع الناس
  S: [
    'أستمتع بمساعدة زملائي على تجاوز صعوبات عملهم.',
    'أفضّل تدريب الآخرين وشرح الإجراءات لهم.',
    'يمنحني التعامل المباشر مع المتعاملين رضًا عن عملي.',
    'أرتاح للعمل ضمن فريق أكثر من العمل منفردًا.',
    'أستمع إلى احتياجات الآخرين قبل أن أتخذ قرارًا يخصّهم.',
  ],
  // المبادِر — القيادة والإقناع والمبادرة
  E: [
    'أستمتع بقيادة فريق نحو هدف محدد.',
    'أفضّل عرض الأفكار وإقناع الآخرين بها.',
    'يشدّني تمثيل جهة عملي في الاجتماعات والمفاوضات.',
    'أبادر باقتراح مشاريع جديدة دون انتظار توجيه.',
    'أرتاح لاتخاذ قرارات تترتب عليها مسؤولية كبيرة.',
  ],
  // التنظيمي — الترتيب والإجراءات والدقة
  C: [
    'أستمتع بترتيب الملفات والسجلات وفق نظام واضح.',
    'أفضّل العمل وفق إجراءات مكتوبة ومحددة الخطوات.',
    'أهتم بدقة الأرقام والتفاصيل في المستندات الرسمية.',
    'أرتاح للمهام التي تتكرر وفق جدول زمني منتظم.',
    'أراجع عملي أكثر من مرة للتأكد من مطابقته للتعليمات.',
  ],
};

/** Presentation order: R, I, A, S, E, C, R, I, … */
const ROTATION: readonly RiasecLetter[] = ['R', 'I', 'A', 'S', 'E', 'C'];

/**
 * The bank in presentation order.
 *
 * Items are **interleaved by dimension** rather than grouped. Five consecutive
 * "do you like fieldwork?" statements read as a section with an obvious theme,
 * and a user who has decided how they want to be categorised can answer the
 * block uniformly. Rotating the dimensions keeps each item a separate judgement.
 */
export const ASSESSMENT_QUESTIONS: readonly SeedQuestion[] = Array.from(
  { length: ROTATION.length * 5 },
  (_unused, index) => {
    const letter = ROTATION[index % ROTATION.length]!;
    const withinDimension = Math.floor(index / ROTATION.length);

    return {
      key: `${letter}${withinDimension + 1}`,
      letter,
      text: ITEMS[letter][withinDimension]!,
    };
  },
);

/** Identity of the assessment itself. One assessment exists in Phase 1. */
export const ASSESSMENT_SEED = {
  key: 'riasec-core',
  version: 1,
  title: 'تقييم الميول المهنية',
  description:
    'ثلاثون عبارة قصيرة تصف اهتماماتك في العمل. اختر مدى انطباق كل عبارة عليك، ولا توجد إجابة صحيحة وأخرى خاطئة.',
} as const;
