import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type { CefrBand, EnglishAssessmentResultView, EnglishAssessmentView } from '@tamkeen/types';

import { AuditAction, AuditReason } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  EnglishScoringError,
  scoreEnglishAssessment,
  type ScorableEnglishQuestion,
} from './english-scoring';
import type { SubmitEnglishAssessmentDto } from './english-assessment.dto';

/**
 * The English placement test (§4.13, D-123).
 *
 * `assessments`/`assessment_results` are shared with the Holland instrument
 * now (TAM-147, folding in TAM-148's sibling tables) — every query here is
 * filtered to `kind: 'CEFR'`, not because Prisma requires it but because
 * without it "the active assessment" or "the user's result" could resolve to
 * the *other* instrument's row, exactly the risk D-124 built separate tables
 * to avoid in the first place. The bank tables (`EnglishAssessmentQuestion` /
 * `Option` / `Band`) stayed their own shape; only the registry and the result
 * unified.
 *
 * Three rules are enforced here rather than in the controller, so a later caller
 * — an admin screen, a job — cannot bypass them:
 *
 *  1. **The answer key never leaves the server.** `getActive` selects questions
 *     and options *without* `isCorrect`, and without `marks` or the item's CEFR
 *     level either. The first is the scoring key outright; the other two let a
 *     taker triage, and a placement test is only useful if it measures what
 *     somebody can do unaided.
 *  2. **The test is taken once** (D-123). The database says so as well — a
 *     partial unique index on `assessment_results (user_id) WHERE kind =
 *     'CEFR'` (TAM-147's replacement for `english_assessment_results.user_id
 *     @unique`) — so the check below is the courteous refusal and the
 *     constraint is the guarantee.
 *  3. **Nothing here writes to a published version.** Editing is §4C.9's job and
 *     is copy-on-write; this service reads the ACTIVE row and appends a result.
 */
