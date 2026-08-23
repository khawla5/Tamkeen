import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  RIASEC_LETTERS,
  type AdminAssessmentDraft,
  type AdminAssessmentOverview,
  type AdminAssessmentQuestion,
  type AdminAssessmentVersion,
  type AdminBankReadiness,
  type RiasecLetter,
} from '@tamkeen/types';

import { AuditAction, AuditReason } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { assessBank, type DraftQuestion } from './bank-readiness';
import type {
  AddDraftQuestionDto,
  UpdateDraftDto,
  UpdateDraftOptionDto,
  UpdateDraftQuestionDto,
} from './admin.dto';

/**
 * §4C.3 — editing the assessment.
 *
 * **Three rules govern everything here, and none of them is negotiable.**
 *
 * 1. **Admins edit inputs, never the algorithm** (D-048). Questions, options and
 *    per-dimension weights are data in these tables. The tally, the ranking, the
 *    canonical tie-break and the top-three derivation are in `scoring.ts` and
 *    `@tamkeen/types`, and nothing on this surface can reach them.
 *
 * 2. **Editing is copy-on-write** (D-069). Publishing inserts a *new* version
 *    carrying its own copy of every question, option and weight, and retires the
 *    previous one. Nothing this service does ever writes to a row a past
 *    response points at — which is why the draft can be edited and deleted
 *    freely: no `assessment_responses` row can reference a DRAFT's questions,
 *    because a draft is never served to anybody.
 *
 * 3. **Existing results are never recomputed** (D-049, D-033). There is no code
 *    path here that touches `assessment_results` at all. That is the strongest
 *    form the guarantee can take: not "we are careful not to", but "there is
 *    nothing to be careful about".
 *
 * The balance guard fires at **publish**, not on save (D-070/D-071) — going from
 * a balanced thirty-item bank to a balanced thirty-six-item bank passes through
 * six unbalanced states, and a rule that makes the legal destination unreachable
 * is one people learn to defeat.
 */
