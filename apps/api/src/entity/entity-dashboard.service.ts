import { Injectable } from '@nestjs/common';

import type { EntityDashboardView } from '@tamkeen/types';

import { EntityCoursesService } from './entity-courses.service';
import { EntityCourseManagementService } from './entity-course-management.service';
import { EntityScopeService, type EntityScope } from './entity-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { publishBlockers } from './publish-readiness';

/**
 * §4B.1 — the entity's dashboard.
 *
 * **The counts are context; `needsAttention` is the screen.** §3's rule is that
 * every screen shows only what is actionable now, and a page of totals is not
 * actionable — an entity cannot do anything about "12 published courses". What
 * they can act on is a course that cannot be published as it stands, so that
 * list is what this page is really for, and the single primary action is
 * creating a course.
 *
 * The blockers come from the same `publishBlockers` the manage screen and the
 * publish endpoint use. Three consumers, one rule: a dashboard that computed its
 * own idea of "needs attention" would eventually list a course the publish
 * endpoint accepts, or omit one it refuses.
 */
@Injectable()
export class EntityDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: EntityScopeService,
    private readonly courses: EntityCoursesService,
    private readonly management: EntityCourseManagementService,
  ) {}

  async get(scope: EntityScope): Promise<EntityDashboardView> {
    const entity =
      scope.entityId === null
        ? null
        : await this.prisma.entity.findUnique({
            where: { id: scope.entityId },
            select: { name: true },
          });

    const owned = await this.prisma.course.findMany({
      where: this.scope.courseFilter(scope),
      select: {
        id: true,
        moodleCourseId: true,
        title: true,
        publication: true,
        durationMinutes: true,
        language: true,
        objectives: true,
        _count: { select: { pathCourses: { where: { status: 'APPROVED' } } } },
      },
    });

    const summaries = await this.courses.list(scope);

    const totalLearners = summaries.reduce((sum, course) => sum + course.enrolledCount, 0);
    const totalPassed = summaries.reduce(
      (sum, course) =>
        sum + Math.round(((course.completionRate ?? 0) / 100) * course.enrolledCount),
      0,
    );

    return {
      entityName: entity?.name ?? '',
      publishedCourses: owned.filter((course) => course.publication === 'PUBLISHED').length,
      draftCourses: owned.filter((course) => course.publication === 'DRAFT').length,
      withdrawnCourses: owned.filter((course) => course.publication === 'UNPUBLISHED').length,
      totalLearners,
      /* Undefined over an empty denominator, as everywhere else: "0%" on a
         catalogue nobody has started reads as failure. */
      completionRate: totalLearners === 0 ? null : Math.round((totalPassed / totalLearners) * 100),
      needsAttention: await this.needsAttention(owned),
    };
  }

  /**
   * Unpublished courses that could not be published as they stand.
   *
   * Only `DRAFT` courses are considered. An `UNPUBLISHED` one was withdrawn
   * deliberately, so listing it as needing attention would nag an entity about a
   * decision they made on purpose — the engagement-nagging §2 rules out.
   */
  private async needsAttention(
    owned: ReadonlyArray<{
      id: string;
      moodleCourseId: number;
      title: string;
      publication: string;
      durationMinutes: number | null;
      language: 'AR' | 'EN' | null;
      objectives: string[];
      _count: { pathCourses: number };
    }>,
  ): Promise<EntityDashboardView['needsAttention']> {
    const drafts = owned.filter((course) => course.publication === 'DRAFT');
    const attention: EntityDashboardView['needsAttention'] = [];

    for (const course of drafts) {
      /*
       * One LMS read per draft. Bounded by how many courses an entity is part
       * way through authoring — a handful — rather than by the catalogue, and
       * the read-back is what makes the list honest about the completion-criteria
       * blocker that D-042 found. If an entity ever holds enough drafts for this
       * to matter, the fix is a bulk port method, not a silent cap that would
       * leave a course quietly absent from the list that exists to surface it.
       */
      const content = await this.management.readContent(course.moodleCourseId);

      const blockers = publishBlockers({
        pathCount: course._count.pathCourses,
        language: course.language,
        objectives: course.objectives,
        durationMinutes: course.durationMinutes,
        content,
      });

      if (blockers.length > 0) {
        attention.push({ id: course.id, title: course.title, blockers });
      }
    }

    return attention;
  }
}
