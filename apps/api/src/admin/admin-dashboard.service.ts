import { Inject, Injectable } from '@nestjs/common';

import { RIASEC_LETTERS } from '@tamkeen/types';
import type {
  AdminActivityRow,
  AdminDashboardView,
  AdminLetterShare,
  AdminLmsHealth,
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
      letterDistribution,
      lms,
      recentActivity,
      assessment,
    ] = await Promise.all([
      this.userCounts(),
      this.entityCounts(),
      this.pathCounts(),
      this.courseCounts(),
      this.journeyCounts(),
      this.letterDistribution(),
      this.lmsHealth(),
      this.recentActivity(),
      this.activeAssessment(),
    ]);

    return {
      users,
      entities,
      paths,
      courses,
      journey,
      letterDistribution,
      lms,
      recentActivity,
      assessment,
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
    const [total, active] = await Promise.all([
      this.prisma.path.count(),
      this.prisma.path.count({ where: { isActive: true } }),
    ]);

    return { total, active };
  }

  private async courseCounts(): Promise<AdminDashboardView['courses']> {
    const [total, published, draft, unowned] = await Promise.all([
      this.prisma.course.count(),
      this.prisma.course.count({ where: { publication: 'PUBLISHED' } }),
      this.prisma.course.count({ where: { publication: 'DRAFT' } }),
      /* The seeded catalogue and anything the LMS holds that no entity authored
         (D-063). Surfaced because §4C.5 makes these the admin's to manage, and
         they are invisible from every entity portal by construction. */
      this.prisma.course.count({ where: { ownerEntityId: null } }),
    ]);

    return { total, published, draft, unowned };
  }

  private async journeyCounts(): Promise<AdminDashboardView['journey']> {
    const [assessedRows, byStatus, coursesPassed, certificatesIssued] = await Promise.all([
      /* Distinct users, not results: retakes append (D-033), so counting rows
         would report one indecisive employee as several assessed people. */
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
      assessed: assessedRows.length,
      building: of('BUILDING'),
      active,
      completed,
      /* Undefined over an empty denominator, as everywhere else in the product. */
      pathCompletionRate: committed === 0 ? null : Math.round((completed / committed) * 100),
      coursesPassed,
      certificatesIssued,
    };
  }

  /**
   * Where the ministry's people are, by career type, against what is offered.
   *
   * **The dominant letter rather than the whole code.** The full Holland Code
   * has thirty-odd values, is written in Latin letters, and tells an
   * administrator nothing they can do anything about; §4C.8's reports keep that
   * breakdown for the analyst who wants it. The *first* letter has six values,
   * each with an Arabic name, and it is the same letter a path is tagged with
   * (§3A) — so putting the employee count beside the count of paths offered for
   * that letter turns a chart into a decision: a type many employees lead with
   * and few paths serve is a gap in the catalogue, and this is the only screen
   * where both halves of that comparison exist.
   *
   * **One result per person — their newest** (D-033). A retake is a correction,
   * not a second opinion, so counting every result row would weight the people
   * who changed their mind more heavily than the people who did not, and the
   * distribution would describe the sample rather than the ministry.
   *
   * All six letters are always returned, including the ones nobody scored:
   * a zero is a finding, and a row that disappears cannot be compared against
   * the paths offered for it.
   */
  private async letterDistribution(): Promise<AdminLetterShare[]> {
    const [newest, pathsByLetter] = await Promise.all([
      this.prisma.assessmentResult.findMany({
        distinct: ['userId'],
        orderBy: [{ userId: 'asc' }, { completedAt: 'desc' }],
        select: { code: true },
      }),
      this.prisma.path.groupBy({
        by: ['riasecLetter'],
        where: { isActive: true },
        _count: { _all: true },
      }),
    ]);

    const employees = new Map<string, number>();
    for (const row of newest) {
      /* The code's first letter IS the dominant dimension: the code is derived
         by ranking, with ties already broken canonically (D-031), so reading it
         here cannot disagree with the ranking the learner was shown. */
      const letter = row.code.charAt(0);
      employees.set(letter, (employees.get(letter) ?? 0) + 1);
    }

    const paths = new Map(pathsByLetter.map((row) => [row.riasecLetter, row._count._all]));

    return RIASEC_LETTERS.map((letter) => ({
      letter,
      employees: employees.get(letter) ?? 0,
      activePaths: paths.get(letter) ?? 0,
    })).sort(
      (a, b) =>
        b.employees - a.employees ||
        /* Canonical R-I-A-S-E-C decides a tie, so the order is reproducible
           rather than whatever the Map happened to hold (D-031). */
        RIASEC_LETTERS.indexOf(a.letter) - RIASEC_LETTERS.indexOf(b.letter),
    );
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

  /**
   * Which version new takers are being served, and whether an edit is in flight.
   *
   * `hasDraft` is what makes §4C.3 reachable from here without a second click:
   * an unfinished assessment edit is the one thing on this page that is waiting
   * on the administrator personally.
   */
  private async activeAssessment(): Promise<AdminDashboardView['assessment']> {
    const [active, draft] = await Promise.all([
      this.prisma.assessment.findFirst({
        where: { status: 'ACTIVE' },
        select: { version: true, effectiveFrom: true, createdAt: true },
      }),
      this.prisma.assessment.count({ where: { status: 'DRAFT' } }),
    ]);

    if (!active) {
      return null;
    }

    return {
      version: active.version,
      /* `effectiveFrom` is null only for a row that was never published, which
         an ACTIVE one cannot be — the fallback exists so a corrupt row renders
         a date rather than crashing the whole dashboard. */
      effectiveFrom: (active.effectiveFrom ?? active.createdAt).toISOString(),
      /* An unfinished edit is the one thing on this page waiting on the
         administrator personally, so it is worth a click from here (§4C.1). */
      hasDraft: draft > 0,
    };
  }
}
