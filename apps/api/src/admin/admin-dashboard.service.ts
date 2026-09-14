import { Inject, Injectable } from '@nestjs/common';

import type {
  AdminActivityRow,
  AdminDashboardView,
  AdminLmsHealth,
  AdminPathAssignmentShare,
} from '@tamkeen/types';

import { AuditAction } from '../audit/audit.actions';
import { AppConfigService } from '../config/app-config.module';
import { LMS_PORT, type LmsPort } from '../moodle/lms.port';
import { PrismaService } from '../prisma/prisma.service';

/**
 * §4C.1 — the admin dashboard.
 *
 * **Every figure here already existed.** Phases 0-4 wrote users, entities,
 * paths, courses, results, completions, certificates and an audit trail; this
 * service adds no new source of truth, it only asks the existing ones the
 * questions an administrator has. That is deliberate — a dashboard that owns
 * data is a dashboard that can disagree with the screens it summarises.
 *
 * **What makes it actionable rather than decorative** (§3, §4C.1): the LMS block
 * separates "Moodle answered us just now" from "the sync job last ran at X",
 * because a healthy Moodle behind a stalled scheduler is the failure that a
 * single green tick would hide, and it is the one an operator must act on.
 */
@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    @Inject(LMS_PORT) private readonly lms: LmsPort,
  ) {}

  async get(): Promise<AdminDashboardView> {
    const [
      users,
      entities,
      paths,
      courses,
      journey,
      pathDistribution,
      lms,
      recentActivity,
      pathsWithoutAssessment,
    ] = await Promise.all([
      this.userCounts(),
      this.entityCounts(),
      this.pathCounts(),
      this.courseCounts(),
      this.journeyCounts(),
      this.pathDistribution(),
      this.lmsHealth(),
      this.recentActivity(),
      this.pathsWithoutAssessment(),
    ]);

    return {
      users,
      entities,
      paths,
      courses,
      journey,
      pathDistribution,
      lms,
      recentActivity,
      pathsWithoutAssessment,
    };
  }

  private async userCounts(): Promise<AdminDashboardView['users']> {
    const [byRole, suspended, unverified] = await Promise.all([
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      this.prisma.user.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.user.count({ where: { emailVerifiedAt: null } }),
    ]);

    const of = (role: string) => byRole.find((row) => row.role === role)?._count._all ?? 0;

    return {
      employees: of('EMPLOYEE'),
      entityAccounts: of('ENTITY'),
      admins: of('SUPER_ADMIN'),
      suspended,
      unverified,
    };
  }

  private async entityCounts(): Promise<AdminDashboardView['entities']> {
    const byStatus = await this.prisma.entity.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const of = (status: string) => byStatus.find((row) => row.status === status)?._count._all ?? 0;
    const active = of('ACTIVE');
    const suspended = of('SUSPENDED');

    return { total: active + suspended, active, suspended };
  }

  private async pathCounts(): Promise<AdminDashboardView['paths']> {
    const [total, published] = await Promise.all([
      this.prisma.path.count(),
      this.prisma.path.count({ where: { status: 'PUBLISHED' } }),
    ]);

    return { total, published, draft: total - published };
  }

  private async courseCounts(): Promise<AdminDashboardView['courses']> {
    const [total, published, draft, unowned, unassigned] = await Promise.all([
      this.prisma.course.count(),
      this.prisma.course.count({ where: { publication: 'PUBLISHED' } }),
      this.prisma.course.count({ where: { publication: 'DRAFT' } }),
      /* The seeded catalogue and anything the LMS holds that no entity authored
         (D-063). Surfaced because §4C.5 makes these the admin's to manage, and
         they are invisible from every entity portal by construction. */
      this.prisma.course.count({ where: { ownerEntityId: null } }),
      /* In a path, on no rung — content an entity has offered and nobody has
         placed, so no learner can see it (D-134). The administrator's own work
         queue, and the number that says how long it has been ignored. */
      this.prisma.course.count({
        where: { pathCourses: { some: { levelId: null } } },
      }),
    ]);

    return { total, published, draft, unowned, unassigned };
  }

  private async journeyCounts(): Promise<AdminDashboardView['journey']> {
    const [assignedRows, placedRows, completedRows, coursesPassed, certificatesIssued] =
      await Promise.all([
        /* Distinct users, not rows: an employee may hold more than one path
           (D-130), and this is a question about people. */
        this.prisma.userPath.findMany({ distinct: ['userId'], select: { userId: true } }),
        this.prisma.learnerPlacement.findMany({
          distinct: ['learnerId'],
          select: { learnerId: true },
        }),
        this.prisma.userPath.findMany({
          where: { status: 'COMPLETED' },
          distinct: ['userId'],
          select: { userId: true },
        }),
        this.prisma.completion.count({ where: { passed: true } }),
        this.prisma.certificate.count(),
      ]);

    return {
      assigned: assignedRows.length,
      placed: placedRows.length,
      completed: completedRows.length,
      /* Over the people actually placed, not everyone assigned: somebody waiting
         on an assessment has not failed to finish, and counting them would
         report an unpublished path as a completion problem. Undefined over an
         empty denominator, as everywhere else in the product. */
      pathCompletionRate:
        placedRows.length === 0
          ? null
          : Math.round((completedRows.length / placedRows.length) * 100),
      coursesPassed,
      certificatesIssued,
    };
  }

  /**
   * Where the ministry has put its people, and how far each of those groups got
   * (D-134).
   *
   * It replaces the career-type distribution, which answered "where are our
   * people's interests" — a question the ministry stopped asking when it started
   * assigning paths. This answers the one it asks instead: of the people we put
   * on this path, how many have been placed and started, and how many are still
   * waiting on the assessment. A path with many assigned and few placed is the
   * finding, and it is actionable from this screen.
   *
   * **Every published path is returned, including the ones nobody is on.** A
   * zero is a finding — a path the ministry built and never used — and a row
   * that disappears cannot be compared against the ones that are working.
   */
  private async pathDistribution(): Promise<AdminPathAssignmentShare[]> {
    const [paths, placements] = await Promise.all([
      this.prisma.path.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { displayOrder: 'asc' },
        select: { id: true, name: true, userPaths: { select: { status: true } } },
      }),
      this.prisma.learnerPlacement.groupBy({ by: ['pathId'], _count: { _all: true } }),
    ]);

    const placedBy = new Map(placements.map((row) => [row.pathId, row._count._all]));

    return paths
      .map((path) => ({
        pathId: path.id,
        name: path.name,
        assigned: path.userPaths.length,
        placed: placedBy.get(path.id) ?? 0,
        completed: path.userPaths.filter((row) => row.status === 'COMPLETED').length,
      }))
      .sort((a, b) => b.assigned - a.assigned || a.name.localeCompare(b.name, 'ar'));
  }

  /**
   * Paths nobody assigned to them can start (§4C.1, D-134).
   *
   * The one genuinely stuck thing this page can show. A path with no published
   * assessment strands every learner on it at «بانتظار تحديد المستوى», and
   * nothing else in the product says so — assignment happens on another screen,
   * so by the time somebody notices, a directorate has been put on a path that
   * goes nowhere.
   */
  private async pathsWithoutAssessment(): Promise<AdminDashboardView['pathsWithoutAssessment']> {
    const paths = await this.prisma.path.findMany({
      where: { status: 'PUBLISHED', assessments: { none: { status: 'ACTIVE' } } },
      orderBy: { displayOrder: 'asc' },
      select: { id: true, name: true },
    });

    return paths;
  }

  private async lmsHealth(): Promise<AdminLmsHealth> {
    const [health, lastCatalog, lastCompletion] = await Promise.all([
      /* A live call. It is the only figure on this page that is not a database
         read, and the only one that can be stale by the time it renders — which
         is the point: the question is whether Moodle is answering *now*.
         `checkHealth` is documented never to throw, so the catch is belt and
         braces: a dashboard that 500s because the LMS is down is a dashboard
         that goes dark exactly when it is needed. */
      this.lms
        .checkHealth()
        .catch(() => ({ reachable: false, failureCode: 'UNREACHABLE' as const })),
      this.lastSuccessfulRun(AuditAction.LMS_CATALOG_SYNCED),
      this.lastSuccessfulRun(AuditAction.LMS_COMPLETION_SYNCED),
    ]);

    return {
      reachable: health.reachable,
      mode: this.config.get('MOODLE_MODE'),
      siteName: 'siteName' in health ? (health.siteName ?? null) : null,
      failureCode: health.failureCode ?? null,
      /* Not a secret — §5.1 keeps the *token* server-side, and an admin cannot
         diagnose an integration without knowing which instance it points at. */
      baseUrl: this.config.get('MOODLE_BASE_URL'),
      lastCatalogSyncAt: lastCatalog,
      lastCompletionSyncAt: lastCompletion,
    };
  }

  /**
   * When a scheduled job last completed successfully.
   *
   * Read from the audit trail because that is the only place a *run* is
   * recorded. `courses.lastSyncedAt` would answer a different question — when a
   * given course was last touched — and would report a healthy catalogue while
   * every recent run had failed.
   */
  private async lastSuccessfulRun(action: string): Promise<string | null> {
    const row = await this.prisma.auditLog.findFirst({
      where: { action, outcome: 'SUCCESS' },
      orderBy: { occurredAt: 'desc' },
      select: { occurredAt: true },
    });

    return row?.occurredAt.toISOString() ?? null;
  }

  /**
   * The newest audit entries, named.
   *
   * The actor's *name* and nothing else about them: §4C.8 owns the full trail
   * with its filters, and a dashboard list needs only enough to recognise an
   * event. No email, no employee id, and no metadata payload — the payloads are
   * non-PII by construction (`AuditService`) but they are also meaningless
   * without context, and a dashboard is not where context lives.
   */
  private async recentActivity(): Promise<AdminActivityRow[]> {
    const rows = await this.prisma.auditLog.findMany({
      orderBy: { occurredAt: 'desc' },
      take: 12,
      select: {
        id: true,
        action: true,
        outcome: true,
        targetType: true,
        occurredAt: true,
        actor: { select: { fullName: true } },
      },
    });

    return rows.map((row) => ({
      /* `audit_log.id` is a bigint. `JSON.stringify` throws on one rather than
         rounding it, so the conversion has to happen here and not be left to
         the serialiser. */
      id: row.id.toString(),
      action: row.action,
      outcome: row.outcome,
      actorName: row.actor?.fullName ?? null,
      targetType: row.targetType,
      occurredAt: row.occurredAt.toISOString(),
    }));
  }
}
