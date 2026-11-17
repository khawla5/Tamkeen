import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type {
  AdminAttachableCourse,
  AdminLevelRow,
  AdminPathCourseRow,
  AdminPathDetail,
  AdminPathRow,
} from '@tamkeen/types';

import { AuditAction, AuditReason } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { PrismaService, type TransactionClient } from '../prisma/prisma.service';
import type { AttachCourseDto, CreatePathDto, UpdatePathDto } from './admin.dto';
import { pathBlockers } from './path-readiness';

/**
 * §4C.4 — managing study paths, their ladders and what is placed on them.
 *
 * **Deletion exists for exactly one case: a path nobody was ever assigned.**
 * `user_paths.path_id` is `Restrict` and `certificates.path_id` names a path on
 * a document somebody holds, so a path anyone has ever been put on cannot be
 * removed without falsifying a credential — the service refuses that, and the
 * schema refuses it again underneath. What is left is the mistake: a path
 * created with the wrong key, sitting in the list with no learners, which
 * unpublishing can only hide rather than clear away. Those two outcomes are
 * deliberately different operations with different words, because one is
 * reversible and the other is not.
 *
 * **Unpublishing a path takes it out of new assignments and touches nobody who
 * holds it.** My Path, a learner's courses and their certificates all read
 * through `user_paths` and never consult `paths.status` — verified rather than
 * assumed, because that is the whole of what makes it safe under D-002.
 *
 * The one thing that is refused is publishing a path a learner could never get
 * anywhere in — see `path-readiness.ts`.
 */
