import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type { AssessmentResultView, AssessmentView } from '@tamkeen/types';

import { AuditAction, AuditReason } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { JourneyStateService } from '../journey/journey-state.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringError, scoreAssessment, type ScorableQuestion } from './scoring';
import type { SubmitAssessmentDto } from './assessment.dto';

/**
 * The assessment flow (§4.3).
 *
 * Two rules are enforced here rather than in the controller, so a later caller —
 * an admin screen, a job — cannot bypass them:
 *
 *  1. **Weights never leave the server.** `getActive` selects the question and
 *     option rows *without* their weights. An assessment whose scoring key is
 *     visible in a network response is one a user can steer toward whichever
 *     result they already wanted, which would make every gold recommendation
 *     downstream meaningless.
 *  2. **Retakes stop at commitment** (D-015). Once a path is confirmed, a new
 *     Holland Code would contradict a decision that cannot be revisited.
 */
@Injectable()
export class AssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journey: JourneyStateService,
    private readonly audit: AuditService,
  ) {}

  /** The active assessment, in presentation order, with no weights attached. */
  async getActive(): Promise<AssessmentView> {
    const assessment = await this.prisma.assessment.findFirst({
      /* The one version new takers receive (D-069). A draft is never served: an
         edit in progress must not reach anybody, and a partial unique index
         guarantees there is at most one ACTIVE row to find. */
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        version: true,
        title: true,
        questions: {
          orderBy: { displayOrder: 'asc' },
          select: {
            id: true,
            displayOrder: true,
            text: true,
            options: {
              orderBy: { displayOrder: 'asc' },
              /* Note the absence of `weights` — see the class comment. A test
                 asserts no weighting reaches this response. */
              select: { id: true, displayOrder: true, label: true },
            },
          },
        },
      },
    });

    if (!assessment) {
      throw new NotFoundException('ASSESSMENT_NOT_FOUND');
    }

    return {
      id: assessment.id,
      version: assessment.version,
      title: assessment.title,
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

  /** The user's newest result, or null if they have not been assessed. */
  async getLatestResult(userId: string): Promise<AssessmentResultView | null> {
    const state = await this.journey.getState(userId);

    if (!state.latestResult) {
      return null;
    }

    return this.toResultView(state.latestResult, !JourneyStateService.isCommitted(state));
  }

  /**
   * Scores a submission and persists the result with its answers.
   *
   * The write is one transaction: a result whose responses failed to save would
   * be a Holland Code nobody could explain, which is worse than a failed
   * submission the user can retry.
   */
  async submit(userId: string, dto: SubmitAssessmentDto, ipAddress: string | null) {
    const state = await this.journey.getState(userId);

    if (JourneyStateService.isCommitted(state)) {
      /* D-015: the result is locked together with the path. */
      await this.audit.record({
        action: AuditAction.ASSESSMENT_SUBMITTED,
        outcome: 'FAILURE',
        actorUserId: userId,
        ipAddress,
        reason: AuditReason.PATH_ALREADY_CONFIRMED,
      });

      throw new ConflictException('ASSESSMENT_LOCKED');
    }

    const assessment = await this.prisma.assessment.findFirst({
      /*
       * Still pinned to the ACTIVE version, and to the id the client was
       * served. A submission that arrives mid-publish therefore scores against
       * the version it was *given* or is refused — never against a bank the
       * taker never saw, which is the one way a copy-on-write publish could
       * corrupt a result.
       */
      where: { id: dto.assessmentId, status: 'ACTIVE' },
      select: {
        id: true,
        version: true,
        questions: {
          select: {
            id: true,
            options: {
              select: { id: true, weights: { select: { dimension: true, points: true } } },
            },
          },
        },
      },
    });

    if (!assessment) {
      throw new NotFoundException('ASSESSMENT_NOT_FOUND');
    }

    const bank: ScorableQuestion[] = assessment.questions.map((question) => ({
      id: question.id,
      options: question.options.map((option) => ({
        id: option.id,
        weights: Object.fromEntries(
          option.weights.map((weight) => [weight.dimension, weight.points]),
        ),
      })),
    }));

    let profile;
    try {
      profile = scoreAssessment(bank, dto.answers);
    } catch (error) {
      if (error instanceof ScoringError) {
        /* Audited as a failure: a malformed submission is either a client bug or
           someone probing the endpoint, and both are worth being able to see. */
        await this.audit.record({
          action: AuditAction.ASSESSMENT_SUBMITTED,
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

    const result = await this.prisma.$transaction(async (tx) => {
      const created = await tx.assessmentResult.create({
        data: {
          userId,
          assessmentId: assessment.id,
          assessmentVersion: assessment.version,
          scoreR: profile.scores.R,
          scoreI: profile.scores.I,
          scoreA: profile.scores.A,
          scoreS: profile.scores.S,
          scoreE: profile.scores.E,
          scoreC: profile.scores.C,
          maxScore: profile.maxScore,
          code: profile.codeString,
        },
        select: { id: true, completedAt: true },
      });

      await tx.assessmentResponse.createMany({
        data: dto.answers.map((answer) => ({
          resultId: created.id,
          questionId: answer.questionId,
          optionId: answer.optionId,
        })),
      });

      return created;
    });

    await this.audit.record({
      action: AuditAction.ASSESSMENT_SUBMITTED,
      outcome: 'SUCCESS',
      actorUserId: userId,
      ipAddress,
      targetType: 'assessment_result',
      targetId: result.id,
      /* The code is the user's own interest profile, not an identifier of
         anyone else — safe to record and genuinely useful when explaining a
         recommendation months later. */
      detail: { code: profile.codeString, attempt: state.latestResult ? 'retake' : 'first' },
    });

    return this.toResultView(
      {
        id: result.id,
        assessmentId: assessment.id,
        assessmentVersion: assessment.version,
        completedAt: result.completedAt,
        profile,
      },
      /* Still uncommitted — reaching here means the lock check passed. */
      true,
    );
  }

  private toResultView(
    result: {
      id: string;
      assessmentId: string;
      assessmentVersion: number;
      completedAt: Date;
      profile: ReturnType<typeof scoreAssessment>;
    },
    canRetake: boolean,
  ): AssessmentResultView {
    return {
      id: result.id,
      assessmentId: result.assessmentId,
      assessmentVersion: result.assessmentVersion,
      completedAt: result.completedAt.toISOString(),
      scores: result.profile.scores,
      ranked: result.profile.ranked,
      code: result.profile.code,
      codeString: result.profile.codeString,
      maxScore: result.profile.maxScore,
      canRetake,
    };
  }
}
