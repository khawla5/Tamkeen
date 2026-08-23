import { Injectable, NotFoundException } from '@nestjs/common';

import {
  rankPathsByRecommendation,
  type PathDetail,
  type PathRecommendations,
  type PathSummary,
} from '@tamkeen/types';

import { JourneyStateService } from '../journey/journey-state.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Paths and the gold recommendation (§4.4, §4.5).
 *
 * The ranking itself is `rankPathsByRecommendation` from `@tamkeen/types` — the
 * same function the web app can call — rather than an ORDER BY. Sorting in SQL
 * would mean the rule existed twice, in TypeScript and in a query, and §3A is
 * explicit that this rule is the product.
 */
@Injectable()
export class PathsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journey: JourneyStateService,
  ) {}

  /**
   * Every active path, gold first.
   *
   * Every path is returned, always. "Gold = recommendation, not restriction"
   * (§3A) — filtering to the user's code here would turn a highlight into a gate
   * without anyone deciding to.
   */
  async listForUser(userId: string): Promise<PathRecommendations> {
    const state = await this.journey.getState(userId);
    const code = JourneyStateService.hollandCode(state);

    const paths = await this.prisma.path.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        riasecLetter: true,
        typicalDurationMinutes: true,
        displayOrder: true,
        _count: {
          /* The count shown on the card is what the user can actually choose
             from, so hidden and retired courses are excluded. Counting all
             memberships would advertise a choice the build page does not offer. */
          select: { pathCourses: { where: { course: { status: 'AVAILABLE' } } } },
        },
      },
    });

    const ranked = rankPathsByRecommendation(
      paths.map((path) => ({
        id: path.id,
        riasecLetter: path.riasecLetter,
        displayOrder: path.displayOrder,
        source: path,
      })),
      code,
    );

    return {
      code: state.latestResult ? code : null,
      paths: ranked.map((entry) => ({
        id: entry.path.source.id,
        name: entry.path.source.name,
        description: entry.path.source.description,
        riasecLetter: entry.path.source.riasecLetter,
        typicalDurationMinutes: entry.path.source.typicalDurationMinutes,
        courseCount: entry.path.source._count.pathCourses,
        displayOrder: entry.path.source.displayOrder,
        recommended: entry.recommended,
        recommendationRank: entry.recommendationRank,
      })) satisfies PathSummary[],
    };
  }

  /** One path with its courses — the §4.5 build page. */
  async getDetail(userId: string, pathId: string): Promise<PathDetail> {
    const state = await this.journey.getState(userId);

    const path = await this.prisma.path.findFirst({
      where: { id: pathId, isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        riasecLetter: true,
        typicalDurationMinutes: true,
        displayOrder: true,
        pathCourses: {
          orderBy: { displayOrder: 'asc' },
          select: {
            course: {
              select: {
                id: true,
                moodleCourseId: true,
                title: true,
                summary: true,
                durationMinutes: true,
                status: true,
                language: true,
              },
            },
          },
        },
      },
    });

    if (!path) {
      throw new NotFoundException('PATH_NOT_FOUND');
    }

    const code = JourneyStateService.hollandCode(state);
    const recommendationRank = code.indexOf(path.riasecLetter);

    /*
     * Which courses this user has already ticked — but only when the selection
     * belongs to *this* path. Without the guard, opening a different path while
     * building would show the other path's ticks against courses that happen to
     * be shared, which is exactly the confusion D-003 invites.
     */
    const selectedCourseIds =
      state.userPath?.pathId === path.id ? state.userPath.selectedCourseIds : [];

    return {
      id: path.id,
      name: path.name,
      description: path.description,
      riasecLetter: path.riasecLetter,
      typicalDurationMinutes: path.typicalDurationMinutes,
      displayOrder: path.displayOrder,
      courseCount: path.pathCourses.filter((entry) => entry.course.status === 'AVAILABLE').length,
      recommended: recommendationRank !== -1,
      recommendationRank: recommendationRank === -1 ? null : recommendationRank,
      /* Building stops for good at the commitment gate (D-002). */
      canBuild: !JourneyStateService.isCommitted(state),
      selectedCourseIds,
      courses: path.pathCourses.map((entry) => ({
        id: entry.course.id,
        moodleCourseId: entry.course.moodleCourseId,
        title: entry.course.title,
        summary: entry.course.summary,
        durationMinutes: entry.course.durationMinutes,
        status: entry.course.status,
        language: entry.course.language,
        /* The build page already knows which path it is; repeating it on every
           card would be the redundant UI §3 forbids. */
        paths: [],
      })),
    };
  }
}
