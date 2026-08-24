import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type { AdminCoursePage, AdminCourseRow } from '@tamkeen/types';

import { AuditAction, AuditReason } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import {
  effectiveCourseStatus,
  type CoursePublicationValue,
} from '../catalog-sync/catalog-mapping';
import { PrismaService } from '../prisma/prisma.service';
import type { AdminCourseQueryDto, InterveneCourseDto } from './admin.dto';

/**
 * §4C.5 — course oversight across every organisation.
 *
 * **Unscoped by design, and the one place that is true** (D-075). An entity sees
 * its own courses and the scope resolver has no vocabulary for asking about
 * another's; this reads them all, plus the roughly forty the seeded catalogue
 * holds that no entity supplies (D-063) — which are invisible from every entity
 * portal by construction and are therefore only ever the administrator's.
 *
 * **`status` is still derived, never assigned.** Every write here goes through
 * `effectiveCourseStatus` exactly as the sync job and the entity portal do, so
 * an administrator hiding a course and an entity withdrawing one cannot produce
 * different meanings for the same combination of inputs. The property that
 * matters most survives with it: **no combination of inputs makes a course
 * invisible to a learner who holds it** (§2/D-015).
 *
 * So an administrator can intervene, and cannot strand anybody by doing so — the
 * intervention lands on `publication`, and the derivation decides what a learner
 * actually sees.
 */
@Injectable()
export class AdminCoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: AdminCourseQueryDto): Promise<AdminCoursePage> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const where = {
      ...(query.publication ? { publication: query.publication } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.pathId ? { pathCourses: { some: { pathId: query.pathId } } } : {}),
      /*
       * `unowned` and `entityId` are separate filters rather than one field with
       * a magic value. "No organisation supplies this" is a different question
       * from "this organisation supplies it", and encoding the first as a
       * sentinel in the second is how a filter for a real entity named `none`
       * would one day return the wrong rows.
       */
      ...(query.unowned ? { ownerEntityId: null } : {}),
      ...(query.entityId ? { ownerEntityId: query.entityId } : {}),
      ...(query.q ? { title: { contains: query.q, mode: 'insensitive' as const } } : {}),
    };

    const [rows, total, unownedTotal] = await Promise.all([
      this.prisma.course.findMany({
        where,
        orderBy: [{ title: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: COURSE_SELECT,
      }),
      this.prisma.course.count({ where }),
      /* Unfiltered: the count is a standing piece of work — courses nobody
         supplies — not a property of whatever the administrator just searched. */
      this.prisma.course.count({ where: { ownerEntityId: null } }),
    ]);

    const held = await this.heldCounts(rows.map((row) => row.id));

    return {
      rows: rows.map((row) => toRow(row, held.get(row.id) ?? 0)),
      total,
      page,
      pageSize,
      unownedTotal,
    };
  }

  async get(courseId: string): Promise<AdminCourseRow> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: COURSE_SELECT,
    });

    if (!course) {
      throw new NotFoundException('COURSE_NOT_FOUND');
    }

    const held = await this.heldCounts([courseId]);

    return toRow(course, held.get(courseId) ?? 0);
  }

  /**
   * The administrator's intervention (§4C.5).
   *
   * Two things it can change and one it cannot. It sets **publication** — hide a
   * problematic course, or restore one — and it sets **ownership**, which is the
   * only way the seeded catalogue's unowned courses ever acquire a supplier.
   *
   * What it cannot do is assign `status`. That is derived from the publication
   * decision and the LMS's facts, so hiding a course a learner holds produces
   * `HIDDEN_BUT_COMPLETABLE` rather than `RETIRED` — the administrator does not
   * choose that and cannot override it.
   */
  async intervene(
    courseId: string,
    dto: InterveneCourseDto,
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminCourseRow> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, publication: true, lmsPresent: true, lmsVisible: true },
    });

    if (!course) {
      throw new NotFoundException('COURSE_NOT_FOUND');
    }

    if (dto.ownerEntityId !== undefined && dto.ownerEntityId !== null) {
      const entity = await this.prisma.entity.findUnique({
        where: { id: dto.ownerEntityId },
        select: { id: true },
      });

      if (!entity) {
        throw new NotFoundException('ENTITY_NOT_FOUND');
      }
    }

    if (dto.publication === 'DRAFT') {
      /*
       * DRAFT is the state between a Moodle shell existing and its metadata
       * being finished — reachable forward, never backward. Returning a
       * published course to it would take it out of the catalogue by a route
       * that bypasses the unpublish rules, and `HIDDEN_BUT_COMPLETABLE` would
       * never be reached, so a learner holding it would lose it.
       */
      await this.audit.record({
        action: AuditAction.ADMIN_COURSE_INTERVENED,
        outcome: 'FAILURE',
        actorUserId: actorId,
        ipAddress,
        targetType: 'course',
        targetId: courseId,
        reason: AuditReason.COURSE_CANNOT_RETURN_TO_DRAFT,
      });

      throw new ConflictException('COURSE_CANNOT_RETURN_TO_DRAFT');
    }

    const publication = (dto.publication ?? course.publication) as CoursePublicationValue;
    const held = await this.heldCounts([courseId]);

    const status = effectiveCourseStatus({
      publication,
      lmsPresent: course.lmsPresent,
      lmsVisible: course.lmsVisible,
      heldByAnyLearner: (held.get(courseId) ?? 0) > 0,
    });

    await this.prisma.course.update({
      where: { id: courseId },
      data: {
        ...(dto.publication === undefined ? {} : { publication: dto.publication }),
        ...(dto.ownerEntityId === undefined ? {} : { ownerEntityId: dto.ownerEntityId }),
        status,
      },
    });

    if (publication === 'PUBLISHED') {
      /*
       * Set on the *first* publication and never rewritten — the rule the entity
       * portal follows, and the one D-067 corrected there. The condition asks
       * whether the column is null rather than whether the course was a draft: a
       * course withdrawn before it was ever published would otherwise reach
       * PUBLISHED with no date, permanently, because the draft condition never
       * comes true again.
       */
      await this.prisma.course.updateMany({
        where: { id: courseId, publishedAt: null },
        data: { publishedAt: new Date() },
      });
    }

    await this.audit.record({
      action: AuditAction.ADMIN_COURSE_INTERVENED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'course',
      targetId: courseId,
      detail: {
        fields: Object.entries({ ...dto })
          .filter(([, value]) => value !== undefined)
          .map(([field]) => field)
          .sort()
          .join(','),
        /* The resulting status, because §2/D-015 turns on it: an intervention
           that degraded to HIDDEN_BUT_COMPLETABLE and one that retired the
           course outright are different events. */
        status,
      },
    });

    return this.get(courseId);
  }

  /** How many learners hold each course, across every path. */
  private async heldCounts(courseIds: readonly string[]): Promise<Map<string, number>> {
    if (courseIds.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.userPathCourse.groupBy({
      by: ['courseId'],
      where: { courseId: { in: [...courseIds] } },
      _count: { _all: true },
    });

    return new Map(rows.map((row) => [row.courseId, row._count._all]));
  }
}

