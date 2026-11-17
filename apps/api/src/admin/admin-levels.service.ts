import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { AdminPathDetail } from '@tamkeen/types';

import { AuditAction, AuditReason } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminPathsService, PARK, repackLevel } from './admin-paths.service';
import type {
  CreateLevelDto,
  PlaceCourseDto,
  ReorderLevelCoursesDto,
  ReorderLevelsDto,
  UpdateLevelDto,
} from './admin.dto';

/**
 * §4C.4 — the ladder, and what sits on it (D-134).
 *
 * **Everything here is the administrator's alone.** An entity offers a course to
 * a path; where it goes is a curriculum decision, and there is no entity-facing
 * route to any of these methods. That is deliberate product policy, not a
 * missing feature.
 *
 * Two invariants are maintained by every write, and both matter to a learner
 * rather than to a screen:
 *
 *  - **Positions stay contiguous.** A level numbered 1, 2, 4 tells a learner a
 *    course is missing when nothing is. Every place, move, unplace and delete
 *    re-packs, in one transaction with the change that disturbed it.
 *  - **Enrolments follow placement.** Putting a course on a rung at or above
 *    where somebody stands adds it to what they owe, so they must be enrolled in
 *    it — otherwise it appears on their path as something they cannot open.
 */
@Injectable()
export class AdminLevelsService {
  private readonly logger = new Logger(AdminLevelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly paths: AdminPathsService,
    private readonly enrollment: EnrollmentService,
  ) {}