@Injectable()
export class EnglishAssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The active version, in presentation order, with no answer key attached. */
  async getActive(): Promise<EnglishAssessmentView> {
    const assessment = await this.prisma.assessment.findFirst({
      /*
       * Scoped to this instrument's key as well as its status and kind.
       * Holland's equivalent query only needs `kind` now (TAM-147) — the
       * `key` filter here is belt-and-braces should a second CEFR instrument
       * ever exist.
       */
      where: { key: ENGLISH_ASSESSMENT_KEY, kind: 'CEFR', status: 'ACTIVE' },
      select: {
        id: true,
        version: true,
        title: true,
        description: true,
        englishQuestions: {
          orderBy: { displayOrder: 'asc' },
          select: {
            id: true,
            displayOrder: true,
            text: true,
            options: {
              orderBy: { displayOrder: 'asc' },
              /* Note the absence of `isCorrect` — see the class comment. An
                 integration test greps this response for it. */
              select: { id: true, displayOrder: true, label: true },
            },
          },
        },
      },
    });

    if (!assessment) {
      throw new NotFoundException('ENGLISH_ASSESSMENT_NOT_FOUND');
    }

    return {
      id: assessment.id,
      version: assessment.version,
      title: assessment.title,
      description: assessment.description,
      questions: assessment.englishQuestions.map((question) => ({
        id: question.id,
        order: question.displayOrder,
        text: question.text,
        options: question.options.map((option) => ({
          id: option.id,
          label: option.label,
          order: option.displayOrder,
        })),
      })),
    };
  }

  /** The user's result, or null if they have not taken the test. */
  async getResult(userId: string): Promise<EnglishAssessmentResultView | null> {
    /* `findFirst`, not `findUnique`: the "one CEFR result ever" rule is a
       partial unique index (`WHERE kind = 'CEFR'`), and Prisma can only
       generate a `findUnique` shortcut for a constraint declared in full in
       the schema — the same limitation the DRAFT/ACTIVE partial indexes on
       `assessments` already live with. */
    const result = await this.prisma.assessmentResult.findFirst({
      where: { userId, kind: 'CEFR' },
      select: RESULT_SELECT,
    });

    return result ? toResultView(result) : null;
  }

  /**
   * Scores a submission and persists the result with its answers.
   *
   * The write is one transaction: a result whose responses failed to save would
   * be a level nobody could explain, which is worse than a failed submission the
   * person can retry.
   */
  async submit(
    userId: string,
    dto: SubmitEnglishAssessmentDto,
    ipAddress: string | null,
  ): Promise<EnglishAssessmentResultView> {
    const existing = await this.prisma.assessmentResult.findFirst({
      where: { userId, kind: 'CEFR' },
      select: { id: true },
    });

    if (existing) {
      /* D-123: taken once. Audited, because a second attempt is either a client
         bug or somebody probing, and both are worth being able to see. */
      await this.audit.record({
        action: AuditAction.ENGLISH_ASSESSMENT_SUBMITTED,
        outcome: 'FAILURE',
        actorUserId: userId,
        ipAddress,
        targetType: 'assessment_result',
        targetId: existing.id,
        reason: AuditReason.ENGLISH_ASSESSMENT_ALREADY_TAKEN,
      });

      throw new ConflictException('ENGLISH_ASSESSMENT_ALREADY_TAKEN');
    }

    const assessment = await this.prisma.assessment.findFirst({
      /*
       * Pinned to the ACTIVE version *and* to the id the client was served. A
       * submission arriving mid-publish therefore scores against the version it
       * was given, or is refused — never against a bank the taker never saw,
       * which is the one way a copy-on-write publish could corrupt a result.
       */
      where: { id: dto.assessmentId, kind: 'CEFR', status: 'ACTIVE' },
      select: {
        id: true,
        version: true,
        englishBands: { select: { level: true, minScore: true, maxScore: true } },
        englishQuestions: {
          select: {
            id: true,
            marks: true,
            options: { select: { id: true, isCorrect: true } },
          },
        },
      },
    });

    if (!assessment) {
      throw new NotFoundException('ENGLISH_ASSESSMENT_NOT_FOUND');
    }

    const bank: ScorableEnglishQuestion[] = assessment.englishQuestions.map((question) => ({
      id: question.id,
      marks: question.marks,
      options: question.options.map((option) => ({ id: option.id, isCorrect: option.isCorrect })),
    }));

    const bands: CefrBand[] = assessment.englishBands.map((band) => ({
      level: band.level,
      minScore: band.minScore,
      maxScore: band.maxScore,
    }));

    let score;
    try {
      score = scoreEnglishAssessment(bank, bands, dto.answers);
    } catch (error) {
      if (error instanceof EnglishScoringError) {
        await this.audit.record({
          action: AuditAction.ENGLISH_ASSESSMENT_SUBMITTED,
          outcome: 'FAILURE',
          actorUserId: userId,
          ipAddress,
          targetType: 'assessment',
          targetId: assessment.id,
          reason: error.code,
        });

        throw new ConflictException(error.code);
      }
      throw error;
    }

    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const created = await tx.assessmentResult.create({
          data: {
            userId,
            assessmentId: assessment.id,
            assessmentVersion: assessment.version,
            kind: 'CEFR',
            cefrScore: score.totalScore,
            cefrMax: score.maxScore,
            cefrLevel: score.level,
          },
          select: RESULT_SELECT,
        });

        await tx.englishAssessmentResponse.createMany({
          data: dto.answers.map((answer) => ({
            resultId: created.id,
            questionId: answer.questionId,
            optionId: answer.optionId,
          })),
        });

        return created;
      });
    } catch (error) {
      /*
       * The unique index doing its job. The read above closes the ordinary case;
       * this closes the race between two submissions in flight at once, which no
       * read-then-write can. Answered exactly as the courteous refusal is, so a
       * caller cannot tell the two apart — and must be, because the second
       * request genuinely did nothing.
       */
      if (isUniqueViolation(error)) {
        throw new ConflictException('ENGLISH_ASSESSMENT_ALREADY_TAKEN');
      }
      throw error;
    }

    await this.audit.record({
      action: AuditAction.ENGLISH_ASSESSMENT_SUBMITTED,
      outcome: 'SUCCESS',
      actorUserId: userId,
      ipAddress,
      targetType: 'assessment_result',
      targetId: result.id,
      /* The level, not the score: it is what the record is *for*, and a raw
         total tells an auditor nothing without the band table beside it. */
      detail: { level: score.level, version: String(assessment.version) },
    });

    return toResultView(result);
  }
}

/** The one instrument (§4.13). Every version shares this key. */
export const ENGLISH_ASSESSMENT_KEY = 'english-cefr';

const RESULT_SELECT = {
  id: true,
  assessmentId: true,
  assessmentVersion: true,
  cefrScore: true,
  cefrMax: true,
  cefrLevel: true,
  completedAt: true,
} as const;

function toResultView(result: {
  id: string;
  assessmentId: string;
  assessmentVersion: number;
  cefrScore: number | null;
  cefrMax: number | null;
  cefrLevel: EnglishAssessmentResultView['level'] | null;
  completedAt: Date;
}): EnglishAssessmentResultView {
  /* Non-null: every row this function is called on was either just created
     with `kind: 'CEFR'` or read back filtered to it (TAM-147) — the CEFR
     payload is populated by construction. */
  const totalScore = result.cefrScore!;
  const maxScore = result.cefrMax!;
  const level = result.cefrLevel!;

  return {
    id: result.id,
    assessmentId: result.assessmentId,
    assessmentVersion: result.assessmentVersion,
    completedAt: result.completedAt.toISOString(),
    totalScore,
    maxScore,
    percent: maxScore > 0 ? (totalScore / maxScore) * 100 : 0,
    /* Always false (D-123). Sent rather than assumed by the client, so the rule
       has one implementation and the screen renders what it is told. */
    canRetake: false,
    level,
  };
}

/** Prisma's unique-constraint code, without importing the client's error class. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}
