import { Injectable } from '@nestjs/common';

import {
  buildRiasecProfile,
  type RiasecLetter,
  type RiasecProfile,
  type RiasecScores,
} from '@tamkeen/types';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Where a user stands: their latest assessment result and their one path.
 *
 * This exists so the rules that depend on *both* live in one place. Four modules
 * need to know whether a path is confirmed — assessment (retake permitted?),
 * paths (may this be selected?), courses (which action applies?), enrollment
 * (may the selection change?) — and if each re-derived it from its own query,
 * they would eventually disagree. Read-only by design: enrollment owns writes.
 *
 * It also breaks what would otherwise be a dependency cycle. Assessment needs
 * the path lock and the dashboard needs the Holland Code, so a direct dependency
 * either way would be circular; both depend on this instead.
 */

export interface LatestResult {
  id: string;
  assessmentId: string;
  assessmentVersion: number;
  completedAt: Date;
  profile: RiasecProfile;
}

export interface CurrentUserPath {
  id: string;
  pathId: string;
  status: 'BUILDING' | 'ACTIVE' | 'COMPLETED';
  confirmedAt: Date | null;
  /** Course ids currently selected, in their chosen order. */
  selectedCourseIds: string[];
}

export interface JourneyState {
  latestResult: LatestResult | null;
  userPath: CurrentUserPath | null;
}

@Injectable()
export class JourneyStateService {
  constructor(private readonly prisma: PrismaService) {}

  async getState(userId: string): Promise<JourneyState> {
    const [result, userPath] = await Promise.all([
      this.prisma.assessmentResult.findFirst({
        /* `kind: 'RIASEC'` is load-bearing, not incidental (TAM-147):
           `assessment_results` now also holds CEFR rows, and without this
           filter "the user's latest result" could resolve to whichever
           instrument they happened to take more recently — precisely the
           wrong-row risk a shared table was rejected over once already
           (D-124), now closed by filtering instead of by separate tables. */
        where: { userId, kind: 'RIASEC' },
        /* Newest wins: retakes append rather than overwrite (D-033), so "the
           user's result" is a question about ordering, not about a single row. */
        orderBy: { completedAt: 'desc' },
      }),
      this.prisma.userPath.findUnique({
        where: { userId },
        include: {
          courses: {
            orderBy: { displayOrder: 'asc' },
            select: { courseId: true },
          },
        },
      }),
    ]);

    return {
      latestResult: result
        ? {
            id: result.id,
            assessmentId: result.assessmentId,
            assessmentVersion: result.assessmentVersion,
            completedAt: result.completedAt,
            /* Non-null by construction: the query above is filtered to
               `kind: 'RIASEC'`, and every row of that kind has its six
               scores and `maxScore` populated by `AssessmentService.submit`
               — the columns are nullable only because a `CEFR` row leaves
               them unset (TAM-147). */
            profile: buildRiasecProfile(
              {
                R: result.scoreR!,
                I: result.scoreI!,
                A: result.scoreA!,
                S: result.scoreS!,
                E: result.scoreE!,
                C: result.scoreC!,
              } satisfies RiasecScores,
              result.maxScore!,
            ),
          }
        : null,
      userPath: userPath
        ? {
            id: userPath.id,
            pathId: userPath.pathId,
            status: userPath.status,
            confirmedAt: userPath.confirmedAt,
            selectedCourseIds: userPath.courses.map((course) => course.courseId),
          }
        : null,
    };
  }

  /**
   * The commitment gate (D-002, D-015).
   *
   * Keyed on `confirmedAt` rather than on `status`, because the timestamp is the
   * fact — a status could be edited to ACTIVE by an admin screen in a later
   * phase without the commitment ever having happened.
   */
  static isCommitted(state: JourneyState): boolean {
    return state.userPath?.confirmedAt != null;
  }

  /** The user's Holland Code, or an empty array before the assessment. */
  static hollandCode(state: JourneyState): RiasecLetter[] {
    return state.latestResult?.profile.code ?? [];
  }
}
