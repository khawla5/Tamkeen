import type { CefrBand, CefrLevel, EnglishSkill } from '@tamkeen/types';

/**
 * The English placement bank, as seedable content (§4.13, D-123).
 *
 * **This is data, not code.** It is seeded into `english_assessment_questions` /
 * `_options` / `_bands` and read from there at runtime, so §4C.9 can edit every
 * item, every answer and every band threshold in the database without a
 * deployment. Nothing in the UI hardcodes a question, and nothing hardcodes a
 * band boundary — the same discipline D-032 established for the RIASEC bank, and
 * the reason both are content rather than constants.
 *
 * It sits under `src/` rather than beside `prisma/seed.ts` for the practical
 * reason D-032 gives: `tsconfig.json` includes only `src` and `test`, so content
 * placed next to the seed script would be neither typechecked nor reachable by
 * the test runner — and the properties asserted below (thirty items, five per
 * level, exactly one correct answer each, a band table that partitions the
 * attainable total) must fail CI rather than be noticed later.
 *
 * **The items are in English, and that is not an oversight.** §2 makes the
 * product Arabic-first and `messages.test.ts` enforces it over the message
 * catalogue — but an English proficiency item cannot be posed in Arabic without
 * ceasing to measure anything. D-047 already established that course content
 * exists in the language it was authored in; this is the same rule applied to
 * assessment content. The chrome around it — the page title, the progress
 * indicator, the buttons, the result — stays Arabic, so the only English a taker
 * meets is the English being tested.
 *
 * **Marks rise with level, and that is the instrument's design.** A1 and A2
 * items are worth 1, B1 and B2 are worth 2, C1 and C2 are worth 3 — sixty marks
 * in total. English has no balance rule to violate (D-125): weighting a harder
 * item more heavily is difficulty weighting doing its job, not a skew, which is
 * precisely the distinction from D-032 that made the sibling schema necessary.
 *
 * **Items are ordered by ascending level**, unlike the RIASEC bank's deliberate
 * interleaving (D-032). The reasoning that makes interleaving right there makes
 * ascending order right here: a Holland item invites a self-description that can
 * be answered in blocks, so the bank breaks up the blocks; a placement item has
 * a right answer, and opening with C2 grammar makes a genuine A2 speaker give up
 * on a test that was about to place them correctly.
 *
 * The wording is a first draft for the ministry to review. The asserted
 * *properties* are not a draft.
 */

export interface SeedEnglishQuestion {
  /** Stable across wording edits — responses reference this, not the text. */
  key: string;
  level: CefrLevel;
  skill: EnglishSkill;
  /** What a correct answer is worth. Derived from the level; see the header. */
  marks: number;
  text: string;
  options: readonly string[];
  /** Index into `options`. Exactly one correct answer per item. */
  correctIndex: number;
}

/** What an item is worth, by the level it targets. */
const MARKS_BY_LEVEL: Record<CefrLevel, number> = {
  A1: 1,
  A2: 1,
  B1: 2,
  B2: 2,
  C1: 3,
  C2: 3,
};

type Item = Omit<SeedEnglishQuestion, 'key' | 'marks'>;

