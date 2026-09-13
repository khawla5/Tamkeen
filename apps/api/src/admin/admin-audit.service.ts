import { Injectable } from '@nestjs/common';

import {
  AUDIT_TARGET_TYPES,
  type AdminAuditPage,
  type AdminAuditRow,
  type AdminReports,
  type AuditTargetType,
} from '@tamkeen/types';

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

    const labels = await this.resolveTargetLabels(page);

    return {
      rows: page.map((row) => toRow(row, labels)),
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
    const [journey, pathPopularity, placementDistribution, certificates, courseOutcomes] =
      await Promise.all([
        this.journey(),
        this.pathPopularity(),
        this.placementDistribution(),
        this.certificates(),
        this.courseOutcomes(),
      ]);

    return { journey, pathPopularity, placementDistribution, certificates, courseOutcomes };
  }

  private async journey(): Promise<AdminReports['journey']> {
<<<<<<< HEAD
    const [assigned, placed, completed, coursesPassed, certificatesIssued] = await Promise.all([
      /* Distinct people, not rows: an employee may hold more than one path
         (D-130), and "how many of our workforce is in training" is a question
         about people. */
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
=======
    const [assessed, byStatus, coursesPassed, certificatesIssued] = await Promise.all([
      /* Distinct people, not results: retakes append (D-033). `kind: 'RIASEC'`
         (TAM-147): this funnel step means the Holland assessment specifically,
         the same reading `admin-dashboard.service.ts`'s "assessed" count
         already gives it — someone who has only taken the CEFR placement test
         has not passed this step. */
      this.prisma.assessmentResult.findMany({
        where: { kind: 'RIASEC' },
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.prisma.userPath.groupBy({ by: ['status'], _count: { _all: true } }),
>>>>>>> origin/main
      this.prisma.completion.count({ where: { passed: true } }),
      this.prisma.certificate.count(),
    ]);

    return {
      assigned: assigned.length,
      placed: placed.length,
      completed: completed.length,
      /* Over the people who were actually placed, not everyone assigned: a
         learner waiting on an assessment has not failed to finish, and counting
         them in the denominator would report a directorate's unpublished path as
         a completion problem. */
      pathCompletionRate:
        placed.length === 0 ? null : Math.round((completed.length / placed.length) * 100),
      coursesPassed,
      certificatesIssued,
    };
  }

  private async pathPopularity(): Promise<AdminReports['pathPopularity']> {
    const paths = await this.prisma.path.findMany({
      select: {
        id: true,
        name: true,
        userPaths: { select: { status: true } },
      },
    });

    return paths
      .map((path) => ({
        pathId: path.id,
        name: path.name,
        /* Assigned, not chosen: under D-130 nobody picks a path, so this reports
           where the ministry is putting people rather than what they preferred. */
        assigned: path.userPaths.length,
        completed: path.userPaths.filter((row) => row.status === 'COMPLETED').length,
      }))
      .sort((a, b) => b.assigned - a.assigned || a.name.localeCompare(b.name, 'ar'));
  }

<<<<<<< HEAD
  /**
   * Where the ministry's people actually stand: employees on each rung of each
   * path.
   *
   * This is what the Holland-code distribution used to be, asked the way the
   * assigned model makes it answerable. A code told the ministry what somebody
   * was drawn to; a placement tells them what somebody can already do, which is
   * the fact a training programme is planned against.
   */
  private async placementDistribution(): Promise<AdminReports['placementDistribution']> {
    const placements = await this.prisma.learnerPlacement.groupBy({
      by: ['pathId', 'levelId'],
      _count: { _all: true },
    });

    if (placements.length === 0) {
      return [];
=======
  private async codeDistribution(): Promise<AdminReports['codeDistribution']> {
    /* `kind: 'RIASEC'` (TAM-147): a Holland Code distribution has nothing to
       say about a CEFR row, which carries no `code`. */
    const newest = await this.prisma.assessmentResult.findMany({
      where: { kind: 'RIASEC' },
      distinct: ['userId'],
      orderBy: [{ userId: 'asc' }, { completedAt: 'desc' }],
      select: { code: true },
    });

    const counts = new Map<string, number>();
    for (const row of newest) {
      /* Non-null: filtered to `kind: 'RIASEC'` above. */
      const code = row.code!;
      counts.set(code, (counts.get(code) ?? 0) + 1);
>>>>>>> origin/main
    }

    const levels = await this.prisma.level.findMany({
      where: { id: { in: placements.map((row) => row.levelId) } },
      select: {
        id: true,
        name: true,
        position: true,
        path: { select: { id: true, name: true, displayOrder: true } },
      },
    });

    const byId = new Map(levels.map((level) => [level.id, level]));

    return placements
      .flatMap((row) => {
        const level = byId.get(row.levelId);
        if (!level) return [];

        return [
          {
            pathId: level.path.id,
            pathName: level.path.name,
            levelId: level.id,
            levelName: level.name,
            position: level.position,
            employees: row._count._all,
            order: level.path.displayOrder,
          },
        ];
      })
      .sort((a, b) => a.order - b.order || a.position - b.position)
      .map(({ order: _order, ...rest }) => rest);
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
      where: { enrollments: { some: {} } },
      select: {
        id: true,
        title: true,
        moodleCourseId: true,
        _count: { select: { enrollments: true } },
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
        const enrolled = course._count.enrollments;
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

  /**
   * What each row's target is called (TAM-137).
   *
   * **One query per kind, for the whole page.** Resolving inside `toRow` would
   * be fifty round trips per page on the table that will be the largest in the
   * system; grouping the ids by kind first makes it at most six regardless of
   * page size.
   *
   * A target that no longer exists simply resolves to nothing. The id is still
   * on the row, so a deleted path's retirement stays traceable — and a trail
   * that dropped entries whose subject was later removed would be missing
   * precisely the entries an investigation is looking for.
   */
  private async resolveTargetLabels(
    rows: Array<{ targetType: string | null; targetId: string | null }>,
  ): Promise<Map<string, string>> {
    const byType = new Map<string, Set<string>>();

    for (const row of rows) {
      if (row.targetType === null || row.targetId === null) {
        continue;
      }
      const ids = byType.get(row.targetType) ?? new Set<string>();
      ids.add(row.targetId);
      byType.set(row.targetType, ids);
    }

    const labels = new Map<string, string>();
    const idsOf = (type: string) => [...(byType.get(type) ?? [])];

    const add = (type: string, id: string, label: string) => labels.set(`${type}:${id}`, label);

    const [users, entities, paths, userPaths, courses, certificates] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: idsOf('user') } },
        select: { id: true, fullName: true },
      }),
      this.prisma.entity.findMany({
        where: { id: { in: idsOf('entity') } },
        select: { id: true, name: true },
      }),
      this.prisma.path.findMany({
        where: { id: { in: idsOf('path') } },
        select: { id: true, name: true },
      }),
      /* A learner's journey is named by the path they are on: that is the thing
         an administrator reading the row is trying to identify. The learner is
         already on the row as the actor. */
      this.prisma.userPath.findMany({
        where: { id: { in: idsOf('user_path') } },
        select: { id: true, path: { select: { name: true } } },
      }),
      this.prisma.course.findMany({
        where: { id: { in: idsOf('course') } },
        select: { id: true, title: true },
      }),
      /* The subject as printed on the face, not the holder's name — §4C.8 is
         not a place to accumulate who holds what. */
      this.prisma.certificate.findMany({
        where: { id: { in: idsOf('certificate') } },
        select: { id: true, subjectTitle: true },
      }),
    ]);

    for (const row of users) add('user', row.id, row.fullName);
    for (const row of entities) add('entity', row.id, row.name);
    for (const row of paths) add('path', row.id, row.name);
    for (const row of userPaths) add('user_path', row.id, row.path.name);
    for (const row of courses) add('course', row.id, row.title);
    for (const row of certificates) add('certificate', row.id, row.subjectTitle);

    /* `setting` and the assessment kinds resolve on the screen instead: a
       setting's id *is* its key and §4C.6's Arabic name for it lives in the
       message catalogue, not in the API. */
    return labels;
  }
}

/**
 * The keys stripped from a detail payload before it leaves the server
 * (TAM-137).
 *
 * **Opaque identifiers, and the raw route of a denied request.** A uuid on
 * screen answers nothing the resolved `targetLabel` does not answer better, and
 * `moodleCourseId` is an internal of a system the ministry does not administer.
 * `path`/`method` on an `AUTHZ_DENIED` entry are the exception that proves the
 * rule and are deliberately *kept*: "who tried to reach the admin settings" is
 * the entry's whole point, and a route is not an identifier.
 *
 * Stripping happens here rather than in the page so the CSV export is clean by
 * the same rule — two renderers, one decision about what is fit to show.
 */
const OPAQUE_DETAIL_KEYS = new Set([
  'pathId',
  'courseId',
  'userId',
  'entityId',
  'certificateId',
  'assessmentId',
  'moodleCourseId',
  'moodleUserId',
]);

/** Belt and braces: anything uuid-shaped goes, whatever it is called. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function presentableDetail(
  metadata: unknown,
  targetId: string | null = null,
): {
  reason: string | null;
  detail: AdminAuditRow['detail'];
} {
  if (metadata === null || typeof metadata !== 'object') {
    return { reason: null, detail: null };
  }

  const source = metadata as Record<string, string | number | boolean>;
  const reason = typeof source.reason === 'string' ? source.reason : null;
  const detail: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(source)) {
    if (key === 'reason' || OPAQUE_DETAIL_KEYS.has(key)) {
      continue;
    }
    if (typeof value === 'string' && UUID.test(value)) {
      continue;
    }
    /* Whatever it is called, a detail that restates the target says the same
       thing twice: a settings change carried `setting=CERT_ISSUING_BODY`
       beside a target of exactly that key. */
    if (targetId !== null && value === targetId) {
      continue;
    }
    detail[key] = value;
  }

  return { reason, detail: Object.keys(detail).length > 0 ? detail : null };
}

