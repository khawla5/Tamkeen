import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  CEFR_LEVELS,
  type AdminEnglishDraft,
  type AdminEnglishOverview,
  type AdminEnglishQuestion,
  type AdminEnglishReadiness,
  type AdminEnglishVersion,
  type CefrBand,
} from '@tamkeen/types';

import { AuditAction, AuditReason } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ENGLISH_ASSESSMENT_KEY } from '../english-assessment/english-assessment.service';
import { assessEnglishBank, type DraftEnglishQuestion } from './english-bank-readiness';
import type {
  AddEnglishQuestionDto,
  SetEnglishBandsDto,
  UpdateEnglishDraftDto,
  UpdateEnglishOptionDto,
  UpdateEnglishQuestionDto,
} from './admin-english.dto';

/**
 * §4C.9 — editing the English placement test.
 *
 * **A parallel surface to `AdminAssessmentService`, not an extension of it.**
 * The RIASEC editor is live, correct and guarded by tests this work must not
 * disturb; retrofitting it to serve two instruments would mean a discriminator
 * on every one of its queries and a weight editor that has to hide itself half
 * the time. Nothing in this file imports from `admin-assessment.service.ts`, and
 * nothing there learns this exists.
 *
 * **Three rules govern everything here, and two of them are the same rules.**
 *
 * 1. **Admins edit inputs, never the algorithm** (D-048, applied to a second
 *    instrument). Questions, options, which option is correct, what an item is
 *    worth, and the band table are data in these tables. The tally, the band
 *    resolution and the partition rule are in `english-scoring.ts` and
 *    `english-bank-readiness.ts`, and nothing on this surface can reach them.
 *
 * 2. **Editing is copy-on-write** (D-072, D-125). Publishing inserts a new
 *    version carrying its own copy of every question, option **and band**, and
 *    retires the previous one. Nothing here ever writes to a row a past response
 *    points at — which is why the draft is freely editable and freely deletable.
 *
 * 3. **Existing results are never recomputed** (D-049, D-123). There is no code
 *    path here that touches `english_assessment_results` at all. That is the
 *    strongest form the guarantee can take: not "we are careful not to", but
 *    "there is nothing to be careful about".
 *
 * The gate fires at **publish**, not on save (D-073) — growing a bank changes
 * the attainable total, which invalidates the band table until the administrator
 * gets round to it, and a rule that makes the legal destination unreachable is
 * one people learn to defeat.
 */