const ITEMS: readonly Item[] = [
  // ── A1 — the everyday basics ───────────────────────────────────────────────
  {
    level: 'A1',
    skill: 'GRAMMAR',
    text: 'She ___ a teacher at the training centre.',
    options: ['is', 'am', 'are', 'be'],
    correctIndex: 0,
  },
  {
    level: 'A1',
    skill: 'VOCABULARY',
    text: 'I write my notes with a ___.',
    options: ['pen', 'chair', 'window', 'door'],
    correctIndex: 0,
  },
  {
    level: 'A1',
    skill: 'GRAMMAR',
    text: '___ you speak English?',
    options: ['Do', 'Are', 'Is', 'Does'],
    correctIndex: 0,
  },
  {
    level: 'A1',
    skill: 'PRACTICAL',
    text: 'A colleague says "Thank you." What is the best reply?',
    options: ["You're welcome.", 'Yes, please.', "I'm fine, thanks.", 'See you tomorrow.'],
    correctIndex: 0,
  },
  {
    level: 'A1',
    skill: 'READING',
    text: 'Read: "The office opens at 8:00 and closes at 3:00." When does the office close?',
    options: ['At 3:00', 'At 8:00', 'At noon', 'It does not close'],
    correctIndex: 0,
  },

  // ── A2 — routine work situations ───────────────────────────────────────────
  {
    level: 'A2',
    skill: 'GRAMMAR',
    text: 'Yesterday I ___ to the ministry by bus.',
    options: ['went', 'go', 'going', 'am going'],
    correctIndex: 0,
  },
  {
    level: 'A2',
    skill: 'VOCABULARY',
    text: 'Please ___ this form and return it to the front desk.',
    options: ['complete', 'build', 'drive', 'cook'],
    correctIndex: 0,
  },
  {
    level: 'A2',
    skill: 'GRAMMAR',
    text: "There aren't ___ chairs left in the meeting room.",
    options: ['any', 'some', 'much', 'a'],
    correctIndex: 0,
  },
  {
    level: 'A2',
    skill: 'PRACTICAL',
    text: 'A colleague invites you to a meeting you cannot attend. What is the most polite reply?',
    options: [
      "I'm afraid I can't make it.",
      'No.',
      "I don't want to come.",
      'Maybe not, who knows.',
    ],
    correctIndex: 0,
  },
  {
    level: 'A2',
    skill: 'READING',
    text: 'Read: "Training sessions are held every Tuesday and Thursday. Registration closes one day before each session." When must you register for a Tuesday session?',
    options: ['By Monday', 'On Tuesday', 'By Thursday', 'At any time'],
    correctIndex: 0,
  },

  // ── B1 — familiar professional matters ─────────────────────────────────────
  {
    level: 'B1',
    skill: 'GRAMMAR',
    text: 'If it rains tomorrow, we ___ the site visit.',
    options: ['will postpone', 'postponed', 'would postpone', 'had postponed'],
    correctIndex: 0,
  },
  {
    level: 'B1',
    skill: 'VOCABULARY',
    text: 'Choose the closest meaning to "postpone".',
    options: ['delay', 'cancel', 'attend', 'repeat'],
    correctIndex: 0,
  },
  {
    level: 'B1',
    skill: 'GRAMMAR',
    text: 'I have worked in this department ___ 2019.',
    options: ['since', 'for', 'from', 'during'],
    correctIndex: 0,
  },
  {
    level: 'B1',
    skill: 'PRACTICAL',
    text: 'You are writing to someone whose name you do not know. How should the email begin?',
    options: ['Dear Sir or Madam,', 'Hi there!', 'Hey,', 'To you,'],
    correctIndex: 0,
  },
  {
    level: 'B1',
    skill: 'READING',
    text: 'Read: "The new policy applies to all employees who joined after January. Those who joined earlier keep their previous allowance." Who keeps the previous allowance?',
    options: [
      'Employees who joined before January',
      'All employees',
      'Only new employees',
      'Nobody',
    ],
    correctIndex: 0,
  },

  // ── B2 — argument and nuance ───────────────────────────────────────────────
  {
    level: 'B2',
    skill: 'GRAMMAR',
    text: 'The report ___ by the committee before it was published.',
    options: ['had been reviewed', 'has reviewed', 'was reviewing', 'is reviewing'],
    correctIndex: 0,
  },
  {
    level: 'B2',
    skill: 'VOCABULARY',
    text: 'The department is responsible ___ processing all applications.',
    options: ['for', 'of', 'to', 'with'],
    correctIndex: 0,
  },
  {
    level: 'B2',
    skill: 'GRAMMAR',
    text: '___ the delay, the project was completed within budget.',
    options: ['Despite', 'Although', 'However', 'Because'],
    correctIndex: 0,
  },
  {
    level: 'B2',
    skill: 'PRACTICAL',
    text: 'You need to disagree with your manager during a meeting. Which is most appropriate?',
    options: [
      "I see your point, though I'd suggest we consider another option.",
      'That is wrong.',
      'No, we are not doing that.',
      'Whatever you say.',
    ],
    correctIndex: 0,
  },
  {
    level: 'B2',
    skill: 'READING',
    text: 'Read: "Although attendance improved this quarter, completion rates fell slightly, suggesting that learners are starting courses without finishing them." What does the writer conclude?',
    options: [
      'Learners begin courses but do not complete them.',
      'Both attendance and completion fell.',
      'Completion rates improved.',
      'Fewer learners enrolled this quarter.',
    ],
    correctIndex: 0,
  },

  // ── C1 — formal register and inference ─────────────────────────────────────
  {
    level: 'C1',
    skill: 'GRAMMAR',
    text: 'Had we anticipated the delay, we ___ additional staff to the project.',
    options: ['would have assigned', 'will assign', 'would assign', 'had assigned'],
    correctIndex: 0,
  },
  {
    level: 'C1',
    skill: 'VOCABULARY',
    text: 'The findings were ___ with those of the earlier study.',
    options: ['consistent', 'consequent', 'constant', 'content'],
    correctIndex: 0,
  },
  {
    level: 'C1',
    skill: 'GRAMMAR',
    text: 'Rarely ___ such a detailed proposal at this stage of the process.',
    options: ['do we receive', 'we receive', 'we do receive', 'receive we'],
    correctIndex: 0,
  },
  {
    level: 'C1',
    skill: 'PRACTICAL',
    text: 'Which sentence is most appropriate for a recommendation in a formal report?',
    options: [
      'The evidence suggests that the measure may reduce processing delays.',
      'This measure will definitely fix the delays.',
      'I think this is a good idea.',
      'Delays are gone now.',
    ],
    correctIndex: 0,
  },
  {
    level: 'C1',
    skill: 'READING',
    text: 'Read: "While the initiative was widely praised, its long-term impact remains difficult to establish, not least because the metrics adopted at the outset were never revised." Why is the impact difficult to establish?',
    options: [
      'The original metrics were never updated.',
      'The initiative was unpopular.',
      'It ran for too short a period.',
      'No data was collected at all.',
    ],
    correctIndex: 0,
  },

  // ── C2 — precision, idiom and implication ──────────────────────────────────
  {
    level: 'C2',
    skill: 'VOCABULARY',
    text: 'Her argument, while ___, ultimately rests on an unexamined assumption.',
    options: ['cogent', 'cognate', 'congenial', 'contingent'],
    correctIndex: 0,
  },
  {
    level: 'C2',
    skill: 'GRAMMAR',
    text: 'Not until the audit was complete ___ the scale of the discrepancy.',
    options: ['did they grasp', 'they grasped', 'had they grasp', 'they did grasp'],
    correctIndex: 0,
  },
  {
    level: 'C2',
    skill: 'VOCABULARY',
    text: 'If you take a claim "with a pinch of salt", you ___.',
    options: [
      'treat it with some scepticism',
      'accept it completely',
      'deal with it quickly',
      'find it distasteful',
    ],
    correctIndex: 0,
  },
  {
    level: 'C2',
    skill: 'PRACTICAL',
    text: 'Which is the most diplomatic way to decline a senior official’s request in writing?',
    options: [
      'Much as we would welcome the opportunity, current commitments prevent us from taking this on.',
      'We cannot do it.',
      'That is not possible for us.',
      'No, sorry.',
    ],
    correctIndex: 0,
  },
  {
    level: 'C2',
    skill: 'READING',
    text: 'Read: "Far from settling the question, the committee’s report merely recast it in terms that made disagreement harder to articulate." What does this imply about the report?',
    options: [
      'It obscured the disagreement rather than resolving it.',
      'It resolved the disagreement conclusively.',
      'It clarified the arguments on both sides.',
      'It brought the committee’s work to an end.',
    ],
    correctIndex: 0,
  },
];

