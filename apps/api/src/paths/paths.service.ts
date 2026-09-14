import { Injectable, NotFoundException } from '@nestjs/common';

import type { AssignedPaths, CourseSummary, PathDetail, PathLevelView } from '@tamkeen/types';

import { JourneyStateService, type JourneyState } from '../journey/journey-state.service';
import { PrismaService } from '../prisma/prisma.service';
import { levelStanding, visibleCourseWhere } from './path-access';

/**
 * The learner's paths (§4.4, §4.5, D-134).
 *
 * **There is no catalogue of paths here any more, and that is the point.** The
 * ministry assigns paths; a learner does not browse them, choose one, or get
 * recommended one. So `list` returns what they hold, and `getDetail` refuses a
 * path they do not — the ranking, the highlight and the "other paths" toggle
 * that used to live here went with the recommendation model (D-130).
 */
@Injectable()
export class PathsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journey: JourneyStateService,
  ) {}

  /** Every path assigned to this learner, oldest assignment first. */
  async listForUser(userId: string): Promise<AssignedPaths> {
    const state = await this.journey.getState(userId);

    if (state.paths.length === 0) {
      return { paths: [] };
    }

    const paths = await this.prisma.path.findMany({
      where: { id: { in: JourneyStateService.assignedPathIds(state) } },
      select: {
        id: true,
        name: true,
        description: true,
        typicalDurationMinutes: true,
        displayOrder: true,
        _count: {
          select: {
            levels: true,
            /*
             * What *this* learner can actually reach, which is narrower than
             * "placed" in two ways and both of them matter.
             *
             * Counting every membership would advertise courses on no rung —
             * the thing the derived state exists to make impossible to say by
             * accident. Counting every placed one would advertise a course the
             * catalogue has withdrawn (§2/D-015), and the path page would then
             * show fewer courses than its own card promised. The card and the
             * page have to agree, so they are counted the same way.
             */
            pathCourses: {
              where: {
                levelId: { not: null },
                course: visibleCourseWhere(state.enrolledCourseIds),
              },
            },
          },
        },
      },
    });

    const byId = new Map(paths.map((path) => [path.id, path]));

    return {
      paths: state.paths.flatMap((assigned) => {
        const path = byId.get(assigned.pathId);
        if (!path) return [];

        return [
          {
            id: path.id,
            name: path.name,
            description: path.description,
            typicalDurationMinutes: path.typicalDurationMinutes,
            courseCount: path._count.pathCourses,
            levelCount: path._count.levels,
            displayOrder: path.displayOrder,
            placedLevel: assigned.placedLevel,
            completed: assigned.status === 'COMPLETED',
          },
        ];
      }),
    };
  }

  /**
   * One path with its ladder (§4.5).
   *
   * **Every level is returned, with the learner's marked** — the decision taken
   * with D-134. A learner placed at the third rung sees the two below it as
   * ground already covered rather than as work missing, which is the difference
   * between a path that explains itself and one that looks incomplete.
   *
   * A path the learner was not assigned is a 404, not an empty page: they have
   * no business knowing it exists, and "assigned" is the whole of their
   * entitlement under D-130.
   */
  async getDetail(userId: string, pathId: string): Promise<PathDetail> {
    const state = await this.journey.getState(userId);
    const assigned = JourneyStateService.findPath(state, pathId);

    if (!assigned) {
      throw new NotFoundException('PATH_NOT_FOUND');
    }

    const path = await this.prisma.path.findUnique({
      where: { id: pathId },
      select: {
        id: true,
        name: true,
        description: true,
        typicalDurationMinutes: true,
        displayOrder: true,
        levels: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            name: true,
            position: true,
            pathCourses: {
              /* Placed by construction — these rows hang off the level. What
                 the filter adds is the catalogue's own visibility rule. */
              where: { course: visibleCourseWhere(state.enrolledCourseIds) },
              orderBy: { position: 'asc' },
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
        },
      },
    });

    if (!path) {
      throw new NotFoundException('PATH_NOT_FOUND');
    }

    const placedPosition = assigned.placedLevel?.position ?? null;

    const levels: PathLevelView[] = path.levels.map((level) => ({
      id: level.id,
      name: level.name,
      position: level.position,
      standing: levelStanding(level.position, placedPosition),
      courses: level.pathCourses.map(
        (entry) =>
          ({
            ...entry.course,
            /* The path page already knows which path it is; repeating it on
               every card would be the redundant UI §3 forbids. */
            paths: [],
          }) satisfies CourseSummary,
      ),
    }));

    return {
      id: path.id,
      name: path.name,
      description: path.description,
      typicalDurationMinutes: path.typicalDurationMinutes,
      courseCount: levels.reduce((total, level) => total + level.courses.length, 0),
      levelCount: levels.length,
      displayOrder: path.displayOrder,
      placedLevel: assigned.placedLevel,
      completed: assigned.status === 'COMPLETED',
      levels,
      assigned: true,
      pendingAssessmentId: assigned.pendingAssessmentId,
    };
  }

  /** Reused by the dashboard and My Path: the state, without a second query. */
  async stateFor(userId: string): Promise<JourneyState> {
    return this.journey.getState(userId);
  }
}