@Injectable()
export class AdminEnglishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** §4C.9's landing state. */
  async overview(): Promise<AdminEnglishOverview> {
    const rows = await this.prisma.englishAssessment.findMany({
      where: { key: ENGLISH_ASSESSMENT_KEY },
      orderBy: { version: 'desc' },
      select: VERSION_SELECT,
    });

    return {
      active: rows.filter((row) => row.status === 'ACTIVE').map(toVersion)[0] ?? null,
      draft: rows.filter((row) => row.status === 'DRAFT').map(toVersion)[0] ?? null,
      history: rows.filter((row) => row.status === 'RETIRED').map(toVersion),
    };
  }

  /** The draft bank, answer key included. Admin-only by the controller's guard. */
  async getDraft(): Promise<AdminEnglishDraft> {
    const draft = await this.requireDraft();
    const [questions, bands] = await Promise.all([
      this.loadQuestions(draft.id),
      this.loadBands(draft.id),
    ]);

    const previous = await this.prisma.englishAssessment.findFirst({
      where: { key: draft.key, version: { lt: draft.version } },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    return {
      id: draft.id,
      key: draft.key,
      version: draft.version,
      title: draft.title,
      description: draft.description,
      questions,
      bands,
      readiness: readiness(questions, bands),
      basedOnVersion: previous?.version ?? null,
    };
  }

  /**
   * Opens a draft as a deep copy of the active version (D-072, D-125).
   *
   * **Or, when there is no version at all, as an empty version 1.** This is the
   * one place the English editor cannot mirror §4C.3: the RIASEC bank is seeded
   * and there has always been an ACTIVE row to copy, so its `createDraft`
   * rightly refuses without one. Refusing here would leave a ministry that
   * cleared the seed — or an environment where it never ran — with an editor
   * that cannot be used to create the thing it edits.
   *
   * The copy is one transaction. A half-copied draft would be a bank missing
   * questions, and the gate would then refuse it for a reason that has nothing
   * to do with anything the administrator did.
   */
  async createDraft(actorId: string, ipAddress: string | null): Promise<AdminEnglishDraft> {
    const existing = await this.prisma.englishAssessment.findFirst({
      where: { key: ENGLISH_ASSESSMENT_KEY, status: 'DRAFT' },
      select: { id: true },
    });

    if (existing) {
      /* At most one draft, enforced by a partial unique index as well. Two would
         mean two answers to "what is being edited", and the screen has one. */
      throw new ConflictException('ENGLISH_DRAFT_EXISTS');
    }

    const active = await this.prisma.englishAssessment.findFirst({
      where: { key: ENGLISH_ASSESSMENT_KEY, status: 'ACTIVE' },
      select: {
        version: true,
        title: true,
        description: true,
        bands: { select: { level: true, minScore: true, maxScore: true } },
        questions: {
          orderBy: { displayOrder: 'asc' },
          select: {
            key: true,
            displayOrder: true,
            text: true,
            marks: true,
            level: true,
            skill: true,
            options: {
              orderBy: { displayOrder: 'asc' },
              select: { key: true, displayOrder: true, label: true, isCorrect: true },
            },
          },
        },
      },
    });

    const draftId = await this.prisma.$transaction(
      async (tx) => {
        const draft = await tx.englishAssessment.create({
          data: {
            key: ENGLISH_ASSESSMENT_KEY,
            version: (active?.version ?? 0) + 1,
            title: active?.title ?? DEFAULT_TITLE,
            description: active?.description ?? DEFAULT_DESCRIPTION,
            status: 'DRAFT',
            /* Copied with the version, which is the whole of D-125: a past
               result stays explicable because the table that produced it
               travelled with the instrument rather than being global. */
            bands: active
              ? {
                  create: active.bands.map((band) => ({
                    level: band.level,
                    minScore: band.minScore,
                    maxScore: band.maxScore,
                  })),
                }
              : undefined,
          },
          select: { id: true },
        });

        /*
         * One round trip per question, with its options nested inside it. The
         * RIASEC copy learned this the expensive way: three nested loops is
         * 30 + 150 statements and slow enough under load to exhaust Prisma's
         * interactive-transaction budget, which surfaced as an intermittent
         * failure with nothing wrong in it.
         */
        for (const question of active?.questions ?? []) {
          await tx.englishAssessmentQuestion.create({
            data: {
              assessmentId: draft.id,
              /* Keys carry over, so an item that survives an edit is
                 recognisably the same item across versions even though the row
                 is new. */
              key: question.key,
              displayOrder: question.displayOrder,
              text: question.text,
              marks: question.marks,
              level: question.level,
              skill: question.skill,
              options: {
                create: question.options.map((option) => ({
                  key: option.key,
                  displayOrder: option.displayOrder,
                  label: option.label,
                  isCorrect: option.isCorrect,
                })),
              },
            },
            select: { id: true },
          });
        }

        return draft.id;
      },
      /* Room for a large bank on a loaded database. The work is bounded by the
         ministry's question count, not by anything a caller controls, and a
         partial copy rolls back to no draft at all — the administrator's edit
         simply never opened. */
      { timeout: 30_000 },
    );

    await this.audit.record({
      action: AuditAction.ADMIN_ENGLISH_DRAFT_OPENED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'assessment',
      targetId: draftId,
      detail: { copiedFromVersion: String(active?.version ?? 'none') },
    });

    return this.getDraft();
  }

  /** Abandons the draft. Nothing references it, so it deletes cleanly. */
  async discardDraft(actorId: string, ipAddress: string | null): Promise<void> {
    const draft = await this.requireDraft();

    /* Safe by construction rather than by check: a DRAFT is never served by
       `getActive`, so no response row can point at its questions, so the
       `Restrict` that protects published banks has nothing to refuse. */
    await this.prisma.englishAssessment.delete({ where: { id: draft.id } });

    await this.audit.record({
      action: AuditAction.ADMIN_ENGLISH_DRAFT_DISCARDED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'assessment',
      targetId: draft.id,
    });
  }

  async updateDraft(dto: UpdateEnglishDraftDto): Promise<AdminEnglishDraft> {
    const draft = await this.requireDraft();

    await this.prisma.englishAssessment.update({
      where: { id: draft.id },
      data: {
        ...(dto.title === undefined ? {} : { title: dto.title }),
        ...(dto.description === undefined ? {} : { description: dto.description }),
      },
    });

    return this.getDraft();
  }

  /**
   * Adds a question with its full set of options.
   *
   * **Where §4C.3 asks for a dimension and generates five Likert options, this
   * asks for the options themselves** — because they *are* the item. A RIASEC
   * question's options are the same five agreement levels every time, so
   * generating them is a kindness; an English item's options are the distractors
   * somebody wrote, and generating them would be inventing assessment content.
   *
   * The correct option is chosen at creation rather than left for the option
   * editor. A question with no correct answer is a blocker (`NO_CORRECT_OPTION`),
   * and creating one that is immediately broken is a worse default than asking
   * for one more click.
   */
  async addQuestion(dto: AddEnglishQuestionDto): Promise<AdminEnglishDraft> {
    const draft = await this.requireDraft();

    if (dto.correctIndex >= dto.options.length) {
      throw new BadRequestException('ENGLISH_CORRECT_OPTION_OUT_OF_RANGE');
    }

    const [maxOrder, keys] = await Promise.all([
      this.prisma.englishAssessmentQuestion.aggregate({
        where: { assessmentId: draft.id },
        _max: { displayOrder: true },
      }),
      this.prisma.englishAssessmentQuestion.findMany({
        where: { assessmentId: draft.id },
        select: { key: true },
      }),
    ]);

    await this.prisma.englishAssessmentQuestion.create({
      data: {
        assessmentId: draft.id,
        key: nextKey(
          dto.level,
          keys.map((row) => row.key),
        ),
        displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
        text: dto.text,
        marks: dto.marks,
        level: dto.level,
        skill: dto.skill,
        options: {
          create: dto.options.map((label, index) => ({
            key: `o${index + 1}`,
            displayOrder: index + 1,
            label,
            isCorrect: index === dto.correctIndex,
          })),
        },
      },
    });

    return this.getDraft();
  }

  async updateQuestion(
    questionId: string,
    dto: UpdateEnglishQuestionDto,
  ): Promise<AdminEnglishDraft> {
    const draft = await this.requireDraft();
    await this.requireDraftQuestion(draft.id, questionId);

    await this.prisma.englishAssessmentQuestion.update({
      where: { id: questionId },
      data: {
        ...(dto.text === undefined ? {} : { text: dto.text }),
        ...(dto.marks === undefined ? {} : { marks: dto.marks }),
        ...(dto.level === undefined ? {} : { level: dto.level }),
        ...(dto.skill === undefined ? {} : { skill: dto.skill }),
      },
    });

    return this.getDraft();
  }

  async removeQuestion(questionId: string): Promise<AdminEnglishDraft> {
    const draft = await this.requireDraft();
    await this.requireDraftQuestion(draft.id, questionId);

    await this.prisma.englishAssessmentQuestion.delete({ where: { id: questionId } });

    return this.getDraft();
  }

  /**
   * Reorders the draft's questions.
   *
   * Takes the complete order rather than a move-up/move-down, so the result is
   * whatever the administrator arranged rather than the outcome of replaying
   * their clicks against a list that may have changed underneath them. One
   * transaction with a two-pass shuffle, because `display_order` has an index
   * and a naive one-by-one update collides with itself half way through.
   */
  async reorder(questionIds: string[]): Promise<AdminEnglishDraft> {
    const draft = await this.requireDraft();

    const existing = await this.prisma.englishAssessmentQuestion.findMany({
      where: { assessmentId: draft.id },
      select: { id: true },
    });

    const ids = new Set(existing.map((row) => row.id));
    const given = new Set(questionIds);

    if (given.size !== questionIds.length || given.size !== ids.size) {
      throw new BadRequestException('ENGLISH_ORDER_INCOMPLETE');
    }
    if (questionIds.some((id) => !ids.has(id))) {
      throw new BadRequestException('ENGLISH_QUESTION_NOT_IN_DRAFT');
    }

    await this.prisma.$transaction(async (tx) => {
      /* Out of the way first: display orders are 1..n, so writing the final
         values directly would transiently duplicate one. */
      for (const [index, id] of questionIds.entries()) {
        await tx.englishAssessmentQuestion.update({
          where: { id },
          data: { displayOrder: -(index + 1) },
        });
      }

      for (const [index, id] of questionIds.entries()) {
        await tx.englishAssessmentQuestion.update({
          where: { id },
          data: { displayOrder: index + 1 },
        });
      }
    });

    return this.getDraft();
  }

  /**
   * Edits an option's label, and which option is the correct one.
   *
   * **Marking an option correct clears its siblings, in the same transaction.**
   * An item has one right answer, so this is radio-button semantics, not a
   * checkbox — and doing it here rather than leaving the administrator to unset
   * the old one means the two-correct state is never reachable through the
   * screen. `MULTIPLE_CORRECT_OPTIONS` stays in the gate regardless: it guards
   * rows that arrive another way — a future import, a hand-run SQL fix — and a
   * blocker that is unreachable through the UI is exactly the one worth keeping,
   * because nothing else would catch it.
   */
  async updateOption(optionId: string, dto: UpdateEnglishOptionDto): Promise<AdminEnglishDraft> {
    const draft = await this.requireDraft();

    const option = await this.prisma.englishAssessmentOption.findFirst({
      where: { id: optionId, question: { assessmentId: draft.id } },
      select: { id: true, questionId: true },
    });

    if (!option) {
      /* Reported as absent rather than forbidden: the id may belong to a
         published version, and editing one of those is not a thing that exists. */
      throw new NotFoundException('ENGLISH_OPTION_NOT_IN_DRAFT');
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.isCorrect === true) {
        await tx.englishAssessmentOption.updateMany({
          where: { questionId: option.questionId },
          data: { isCorrect: false },
        });
      }

      await tx.englishAssessmentOption.update({
        where: { id: optionId },
        data: {
          ...(dto.label === undefined ? {} : { label: dto.label }),
          ...(dto.isCorrect === undefined ? {} : { isCorrect: dto.isCorrect }),
        },
      });
    });

    return this.getDraft();
  }

  /**
   * Replaces the band table — §4C.9's configurable scoring rule (D-125).
   *
   * **The whole table at once, never one band.** A partition is a single object:
   * moving the B1/B2 boundary necessarily changes two bands, so a per-band
   * endpoint would force the administrator through states that are invalid by
   * construction and make the editor reject its own intermediate steps. Taking
   * the complete table also means what is stored is what they arranged, on the
   * same reasoning `reorder` takes the complete order.
   *
   * Validation is the gate's, at publish, not here — a draft whose bank has just
   * grown has a stale table by definition, and refusing the save would leave no
   * way to fix it.
   */
  async setBands(dto: SetEnglishBandsDto): Promise<AdminEnglishDraft> {
    const draft = await this.requireDraft();

    const levels = dto.bands.map((band) => band.level);
    if (new Set(levels).size !== levels.length) {
      /* The unique index would refuse this too; catching it here turns a 500
         into a named refusal the screen can render. */
      throw new BadRequestException('ENGLISH_BAND_LEVEL_REPEATED');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.englishAssessmentBand.deleteMany({ where: { assessmentId: draft.id } });

      if (dto.bands.length > 0) {
        await tx.englishAssessmentBand.createMany({
          data: dto.bands.map((band) => ({
            assessmentId: draft.id,
            level: band.level,
            minScore: band.minScore,
            maxScore: band.maxScore,
          })),
        });
      }
    });

    return this.getDraft();
  }

  /**
   * Publishes the draft: validate, activate, retire the predecessor.
   *
   * One transaction, and the order inside it matters. The previous version is
   * retired *before* the draft becomes active, because a partial unique index
   * permits only one ACTIVE row per key — doing it the other way round would
   * fail on the constraint, which is the constraint working.
   */
  async publish(actorId: string, ipAddress: string | null): Promise<AdminEnglishVersion> {
    const draft = await this.requireDraft();
    const [questions, bands] = await Promise.all([
      this.loadQuestions(draft.id),
      this.loadBands(draft.id),
    ]);
    const state = readiness(questions, bands);

    if (state.blockers.length > 0) {
      await this.audit.record({
        action: AuditAction.ADMIN_ENGLISH_PUBLISHED,
        outcome: 'FAILURE',
        actorUserId: actorId,
        ipAddress,
        targetType: 'assessment',
        targetId: draft.id,
        reason: AuditReason.ENGLISH_BANK_NOT_PUBLISHABLE,
        /* The specific blockers, so a refusal is explicable months later without
           reconstructing the bank as it stood. */
        detail: { blockers: state.blockers.join(',') },
      });

      throw new ConflictException(state.blockers[0]);
    }

    const effectiveFrom = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.englishAssessment.updateMany({
        where: { key: draft.key, status: 'ACTIVE' },
        data: { status: 'RETIRED', retiredAt: effectiveFrom },
      });

      await tx.englishAssessment.update({
        where: { id: draft.id },
        data: { status: 'ACTIVE', effectiveFrom },
      });
    });

    await this.audit.record({
      action: AuditAction.ADMIN_ENGLISH_PUBLISHED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'assessment',
      targetId: draft.id,
      detail: {
        version: String(draft.version),
        questions: String(questions.length),
        maxScore: String(state.maxScore),
        /* Recorded even on success: an administrator who published past a
           warning made a decision, and the trail should say which one. */
        warnings: state.warnings.join(',') || 'none',
      },
    });

    const published = await this.prisma.englishAssessment.findUniqueOrThrow({
      where: { id: draft.id },
      select: VERSION_SELECT,
    });

    return toVersion(published);
  }

  /** A published version, read-only, exactly as it was taken. */
  async getVersion(assessmentId: string): Promise<AdminEnglishDraft> {
    const version = await this.prisma.englishAssessment.findUnique({
      where: { id: assessmentId },
      select: { id: true, key: true, version: true, title: true, description: true },
    });

    if (!version) {
      throw new NotFoundException('ENGLISH_ASSESSMENT_NOT_FOUND');
    }

    const [questions, bands] = await Promise.all([
      this.loadQuestions(version.id),
      this.loadBands(version.id),
    ]);

    return {
      ...version,
      questions,
      bands,
      readiness: readiness(questions, bands),
      basedOnVersion: null,
    };
  }

  // ── internals ───────────────────────────────────────────────────────────────

  private async requireDraft() {
    const draft = await this.prisma.englishAssessment.findFirst({
      where: { key: ENGLISH_ASSESSMENT_KEY, status: 'DRAFT' },
      select: { id: true, key: true, version: true, title: true, description: true },
    });

    if (!draft) {
      throw new NotFoundException('ENGLISH_NO_DRAFT');
    }

    return draft;
  }

  private async requireDraftQuestion(assessmentId: string, questionId: string): Promise<void> {
    const question = await this.prisma.englishAssessmentQuestion.findFirst({
      where: { id: questionId, assessmentId },
      select: { id: true },
    });

    if (!question) {
      throw new NotFoundException('ENGLISH_QUESTION_NOT_IN_DRAFT');
    }
  }

  private async loadQuestions(assessmentId: string): Promise<AdminEnglishQuestion[]> {
    const rows = await this.prisma.englishAssessmentQuestion.findMany({
      where: { assessmentId },
      orderBy: { displayOrder: 'asc' },
      select: {
        id: true,
        key: true,
        text: true,
        displayOrder: true,
        marks: true,
        level: true,
        skill: true,
        options: {
          orderBy: { displayOrder: 'asc' },
          select: { id: true, key: true, label: true, displayOrder: true, isCorrect: true },
        },
      },
    });

    return rows.map((question) => ({
      id: question.id,
      key: question.key,
      text: question.text,
      order: question.displayOrder,
      marks: question.marks,
      level: question.level,
      skill: question.skill,
      options: question.options.map((option) => ({
        id: option.id,
        key: option.key,
        label: option.label,
        order: option.displayOrder,
        isCorrect: option.isCorrect,
      })),
    }));
  }

  /** The band table, ascending by level — the order it must partition in. */
  private async loadBands(assessmentId: string): Promise<CefrBand[]> {
    const rows = await this.prisma.englishAssessmentBand.findMany({
      where: { assessmentId },
      select: { level: true, minScore: true, maxScore: true },
    });

    return rows
      .map((row) => ({ level: row.level, minScore: row.minScore, maxScore: row.maxScore }))
      .sort((a, b) => CEFR_LEVELS.indexOf(a.level) - CEFR_LEVELS.indexOf(b.level));
  }
}

