import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  defaultPlacementBands,
  type AdminAssessmentDraft,
  type AdminAssessmentOverview,
  type AdminAssessmentQuestion,
  type AdminAssessmentReadiness,
  type AdminAssessmentVersion,
  type LevelRef,
  type PlacementBand,
} from '@tamkeen/types';

import { AuditAction, AuditReason } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { assessBank, type DraftQuestion } from './bank-readiness';
import type {
  AddDraftQuestionDto,
  ReorderDraftDto,
  SetBandsDto,
  UpdateDraftDto,
  UpdateDraftOptionDto,
  UpdateDraftQuestionDto,
} from './admin.dto';

/**
 * §4C.3 — editing a path's placement assessment (D-134).
 *
 * **Per path.** There is no "the assessment" any more: each path owns one, and
 * every method here is scoped by `pathId`. That is what makes the versioning
 * indexes work — one DRAFT and one ACTIVE per path — and it is why an
 * administrator editing one path's bank cannot disturb another's.
 *
 * **Three rules govern everything here.**
 *
 * 1. **Admins edit inputs, never the algorithm** (D-048). Questions, options,
 *    which option is correct, what an item is worth, and the band table are data
 *    in these tables. The tally, the placement and the partition rule are in
 *    `assessment/scoring.ts` and `bank-readiness.ts`, and nothing on this
 *    surface can reach them.
 *
 * 2. **Editing is copy-on-write** (D-072). Publishing inserts a new version
 *    carrying its own copy of every question, option **and band**, and retires
 *    the previous one. Nothing here ever writes to a row a past response points
 *    at — which is why the draft is freely editable and freely deletable.
 *
 * 3. **Existing results are never recomputed** (D-049). There is no code path
 *    here that touches `assessment_results` or `learner_placements` at all. That
 *    is the strongest form the guarantee can take: not "we are careful not to",
 *    but "there is nothing to be careful about".
 *
 * The gate fires at **publish**, not on save (D-073) — growing a bank changes
 * the attainable total, which invalidates the band table until the administrator
 * gets round to it, and a rule that makes the legal destination unreachable is
 * one people learn to defeat.
 */