/**
 * Rotates an item's options so the correct one does not always sit first.
 *
 * **The items above are authored with the right answer first**, because that is
 * how a human reviews an answer key: reading down the file, the first option is
 * the one the ministry is asserting to be correct, and a reviewer can check
 * thirty of them quickly. Seeding them in that order would be a test anybody
 * could pass without a word of English — the position *is* the answer.
 *
 * So the stored bank rotates by the item's index. Deterministic, not random: a
 * shuffled seed would place the answer somewhere new on every run, so a stored
 * response could not be re-read against the bank that produced it, and two
 * environments would hold different instruments under the same version number.
 */
function rotate(options: readonly string[], by: number): { options: string[]; correct: number } {
  const size = options.length;
  const shift = ((by % size) + size) % size;

  return {
    options: options.map((_unused, index) => options[(index - shift + size) % size]!),
    /* The authored answer was at 0, so after rotating right by `shift` it is at
       `shift`. Derived rather than searched for, so it stays correct if two
       options ever share a label. */
    correct: shift,
  };
}

/**
 * The bank, keyed, weighted and rotated.
 *
 * Keys are `LEVEL-n` — the same shape `nextKey` produces in §4C.9, so an item
 * added by an administrator is indistinguishable in form from a seeded one.
 */
export const ENGLISH_QUESTIONS: readonly SeedEnglishQuestion[] = ITEMS.map((item, index) => {
  const rotated = rotate(item.options, index);

  return {
    ...item,
    key: `${item.level}-${ITEMS.slice(0, index).filter((earlier) => earlier.level === item.level).length + 1}`,
    marks: MARKS_BY_LEVEL[item.level],
    options: rotated.options,
    correctIndex: rotated.correct,
  };
});