@Injectable()
export class AdminPathsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<AdminPathRow[]> {
    const paths = await this.prisma.path.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        key: true,
        name: true,
        status: true,
        displayOrder: true,
        _count: {
          select: {
            levels: true,
            userPaths: true,
          },
        },
        pathCourses: { select: { levelId: true } },
        /* Only the two live rows: a retired version says nothing about whether
           the path can place anybody today. */
        assessments: {
          where: { status: { in: ['ACTIVE', 'DRAFT'] } },
          select: { status: true },
        },
      },
    });

    return paths.map((path) => ({
      id: path.id,
      key: path.key,
      name: path.name,
      levelCount: path._count.levels,
      placedCourseCount: path.pathCourses.filter((row) => row.levelId !== null).length,
      /* The administrator's own work queue, visible from the list: courses an
         entity has offered that nobody has placed, and which therefore reach no
         learner at all (D-134). */
      unassignedCourseCount: path.pathCourses.filter((row) => row.levelId === null).length,
      assignedLearners: path._count.userPaths,
      hasActiveAssessment: path.assessments.some((row) => row.status === 'ACTIVE'),
      hasDraftAssessment: path.assessments.some((row) => row.status === 'DRAFT'),
      status: path.status,
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
        skillOutcomes: true,
        typicalDurationMinutes: true,
        displayOrder: true,
        status: true,
        levels: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            name: true,
            position: true,
            _count: { select: { placements: true } },
          },
        },
        pathCourses: {
          orderBy: [{ position: 'asc' }, { assignedAt: 'asc' }],
          select: {
            id: true,
            levelId: true,
            position: true,
            assignedAt: true,
            assignedByEntity: { select: { name: true } },
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
        userPaths: { select: { userId: true, status: true } },
        placements: { select: { learnerId: true } },
        assessments: {
          where: { status: { in: ['ACTIVE', 'DRAFT'] } },
          select: { status: true },
        },
        _count: { select: { certificates: true } },
      },
    });

    if (!path) {
      throw new NotFoundException('PATH_NOT_FOUND');
    }

    const started = await this.startedCounts(pathId);

    const toRow = (entry: (typeof path.pathCourses)[number]): AdminPathCourseRow => ({
      id: entry.id,
      courseId: entry.course.id,
      moodleCourseId: entry.course.moodleCourseId,
      title: entry.course.title,
      status: entry.course.status,
      placement: entry.levelId === null ? 'UNASSIGNED' : 'PLACED',
      levelId: entry.levelId,
      position: entry.position,
      ownerEntityName: entry.course.ownerEntity?.name ?? null,
      assignedByEntityName: entry.assignedByEntity?.name ?? null,
      assignedAt: entry.assignedAt.toISOString(),
      learnersStarted: started.get(entry.course.id) ?? 0,
    });

    const levels: AdminLevelRow[] = path.levels.map((level) => ({
      id: level.id,
      name: level.name,
      position: level.position,
      hasPlacedLearners: level._count.placements > 0,
      courses: path.pathCourses.filter((entry) => entry.levelId === level.id).map(toRow),
    }));

    const unassignedCourses = path.pathCourses.filter((entry) => entry.levelId === null).map(toRow);

    const selectableCourses = levels
      .flatMap((level) => level.courses)
      .filter((course) => course.status === 'AVAILABLE').length;

    const hasActiveAssessment = path.assessments.some((row) => row.status === 'ACTIVE');

    const placedLearners = new Set(path.placements.map((row) => row.learnerId));

    return {
      id: path.id,
      key: path.key,
      name: path.name,
      description: path.description,
      skillOutcomes: path.skillOutcomes,
      typicalDurationMinutes: path.typicalDurationMinutes,
      displayOrder: path.displayOrder,
      status: path.status,
      levelCount: path.levels.length,
      placedCourseCount: levels.reduce((total, level) => total + level.courses.length, 0),
      unassignedCourseCount: unassignedCourses.length,
      assignedLearners: path.userPaths.length,
      hasActiveAssessment,
      hasDraftAssessment: path.assessments.some((row) => row.status === 'DRAFT'),
      levels,
      unassignedCourses,
      learners: {
        /* Assigned but not yet placed: the group a missing or unpublished
           assessment strands, and the one an administrator can unblock. */
        awaitingPlacement: path.userPaths.filter((row) => !placedLearners.has(row.userId)).length,
        active: path.userPaths.filter((row) => row.status === 'ACTIVE').length,
        completed: path.userPaths.filter((row) => row.status === 'COMPLETED').length,
      },
      blockers: pathBlockers({
        levelCount: path.levels.length,
        hasActiveAssessment,
        selectableCourses,
      }),
      selectableCourses,
      certificateCount: path._count.certificates,
      /* The same rule `remove()` enforces, reported before the choice rather
         than after it: anyone who was ever assigned this path, or holds a
         certificate naming it, makes deletion a falsification and unpublishing
         the operation. */
      canDelete: path.userPaths.length === 0 && path._count.certificates === 0,
    };
  }

  /**
   * How many learners have started each of this path's courses.
   *
   * Shown beside a move because §10 of the spec leaves the product question
   * open: their progress is kept — it lives in `completions`, keyed on the
   * course — and the administrator is told rather than asked.
   */
  private async startedCounts(pathId: string): Promise<Map<string, number>> {
    const rows = await this.prisma.enrollment.findMany({
      where: { course: { pathCourses: { some: { pathId } } } },
      select: { courseId: true },
    });

    const counts = new Map<string, number>();

    for (const row of rows) {
      counts.set(row.courseId, (counts.get(row.courseId) ?? 0) + 1);
    }

    return counts;
  }

  /**
   * Courses this path does not already contain (§4C.4's attach picker).
   *
   * Not the learner catalogue: an administrator attaching a course needs to see
   * drafts and hidden ones too — a draft attached now becomes reachable the
   * moment its entity publishes it and somebody places it — and needs to know
   * which organisation supplies each, which no learner-facing shape carries.
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
        ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}),
      },
      orderBy: { title: 'asc' },
      take: 50,
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
   * Creates a path. Always a draft.
   *
   * A new path has no levels, no assessment and no courses, so it is exactly
   * what `pathBlockers` refuses. Building the ladder and publishing are separate
   * deliberate steps for that reason.
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
        skillOutcomes: dto.skillOutcomes ?? [],
        typicalDurationMinutes: dto.typicalDurationMinutes ?? null,
        displayOrder: dto.displayOrder ?? (maxOrder._max.displayOrder ?? 0) + 1,
        status: 'DRAFT',
        /* TAM-147's gold-recommendation field, foreign to this D-134 creation
           flow — an admin building a ladder here has no RIASEC letter to
           give it. Neutral placeholder until §4C.4 grows a field for it. */
        riasecLetter: 'C',
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
      detail: { key },
    });

    return this.get(path.id);
  }

  /**
   * Edits a path, including whether it is published.
   *
   * Publication is the only field that can be refused, and it is refused for one
   * reason: a path a learner could not get anywhere in. Everything else — name,
   * description, outcomes, duration, order — is content the ministry owns.
   */
  async update(
    pathId: string,
    dto: UpdatePathDto,
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminPathDetail> {
    const current = await this.get(pathId);

    if (dto.status === 'PUBLISHED' && current.blockers.length > 0) {
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
        ...(dto.skillOutcomes === undefined ? {} : { skillOutcomes: dto.skillOutcomes }),
        ...(dto.typicalDurationMinutes === undefined
          ? {}
          : { typicalDurationMinutes: dto.typicalDurationMinutes }),
        ...(dto.displayOrder === undefined ? {} : { displayOrder: dto.displayOrder }),
        ...(dto.status === undefined ? {} : { status: dto.status }),
      },
    });

    await this.audit.record({
      action:
        dto.status === undefined
          ? AuditAction.ADMIN_PATH_UPDATED
          : dto.status === 'PUBLISHED'
            ? AuditAction.ADMIN_PATH_ACTIVATED
            : AuditAction.ADMIN_PATH_RETIRED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'path',
      targetId: pathId,
      detail: {
        fields: changedFields({ ...dto }),
        /* Recorded on an unpublish because it is the number that made the
           decision defensible: this many people are on it right now. */
        ...(dto.status === 'DRAFT' ? { assignedLearners: current.assignedLearners } : {}),
      },
    });

    return this.get(pathId);
  }

  /** Attaches a course to the path — unassigned, as every membership starts. */
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

    /* No level, no position. Even when an administrator is the one attaching,
       the course lands in the same place an entity's proposal does — the
       unassigned group — because putting it on a rung is a second, separate
       decision with its own endpoint (D-134). */
    await this.prisma.pathCourse.create({ data: { pathId, courseId: dto.courseId } });

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
   * Detaches a course from the path entirely.
   *
   * **Refused while a learner on this path is enrolled in it.** Their enrolment
   * and their progress survive either way — both are keyed on the course, not on
   * this join row — but the course would vanish from their ladder mid-way
   * through, which is §2's stranding rule in a different costume.
   *
   * A placed membership is detached freely otherwise: the position it vacates is
   * re-packed with the rest of its level.
   */
  async detachCourse(
    pathId: string,
    pathCourseId: string,
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminPathDetail> {
    const membership = await this.prisma.pathCourse.findFirst({
      where: { id: pathCourseId, pathId },
      select: { id: true, courseId: true, levelId: true },
    });

    if (!membership) {
      throw new NotFoundException('COURSE_NOT_IN_PATH');
    }

    const holders = await this.prisma.enrollment.count({
      where: { courseId: membership.courseId, user: { userPaths: { some: { pathId } } } },
    });

    if (holders > 0) {
      await this.audit.record({
        action: AuditAction.ADMIN_PATH_COURSE_DETACHED,
        outcome: 'FAILURE',
        actorUserId: actorId,
        ipAddress,
        targetType: 'path',
        targetId: pathId,
        reason: AuditReason.COURSE_HELD_BY_LEARNERS,
        detail: { courseId: membership.courseId, heldByLearners: holders },
      });

      throw new ConflictException('COURSE_HELD_BY_LEARNERS');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.pathCourse.delete({ where: { id: membership.id } });

      if (membership.levelId) {
        await repackLevel(tx, membership.levelId);
      }
    });

    await this.audit.record({
      action: AuditAction.ADMIN_PATH_COURSE_DETACHED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'path',
      targetId: pathId,
      detail: { courseId: membership.courseId },
    });

    return this.get(pathId);
  }

  /**
   * Deletes a path permanently — and only one nobody was ever assigned.
   *
   * **The refusal is the feature.** A path certificate names the path on a
   * credential somebody holds, and an assignment is the ministry's record of
   * having put a person on it; deleting either out from under them would falsify
   * a document or erase a decision. So anything with a `user_paths` row or a
   * certificate against it is refused here, and the administrator is pointed at
   * unpublishing, which takes the path out of new assignments and touches nobody
   * holding it.
   *
   * What remains deletable is the case unpublishing handles badly: the path
   * created by mistake. Hiding it leaves it in the management list forever,
   * where it is a permanent invitation to wonder what it was for.
   *
   * Levels, memberships and the assessment cascade; the courses themselves are
   * the LMS's and are not touched. The audit entry carries the key and name
   * rather than only the id, because after this returns there is no row left to
   * resolve an id against.
   */
  async remove(pathId: string, actorId: string, ipAddress: string | null): Promise<void> {
    const path = await this.prisma.path.findUnique({
      where: { id: pathId },
      select: {
        id: true,
        key: true,
        name: true,
        _count: { select: { userPaths: true, certificates: true } },
      },
    });

    if (!path) {
      throw new NotFoundException('PATH_NOT_FOUND');
    }

    if (path._count.userPaths > 0 || path._count.certificates > 0) {
      await this.audit.record({
        action: AuditAction.ADMIN_PATH_DELETED,
        outcome: 'FAILURE',
        actorUserId: actorId,
        ipAddress,
        targetType: 'path',
        targetId: pathId,
        reason: AuditReason.PATH_HELD_BY_LEARNERS,
        detail: {
          assignedLearners: path._count.userPaths,
          certificates: path._count.certificates,
        },
      });

      throw new ConflictException('PATH_HELD_BY_LEARNERS');
    }

    await this.prisma.path.delete({ where: { id: pathId } });

    await this.audit.record({
      action: AuditAction.ADMIN_PATH_DELETED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'path',
      targetId: pathId,
      detail: { key: path.key, name: path.name },
    });
  }

  private async requirePath(pathId: string): Promise<void> {
    const path = await this.prisma.path.findUnique({ where: { id: pathId }, select: { id: true } });

    if (!path) {
      throw new NotFoundException('PATH_NOT_FOUND');
    }
  }
}

