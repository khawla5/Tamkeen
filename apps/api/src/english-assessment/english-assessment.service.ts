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
 * Three rules are enforced here rather than in the controller, so a later caller
 * — an admin screen, a job — cannot bypass them:
 *
 *  1. **The answer key never leaves the server.** `getActive` selects questions
 *     and options *without* `isCorrect`, and without `marks` or the item's CEFR
 *     level either. The first is the scoring key outright; the other two let a
 *     taker triage, and a placement test is only useful if it measures what
 *     somebody can do unaided.
 *  2. **The test is taken once** (D-123). The database says so as well —
 *     `english_assessment_results.user_id` is unique — so the check below is the
 *     courteous refusal and the constraint is the guarantee.
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
    const assessment = await this.prisma.englishAssessment.findFirst({
      /*
       * Scoped to this instrument's key as well as its status. Holland's
       * equivalent query does not need to be — its table holds one instrument —
       * but writing the filter here costs nothing and means a second English
       * instrument, if the ministry ever wants one, is a data decision rather
       * than a bug that surfaces as the wrong test being served.
       */
      where: { key: ENGLISH_ASSESSMENT_KEY, status: 'ACTIVE' },
      select: {
        id: true,
        version: true,
        title: true,
        description: true,
        questions: {
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
      questions: assessment.questions.map((question) => ({
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
    const result = await this.prisma.englishAssessmentResult.findUnique({
      where: { userId },
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
    const existing = await this.prisma.englishAssessmentResult.findUnique({
      where: { userId },
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

    const assessment = await this.prisma.englishAssessment.findFirst({
      /*
       * Pinned to the ACTIVE version *and* to the id the client was served. A
       * submission arriving mid-publish therefore scores against the version it
       * was given, or is refused — never against a bank the taker never saw,
       * which is the one way a copy-on-write publish could corrupt a result.
       */
      where: { id: dto.assessmentId, status: 'ACTIVE' },
      select: {
        id: true,
        version: true,
        bands: { select: { level: true, minScore: true, maxScore: true } },
        questions: {
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

    const bank: ScorableEnglishQuestion[] = assessment.questions.map((question) => ({
      id: question.id,
      marks: question.marks,
      options: question.options.map((option) => ({ id: option.id, isCorrect: option.isCorrect })),
    }));

    const bands: CefrBand[] = assessment.bands.map((band) => ({
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
        const created = await tx.englishAssessmentResult.create({
          data: {
            userId,
            assessmentId: assessment.id,
            assessmentVersion: assessment.version,
            totalScore: score.totalScore,
            maxScore: score.maxScore,
            level: score.level,
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
  totalScore: true,
  maxScore: true,
  level: true,
  completedAt: true,
} as const;

function toResultView(result: {
  id: string;
  assessmentId: string;
  assessmentVersion: number;
  totalScore: number;
  maxScore: number;
  level: EnglishAssessmentResultView['level'];
  completedAt: Date;
}): EnglishAssessmentResultView {
  return {
    id: result.id,
    assessmentId: result.assessmentId,
    assessmentVersion: result.assessmentVersion,
    completedAt: result.completedAt.toISOString(),
    totalScore: result.totalScore,
    maxScore: result.maxScore,
    percent: result.maxScore > 0 ? (result.totalScore / result.maxScore) * 100 : 0,
    /* Always false (D-123). Sent rather than assumed by the client, so the rule
       has one implementation and the screen renders what it is told. */
    canRetake: false,
    level: result.level,
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
