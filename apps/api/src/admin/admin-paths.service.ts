import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type {
  AdminAttachableCourse,
  AdminPathBounds,
  AdminPathDetail,
  AdminPathRow,
} from '@tamkeen/types';

import { AuditAction, AuditReason } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PATH_COURSE_BOUNDS, pathBlockers } from './path-readiness';
import type {
  AttachCourseDto,
  CreatePathDto,
  ReorderPathCoursesDto,
  UpdatePathDto,
} from './admin.dto';

/**
 * §4C.4 — managing study paths.
 *
 * **There is no delete, and the schema agrees.** `user_paths.path_id` is
 * `Restrict` and `certificates.path_id` references a path by name on a document
 * somebody holds, so a path that anyone has ever chosen cannot be removed
 * without falsifying a credential. Deactivation is the operational answer, and
 * it is a narrower thing than it sounds:
 *
 * **Retiring a path takes it out of new selections and touches nobody who holds
 * it.** My Path, a learner's courses and their certificates all read through
 * `user_paths` and never consult `paths.is_active` — verified rather than
 * assumed, because that is the whole of what makes retirement safe under D-002.
 * A learner still *building* is the one group affected, which is why this
 * service reports that count: the decision should be made knowing it.
 *
 * The one thing that is refused is offering a path a learner could never
 * confirm — see `path-readiness.ts`.
 */