@Injectable()
export class AdminAssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** What is live for this path, what is being edited, what came before. */
  async overview(pathId: string): Promise<AdminAssessmentOverview> {
    const path = await this.requirePath(pathId);

    const versions = await this.prisma.pathAssessment.findMany({
      where: { pathId },
      orderBy: { version: 'desc' },
      select: VERSION_SELECT,
    });

    return {
      pathId,
      pathName: path.name,
      levels: path.levels,
      active: versions.filter((row) => row.status === 'ACTIVE').map(toVersion)[0] ?? null,
      draft: versions.filter((row) => row.status === 'DRAFT').map(toVersion)[0] ?? null,
      history: versions.filter((row) => row.status === 'RETIRED').map(toVersion),
    };
  }

  async getDraft(pathId: string): Promise<AdminAssessmentDraft> {
    const draft = await this.requireDraft(pathId);

    return this.load(draft.id);
  }

  /**
   * Opens an edit: a new version copied from the active one.
   *
   * A path with no assessment at all gets an empty first draft rather than an
   * error — that is how a path acquires one, and refusing here would leave a new
   * path with no way to reach §4C.3 at all.
   */
  async createDraft(
    pathId: string,
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminAssessmentDraft> {
    await this.requirePath(pathId);

    const existing = await this.prisma.pathAssessment.findFirst({
      where: { pathId, status: 'DRAFT' },
      select: { id: true },
    });

    if (existing) {
      /* At most one draft, enforced by a partial unique index as well. Two would
         mean two answers to "what is being edited", and the screen has one. */
      throw new ConflictException('ASSESSMENT_DRAFT_EXISTS');
    }

    const active = await this.prisma.pathAssessment.findFirst({
      where: { pathId, status: 'ACTIVE' },
      select: {
        version: true,
        title: true,
        description: true,
        bands: { select: { levelId: true, minScore: true, maxScore: true } },
        questions: {
          orderBy: { displayOrder: 'asc' },
          select: {
            key: true,
            displayOrder: true,
            text: true,
            marks: true,
            levelId: true,
            topic: true,
            options: {
              orderBy: { displayOrder: 'asc' },
              select: { key: true, displayOrder: true, label: true, isCorrect: true },
            },
          },
        },
      },
    });

    const path = await this.prisma.path.findUniqueOrThrow({
      where: { id: pathId },
      select: { name: true },
    });

    const draftId = await this.prisma.$transaction(
      async (tx) => {
        const draft = await tx.pathAssessment.create({
          data: {
            pathId,
            version: (active?.version ?? 0) + 1,
            title: active?.title ?? `تحديد المستوى — ${path.name}`,
            description: active?.description ?? DEFAULT_DESCRIPTION,
            status: 'DRAFT',
            /* Copied with the version, which is the whole of D-072: a past
               placement stays explicable because the table that produced it
               travelled with the instrument rather than being global. */
            bands: active
              ? {
                  create: active.bands.map((band) => ({
                    levelId: band.levelId,
                    minScore: band.minScore,
                    maxScore: band.maxScore,
                  })),
                }
              : undefined,
          },
          select: { id: true },
        });

        /*
         * One round trip per question, with its options nested inside it. Three
         * nested loops is hundreds of statements and slow enough under load to
         * exhaust Prisma's interactive-transaction budget, which surfaces as an
         * intermittent failure with nothing wrong in it.
         */
        for (const question of active?.questions ?? []) {
          await tx.assessmentQuestion.create({
            data: {
              assessmentId: draft.id,
              /* Keys carry over, so an item that survives an edit is
                 recognisably the same item across versions even though the row
                 is new. */
              key: question.key,
              displayOrder: question.displayOrder,
              text: question.text,
              marks: question.marks,
              levelId: question.levelId,
              topic: question.topic,
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
      action: AuditAction.ADMIN_ASSESSMENT_DRAFT_OPENED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'assessment',
      targetId: draftId,
      detail: { copiedFromVersion: String(active?.version ?? 'none') },
    });

    return this.load(draftId);
  }

  /** Abandons the draft. Nothing references it, so it deletes cleanly. */
  async discardDraft(pathId: string, actorId: string, ipAddress: string | null): Promise<void> {
    const draft = await this.requireDraft(pathId);

    /* Safe by construction rather than by check: a DRAFT is never served by
       `getActive`, so no response row can point at its questions, so the
       `Restrict` that protects published banks has nothing to refuse. */
    await this.prisma.pathAssessment.delete({ where: { id: draft.id } });

    await this.audit.record({
      action: AuditAction.ADMIN_ASSESSMENT_DRAFT_DISCARDED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'assessment',
      targetId: draft.id,
      detail: { version: String(draft.version) },
    });
  }

  async updateDraft(pathId: string, dto: UpdateDraftDto): Promise<AdminAssessmentDraft> {
    const draft = await this.requireDraft(pathId);

    await this.prisma.pathAssessment.update({
      where: { id: draft.id },
      data: {
        ...(dto.title === undefined ? {} : { title: dto.title }),
        ...(dto.description === undefined ? {} : { description: dto.description }),
      },
    });

    return this.load(draft.id);
  }

  /**
   * Adds a question with four blank options and no correct answer yet.
   *
   * Four because that is the shape of every item in the seeded banks and the one
   * an author expects; blank because writing the distractors *is* the authoring
   * work, and generating them would be inventing assessment content. The missing
   * correct answer is a blocker until they tick one, which is the editor telling
   * the truth about an unfinished item.
   */
  async addQuestion(pathId: string, dto: AddDraftQuestionDto): Promise<AdminAssessmentDraft> {
    const draft = await this.requireDraft(pathId);

    if (dto.levelId) {
      await this.requireLevel(pathId, dto.levelId);
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
        key: nextKey(keys.map((row) => row.key)),
        displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
        text: dto.text,
        marks: dto.marks ?? 1,
        levelId: dto.levelId ?? null,
        topic: dto.topic ?? null,
        options: {
          create: [1, 2, 3, 4].map((index) => ({
            key: `o${index}`,
            displayOrder: index,
            label: '',
            isCorrect: false,
          })),
        },
      },
    });

    return this.load(draft.id);
  }

  async updateQuestion(
    pathId: string,
    questionId: string,
    dto: UpdateDraftQuestionDto,
  ): Promise<AdminAssessmentDraft> {
    const draft = await this.requireDraft(pathId);
    await this.requireDraftQuestion(draft.id, questionId);

    if (dto.levelId) {
      await this.requireLevel(pathId, dto.levelId);
    }

    await this.prisma.assessmentQuestion.update({
      where: { id: questionId },
      data: {
        ...(dto.text === undefined ? {} : { text: dto.text }),
        ...(dto.marks === undefined ? {} : { marks: dto.marks }),
        ...(dto.levelId === undefined ? {} : { levelId: dto.levelId }),
        ...(dto.topic === undefined ? {} : { topic: dto.topic }),
        ...(dto.displayOrder === undefined ? {} : { displayOrder: dto.displayOrder }),
      },
    });

    return this.load(draft.id);
  }

  async removeQuestion(pathId: string, questionId: string): Promise<AdminAssessmentDraft> {
    const draft = await this.requireDraft(pathId);
    await this.requireDraftQuestion(draft.id, questionId);

    await this.prisma.assessmentQuestion.delete({ where: { id: questionId } });

    return this.load(draft.id);
  }

  /** Takes the complete order, and shuffles in two passes. */
  async reorder(pathId: string, dto: ReorderDraftDto): Promise<AdminAssessmentDraft> {
    const draft = await this.requireDraft(pathId);

    const existing = await this.prisma.assessmentQuestion.findMany({
      where: { assessmentId: draft.id },
      select: { id: true },
    });

    const known = new Set(existing.map((row) => row.id));
    const given = new Set(dto.questionIds);

    if (given.size !== dto.questionIds.length || given.size !== known.size) {
      throw new BadRequestException('ASSESSMENT_ORDER_INCOMPLETE');
    }
    if (dto.questionIds.some((id) => !known.has(id))) {
      throw new BadRequestException('ASSESSMENT_QUESTION_NOT_IN_DRAFT');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const [index, id] of dto.questionIds.entries()) {
        await tx.assessmentQuestion.update({
          where: { id },
          data: { displayOrder: -(index + 1) },
        });
      }
      for (const [index, id] of dto.questionIds.entries()) {
        await tx.assessmentQuestion.update({ where: { id }, data: { displayOrder: index + 1 } });
      }
    });

    return this.load(draft.id);
  }

  async updateOption(
    pathId: string,
    optionId: string,
    dto: UpdateDraftOptionDto,
  ): Promise<AdminAssessmentDraft> {
    const draft = await this.requireDraft(pathId);

    const option = await this.prisma.assessmentOption.findFirst({
      where: { id: optionId, question: { assessmentId: draft.id } },
      select: { id: true, questionId: true },
    });

    if (!option) {
      /* Reported as absent rather than forbidden: the id may belong to a
         published version, and editing one of those is not a thing that exists. */
      throw new NotFoundException('ASSESSMENT_OPTION_NOT_IN_DRAFT');
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.isCorrect === true) {
        /* Moving the tick is one action, not two. Making the client clear the
           old one first would leave the bank momentarily two-answered, and the
           readiness panel would flicker a blocker at them for it. */
        await tx.assessmentOption.updateMany({
          where: { questionId: option.questionId },
          data: { isCorrect: false },
        });
      }

      await tx.assessmentOption.update({
        where: { id: optionId },
        data: {
          ...(dto.label === undefined ? {} : { label: dto.label }),
          ...(dto.isCorrect === undefined ? {} : { isCorrect: dto.isCorrect }),
        },
      });
    });

    return this.load(draft.id);
  }

  /**
   * Replaces the band table — §4C.3's configurable placement rule (D-134).
   *
   * **The whole table at once, never one band.** A partition is a single object:
   * moving a boundary necessarily changes two bands, so a per-band endpoint
   * would force the administrator through states that are invalid by
   * construction and make the editor reject its own intermediate steps. Taking
   * the complete table also means what is stored is what they arranged, on the
   * same reasoning `reorder` takes the complete order.
   *
   * An empty list clears the table and returns the path to the even split.
   *
   * Validation is the gate's, at publish, not here — a draft whose bank has just
   * grown has a stale table by definition, and refusing the save would leave no
   * way to fix it.
   */
  async setBands(pathId: string, dto: SetBandsDto): Promise<AdminAssessmentDraft> {
    const draft = await this.requireDraft(pathId);

    const levelIds = dto.bands.map((band) => band.levelId);

    if (new Set(levelIds).size !== levelIds.length) {
      /* The unique index would refuse this too; catching it here turns a 500
         into a named refusal the screen can render. */
      throw new BadRequestException('ASSESSMENT_BAND_LEVEL_REPEATED');
    }

    for (const levelId of levelIds) {
      await this.requireLevel(pathId, levelId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.assessmentBand.deleteMany({ where: { assessmentId: draft.id } });

      if (dto.bands.length > 0) {
        await tx.assessmentBand.createMany({
          data: dto.bands.map((band) => ({
            assessmentId: draft.id,
            levelId: band.levelId,
            minScore: band.minScore,
            maxScore: band.maxScore,
          })),
        });
      }
    });

    return this.load(draft.id);
  }

  /**
   * Publishes the draft: validate, activate, retire the predecessor.
   *
   * One transaction, and the order inside it matters. The previous version is
   * retired *before* the draft becomes active, because a partial unique index
   * permits only one ACTIVE row per path — doing it the other way round would
   * fail on the constraint, which is the constraint working.
   */
  async publish(
    pathId: string,
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminAssessmentVersion> {
    const draft = await this.requireDraft(pathId);
    const loaded = await this.load(draft.id);

    if (loaded.readiness.blockers.length > 0) {
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
        detail: { blockers: loaded.readiness.blockers.join(',') },
      });

      throw new ConflictException(loaded.readiness.blockers[0]);
    }

    const effectiveFrom = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.pathAssessment.updateMany({
        where: { pathId, status: 'ACTIVE' },
        data: { status: 'RETIRED', retiredAt: effectiveFrom },
      });

      await tx.pathAssessment.update({
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
        version: String(draft.version),
        questions: String(loaded.questions.length),
        maxScore: String(loaded.readiness.maxScore),
        /* Recorded even on success: an administrator who published past a
           warning made a decision, and the trail should say which one. */
        warnings: loaded.readiness.warnings.join(',') || 'none',
      },
    });

    const published = await this.prisma.pathAssessment.findUniqueOrThrow({
      where: { id: draft.id },
      select: VERSION_SELECT,
    });

    return toVersion(published);
  }

  /** A published version, read-only, exactly as it was taken. */
  async getVersion(assessmentId: string): Promise<AdminAssessmentDraft> {
    return this.load(assessmentId);
  }

  // ── internals ───────────────────────────────────────────────────────────────

  /** One version, whatever its status, with everything the editor renders. */
  private async load(assessmentId: string): Promise<AdminAssessmentDraft> {
    const version = await this.prisma.pathAssessment.findUnique({
      where: { id: assessmentId },
      select: {
        id: true,
        pathId: true,
        version: true,
        title: true,
        description: true,
        path: {
          select: {
            name: true,
            levels: {
              orderBy: { position: 'asc' },
              select: { id: true, name: true, position: true },
            },
          },
        },
        bands: { select: { levelId: true, minScore: true, maxScore: true } },
        questions: {
          orderBy: { displayOrder: 'asc' },
          select: {
            id: true,
            key: true,
            text: true,
            displayOrder: true,
            marks: true,
            levelId: true,
            topic: true,
            options: {
              orderBy: { displayOrder: 'asc' },
              select: { id: true, key: true, label: true, displayOrder: true, isCorrect: true },
            },
          },
        },
      },
    });

    if (!version) {
      throw new NotFoundException('ASSESSMENT_NOT_FOUND');
    }

    const questions: AdminAssessmentQuestion[] = version.questions.map((question) => ({
      id: question.id,
      key: question.key,
      text: question.text,
      order: question.displayOrder,
      marks: question.marks,
      levelId: question.levelId,
      topic: question.topic,
      options: question.options.map((option) => ({
        id: option.id,
        key: option.key,
        label: option.label,
        order: option.displayOrder,
        isCorrect: option.isCorrect,
      })),
    }));

    const levels: LevelRef[] = version.path.levels;
    const authored = [...version.bands].sort((a, b) => a.minScore - b.minScore);
    const readiness = toReadiness(questions, authored, levels);

    return {
      id: version.id,
      pathId: version.pathId,
      pathName: version.path.name,
      version: version.version,
      title: version.title,
      description: version.description,
      levels,
      questions,
      /* What placement will actually use: the authored table, or the split it
         falls back to. Sending the effective table rather than an empty list
         means the editor shows the administrator the rule in force rather than
         a blank they have to know the meaning of. */
      bands: authored.length > 0 ? authored : defaultPlacementBands(levels, readiness.maxScore),
      bandsAreDefault: authored.length === 0,
      readiness,
      basedOnVersion: version.version > 1 ? version.version - 1 : null,
    };
  }

  private async requirePath(pathId: string): Promise<{ name: string; levels: LevelRef[] }> {
    const path = await this.prisma.path.findUnique({
      where: { id: pathId },
      select: {
        name: true,
        levels: { orderBy: { position: 'asc' }, select: { id: true, name: true, position: true } },
      },
    });

    if (!path) {
      throw new NotFoundException('PATH_NOT_FOUND');
    }

    return path;
  }

  private async requireLevel(pathId: string, levelId: string): Promise<void> {
    const level = await this.prisma.level.findFirst({
      where: { id: levelId, pathId },
      select: { id: true },
    });

    if (!level) {
      throw new BadRequestException(AuditReason.LEVEL_NOT_IN_PATH);
    }
  }

  private async requireDraft(pathId: string) {
    const draft = await this.prisma.pathAssessment.findFirst({
      where: { pathId, status: 'DRAFT' },
      select: { id: true, version: true },
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
}

const DEFAULT_DESCRIPTION =
  'اختبار قصير لتحديد نقطة البداية المناسبة لك في هذا المسار. يُجرى مرة واحدة.';

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
    /* How many people this version placed. Shown because it is what makes D-049
       concrete on the screen: these results exist, and editing does not touch
       them. */
    resultCount: row._count.results,
  };
}