/**
 * A position no real row occupies, used to park rows mid-shuffle.
 *
 * **Two passes, parked then final.** The unique index on `(level_id, position)`
 * refuses two rows in one slot even momentarily, so writing the final numbers
 * directly would collide the moment anything moves up the list. Parking the
 * whole set out of range first vacates it.
 *
 * Parked *above* the range rather than below it, because `position >= 1` is a
 * check constraint: negative parking numbers were the obvious trick and the
 * database refuses them, which is the constraint doing its job. The offset is
 * far beyond the DTO's 500-row cap, so a parked row can never collide with a
 * real one.
 */
const PARK = 10_000;

/** Re-packs one level's positions to `1 … n`, in their current order. */
async function repackLevel(tx: TransactionClient, levelId: string): Promise<void> {
  const rows = await tx.pathCourse.findMany({
    where: { levelId },
    orderBy: { position: 'asc' },
    select: { id: true },
  });

  for (const [index, row] of rows.entries()) {
    await tx.pathCourse.update({ where: { id: row.id }, data: { position: PARK + index } });
  }

  for (const [index, row] of rows.entries()) {
    await tx.pathCourse.update({ where: { id: row.id }, data: { position: index + 1 } });
  }
}

export { PARK, repackLevel };

/** The names of the fields a patch actually carries, for the audit detail. */
function changedFields(patch: Record<string, unknown>): string {
  return Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)
    .sort()
    .join(',');
}