interface AuditRowSource {
  id: bigint;
  occurredAt: Date;
  action: string;
  outcome: 'SUCCESS' | 'FAILURE';
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  actor: { fullName: string } | null;
}

function toRow(row: AuditRowSource, labels: Map<string, string>): AdminAuditRow {
  const { reason, detail } = presentableDetail(row.metadata, row.targetId);

  return {
    /* `JSON.stringify` throws on a bigint rather than rounding it, so the
       conversion happens here and is not left to the serialiser. */
    id: row.id.toString(),
    occurredAt: row.occurredAt.toISOString(),
    action: row.action,
    outcome: row.outcome,
    actorName: row.actor?.fullName ?? null,
    /* Read back through the vocabulary rather than trusted: rows written before
       TAM-137 normalised the spellings are migrated, but a row from a restored
       backup should degrade to "no target type" rather than to a value the
       screen has no copy for. */
    targetType: asTargetType(row.targetType),
    targetId: row.targetId,
    targetLabel: row.targetId === null ? null : (labels.get(targetKey(row)) ?? null),
    reason,
    detail,
  };
}

function asTargetType(value: string | null): AuditTargetType | null {
  return value !== null && (AUDIT_TARGET_TYPES as readonly string[]).includes(value)
    ? (value as AuditTargetType)
    : null;
}

function targetKey(row: { targetType: string | null; targetId: string | null }): string {
  return `${row.targetType}:${row.targetId}`;
}