function toReadiness(
  questions: readonly AdminAssessmentQuestion[],
  bands: readonly PlacementBand[],
  levels: readonly LevelRef[],
): AdminAssessmentReadiness {
  const draft: DraftQuestion[] = questions.map((question) => ({
    id: question.id,
    displayOrder: question.order,
    marks: question.marks,
    levelId: question.levelId,
    options: question.options.map((option) => ({ id: option.id, isCorrect: option.isCorrect })),
  }));

  const result = assessBank(draft, bands, levels);

  return {
    blockers: [...result.blockers],
    warnings: [...result.warnings],
    maxScore: result.maxScore,
    levelsWithoutQuestion: [...result.levelsWithoutQuestion],
    bandsCoverRange: result.bandsCoverRange,
  };
}

/**
 * The next free question key, e.g. `q7`.
 *
 * Keys stay stable across versions, so a new question must not reuse one a
 * retired version already gave to a different question — that would make two
 * different items look like the same item revised.
 */
function nextKey(taken: readonly string[]): string {
  const used = new Set(taken);

  for (let index = 1; index <= taken.length + 1; index += 1) {
    const candidate = `q${index}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }

  /* Unreachable: the loop bound exceeds the number of taken keys. */
  throw new ConflictException('ASSESSMENT_KEY_EXHAUSTED');
}