const COURSE_SELECT = {
  id: true,
  moodleCourseId: true,
  title: true,
  publication: true,
  status: true,
  lmsPresent: true,
  lmsVisible: true,
  language: true,
  durationMinutes: true,
  ownerEntityId: true,
  publishedAt: true,
  lastSyncedAt: true,
  ownerEntity: { select: { name: true } },
  pathCourses: { select: { path: { select: { id: true, name: true } } } },
} as const;

function toRow(
  course: {
    id: string;
    moodleCourseId: number;
    title: string;
    publication: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';
    status: 'DRAFT' | 'AVAILABLE' | 'HIDDEN_BUT_COMPLETABLE' | 'RETIRED';
    lmsPresent: boolean;
    lmsVisible: boolean;
    language: 'AR' | 'EN' | null;
    durationMinutes: number | null;
    ownerEntityId: string | null;
    publishedAt: Date | null;
    lastSyncedAt: Date | null;
    ownerEntity: { name: string } | null;
    pathCourses: Array<{ path: { id: string; name: string } }>;
  },
  heldByLearners: number,
): AdminCourseRow {
  return {
    id: course.id,
    moodleCourseId: course.moodleCourseId,
    title: course.title,
    publication: course.publication,
    status: course.status,
    lmsPresent: course.lmsPresent,
    lmsVisible: course.lmsVisible,
    language: course.language,
    durationMinutes: course.durationMinutes,
    ownerEntityId: course.ownerEntityId,
    ownerEntityName: course.ownerEntity?.name ?? null,
    paths: course.pathCourses.map((row) => row.path),
    heldByLearners,
    publishedAt: course.publishedAt?.toISOString() ?? null,
    lastSyncedAt: course.lastSyncedAt?.toISOString() ?? null,
  };
}