@Injectable()
export class AdminAssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** §4C.3's landing state. */
  async overview(): Promise<AdminAssessmentOverview> {
    const rows = await this.prisma.assessment.findMany({
      orderBy: { version: 'desc' },
      select: VERSION_SELECT,
    });

    return {
      active: rows.filter((row) => row.status === 'ACTIVE').map(toVersion)[0] ?? null,
      draft: rows.filter((row) => row.status === 'DRAFT').map(toVersion)[0] ?? null,
      history: rows.filter((row) => row.status === 'RETIRED').map(toVersion),
    };
  }

  /** The draft bank, weights included. Admin-only by the controller's guard. */
  async getDraft(): Promise<AdminAssessmentDraft> {
    const draft = await this.requireDraft();
    const questions = await this.loadQuestions(draft.id);

    const previous = await this.prisma.assessment.findFirst({
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
      readiness: readiness(questions),
      basedOnVersion: previous?.version ?? null,
    };
  }

  /**
   * Opens a draft as a deep copy of the active version (D-069/D-070).
   *
   * The copy is one transaction. A half-copied draft would be an assessment
   * missing questions, and the balance guard would then refuse it for a reason
   * that has nothing to do with anything the administrator did.
   */
  async createDraft(actorId: string, ipAddress: string | null): Promise<AdminAssessmentDraft> {
    const existing = await this.prisma.assessment.findFirst({
      where: { status: 'DRAFT' },
      select: { id: true },
    });

    if (existing) {
      /* At most one draft, enforced by a partial unique index as well. Two would
         mean two answers to "what is being edited", and the screen has one. */
      throw new ConflictException('ASSESSMENT_DRAFT_EXISTS');
    }

    const active = await this.prisma.assessment.findFirst({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        key: true,
        version: true,
        title: true,
        description: true,
        questions: {
          orderBy: { displayOrder: 'asc' },
          select: {
            key: true,
            displayOrder: true,
            text: true,
            options: {
              orderBy: { displayOrder: 'asc' },
              select: {
                key: true,
                displayOrder: true,
                label: true,
                weights: { select: { dimension: true, points: true } },
              },
            },
          },
        },
      },
    });

    if (!active) {
      throw new NotFoundException('ASSESSMENT_NOT_FOUND');
    }

    const draftId = await this.prisma.$transaction(
      async (tx) => {
        const draft = await tx.assessment.create({
          data: {
            key: active.key,
            version: active.version + 1,
            title: active.title,
            description: active.description,
            status: 'DRAFT',
          },
          select: { id: true },
        });

        /*
         * One round trip per question, with its options and their weights
         * nested inside it.
         *
         * Written as three nested loops first, which is 30 + 150 statements for
         * the seeded bank — and slow enough under load to exhaust Prisma's
         * five-second interactive-transaction budget, which surfaced as an
         * intermittent failure with nothing wrong in it. Nesting the writes lets
         * the driver send each question and its 25-odd descendant rows together,
         * so the copy is 30 statements and the transaction is short.
         */
        for (const question of active.questions) {
          await tx.assessmentQuestion.create({
            data: {
              assessmentId: draft.id,
              /* Keys are carried over, so a question that survives an edit is
                 recognisably the same question across versions even though the
                 row is new. */
              key: question.key,
              displayOrder: question.displayOrder,
              text: question.text,
              options: {
                create: question.options.map((option) => ({
                  key: option.key,
                  displayOrder: option.displayOrder,
                  label: option.label,
                  weights: {
                    create: option.weights.map((weight) => ({
                      dimension: weight.dimension,
                      points: weight.points,
                    })),
                  },
                })),
              },
            },
            select: { id: true },
          });
        }

        return draft.id;
      },
      /*
       * Room for a large bank on a loaded database. Prisma's default is five
       * seconds, which is a sensible ceiling for a request-path transaction and
       * the wrong one for copying an instrument: the work is bounded by the
       * ministry's question count, not by anything a caller controls, and a
       * partial copy is not a state this rolls back *to* — it rolls back to no
       * draft at all, which means an administrator's edit simply never opened.
       */
      { timeout: 30_000 },
    );

    await this.audit.record({
      action: AuditAction.ADMIN_ASSESSMENT_DRAFT_OPENED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'assessment',
      targetId: draftId,
      detail: { copiedFromVersion: active.version },
    });

    return this.getDraft();
  }

  /** Abandons the draft. Nothing references it, so it deletes cleanly. */
  async discardDraft(actorId: string, ipAddress: string | null): Promise<void> {
    const draft = await this.requireDraft();

    /*
     * Safe by construction rather than by check: a DRAFT is never served by
     * `getActive`, so no `assessment_responses` row can point at its questions,
     * so the `Restrict` that protects published banks has nothing to refuse.
     * Questions and options cascade from the assessment.
     */
    await this.prisma.assessment.delete({ where: { id: draft.id } });

    await this.audit.record({
      action: AuditAction.ADMIN_ASSESSMENT_DRAFT_DISCARDED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'assessment',
      targetId: draft.id,
    });
  }

  async updateDraft(dto: UpdateDraftDto): Promise<AdminAssessmentDraft> {
    const draft = await this.requireDraft();

    await this.prisma.assessment.update({
      where: { id: draft.id },
      data: {
        ...(dto.title === undefined ? {} : { title: dto.title }),
        ...(dto.description === undefined ? {} : { description: dto.description }),
      },
    });

    return this.getDraft();
  }

  /**
   * Adds a question, with the standard Likert options weighted to one dimension.
   *
   * **The shortcut is the point.** The schema permits an option weighted across
   * several dimensions and the option editor exposes that, but the bank's shape
   * — five agreement levels, one dimension per item, 0-4 — is what makes it
   * balanced by construction (D-032). Going from five items per dimension to six
   * means adding six questions, one per letter; making that the easy path is how
   * the editor helps the administrator stay balanced rather than merely telling
   * them afterwards that they are not.
   */
  async addQuestion(dto: AddDraftQuestionDto): Promise<AdminAssessmentDraft> {
    const draft = await this.requireDraft();

    const levels = await this.likertLevels(draft.id);

    if (levels.length === 0) {
      /* An empty draft has no house style to copy. Rather than inventing one
         silently, refuse and let the administrator say what the options are. */
      throw new BadRequestException('ASSESSMENT_NO_TEMPLATE_QUESTION');
    }

    const [maxOrder, keys] = await Promise.all([
      this.prisma.assessmentQuestion.aggregate({
        where: { assessmentId: draft.id },
        _max: { displayOrder: true },
      }),
      this.prisma.assessmentQuestion.findMany({
        where: { assessmentId: draft.id },
        select: { key: true },
      }),
    ]);

    await this.prisma.assessmentQuestion.create({
      data: {
        assessmentId: draft.id,
        key: nextKey(
          dto.letter,
          keys.map((row) => row.key),
        ),
        displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
        text: dto.text,
        options: {
          create: levels.map((level) => ({
            key: level.key,
            displayOrder: level.displayOrder,
            label: level.label,
            weights: { create: [{ dimension: dto.letter, points: level.points }] },
          })),
        },
      },
    });

    return this.getDraft();
  }

  async updateQuestion(
    questionId: string,
    dto: UpdateDraftQuestionDto,
  ): Promise<AdminAssessmentDraft> {
    const draft = await this.requireDraft();
    await this.requireDraftQuestion(draft.id, questionId);

    await this.prisma.assessmentQuestion.update({
      where: { id: questionId },
      data: {
        ...(dto.text === undefined ? {} : { text: dto.text }),
        ...(dto.displayOrder === undefined ? {} : { displayOrder: dto.displayOrder }),
      },
    });

    return this.getDraft();
  }

  async removeQuestion(questionId: string): Promise<AdminAssessmentDraft> {
    const draft = await this.requireDraft();
    await this.requireDraftQuestion(draft.id, questionId);

    await this.prisma.assessmentQuestion.delete({ where: { id: questionId } });

    return this.getDraft();
  }

  /**
   * Reorders the draft's questions.
   *
   * Takes the complete order rather than a move-up/move-down, so the result is
   * whatever the administrator arranged rather than the outcome of replaying
   * their clicks against a list that may have changed underneath them. Written
   * in one transaction with a two-pass shuffle, because `display_order` has an
   * index and a naive one-by-one update collides with itself half way through.
   */
  async reorder(questionIds: string[]): Promise<AdminAssessmentDraft> {
    const draft = await this.requireDraft();

    const existing = await this.prisma.assessmentQuestion.findMany({
      where: { assessmentId: draft.id },
      select: { id: true },
    });

    const ids = new Set(existing.map((row) => row.id));
    const given = new Set(questionIds);

    /* Every question exactly once. A partial order would leave the omitted ones
       at whatever position they held, which is not an order anybody chose. */
    if (given.size !== questionIds.length || given.size !== ids.size) {
      throw new BadRequestException('ASSESSMENT_ORDER_INCOMPLETE');
    }
    if (questionIds.some((id) => !ids.has(id))) {
      throw new BadRequestException('ASSESSMENT_QUESTION_NOT_IN_DRAFT');
    }

    await this.prisma.$transaction(async (tx) => {
      /* Out of the way first: display orders are 1..n, so writing the final
         values directly would transiently duplicate one. */
      for (const [index, id] of questionIds.entries()) {
        await tx.assessmentQuestion.update({
          where: { id },
          data: { displayOrder: -(index + 1) },
        });
      }

      for (const [index, id] of questionIds.entries()) {
        await tx.assessmentQuestion.update({
          where: { id },
          data: { displayOrder: index + 1 },
        });
      }
    });

    return this.getDraft();
  }

  /**
   * Edits an option's label and its per-dimension weights (D-048).
   *
   * Weights are replaced wholesale rather than merged, because "this option now
   * contributes to S only" has to be expressible, and a merge cannot say that.
   * The dimension column is an enum, so a mistyped letter is refused by the
   * database rather than silently contributing nothing (D-035).
   */
  async updateOption(optionId: string, dto: UpdateDraftOptionDto): Promise<AdminAssessmentDraft> {
    const draft = await this.requireDraft();

    const option = await this.prisma.assessmentOption.findFirst({
      where: { id: optionId, question: { assessmentId: draft.id } },
      select: { id: true },
    });

    if (!option) {
      /* Reported as absent rather than forbidden: the id may belong to a
         published version, and editing one of those is not a thing that exists. */
      throw new NotFoundException('ASSESSMENT_OPTION_NOT_IN_DRAFT');
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.label !== undefined) {
        await tx.assessmentOption.update({ where: { id: optionId }, data: { label: dto.label } });
      }

      if (dto.weights !== undefined) {
        await tx.assessmentOptionWeight.deleteMany({ where: { optionId } });

        const rows = Object.entries(dto.weights)
          .filter(([, points]) => points !== undefined)
          .map(([dimension, points]) => ({
            optionId,
            dimension: dimension as RiasecLetter,
            points: points as number,
          }));

        if (rows.length > 0) {
          await tx.assessmentOptionWeight.createMany({ data: rows });
        }
      }
    });

    return this.getDraft();
  }

  /**
   * Publishes the draft: validate, activate, retire the predecessor (D-070).
   *
   * One transaction, and the order inside it matters. The previous version is
   * retired *before* the draft becomes active, because a partial unique index
   * permits only one ACTIVE row per key — doing it the other way round would
   * fail on the constraint, which is the constraint working.
   */
  async publish(actorId: string, ipAddress: string | null): Promise<AdminAssessmentVersion> {
    const draft = await this.requireDraft();
    const questions = await this.loadQuestions(draft.id);
    const state = readiness(questions);

    if (state.blockers.length > 0) {
      await this.audit.record({
        action: AuditAction.ADMIN_ASSESSMENT_PUBLISHED,
        outcome: 'FAILURE',
        actorUserId: actorId,
        ipAddress,
        targetType: 'assessment',
        targetId: draft.id,
        reason: AuditReason.BANK_NOT_PUBLISHABLE,
        /* The specific blockers, so a refusal is explicable months later without
           reconstructing the bank as it stood. */
        detail: { blockers: state.blockers.join(',') },
      });

      throw new ConflictException(state.blockers[0]);
    }

    const effectiveFrom = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.assessment.updateMany({
        where: { key: draft.key, status: 'ACTIVE' },
        data: { status: 'RETIRED', retiredAt: effectiveFrom },
      });

      await tx.assessment.update({
        where: { id: draft.id },
        data: { status: 'ACTIVE', effectiveFrom },
      });
    });

    await this.audit.record({
      action: AuditAction.ADMIN_ASSESSMENT_PUBLISHED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'assessment',
      targetId: draft.id,
      detail: {
        version: draft.version,
        questions: questions.length,
        /* Recorded even on success: an administrator who published past a
           warning made a decision, and the trail should say which one. */
        warnings: state.warnings.join(',') || 'none',
      },
    });

    const published = await this.prisma.assessment.findUniqueOrThrow({
      where: { id: draft.id },
      select: VERSION_SELECT,
    });

    return toVersion(published);
  }

  /** A published version, read-only, exactly as it was taken. */
  async getVersion(assessmentId: string): Promise<AdminAssessmentDraft> {
    const version = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { id: true, key: true, version: true, title: true, description: true },
    });

    if (!version) {
      throw new NotFoundException('ASSESSMENT_NOT_FOUND');
    }

    const questions = await this.loadQuestions(version.id);

    return {
      ...version,
      questions,
      readiness: readiness(questions),
      basedOnVersion: null,
    };
  }

  private async requireDraft() {
    const draft = await this.prisma.assessment.findFirst({
      where: { status: 'DRAFT' },
      select: { id: true, key: true, version: true, title: true, description: true },
    });

    if (!draft) {
      throw new NotFoundException('ASSESSMENT_NO_DRAFT');
    }

    return draft;
  }

  private async requireDraftQuestion(assessmentId: string, questionId: string): Promise<void> {
    const question = await this.prisma.assessmentQuestion.findFirst({
      where: { id: questionId, assessmentId },
      select: { id: true },
    });

    if (!question) {
      throw new NotFoundException('ASSESSMENT_QUESTION_NOT_IN_DRAFT');
    }
  }

  private async loadQuestions(assessmentId: string): Promise<AdminAssessmentQuestion[]> {
    const rows = await this.prisma.assessmentQuestion.findMany({
      where: { assessmentId },
      orderBy: { displayOrder: 'asc' },
      select: {
        id: true,
        key: true,
        text: true,
        displayOrder: true,
        options: {
          orderBy: { displayOrder: 'asc' },
          select: {
            id: true,
            key: true,
            label: true,
            displayOrder: true,
            weights: { select: { dimension: true, points: true } },
          },
        },
      },
    });

    return rows.map((question) => ({
      id: question.id,
      key: question.key,
      text: question.text,
      order: question.displayOrder,
      options: question.options.map((option) => ({
        id: option.id,
        key: option.key,
        label: option.label,
        order: option.displayOrder,
        weights: Object.fromEntries(
          option.weights.map((weight) => [weight.dimension, weight.points]),
        ) as Partial<Record<RiasecLetter, number>>,
      })),
    }));
  }

  /**
   * The option template a new question copies.
   *
   * Read from the draft's own first question rather than from
   * `seed-data/assessment.ts`, so a ministry that has revised its agreement
   * labels gets *its* labels on the next question it adds rather than the ones
   * that shipped with the code. The bank is theirs after the first publish
   * (D-069); the editor should behave as if it is.
   */
  private async likertLevels(assessmentId: string) {
    const template = await this.prisma.assessmentQuestion.findFirst({
      where: { assessmentId },
      orderBy: { displayOrder: 'asc' },
      select: {
        options: {
          orderBy: { displayOrder: 'asc' },
          select: {
            key: true,
            displayOrder: true,
            label: true,
            weights: { select: { points: true } },
          },
        },
      },
    });

    return (template?.options ?? []).map((option) => ({
      key: option.key,
      displayOrder: option.displayOrder,
      label: option.label,
      /* The points the template gives this level, whichever dimension it was
         for — the level's *weight* is a property of the agreement scale, not of
         the dimension it happens to score. */
      points: option.weights[0]?.points ?? 0,
    }));
  }
}

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
}): AdminAssessmentVersion {
  return {
    id: row.id,
    version: row.version,
    status: row.status,
    title: row.title,
    effectiveFrom: row.effectiveFrom?.toISOString() ?? null,
    retiredAt: row.retiredAt?.toISOString() ?? null,
    questionCount: row._count.questions,
    /* How many people this version scored. Shown because it is what makes
       D-049 concrete on the screen: these results exist, and editing does not
       touch them. */
    resultCount: row._count.results,
  };
}

function readiness(questions: readonly AdminAssessmentQuestion[]): AdminBankReadiness {
  const draft: DraftQuestion[] = questions.map((question) => ({
    id: question.id,
    displayOrder: question.order,
    options: question.options.map((option) => ({ id: option.id, weights: option.weights })),
  }));

  const result = assessBank(draft);

  return {
    blockers: [...result.blockers],
    warnings: [...result.warnings],
    attainable: result.attainable,
    balanced: result.balanced,
  };
}

/**
 * The next free key for a dimension, e.g. `S6`.
 *
 * Keys stay stable across versions (D-032), so a new question must not reuse one
 * a retired version already gave to a different question — that would make two
 * different questions look like the same question revised.
 */
function nextKey(letter: RiasecLetter, taken: readonly string[]): string {
  const used = new Set(taken);

  for (let index = 1; index <= taken.length + RIASEC_LETTERS.length + 1; index += 1) {
    const candidate = `${letter}${index}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }

  /* Unreachable: the loop bound exceeds the number of taken keys. */
  throw new ConflictException('ASSESSMENT_KEY_EXHAUSTED');
}