@Injectable()
export class AdminPathsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The 5-10 rule, shown and never edited (D-074). */
  bounds(): AdminPathBounds {
    return { ...PATH_COURSE_BOUNDS };
  }

  async list(): Promise<AdminPathRow[]> {
    const paths = await this.prisma.path.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        key: true,
        name: true,
        riasecLetter: true,
        isActive: true,
        displayOrder: true,
        _count: { select: { pathCourses: true } },
        userPaths: { where: { confirmedAt: { not: null } }, select: { id: true } },
      },
    });

    return paths.map((path) => ({
      id: path.id,
      key: path.key,
      name: path.name,
      riasecLetter: path.riasecLetter,
      courseCount: path._count.pathCourses,
      /* Confirmed learners specifically: they are the ones D-002 makes
         permanent, and the number an administrator needs before touching
         anything about this path. */
      committedLearners: path.userPaths.length,
      isActive: path.isActive,
      displayOrder: path.displayOrder,
    }));
  }

  async get(pathId: string): Promise<AdminPathDetail> {
    const path = await this.prisma.path.findUnique({
      where: { id: pathId },
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        riasecLetter: true,
        typicalDurationMinutes: true,
        displayOrder: true,
        isActive: true,
        pathCourses: {
          orderBy: { displayOrder: 'asc' },
          select: {
            displayOrder: true,
            course: {
              select: {
                id: true,
                moodleCourseId: true,
                title: true,
                status: true,
                ownerEntity: { select: { name: true } },
              },
            },
          },
        },
        userPaths: { select: { status: true } },
      },
    });

    if (!path) {
      throw new NotFoundException('PATH_NOT_FOUND');
    }

    const held = await this.heldCounts(pathId);

    const courses = path.pathCourses.map((row) => ({
      id: row.course.id,
      moodleCourseId: row.course.moodleCourseId,
      title: row.course.title,
      status: row.course.status,
      displayOrder: row.displayOrder,
      ownerEntityName: row.course.ownerEntity?.name ?? null,
      heldByLearners: held.get(row.course.id) ?? 0,
    }));

    const selectableCourses = courses.filter((course) => isSelectable(course.status)).length;

    return {
      id: path.id,
      key: path.key,
      name: path.name,
      description: path.description,
      riasecLetter: path.riasecLetter,
      typicalDurationMinutes: path.typicalDurationMinutes,
      displayOrder: path.displayOrder,
      isActive: path.isActive,
      courseCount: courses.length,
      committedLearners: path.userPaths.filter((row) => row.status !== 'BUILDING').length,
      courses,
      learners: {
        building: path.userPaths.filter((row) => row.status === 'BUILDING').length,
        active: path.userPaths.filter((row) => row.status === 'ACTIVE').length,
        completed: path.userPaths.filter((row) => row.status === 'COMPLETED').length,
      },
      blockers: pathBlockers({ selectableCourses }),
      selectableCourses,
    };
  }

  /**
   * Courses this path does not already contain (§4C.4's attach picker).
   *
   * Not the learner catalogue: an administrator attaching a course needs to see
   * drafts and hidden ones too — a draft attached now becomes selectable the
   * moment its entity publishes it — and needs to know which organisation
   * supplies each, which no learner-facing shape carries.
   *
   * `RETIRED` is excluded, because a retired course is one the LMS no longer
   * holds; attaching it would put a dead row into a path's membership.
   */
  async attachableCourses(pathId: string, q?: string): Promise<AdminAttachableCourse[]> {
    await this.requirePath(pathId);

    const courses = await this.prisma.course.findMany({
      where: {
        status: { not: 'RETIRED' },
        pathCourses: { none: { pathId } },
        ...(q ? { title: { contains: q, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { title: 'asc' },
      take: 100,
      select: {
        id: true,
        moodleCourseId: true,
        title: true,
        status: true,
        ownerEntity: { select: { name: true } },
      },
    });

    return courses.map((course) => ({
      id: course.id,
      moodleCourseId: course.moodleCourseId,
      title: course.title,
      status: course.status,
      ownerEntityName: course.ownerEntity?.name ?? null,
    }));
  }

  /**
   * Creates a path.
   *
   * Always inactive to begin with, whatever the caller asks. A path is created
   * empty, and an empty path cannot be offered — so accepting `isActive: true`
   * here would mean either refusing every creation or admitting a path nobody
   * can confirm. Attaching courses and then activating is two deliberate steps
   * for a reason.
   */
  async create(
    dto: CreatePathDto,
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminPathDetail> {
    const key = dto.key.trim().toLowerCase();

    const clash = await this.prisma.path.findUnique({ where: { key }, select: { id: true } });

    if (clash) {
      throw new ConflictException('PATH_KEY_TAKEN');
    }

    const maxOrder = await this.prisma.path.aggregate({ _max: { displayOrder: true } });

    const path = await this.prisma.path.create({
      data: {
        key,
        name: dto.name,
        description: dto.description,
        riasecLetter: dto.riasecLetter,
        typicalDurationMinutes: dto.typicalDurationMinutes ?? null,
        displayOrder: dto.displayOrder ?? (maxOrder._max.displayOrder ?? 0) + 1,
        isActive: false,
      },
      select: { id: true },
    });

    await this.audit.record({
      action: AuditAction.ADMIN_PATH_CREATED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'path',
      targetId: path.id,
      detail: { key, riasecLetter: dto.riasecLetter },
    });

    return this.get(path.id);
  }

  /**
   * Edits a path, including whether it is offered.
   *
   * Activation is the only field that can be refused, and it is refused for one
   * reason: a path with fewer than five selectable courses is one no learner can
   * ever confirm (§2). Everything else — name, description, duration, letter,
   * order — is content the ministry owns.
   */
  async update(
    pathId: string,
    dto: UpdatePathDto,
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminPathDetail> {
    const current = await this.get(pathId);

    if (dto.isActive === true && current.blockers.length > 0) {
      await this.audit.record({
        action: AuditAction.ADMIN_PATH_UPDATED,
        outcome: 'FAILURE',
        actorUserId: actorId,
        ipAddress,
        targetType: 'path',
        targetId: pathId,
        reason: AuditReason.PATH_NOT_OFFERABLE,
        detail: { blockers: current.blockers.join(','), selectable: current.selectableCourses },
      });

      throw new ConflictException(current.blockers[0]);
    }

    await this.prisma.path.update({
      where: { id: pathId },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.description === undefined ? {} : { description: dto.description }),
        ...(dto.riasecLetter === undefined ? {} : { riasecLetter: dto.riasecLetter }),
        ...(dto.typicalDurationMinutes === undefined
          ? {}
          : { typicalDurationMinutes: dto.typicalDurationMinutes }),
        ...(dto.displayOrder === undefined ? {} : { displayOrder: dto.displayOrder }),
        ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
      },
    });

    await this.audit.record({
      action:
        dto.isActive === undefined
          ? AuditAction.ADMIN_PATH_UPDATED
          : dto.isActive
            ? AuditAction.ADMIN_PATH_ACTIVATED
            : AuditAction.ADMIN_PATH_RETIRED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'path',
      targetId: pathId,
      detail: {
        fields: changedFields({ ...dto }),
        /* Recorded on a retirement because it is the number that made the
           decision defensible: nobody confirmed is affected, and this many were
           part way through choosing. */
        ...(dto.isActive === false ? { buildingLearners: current.learners.building } : {}),
      },
    });

    return this.get(pathId);
  }

  /** Attaches a course to the path, at the end of the order. */
  async attachCourse(
    pathId: string,
    dto: AttachCourseDto,
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminPathDetail> {
    await this.requirePath(pathId);

    const course = await this.prisma.course.findUnique({
      where: { id: dto.courseId },
      select: { id: true },
    });

    if (!course) {
      throw new NotFoundException('COURSE_NOT_FOUND');
    }

    const existing = await this.prisma.pathCourse.findUnique({
      where: { pathId_courseId: { pathId, courseId: dto.courseId } },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('COURSE_ALREADY_IN_PATH');
    }

    const maxOrder = await this.prisma.pathCourse.aggregate({
      where: { pathId },
      _max: { displayOrder: true },
    });

    await this.prisma.pathCourse.create({
      data: {
        pathId,
        courseId: dto.courseId,
        displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
      },
    });

    await this.audit.record({
      action: AuditAction.ADMIN_PATH_COURSE_ATTACHED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'path',
      targetId: pathId,
      detail: { courseId: dto.courseId },
    });

    return this.get(pathId);
  }

  /**
   * Detaches a course, unless a learner holds it through this path.
   *
   * **The refusal is what makes this safe.** `user_path_courses` keeps its row
   * either way — nothing cascades — so a confirmed learner would still see the
   * course on My Path. What breaks is everyone still *building*: the build rules
   * validate a selection against path membership, so their next save or their
   * confirmation would be refused with `COURSE_NOT_IN_PATH`, about a course they
   * selected from this very screen. That is §2's stranding rule in a different
   * costume, and it is refused for the same reason.
   *
   * Detaching is also refused when it would drop an *active* path below the
   * five-course floor, for the reason `path-readiness.ts` gives.
   */
  async detachCourse(
    pathId: string,
    courseId: string,
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminPathDetail> {
    const path = await this.get(pathId);
    const course = path.courses.find((row) => row.id === courseId);

    if (!course) {
      throw new NotFoundException('COURSE_NOT_IN_PATH');
    }

    const refusal =
      course.heldByLearners > 0
        ? { code: 'COURSE_HELD_BY_LEARNERS', reason: AuditReason.COURSE_HELD_BY_LEARNERS }
        : path.isActive && isSelectable(course.status) && path.selectableCourses <= bound()
          ? { code: 'PATH_TOO_FEW_COURSES', reason: AuditReason.PATH_NOT_OFFERABLE }
          : null;

    if (refusal) {
      await this.audit.record({
        action: AuditAction.ADMIN_PATH_COURSE_DETACHED,
        outcome: 'FAILURE',
        actorUserId: actorId,
        ipAddress,
        targetType: 'path',
        targetId: pathId,
        reason: refusal.reason,
        detail: { courseId, heldByLearners: course.heldByLearners },
      });

      throw new ConflictException(refusal.code);
    }

    await this.prisma.pathCourse.delete({
      where: { pathId_courseId: { pathId, courseId } },
    });

    await this.audit.record({
      action: AuditAction.ADMIN_PATH_COURSE_DETACHED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'path',
      targetId: pathId,
      detail: { courseId },
    });

    return this.get(pathId);
  }

  /**
   * Reorders a path's courses (owed since Phase 4).
   *
   * `path_courses.display_order` has been set from the seed's own order and left
   * alone ever since, because nothing could edit it. It decides the order the
   * build screen offers courses in, and the order a learner's chosen courses are
   * numbered in on My Path — so it is curriculum sequencing, not decoration.
   *
   * Takes the complete order and shuffles in two passes, for the reasons the
   * assessment editor's reorder gives.
   */
  async reorderCourses(
    pathId: string,
    dto: ReorderPathCoursesDto,
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminPathDetail> {
    const existing = await this.prisma.pathCourse.findMany({
      where: { pathId },
      select: { courseId: true },
    });

    const ids = new Set(existing.map((row) => row.courseId));
    const given = new Set(dto.courseIds);

    if (given.size !== dto.courseIds.length || given.size !== ids.size) {
      throw new ConflictException('PATH_ORDER_INCOMPLETE');
    }
    if (dto.courseIds.some((id) => !ids.has(id))) {
      throw new ConflictException('COURSE_NOT_IN_PATH');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const [index, courseId] of dto.courseIds.entries()) {
        await tx.pathCourse.update({
          where: { pathId_courseId: { pathId, courseId } },
          data: { displayOrder: -(index + 1) },
        });
      }

      for (const [index, courseId] of dto.courseIds.entries()) {
        await tx.pathCourse.update({
          where: { pathId_courseId: { pathId, courseId } },
          data: { displayOrder: index + 1 },
        });
      }
    });

    await this.audit.record({
      action: AuditAction.ADMIN_PATH_UPDATED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'path',
      targetId: pathId,
      detail: { fields: 'courseOrder' },
    });

    return this.get(pathId);
  }

  /**
   * How many learners hold each of this path's courses, through this path.
   *
   * Scoped to the path deliberately. A course may belong to several paths
   * (D-003), and a learner holding it through *another* path is not stranded by
   * detaching it from this one — their own path still lists it.
   */
  private async heldCounts(pathId: string): Promise<Map<string, number>> {
    const rows = await this.prisma.userPathCourse.groupBy({
      by: ['courseId'],
      where: { userPath: { pathId } },
      _count: { _all: true },
    });

    return new Map(rows.map((row) => [row.courseId, row._count._all]));
  }

  private async requirePath(pathId: string): Promise<void> {
    const path = await this.prisma.path.findUnique({ where: { id: pathId }, select: { id: true } });

    if (!path) {
      throw new NotFoundException('PATH_NOT_FOUND');
    }
  }
}

/**
 * Whether a learner could select a course right now.
 *
 * `AVAILABLE` only. `HIDDEN_BUT_COMPLETABLE` is the §2/D-015 state — still
 * completable by whoever holds it, gone from new selections — so counting it
 * would report a path as offerable on the strength of courses nobody new can
 * choose, which is exactly the trap this count exists to avoid.
 */
function isSelectable(status: string): boolean {
  return status === 'AVAILABLE';
}

function bound(): number {
  return PATH_COURSE_BOUNDS.min;
}

function changedFields(dto: Record<string, unknown>): string {
  /* Filtered on `!== undefined`: `transform: true` gives the DTO an own property
     for every declared optional, so `Object.keys` alone would report every field
     as changed on every edit — the defect 5.2's audit test caught. */
  return Object.entries(dto)
    .filter(([, value]) => value !== undefined)
    .map(([field]) => field)
    .sort()
    .join(',');
}
