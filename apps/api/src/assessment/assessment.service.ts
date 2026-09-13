import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  defaultPlacementBands,
  type AssessmentResultView,
  type AssessmentView,
  type LevelRef,
  type PlacementBand,
} from '@tamkeen/types';

import { AuditAction, AuditReason } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { PrismaService } from '../prisma/prisma.service';
import type { SubmitAssessmentDto } from './assessment.dto';
import { ScoringError, scoreAssessment, type ScorableQuestion } from './scoring';

/**
 * Taking a path's assessment, and being placed by it (§4.3, D-134).
 *
 * Four rules are enforced here rather than in the controller, so a later caller
 * — an admin screen, a job — cannot bypass them:
 *
 *  1. **The answer key never leaves the server.** `getActive` selects questions
 *     and options *without* `isCorrect`, and without `marks` or the item's level
 *     either. The first is the scoring key outright; the other two let a taker
 *     triage, and a placement test is only useful if it measures what somebody
 *     can do unaided.
 *  2. **Taking requires the path** (D-130). An employee may sit the assessment
 *     of a path the ministry assigned them, and no other. Assignment is the
 *     whole of their entitlement, which is why there is no separate instrument
 *     assignment any more.
 *  3. **A placement stands.** A second submission is refused while one exists —
 *     the unique index on `(learner, path)` is the guarantee, this is the
 *     courteous refusal.
 *  4. **Nothing here writes to a published version.** Editing is §4C.3's job and
 *     is copy-on-write; this service reads the ACTIVE row and appends a result.
 */
@Injectable()
export class AssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly enrollment: EnrollmentService,
  ) {}