  /** Adds a rung at the top of the ladder. */
  async createLevel(
    pathId: string,
    dto: CreateLevelDto,
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminPathDetail> {
    await this.requirePath(pathId);

    const highest = await this.prisma.level.aggregate({
      where: { pathId },
      _max: { position: true },
    });

    const level = await this.prisma.level.create({
      data: { pathId, name: dto.name, position: (highest._max.position ?? 0) + 1 },
      select: { id: true, position: true },
    });

    await this.audit.record({
      action: AuditAction.ADMIN_LEVEL_CREATED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'path',
      targetId: pathId,
      detail: { name: dto.name, position: level.position },
    });

    return this.paths.get(pathId);
  }

  async updateLevel(
    pathId: string,
    levelId: string,
    dto: UpdateLevelDto,
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminPathDetail> {
    await this.requireLevel(pathId, levelId);

    await this.prisma.level.update({ where: { id: levelId }, data: { name: dto.name } });

    await this.audit.record({
      action: AuditAction.ADMIN_LEVEL_UPDATED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'path',
      targetId: pathId,
      detail: { name: dto.name },
    });

    return this.paths.get(pathId);
  }

  /**
   * Deletes a rung. **Its courses revert to unassigned; none is deleted.**
   *
   * That is the spec's rule and it is also the only safe reading: the courses
   * belong to the path, the rung was one administrator's opinion about where
   * they go, and deleting content because somebody restructured a ladder would
   * be a data loss nobody asked for.
   *
   * **Refused while any learner stands on it.** A placement names a level; with
   * the level gone the placement would point at nothing, and `Restrict` on the
   * foreign key would refuse the delete anyway. Refusing here, by name, means
   * the administrator is told which rung and why rather than seeing a constraint
   * error.
   */
  async deleteLevel(
    pathId: string,
    levelId: string,
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminPathDetail> {
    const level = await this.requireLevel(pathId, levelId);

    const standing = await this.prisma.learnerPlacement.count({ where: { levelId } });

    if (standing > 0) {
      await this.audit.record({
        action: AuditAction.ADMIN_LEVEL_DELETED,
        outcome: 'FAILURE',
        actorUserId: actorId,
        ipAddress,
        targetType: 'path',
        targetId: pathId,
        reason: AuditReason.LEVEL_HELD_BY_LEARNERS,
        detail: { name: level.name, learners: standing },
      });

      throw new ConflictException('LEVEL_HELD_BY_LEARNERS');
    }

    const unassigned = await this.prisma.pathCourse.count({ where: { levelId } });

    await this.prisma.$transaction(async (tx) => {
      /* Unassign first, then delete. The composite foreign key is `Restrict`
         precisely so that a forgotten unassign fails loudly instead of
         cascading a learner's curriculum away. */
      await tx.pathCourse.updateMany({
        where: { levelId },
        data: { levelId: null, position: null, placedAt: null, placedById: null },
      });

      await tx.level.delete({ where: { id: levelId } });

      /* The rungs above it close the gap, so the ladder stays 1 … n. */
      const remaining = await tx.level.findMany({
        where: { pathId },
        orderBy: { position: 'asc' },
        select: { id: true },
      });

      for (const [index, row] of remaining.entries()) {
        await tx.level.update({ where: { id: row.id }, data: { position: PARK + index } });
      }
      for (const [index, row] of remaining.entries()) {
        await tx.level.update({ where: { id: row.id }, data: { position: index + 1 } });
      }
    });

    await this.audit.record({
      action: AuditAction.ADMIN_LEVEL_DELETED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'path',
      targetId: pathId,
      detail: { name: level.name, coursesUnassigned: unassigned },
    });

    return this.paths.get(pathId);
  }

  /** Reorders the whole ladder. Takes the complete order, like every reorder here. */
  async reorderLevels(
    pathId: string,
    dto: ReorderLevelsDto,
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminPathDetail> {
    const existing = await this.prisma.level.findMany({
      where: { pathId },
      select: { id: true },
    });

    const known = new Set(existing.map((row) => row.id));
    const given = new Set(dto.levelIds);

    if (given.size !== dto.levelIds.length || given.size !== known.size) {
      throw new ConflictException('LEVEL_ORDER_INCOMPLETE');
    }
    if (dto.levelIds.some((id) => !known.has(id))) {
      throw new ConflictException('LEVEL_NOT_IN_PATH');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const [index, levelId] of dto.levelIds.entries()) {
        await tx.level.update({ where: { id: levelId }, data: { position: PARK + index } });
      }
      for (const [index, levelId] of dto.levelIds.entries()) {
        await tx.level.update({ where: { id: levelId }, data: { position: index + 1 } });
      }
    });

    await this.audit.record({
      action: AuditAction.ADMIN_LEVELS_REORDERED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'path',
      targetId: pathId,
      detail: { levels: dto.levelIds.length },
    });

    /* Reordering rungs changes which of them sit above a learner's placement,
       and therefore what every learner on this path owes. */
    await this.syncPathEnrolments(pathId);

    return this.paths.get(pathId);
  }

  /**
   * Places a course on a rung, moves it between rungs, or takes it off one.
   *
   * One method for all three, because they are one decision — where in the path
   * does this course belong — and the caller distinguishes them by sending a
   * level or `null`.
   */
  async place(
    pathId: string,
    pathCourseId: string,
    dto: PlaceCourseDto,
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminPathDetail> {
    const membership = await this.prisma.pathCourse.findFirst({
      where: { id: pathCourseId, pathId },
      select: { id: true, courseId: true, levelId: true, position: true },
    });

    if (!membership) {
      throw new NotFoundException('COURSE_NOT_IN_PATH');
    }

    const target = dto.levelId ?? null;

    if (target !== null) {
      const level = await this.prisma.level.findFirst({
        where: { id: target, pathId },
        select: { id: true },
      });

      if (!level) {
        /* A level from another path. 422 rather than 404: the request is
           well-formed and the level exists — it is the combination that is
           wrong, and saying so is what lets a client tell a typo from a bug. */
        await this.auditPlacement(actorId, ipAddress, pathId, 'FAILURE', {
          reason: AuditReason.LEVEL_NOT_IN_PATH,
          detail: { courseId: membership.courseId },
        });

        throw new UnprocessableEntityException(AuditReason.LEVEL_NOT_IN_PATH);
      }
    }

    const moved = membership.levelId !== null && target !== null && membership.levelId !== target;

    if (moved) {
      /*
       * TODO(product-decision): what should happen to a learner's in-progress
       * work when the course they started moves to a different rung.
       *
       * Nothing is reset today, and nothing needs to be: progress is keyed on
       * `(learner, course)` in `completions`, never on the level, so it survives
       * the move untouched. What is undecided is whether a learner *below* the
       * new rung should keep owing a course they had already started — the spec
       * (§10) leaves it open, and building reconciliation before the ministry
       * has decided would be inventing the answer.
       */
      const started = await this.prisma.enrollment.count({
        where: { courseId: membership.courseId },
      });

      if (started > 0) {
        this.logger.log(
          `Course ${membership.courseId} moved between levels in path ${pathId}; ` +
            `${started} learner(s) have started it. Their progress is kept.`,
        );
      }
    }

    const position = await this.resolvePosition(target, membership.id, dto.position ?? null);

    await this.prisma.$transaction(async (tx) => {
      /* Parked out of the way first: the row may be moving *within* its level,
         and the unique index refuses two rows in one slot even for an instant. */
      await tx.pathCourse.update({
        where: { id: membership.id },
        data: { levelId: null, position: null },
      });

      if (membership.levelId) {
        await repackLevel(tx, membership.levelId);
      }

      if (target === null) {
        await tx.pathCourse.update({
          where: { id: membership.id },
          data: { placedAt: null, placedById: null },
        });

        return;
      }

      /* Make room at `position`, from the top down so no two rows collide. */
      const occupants = await tx.pathCourse.findMany({
        where: { levelId: target },
        orderBy: { position: 'asc' },
        select: { id: true },
      });

      const order = [...occupants.map((row) => row.id)];
      order.splice(Math.min(position - 1, order.length), 0, membership.id);

      await tx.pathCourse.update({
        where: { id: membership.id },
        data: {
          levelId: target,
          position: PARK + order.length,
          placedAt: new Date(),
          placedById: actorId,
        },
      });

      for (const [index, id] of order.entries()) {
        await tx.pathCourse.update({ where: { id }, data: { position: PARK + index } });
      }
      for (const [index, id] of order.entries()) {
        await tx.pathCourse.update({ where: { id }, data: { position: index + 1 } });
      }
    });

    await this.auditPlacement(actorId, ipAddress, pathId, 'SUCCESS', {
      detail: {
        courseId: membership.courseId,
        from: membership.levelId ?? 'unassigned',
        to: target ?? 'unassigned',
        position,
      },
    });

    await this.syncPathEnrolments(pathId);

    return this.paths.get(pathId);
  }

  /** Reorders the courses within one rung. Takes the complete order. */
  async reorderLevelCourses(
    pathId: string,
    levelId: string,
    dto: ReorderLevelCoursesDto,
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminPathDetail> {
    await this.requireLevel(pathId, levelId);

    const existing = await this.prisma.pathCourse.findMany({
      where: { levelId },
      select: { id: true },
    });

    const known = new Set(existing.map((row) => row.id));
    const given = new Set(dto.pathCourseIds);

    if (given.size !== dto.pathCourseIds.length || given.size !== known.size) {
      throw new UnprocessableEntityException(AuditReason.POSITION_OUT_OF_RANGE);
    }
    if (dto.pathCourseIds.some((id) => !known.has(id))) {
      throw new UnprocessableEntityException(AuditReason.COURSE_NOT_IN_PATH);
    }

    await this.prisma.$transaction(async (tx) => {
      for (const [index, id] of dto.pathCourseIds.entries()) {
        await tx.pathCourse.update({ where: { id }, data: { position: PARK + index } });
      }
      for (const [index, id] of dto.pathCourseIds.entries()) {
        await tx.pathCourse.update({ where: { id }, data: { position: index + 1 } });
      }
    });

    await this.audit.record({
      action: AuditAction.ADMIN_LEVEL_COURSES_REORDERED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'path',
      targetId: pathId,
      detail: { courses: dto.pathCourseIds.length },
    });

    return this.paths.get(pathId);
  }

  /**
   * Where in the level the course should land.
   *
   * Absent means the end, which is what an administrator dropping a course onto
   * a rung means by default. A number outside `1 … n + 1` is refused rather than
   * clamped: silently putting a course somewhere other than where the request
   * said would make a drag-and-drop client look like it had lost the row.
   */
  private async resolvePosition(
    levelId: string | null,
    pathCourseId: string,
    requested: number | null,
  ): Promise<number> {
    if (levelId === null) {
      return 0;
    }

    const occupants = await this.prisma.pathCourse.count({
      where: { levelId, id: { not: pathCourseId } },
    });

    if (requested === null) {
      return occupants + 1;
    }

    if (requested < 1 || requested > occupants + 1) {
      throw new UnprocessableEntityException(AuditReason.POSITION_OUT_OF_RANGE);
    }

    return requested;
  }

  /**
   * Brings every placed learner on this path back in step with what it now
   * holds.
   *
   * Bounded by the people on one path, and it only ever *adds*: an enrolment a
   * learner has already worked in is not ours to take away, and `completions`
   * outlives it regardless. Best-effort for D-036's reason — the placement is
   * recorded whatever the LMS is doing.
   */
  private async syncPathEnrolments(pathId: string): Promise<void> {
    const learners = await this.prisma.learnerPlacement.findMany({
      where: { pathId },
      select: { learnerId: true },
    });

    for (const learner of learners) {
      await this.enrollment.syncEnrolments(learner.learnerId, pathId, null);
    }

    if (learners.length > 0) {
      this.logger.log(`Re-synced enrolments for ${learners.length} learner(s) on path ${pathId}.`);
    }
  }

  private async auditPlacement(
    actorId: string,
    ipAddress: string | null,
    pathId: string,
    outcome: 'SUCCESS' | 'FAILURE',
    options: {
      reason?: (typeof AuditReason)[keyof typeof AuditReason];
      detail: Record<string, string | number | boolean>;
    },
  ): Promise<void> {
    await this.audit.record({
      action: AuditAction.ADMIN_COURSE_PLACED,
      outcome,
      actorUserId: actorId,
      ipAddress,
      targetType: 'path',
      targetId: pathId,
      ...(options.reason ? { reason: options.reason } : {}),
      detail: options.detail,
    });
  }

  private async requirePath(pathId: string): Promise<void> {
    const path = await this.prisma.path.findUnique({ where: { id: pathId }, select: { id: true } });

    if (!path) {
      throw new NotFoundException('PATH_NOT_FOUND');
    }
  }

  private async requireLevel(pathId: string, levelId: string): Promise<{ name: string }> {
    const level = await this.prisma.level.findFirst({
      where: { id: levelId, pathId },
      select: { name: true },
    });

    if (!level) {
      throw new NotFoundException('LEVEL_NOT_IN_PATH');
    }

    return level;
  }
}