const DEFAULT_TITLE = 'تقييم مستوى اللغة الإنجليزية';
const DEFAULT_DESCRIPTION = 'أسئلة اختيار من متعدد تقيس مستواك في اللغة الإنجليزية.';

const VERSION_SELECT = {
  id: true,
  version: true,
  status: true,
  title: true,
  effectiveFrom: true,
  retiredAt: true,
  _count: { select: { questions: true, results: true } },
} as const;

function toVersion(row: {
  id: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED';
  title: string;
  effectiveFrom: Date | null;
  retiredAt: Date | null;
  _count: { questions: number; results: number };
}): AdminEnglishVersion {
  return {
    id: row.id,
    version: row.version,
    status: row.status,
    title: row.title,
    effectiveFrom: row.effectiveFrom?.toISOString() ?? null,
    retiredAt: row.retiredAt?.toISOString() ?? null,
    questionCount: row._count.questions,
    /* How many people this version placed. Shown because it is what makes D-049
       concrete on the screen: these results exist, and editing does not touch
       them. */
    resultCount: row._count.results,
  };
}

function readiness(
  questions: readonly AdminEnglishQuestion[],
  bands: readonly CefrBand[],
): AdminEnglishReadiness {
  const draft: DraftEnglishQuestion[] = questions.map((question) => ({
    id: question.id,
    displayOrder: question.order,
    marks: question.marks,
    level: question.level,
    skill: question.skill,
    options: question.options.map((option) => ({ id: option.id, isCorrect: option.isCorrect })),
  }));

  const result = assessEnglishBank(draft, bands);

  return {
    blockers: [...result.blockers],
    warnings: [...result.warnings],
    maxScore: result.maxScore,
    levelsWithoutQuestion: [...result.levelsWithoutQuestion],
    bandsCoverRange: result.bandsCoverRange,
  };
}

/**
 * The next free key for a level, e.g. `B2-3`.
 *
 * Keys stay stable across versions, so a new question must not reuse one a
 * retired version already gave to a different question — that would make two
 * different items look like the same item revised.
 */
function nextKey(level: string, taken: readonly string[]): string {
  const used = new Set(taken);

  for (let index = 1; index <= taken.length + 1; index += 1) {
    const candidate = `${level}-${index}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }

  /* Unreachable: the loop bound exceeds the number of taken keys. */
  throw new ConflictException('ENGLISH_KEY_EXHAUSTED');
}