<<<<<<< HEAD
  /** The active version for a path, in order, with no answer key attached. */
  async getActive(userId: string, pathId: string): Promise<AssessmentView> {
    await this.assertAssigned(userId, pathId);

    const assessment = await this.prisma.pathAssessment.findFirst({
      where: { pathId, status: 'ACTIVE' },
=======
  /** The active assessment, in presentation order, with no weights attached. */
  async getActive(): Promise<AssessmentView> {
    const assessment = await this.prisma.assessment.findFirst({
      /* The one version new takers receive (D-069). A draft is never served: an
         edit in progress must not reach anybody, and a partial unique index
         guarantees there is at most one ACTIVE row to find *of this kind*
         (TAM-147) — `assessments` now also holds CEFR rows, so `kind` is not
         optional here the way it looked before a second instrument existed. */
      where: { status: 'ACTIVE', kind: 'RIASEC' },
>>>>>>> origin/main
      select: {
        id: true,
        version: true,
        title: true,
        description: true,
        path: { select: { id: true, name: true } },
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
      throw new NotFoundException('ASSESSMENT_NOT_FOUND');
    }

    return {
      id: assessment.id,
      pathId: assessment.path.id,
      pathName: assessment.path.name,
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

  /** This learner's placement on a path, or null before they have taken it. */
  async getResult(userId: string, pathId: string): Promise<AssessmentResultView | null> {
    const placement = await this.prisma.learnerPlacement.findUnique({
      where: { learnerId_pathId: { learnerId: userId, pathId } },
      select: {
        score: true,
        placedAt: true,
        level: { select: { id: true, name: true, position: true } },
        path: { select: { id: true, name: true, _count: { select: { levels: true } } } },
        result: {
          select: { id: true, assessmentId: true, assessmentVersion: true, maxScore: true },
        },
      },
    });

    if (!placement) {
      return null;
    }

    return {
      id: placement.result.id,
      assessmentId: placement.result.assessmentId,
      assessmentVersion: placement.result.assessmentVersion,
      pathId: placement.path.id,
      pathName: placement.path.name,
      completedAt: placement.placedAt.toISOString(),
      totalScore: placement.score,
      maxScore: placement.result.maxScore,
      percent:
        placement.result.maxScore > 0 ? (placement.score / placement.result.maxScore) * 100 : 0,
      level: placement.level,
      levelCount: placement.path._count.levels,
      /* Always false. A placement stands until an administrator changes it
         (D-134). Sent rather than assumed by the client, so the rule has one
         implementation and the screen renders what it is told. */
      canRetake: false,
    };
  }

  /**
   * Scores a submission, places the learner, and enrols them in what they owe.
   *
   * The result, its answers and the placement are one transaction: a placement
   * whose responses failed to save would be a level nobody could explain, which
   * is worse than a failed submission the person can retry. Enrolment happens
   * *after* it commits and is best-effort, for D-036's reason — the placement is
   * recorded whatever the LMS is doing, and reconciliation catches up.
   */
  async submit(
    userId: string,
    pathId: string,
    dto: SubmitAssessmentDto,
    ipAddress: string | null,
  ): Promise<AssessmentResultView> {
    await this.assertAssigned(userId, pathId, true, ipAddress);

    const existing = await this.prisma.learnerPlacement.findUnique({
      where: { learnerId_pathId: { learnerId: userId, pathId } },
      select: { id: true },
    });

    if (existing) {
      /* Audited, because a second attempt is either a client bug or somebody
         probing, and both are worth being able to see. */
      await this.audit.record({
        action: AuditAction.ASSESSMENT_SUBMITTED,
        outcome: 'FAILURE',
        actorUserId: userId,
        ipAddress,
        targetType: 'path',
        targetId: pathId,
        reason: AuditReason.ASSESSMENT_ALREADY_TAKEN,
      });

      throw new ConflictException('ASSESSMENT_ALREADY_TAKEN');
    }

    const assessment = await this.prisma.pathAssessment.findFirst({
      /*
       * Pinned to the ACTIVE version *and* to the id the client was served, and
       * to the path in the URL. A submission arriving mid-publish therefore
       * scores against the version it was given, or is refused — never against a
       * bank the taker never saw, which is the one way a copy-on-write publish
       * could corrupt a placement.
       */
<<<<<<< HEAD
      where: { id: dto.assessmentId, pathId, status: 'ACTIVE' },
=======
      where: { id: dto.assessmentId, status: 'ACTIVE', kind: 'RIASEC' },
>>>>>>> origin/main
      select: {
        id: true,
        version: true,
        bands: { select: { levelId: true, minScore: true, maxScore: true } },
        questions: {
          select: {
            id: true,
            marks: true,
            options: { select: { id: true, isCorrect: true } },
          },
        },
        path: {
          select: {
            id: true,
            name: true,
            levels: {
              orderBy: { position: 'asc' },
              select: { id: true, name: true, position: true },
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
      marks: question.marks,
      options: question.options.map((option) => ({ id: option.id, isCorrect: option.isCorrect })),
    }));

    const bands = this.bandsFor(assessment.bands, assessment.path.levels, bank);

    let score;
    try {
      score = scoreAssessment(bank, bands, dto.answers);
    } catch (error) {
      if (error instanceof ScoringError) {
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

<<<<<<< HEAD
    const level = assessment.path.levels.find((candidate) => candidate.id === score.levelId);
=======
    const result = await this.prisma.$transaction(async (tx) => {
      const created = await tx.assessmentResult.create({
        data: {
          userId,
          assessmentId: assessment.id,
          assessmentVersion: assessment.version,
          kind: 'RIASEC',
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
>>>>>>> origin/main

    if (!level) {
      /* A band naming a level the path no longer has. The publish gate refuses
         this, and `assessment_bands.level_id` cascades on deletion, so it is
         unreachable — but placing somebody at a level that does not exist is
         not a failure mode worth leaving open. */
      throw new ConflictException(AuditReason.ASSESSMENT_NO_BAND);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const result = await tx.assessmentResult.create({
          data: {
            userId,
            assessmentId: assessment.id,
            assessmentVersion: assessment.version,
            totalScore: score.totalScore,
            maxScore: score.maxScore,
          },
          select: { id: true },
        });

        await tx.assessmentResponse.createMany({
          data: dto.answers.map((answer) => ({
            resultId: result.id,
            questionId: answer.questionId,
            optionId: answer.optionId,
          })),
        });

        await tx.learnerPlacement.create({
          data: {
            learnerId: userId,
            pathId,
            resultId: result.id,
            levelId: level.id,
            score: score.totalScore,
          },
        });
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
        throw new ConflictException('ASSESSMENT_ALREADY_TAKEN');
      }
      throw error;
    }

    await this.audit.record({
      action: AuditAction.ASSESSMENT_SUBMITTED,
      outcome: 'SUCCESS',
      actorUserId: userId,
      ipAddress,
      targetType: 'path',
      targetId: pathId,
      detail: { version: String(assessment.version) },
    });

    await this.audit.record({
      action: AuditAction.LEARNER_PLACED,
      outcome: 'SUCCESS',
      actorUserId: userId,
      ipAddress,
      targetType: 'path',
      targetId: pathId,
      /* The level and the score together: "why did I start here" is answerable
         from this row alone, without the band table beside it. */
      detail: { level: level.name, score: score.totalScore, outOf: score.maxScore },
    });

    /* Now that they have a rung, they owe the courses at and above it. */
    await this.enrollment.syncEnrolments(userId, pathId, ipAddress);

    const placed = await this.getResult(userId, pathId);

    if (!placed) {
      /* Unreachable — it was just written. Throwing beats returning a lie. */
      throw new NotFoundException('ASSESSMENT_RESULT_NOT_FOUND');
    }

    return placed;
  }

  /**
   * The band table to place by: the authored one, or the even split.
   *
   * The default is not a fallback for a broken configuration — it is the rule
   * the spec states for a path whose bands nobody has configured yet, and it
   * lets a path be usable the moment its assessment is published rather than
   * only after somebody types six ranges.
   */
  private bandsFor(
    authored: PlacementBand[],
    levels: readonly LevelRef[],
    bank: readonly ScorableQuestion[],
  ): PlacementBand[] {
    if (authored.length > 0) {
      return authored;
    }

    return defaultPlacementBands(
      levels,
      bank.reduce((total, question) => total + question.marks, 0),
    );
  }

  /**
   * Refuses an employee a path the ministry did not assign them.
   *
   * The refusal on the submit path is audited and the one on the read path is
   * not, matching D-132's rule: a refused *attempt* is a fact worth being able
   * to find, while a browser asking for a page it should not have is noise.
   */
  private async assertAssigned(
    userId: string,
    pathId: string,
    audited = false,
    ipAddress: string | null = null,
  ): Promise<void> {
    const assigned = await this.prisma.userPath.findUnique({
      where: { userId_pathId: { userId, pathId } },
      select: { id: true },
    });

    if (assigned) {
      return;
    }

    if (audited) {
      await this.audit.record({
        action: AuditAction.ASSESSMENT_SUBMITTED,
        outcome: 'FAILURE',
        actorUserId: userId,
        ipAddress,
        targetType: 'path',
        targetId: pathId,
        reason: AuditReason.PATH_NOT_ASSIGNED,
      });
    }

    throw new ForbiddenException('PATH_NOT_ASSIGNED');
  }
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