/** The attainable total: 5 items per level at 1, 1, 2, 2, 3, 3 marks. Sixty. */
export const ENGLISH_MAX_SCORE = ENGLISH_QUESTIONS.reduce(
  (total, question) => total + question.marks,
  0,
);

/**
 * The band table — the configurable scoring rule (D-125), seeded with a
 * defensible starting point rather than an authoritative one.
 *
 * A partition of `0 … 60`, weighted so the middle bands are wider than the ends:
 * a taker who answers only the A1 and A2 items correctly scores 10 and is placed
 * at A1, which is right, and one who reaches 54 has had to answer C-level items
 * correctly, because the lower levels alone cannot get there.
 *
 * **These boundaries are the ministry's to set**, and §4C.9 exists so they can
 * be set without a deployment. What the code owns is that the table is a
 * partition; what it means is theirs.
 */
export const ENGLISH_BANDS: readonly CefrBand[] = [
  { level: 'A1', minScore: 0, maxScore: 14 },
  { level: 'A2', minScore: 15, maxScore: 24 },
  { level: 'B1', minScore: 25, maxScore: 34 },
  { level: 'B2', minScore: 35, maxScore: 44 },
  { level: 'C1', minScore: 45, maxScore: 53 },
  { level: 'C2', minScore: 54, maxScore: 60 },
];

/** Identity of the instrument itself. One English test exists (§4.13). */
export const ENGLISH_ASSESSMENT_SEED = {
  key: 'english-cefr',
  version: 1,
  title: 'تقييم مستوى اللغة الإنجليزية',
  description:
    'ثلاثون سؤال اختيار من متعدد تقيس مستواك في اللغة الإنجليزية وفق الإطار الأوروبي المرجعي المشترك. الأسئلة بالإنجليزية، وتتدرّج من المستوى المبتدئ إلى المتمكّن. يُؤدّى التقييم مرة واحدة.',
} as const;
