import { Injectable } from '@nestjs/common';

import type { ResolvedAssessmentAssignment } from '@tamkeen/types';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Resolves an employee's *effective* instrument list from the assignment
 * rules an admin wrote (§4C.3, TAM-147).
 *
 * **Nothing here is stored per employee.** `assessment_assignments` holds the
 * rules — everyone / a department / a person, an instrument or a group —
 * and this is where they are turned into "here is what Ahmad specifically
 * must take" on every read, the same relationship `path_courses` has to "which
 * courses can this learner pick". A department transfer or an admin editing a
 * group's membership takes effect on the next dashboard load, not on the next
 * seed run.
 *
 * Union, then de-duplicate by the instrument key a rule resolves to (a group
 * expands to its members first), ordered by `displayOrder`. The **first**
 * assignment to name a given key wins its `required`/`displayOrder` — an
 * employee assigned an instrument both directly and via `ALL` sees it once,
 * governed by whichever rule sorts first.
 */
@Injectable()
export class AssessmentAssignmentResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForUser(userId: string): Promise<ResolvedAssessmentAssignment[]> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { department: true },
    });

    const [assignments, groups] = await Promise.all([
      this.prisma.assessmentAssignment.findMany({
        where: {
          OR: [
            { scope: 'ALL' },
            { scope: 'DEPARTMENT', target: user.department },
            { scope: 'USER', target: userId },
          ],
        },
        orderBy: { displayOrder: 'asc' },
      }),
      /* Loaded whole rather than per-key: the table is small (named bundles an
         admin curates by hand, not a per-user structure) and every resolution
         needs to try every assignment against it. */
      this.prisma.assessmentGroup.findMany({ select: { key: true, memberKeys: true } }),
    ]);

    if (assignments.length === 0) {
      return [];
    }

    const groupByKey = new Map(groups.map((group) => [group.key, group.memberKeys]));

    /* Expand groups to member keys, first assignment to name a key wins. */
    const order: string[] = [];
    const rules = new Map<string, { required: boolean; displayOrder: number }>();

    for (const assignment of assignments) {
      const memberKeys = groupByKey.get(assignment.assessmentKey) ?? [assignment.assessmentKey];

      for (const key of memberKeys) {
        if (rules.has(key)) {
          continue;
        }
        rules.set(key, { required: assignment.required, displayOrder: assignment.displayOrder });
        order.push(key);
      }
    }

    /* Only ACTIVE instruments are ever offered — a DRAFT or RETIRED key an
       assignment still names (an admin unpublished it, or an edit is mid-way)
       resolves to nothing, the same way a stale group member does. */
    const activeAssessments = await this.prisma.assessment.findMany({
      where: { key: { in: order }, status: 'ACTIVE' },
      select: { key: true, kind: true, title: true },
    });
    const byKey = new Map(activeAssessments.map((row) => [row.key, row]));

    return order
      .map((key): ResolvedAssessmentAssignment | null => {
        const assessment = byKey.get(key);
        const rule = rules.get(key)!;

        return assessment
          ? {
              key,
              kind: assessment.kind,
              title: assessment.title,
              required: rule.required,
              displayOrder: rule.displayOrder,
            }
          : null;
      })
      .filter((entry): entry is ResolvedAssessmentAssignment => entry !== null)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }
}
