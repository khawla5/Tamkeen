import { Injectable } from '@nestjs/common';

import type { AdminAuditPage, AdminAuditRow, AdminReports } from '@tamkeen/types';

import { AuditAction } from '../audit/audit.actions';
import { PrismaService } from '../prisma/prisma.service';
import type { AdminAuditQueryDto } from './admin.dto';

/**
 * §4C.8 — the audit trail and system-wide reports.
 *
 * **Read-only, and the whole module has no write path.** `AuditService` is the
 * only thing that inserts, and it is called from the services that perform each
 * change rather than from a controller. Giving the admin portal an endpoint that
 * could edit or delete an entry would make the trail evidence of nothing.
 *
 * **Paged by cursor, not by offset.** The log only grows, and `OFFSET 20000` on
 * a table with an index on `occurred_at` is a scan the database has to do before
 * it can skip. Reading "everything before this id" uses the index and stays fast
 * on a table that will be the largest in the system.
 *
 * **The detail payload is shown.** It is non-PII by construction — `AuditService`
 * accepts enumerated reason codes and scalar values, never free text — and half
 * the value of an entry is *why* something was refused. A trail that hides the
 * reason is a list of timestamps.
 */
@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminAuditQueryDto): Promise<AdminAuditPage> {
    const take = query.pageSize ?? 50;

    const where = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.before ? { id: { lt: BigInt(query.before) } } : {}),
    };

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { id: 'desc' },
      /* One more than asked for, so "is there another page" is answered without
         a second count over a table that only grows. */
      take: take + 1,
      select: {
        id: true,
        occurredAt: true,
        action: true,
        outcome: true,
        targetType: true,
        targetId: true,
        metadata: true,
        actor: { select: { fullName: true } },
      },
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    return {
      rows: page.map(toRow),
      nextBefore: hasMore ? page[page.length - 1]!.id.toString() : null,
      /* Every action the codebase can emit, not every action present in the log:
         a filter that offered only what has happened would silently lose options
         as old entries are retained away, and the list is a constant anyway. */
      actions: Object.values(AuditAction).sort(),
    };
  }

  /**
   * §4C.8's reports.
   *
   * Five questions the ministry actually asks, answered from the tables that
   * already hold the answers. Nothing here is stored or cached — a report is a
   * question about the present, and a materialised one is a second copy of the
   * truth that goes stale.
   */
  async reports(): Promise<AdminReports> {
    const [journey, pathPopularity, codeDistribution, certificates, courseOutcomes] =
      await Promise.all([
        this.journey(),
        this.pathPopularity(),
        this.codeDistribution(),
        this.certificates(),
        this.courseOutcomes(),
      ]);

    return { journey, pathPopularity, codeDistribution, certificates, courseOutcomes };
  }

  private async journey(): Promise<AdminReports['journey']> {
    const [assessed, byStatus, coursesPassed, certificatesIssued] = await Promise.all([
      /* Distinct people, not results: retakes append (D-033). */
      this.prisma.assessmentResult.findMany({ distinct: ['userId'], select: { userId: true } }),
      this.prisma.userPath.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.completion.count({ where: { passed: true } }),
      this.prisma.certificate.count(),
    ]);

    const of = (status: string) => byStatus.find((row) => row.status === status)?._count._all ?? 0;
    const active = of('ACTIVE');
    const completed = of('COMPLETED');
    const committed = active + completed;

    return {
      assessed: assessed.length,
      building: of('BUILDING'),
      active,
      completed,
      pathCompletionRate: committed === 0 ? null : Math.round((completed / committed) * 100),
      coursesPassed,
      certificatesIssued,
    };
  }

  private async pathPopularity(): Promise<AdminReports['pathPopularity']> {
    const paths = await this.prisma.path.findMany({
      select: {
        id: true,
        name: true,
        riasecLetter: true,
        userPaths: { select: { status: true } },
      },
    });

    return paths
      .map((path) => ({
        pathId: path.id,
        name: path.name,
        riasecLetter: path.riasecLetter,
        /* Chosen, not "confirmed": someone still building has expressed a
           preference, and that is what "popular" is asking about. */
        chosen: path.userPaths.length,
        completed: path.userPaths.filter((row) => row.status === 'COMPLETED').length,
      }))
      .sort((a, b) => b.chosen - a.chosen || a.name.localeCompare(b.name, 'ar'));
  }

  private async codeDistribution(): Promise<AdminReports['codeDistribution']> {
    const newest = await this.prisma.assessmentResult.findMany({
      distinct: ['userId'],
      orderBy: [{ userId: 'asc' }, { completedAt: 'desc' }],
      select: { code: true },
    });

    const counts = new Map<string, number>();
    for (const row of newest) {
      counts.set(row.code, (counts.get(row.code) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  }

  private async certificates(): Promise<AdminReports['certificates']> {
    const byType = await this.prisma.certificate.groupBy({
      by: ['type'],
      _count: { _all: true },
    });

    const of = (type: string) => byType.find((row) => row.type === type)?._count._all ?? 0;
    const course = of('COURSE');
    const path = of('PATH');

    return { course, path, total: course + path };
  }

  /**
   * Where learners are actually stuck.
   *
   * Sorted worst-first, which is the only ordering that makes this actionable:
   * a report of the best-performing courses tells the ministry nothing it needs
   * to do. A course nobody has taken has a null rate rather than 0% — over an
   * empty denominator a rate is undefined, and 0% would put an untouched course
   * at the top of a list of problems.
   */
  private async courseOutcomes(): Promise<AdminReports['courseOutcomes']> {
    const courses = await this.prisma.course.findMany({
      where: { userPathCourses: { some: {} } },
      select: {
        id: true,
        title: true,
        moodleCourseId: true,
        _count: { select: { userPathCourses: true } },
      },
    });

    const passed = await this.prisma.completion.groupBy({
      by: ['moodleCourseId'],
      where: { passed: true },
      _count: { _all: true },
    });

    const passedBy = new Map(passed.map((row) => [row.moodleCourseId, row._count._all]));

    return courses
      .map((course) => {
        const enrolled = course._count.userPathCourses;
        const passedCount = passedBy.get(course.moodleCourseId) ?? 0;

        return {
          courseId: course.id,
          title: course.title,
          enrolled,
          passed: passedCount,
          passRate: enrolled === 0 ? null : Math.round((passedCount / enrolled) * 100),
        };
      })
      .sort((a, b) => (a.passRate ?? 101) - (b.passRate ?? 101));
  }
}

function toRow(row: {
  id: bigint;
  occurredAt: Date;
  action: string;
  outcome: 'SUCCESS' | 'FAILURE';
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  actor: { fullName: string } | null;
}): AdminAuditRow {
  return {
    /* `JSON.stringify` throws on a bigint rather than rounding it, so the
       conversion happens here and is not left to the serialiser. */
    id: row.id.toString(),
    occurredAt: row.occurredAt.toISOString(),
    action: row.action,
    outcome: row.outcome,
    actorName: row.actor?.fullName ?? null,
    targetType: row.targetType,
    targetId: row.targetId,
    detail: (row.metadata as AdminAuditRow['detail']) ?? null,
  };
}
