import { randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import type {
  EntityAuthorLaunchView,
  EntityCourseContentView,
  EntityCourseDetail,
  EntityUnpublishResult,
} from '@tamkeen/types';

import { AuditAction, AuditReason } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import {
  effectiveCourseStatus,
  isWithinAvailabilityWindow,
  type CourseStatusValue,
} from '../catalog-sync/catalog-mapping';
import { CatalogSyncService } from '../catalog-sync/catalog-sync.service';
import { LMS_PORT, type LmsPort } from '../moodle/lms.port';
import { LmsOperationError, LmsUnavailableError } from '../moodle/lms.types';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { EntityScopeService, type EntityScope } from './entity-scope.service';
import { checkPathMembership, exceedsLimits } from './path-membership-rules';
import { publishBlockers } from './publish-readiness';

/** What §4B.3's metadata form can change. All optional — it patches. */
export interface CourseMetadataPatch {
  pathIds?: string[];
  durationMinutes?: number | null;
  objectives?: string[];
  prerequisites?: string | null;
  language?: 'AR' | 'EN';
}

/**
 * Creating and managing one entity's courses (§4B.3, Model 1).
 *
 * **The division of labour is the whole design.** The LMS owns the course
 * existing and everything inside it — lectures, materials, the quiz, its
 * questions — and an entity authors all of that *in Moodle*, arriving there
 * through the seamless handoff (D-046, D-060). This service owns only the
 * product layer Moodle has no field for: path membership, duration, objectives,
 * prerequisites, language, and the decision to publish.
 *
 * There is deliberately no method here that writes course content. Adding one
 * would begin rebuilding Moodle's authoring API behind a boundary built to hide
 * it.
 */
@Injectable()
export class EntityCourseManagementService {
  private readonly logger = new Logger(EntityCourseManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: EntityScopeService,
    private readonly catalogSync: CatalogSyncService,
    @Inject(LMS_PORT) private readonly lms: LmsPort,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Creates the course shell — **in the LMS first**, then in our catalogue.
   *
   * The order is not arbitrary. Our row mirrors an LMS course and is keyed on
   * `moodle_course_id`; writing ours first would mean either inventing an id or
   * leaving it null, and catalogue sync would withdraw the row on its next run
   * (D-060). If the LMS refuses, nothing is written here at all — a catalogue
   * entry pointing at no course is worse than a failed request.
   *
   * The course enters as a `DRAFT` owned by this entity, invisible to learners
   * until its metadata is complete and it is published (D-059).
   */
  async create(
    scope: EntityScope,
    input: { title: string; summary: string; language?: 'AR' | 'EN' },
    actorUserId: string,
    ipAddress: string | null,
  ): Promise<EntityCourseDetail> {
    if (scope.entityId === null) {
      /* A super-admin has no organisation to own the course. Course creation is
         an entity action; §4C.5 gives an admin oversight, not authorship. */
      throw new ConflictException('ENTITY_REQUIRED');
    }

    let lmsCourse;

    try {
      lmsCourse = await this.lms.createCourse({
        title: input.title,
        summary: input.summary,
        /* Random rather than derived from the title: Moodle rejects a duplicate
           shortname, and two entities naming a course the same thing is a
           collision waiting to happen rather than an error either could fix. */
        shortName: `tk-${randomBytes(6).toString('hex')}`,
      });
    } catch (error) {
      await this.audit.record({
        action: AuditAction.ENTITY_COURSE_CREATED,
        outcome: 'FAILURE',
        actorUserId,
        ipAddress,
        reason: AuditReason.LMS_COURSE_CREATE_FAILED,
        detail: { unavailable: error instanceof LmsUnavailableError },
      });

      this.logger.error(
        `Course creation failed for entity ${scope.entityId}: ${
          error instanceof LmsOperationError || error instanceof LmsUnavailableError
            ? error.message
            : 'unknown'
        }`,
      );

      throw new ConflictException('LMS_COURSE_CREATE_FAILED');
    }

    const course = await this.prisma.course.create({
      data: {
        moodleCourseId: lmsCourse.lmsCourseId,
        title: lmsCourse.title,
        summary: lmsCourse.summary,
        ownerEntityId: scope.entityId,
        publication: 'DRAFT',
        status: 'DRAFT',
        lmsVisible: lmsCourse.visible,
        lmsPresent: true,
        language: input.language ?? null,
        objectives: [],
        prerequisites: null,
        lastSyncedAt: new Date(),
      },
      select: { id: true },
    });

    await this.audit.record({
      action: AuditAction.ENTITY_COURSE_CREATED,
      outcome: 'SUCCESS',
      actorUserId,
      ipAddress,
      targetType: 'course',
      targetId: course.id,
      detail: { moodleCourseId: lmsCourse.lmsCourseId, entityId: scope.entityId },
    });

    /* Enrol the author now rather than at first launch. The launch endpoint
       enrols too — it has to, since a course may be created before Moodle is
       reachable — but doing it here means the common case is already correct
       and the handoff is a pure credential mint. Best-effort for the same
       reason enrolment is at path confirm (D-036): the course exists either
       way, and failing the request would misreport what actually happened. */
    await this.ensureAuthorEnrolment(actorUserId, lmsCourse.lmsCourseId).catch(() => undefined);

    return this.get(scope, course.id);
  }

  /**
   * One course, with everything §4B.3 and §4B.4 need to render.
   *
   * The LMS read-back is folded in here rather than left to a second request, so
   * the publish button and the reason it is disabled arrive together — a screen
   * that showed an enabled button and then refused would be worse than one that
   * explains itself up front.
   */
  async get(scope: EntityScope, courseId: string): Promise<EntityCourseDetail> {
    await this.scope.requireOwnedCourse(scope, courseId);

    const course = await this.prisma.course.findUniqueOrThrow({
      where: { id: courseId },
      select: {
        id: true,
        moodleCourseId: true,
        title: true,
        summary: true,
        durationMinutes: true,
        language: true,
        publication: true,
        status: true,
        objectives: true,
        prerequisites: true,
        pathCourses: {
          orderBy: { path: { displayOrder: 'asc' } },
          select: {
            levelId: true,
            path: { select: { id: true, name: true } },
            level: { select: { id: true, name: true, position: true } },
          },
        },
        _count: { select: { enrollments: true } },
      },
    });

    const content = await this.readContent(course.moodleCourseId);

    /* What an entity sees of its own membership (D-134): which paths it put the
       course in, and where the administrator has since placed it. `placement` is
       derived from the level being set or not, never stored. */
    const paths = course.pathCourses.map((entry) => ({
      id: entry.path.id,
      name: entry.path.name,
      placement: entry.levelId === null ? ('UNASSIGNED' as const) : ('PLACED' as const),
      level: entry.level,
    }));
    /* Only a placed membership gives a learner a route to the course, so only a
       placed one satisfies the publish gate. */
    const placed = paths.filter((path) => path.placement === 'PLACED');
    const limits = await this.membershipLimits();

    const availablePaths = await this.prisma.path.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { displayOrder: 'asc' },
      select: { id: true, name: true },
    });

    const stats = await this.enrolmentStats(course.id, course.moodleCourseId);

    return {
      id: course.id,
      moodleCourseId: course.moodleCourseId,
      title: course.title,
      summary: course.summary,
      durationMinutes: course.durationMinutes,
      language: course.language,
      publication: course.publication,
      status: course.status,
      paths,
      objectives: course.objectives,
      prerequisites: course.prerequisites,
      content,
      pathRules: {
        ...limits,
        frozen: exceedsLimits(paths, limits),
      },
      publishBlockers: publishBlockers({
        /* Membership alone is not a route to a learner any more: until an
           administrator places the course on a rung, nobody can see it. So the
           gate counts *placed* memberships, and a course sitting unassigned in
           three paths still says «لم يُسنَد بعد» rather than reporting itself
           ready (D-134). */
        pathCount: placed.length,
        language: course.language,
        objectives: course.objectives,
        durationMinutes: course.durationMinutes,
        content,
      }),
      learnersHolding: course._count.enrollments,
      availablePaths,
      enrolledCount: stats.enrolled,
      completionRate:
        stats.enrolled === 0 ? null : Math.round((stats.passed / stats.enrolled) * 100),
    };
  }

  /** §4B.4's read-back, tolerant of an LMS that will not answer. */
  async readContent(moodleCourseId: number): Promise<EntityCourseContentView | null> {
    try {
      const summary = await this.lms.getCourseContentSummary(moodleCourseId);

      return summary
        ? {
            activityCount: summary.activityCount,
            hasQuiz: summary.hasQuiz,
            completionConfigured: summary.completionConfigured,
          }
        : null;
    } catch (error) {
      /*
       * Null, not a thrown error. This is consulted to decide whether to allow a
       * publish, and the readiness rules treat null as `LMS_UNREACHABLE` — a
       * blocker. So an outage makes the manage screen render with an explained
       * refusal rather than an error page, and publishing stays refused, which
       * is the safe direction.
       */
      this.logger.warn(
        `Content read-back failed for LMS course ${moodleCourseId}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );

      return null;
    }
  }

  /**
   * Re-reads this one course from the LMS right now, rather than waiting for
   * the next scheduled catalogue sync (§4B.4, TAM-133).
   *
   * The gap this closes: title, description and visibility are a cached copy
   * refreshed only every `COMPLETION_SYNC_INTERVAL_MINUTES`, so a rename made
   * in the frame's Settings tab took minutes to appear anywhere in the
   * portal. This is the fast path the frame's own edit signal (and the
   * manual «تحديث») calls instead of waiting.
   *
   * Delegates the actual LMS read and upsert to `CatalogSyncService.syncOne`
   * — the same mapping the scheduled sync uses, so the two can never
   * describe the same course differently — and returns the full detail in
   * one response, exactly like every other write on this service, so the
   * page needs no second request to see title, status, the read-back and the
   * publish blockers together.
   */
  async resync(
    scope: EntityScope,
    courseId: string,
    actorUserId: string,
    ipAddress: string | null,
  ): Promise<EntityCourseDetail> {
    await this.scope.requireOwnedCourse(scope, courseId);

    const course = await this.prisma.course.findUniqueOrThrow({
      where: { id: courseId },
      select: { moodleCourseId: true },
    });

    try {
      await this.catalogSync.syncOne(course.moodleCourseId);
    } catch (error) {
      await this.audit.record({
        action: AuditAction.ENTITY_COURSE_RESYNCED,
        outcome: 'FAILURE',
        actorUserId,
        ipAddress,
        targetType: 'course',
        targetId: courseId,
        reason: AuditReason.LMS_COURSE_RESYNC_FAILED,
      });

      throw error;
    }

    await this.audit.record({
      action: AuditAction.ENTITY_COURSE_RESYNCED,
      outcome: 'SUCCESS',
      actorUserId,
      ipAddress,
      targetType: 'course',
      targetId: courseId,
    });

    return this.get(scope, courseId);
  }

  /**
   * The product metadata our app owns (§4B.3, D-035, D-039).
   *
   * A patch, not a replace: the form saves one section at a time, and a PUT
   * would silently clear whatever the caller did not resend.
   *
   * `path_courses` is rewritten wholesale when `pathIds` is supplied, because it
   * *is* the value being edited — but only then. Note what this cannot touch:
   * title, summary and the LMS's flags, which belong to Moodle and arrive
   * through sync (D-040 rule 3).
   */
  async updateMetadata(
    scope: EntityScope,
    courseId: string,
    patch: CourseMetadataPatch,
    actorUserId: string,
    ipAddress: string | null,
  ): Promise<EntityCourseDetail> {
    await this.scope.requireOwnedCourse(scope, courseId);

    if (patch.pathIds) {
      await this.replacePathMembership(scope, courseId, patch.pathIds);
    }

    await this.prisma.course.update({
      where: { id: courseId },
      data: {
        ...(patch.durationMinutes !== undefined ? { durationMinutes: patch.durationMinutes } : {}),
        ...(patch.objectives !== undefined
          ? { objectives: patch.objectives.map((line) => line.trim()).filter(Boolean) }
          : {}),
        ...(patch.prerequisites !== undefined
          ? { prerequisites: patch.prerequisites?.trim() || null }
          : {}),
        ...(patch.language !== undefined ? { language: patch.language } : {}),
      },
    });

    await this.audit.record({
      action: AuditAction.ENTITY_COURSE_METADATA_UPDATED,
      outcome: 'SUCCESS',
      actorUserId,
      ipAddress,
      targetType: 'course',
      targetId: courseId,
      /* Which fields changed, never their values — an audit log is not a copy of
         the data (§6 PII discipline). */
      /* Joined rather than nested: `AuditEntry.detail` is scalar-only by design,
         so the trail stays queryable and cannot grow a structure that hides PII
         inside it. */
      detail: { fields: Object.keys(patch).sort().join(',') },
    });

    /* Publication is unchanged, but the *derived* status may not be: a course
       already published whose metadata changed still resolves through the same
       function, so nothing drifts. */
    await this.recomputeStatus(courseId);

    return this.get(scope, courseId);
  }

  private async membershipLimits(): Promise<{ maxPaths: number }> {
    return { maxPaths: await this.settings.get('COURSE_MAX_PATHS') };
  }

  /**
   * The entity's half of membership (D-134): which paths it offers this course
   * to.
   *
   * **It never writes a level or a position.** Where a course sits in a path is
   * the administrator's decision and this method has no vocabulary for it — the
   * DTO refuses the two field names outright, and the writes below name neither.
   *
   * **An entity may withdraw only what nobody has placed.** Once a course is on
   * a rung it is part of a curriculum somebody may be working through, so
   * removing it is an administrative act (§4C.4), refused here with its own code
   * rather than silently ignored.
   */
  private async replacePathMembership(
    scope: EntityScope,
    courseId: string,
    pathIds: string[],
  ): Promise<void> {
    const unique = [...new Set(pathIds)];

    const known = await this.prisma.path.findMany({
      where: { id: { in: unique }, status: 'PUBLISHED' },
      select: { id: true },
    });

    if (known.length !== unique.length) {
      /* An unknown or unpublished path id is a client error, not something to
         silently drop — dropping it would leave the entity believing the course
         is in a path it is not, and the publish gate would then pass or fail for
         a reason they cannot see. */
      throw new NotFoundException('PATH_NOT_FOUND');
    }

    /* The rules (TAM-141, D-134): the cap, and grandfathering for a course
       already over it — decided by the pure module, on the rows as they are. */
    const [current, limits] = await Promise.all([
      this.prisma.pathCourse.findMany({
        where: { courseId },
        select: { pathId: true, levelId: true },
      }),
      this.membershipLimits(),
    ]);

    const verdict = checkPathMembership({
      current: current.map((row) => ({ id: row.pathId })),
      next: known.map((path) => ({ id: path.id })),
      limits,
    });

    if (!verdict.ok) {
      throw new BadRequestException(verdict.error);
    }

    const removing = current.filter((row) => !unique.includes(row.pathId));

    if (removing.some((row) => row.levelId !== null)) {
      throw new BadRequestException(AuditReason.MEMBERSHIP_ALREADY_PLACED);
    }

    await this.prisma.$transaction([
      this.prisma.pathCourse.deleteMany({
        where: { courseId, pathId: { notIn: unique }, levelId: null },
      }),
      ...known.map((path) =>
        this.prisma.pathCourse.upsert({
          where: { pathId_courseId: { pathId: path.id, courseId } },
          /* Unassigned, always: a new membership is an offer, and where it goes
             is the administrator's to decide (D-134). */
          create: { pathId: path.id, courseId, assignedByEntityId: scope.entityId },
          /* Placement is not this form's business, so an existing membership
             keeps the rung — and the position — it already had. */
          update: {},
        }),
      ),
    ]);
  }

  /**
   * Publishes into the learner catalogue (§4A's bridge, D-059).
   *
   * **Refused, not warned, when the course is not fit** (D-061). The blockers
   * are re-derived here rather than trusted from whatever the screen last
   * showed: the LMS may have changed under it, and a gate that believed the
   * client would be no gate at all.
   */
  async publish(
    scope: EntityScope,
    courseId: string,
    actorUserId: string,
    ipAddress: string | null,
  ): Promise<EntityCourseDetail> {
    const detail = await this.get(scope, courseId);

    if (detail.publishBlockers.length > 0) {
      await this.audit.record({
        action: AuditAction.ENTITY_COURSE_PUBLISHED,
        outcome: 'FAILURE',
        actorUserId,
        ipAddress,
        targetType: 'course',
        targetId: courseId,
        reason: AuditReason.COURSE_NOT_PUBLISHABLE,
        detail: { blockers: detail.publishBlockers.join(',') },
      });

      /*
       * `message` carries the code, as every other thrown error in this API
       * does — the web client reads exactly that field to look up Arabic copy
       * (D-024), so an object shaped any other way would surface as
       * "UNKNOWN_ERROR" to the user. `blockers` rides alongside it.
       */
      throw new ConflictException({
        message: 'COURSE_NOT_PUBLISHABLE',
        blockers: detail.publishBlockers,
      });
    }

    /*
     * Set once, on the first publish. Re-publishing after a withdrawal keeps the
     * original date, which is what "published since" means to anyone reading it.
     *
     * The condition is `publishedAt is null`, not `publication === 'DRAFT'`,
     * because those are not the same question. A course withdrawn before it was
     * ever published sits at UNPUBLISHED with no date, and testing the
     * publication would have left it dateless for good — published, with nothing
     * saying since when. The column already records whether a first publish has
     * happened, so it is the thing to ask.
     */
    const current = await this.prisma.course.findUniqueOrThrow({
      where: { id: courseId },
      select: { publishedAt: true },
    });

    await this.prisma.course.update({
      where: { id: courseId },
      data: {
        publication: 'PUBLISHED',
        publishedAt: current.publishedAt ?? new Date(),
      },
    });

    await this.recomputeStatus(courseId);

    await this.audit.record({
      action: AuditAction.ENTITY_COURSE_PUBLISHED,
      outcome: 'SUCCESS',
      actorUserId,
      ipAddress,
      targetType: 'course',
      targetId: courseId,
    });

    return this.get(scope, courseId);
  }

  /**
   * Withdraws a course from *new* selections (§2, D-015, D-059).
   *
   * **It can never strand a learner, and not because of a check here.** The
   * derived status does it: `effectiveCourseStatus` resolves an unpublished
   * course that anyone holds to `HIDDEN_BUT_COMPLETABLE` rather than `RETIRED`,
   * so the forbidden state is not expressible. There is no branch below that
   * could be forgotten.
   *
   * What this *does* owe the entity is honesty about the outcome, which is why
   * it returns the resulting status and the number of learners still holding the
   * course. Silently degrading the request would leave them believing a course
   * was withdrawn when learners can still take it.
   *
   * Deletion is not offered anywhere in this portal.
   */
  async unpublish(
    scope: EntityScope,
    courseId: string,
    actorUserId: string,
    ipAddress: string | null,
  ): Promise<EntityUnpublishResult> {
    await this.scope.requireOwnedCourse(scope, courseId);

    await this.prisma.course.update({
      where: { id: courseId },
      data: { publication: 'UNPUBLISHED' },
    });

    const { status, learnersHolding } = await this.recomputeStatus(courseId);

    await this.audit.record({
      action: AuditAction.ENTITY_COURSE_UNPUBLISHED,
      outcome: 'SUCCESS',
      actorUserId,
      ipAddress,
      targetType: 'course',
      targetId: courseId,
      /* The resulting status is the interesting part: a withdrawal that had to
         stay completable is a different event from one that retired outright. */
      detail: { status, learnersHolding },
    });

    return { publication: 'UNPUBLISHED', status, learnersHolding };
  }

  /**
   * Hands the entity into Moodle to author this course (§4B.3, §4B.4, D-060).
   *
   * Reuses the learner handoff **unchanged**. The token still binds one user and
   * one course, so an authoring launch grants exactly what a learner launch
   * grants — to someone who additionally holds the editing capability, which the
   * enrolment below is what confers. Widening the token to carry a target would
   * have turned a reviewed credential into an unreviewed one, and would have
   * enlarged the custom-PHP surface still awaiting ministry approval (D-044).
   *
   * The entity lands on the course page and uses Moodle's own Edit mode.
   *
   * Minted per click, never rendered into a page: it carries a live credential
   * whose short life must start when it is actually used (D-045).
   */
  async authorLaunch(
    scope: EntityScope,
    courseId: string,
    actorUserId: string,
    ipAddress: string | null,
    options: { embed: boolean } = { embed: false },
  ): Promise<EntityAuthorLaunchView> {
    await this.scope.requireOwnedCourse(scope, courseId);

    const course = await this.prisma.course.findUniqueOrThrow({
      where: { id: courseId },
      select: { moodleCourseId: true },
    });

    const moodleUserId = await this.ensureAuthorEnrolment(actorUserId, course.moodleCourseId);

    if (moodleUserId === null) {
      await this.audit.record({
        action: AuditAction.ENTITY_COURSE_AUTHOR_LAUNCHED,
        outcome: 'FAILURE',
        actorUserId,
        ipAddress,
        targetType: 'course',
        targetId: courseId,
      });

      throw new ConflictException('LMS_UNAVAILABLE');
    }

    await this.audit.record({
      action: AuditAction.ENTITY_COURSE_AUTHOR_LAUNCHED,
      outcome: 'SUCCESS',
      actorUserId,
      ipAddress,
      targetType: 'course',
      targetId: courseId,
    });

    /* TAM-129: framed by the portal, or the full-page handoff. Same credential,
       same audit entry either way — only the presentation differs. */
    return options.embed
      ? {
          url: this.lms.courseLaunchUrl(moodleUserId, course.moodleCourseId, { embed: 'author' }),
          mode: 'embed',
        }
      : { url: this.lms.courseLaunchUrl(moodleUserId, course.moodleCourseId), mode: 'handoff' };
  }

  /**
   * Provisions the entity's LMS account if needed and enrols it as an author.
   *
   * Lazy, exactly as learner provisioning is (D-036): the account is created at
   * the first moment one is genuinely needed. Returns null when the LMS could
   * not be reached, so the caller decides what that means rather than having an
   * exception decide for it.
   */
  private async ensureAuthorEnrolment(
    actorUserId: string,
    moodleCourseId: number,
  ): Promise<number | null> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: actorUserId },
      select: { id: true, email: true, fullName: true, moodleUserId: true },
    });

    try {
      let moodleUserId = user.moodleUserId;

      if (moodleUserId === null) {
        const reference = await this.lms.provisionUser({
          email: user.email,
          fullName: user.fullName,
          externalUserId: user.id,
        });

        moodleUserId = reference.lmsUserId;

        await this.prisma.user.update({
          where: { id: user.id },
          data: { moodleUserId },
        });
      }

      await this.lms.enrol({
        lmsUserId: moodleUserId,
        lmsCourseId: moodleCourseId,
        role: 'AUTHOR',
      });

      return moodleUserId;
    } catch (error) {
      this.logger.error(
        `Author enrolment failed for user ${actorUserId} in LMS course ${moodleCourseId}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );

      return null;
    }
  }

  /**
   * Rewrites `status` from the current inputs (D-059).
   *
   * Called after anything that changes `publication` or path membership.
   * Nothing assigns `status` directly — every writer goes through
   * `effectiveCourseStatus`, which is what keeps the sync job and the entity
   * portal from disagreeing about what a given combination means.
   */
  private async recomputeStatus(
    courseId: string,
  ): Promise<{ status: CourseStatusValue; learnersHolding: number }> {
    const course = await this.prisma.course.findUniqueOrThrow({
      where: { id: courseId },
      select: {
        publication: true,
        lmsPresent: true,
        lmsVisible: true,
        availableFrom: true,
        availableUntil: true,
        _count: { select: { enrollments: true } },
      },
    });

    const learnersHolding = course._count.enrollments;

    const status = effectiveCourseStatus({
      publication: course.publication,
      lmsPresent: course.lmsPresent,
      lmsVisible: course.lmsVisible,
      heldByAnyLearner: learnersHolding > 0,
      /* The window is the administrator's (§4C.5); an entity neither sets it nor
         escapes it, so publishing inside a closed window leaves the course
         hidden and the derivation says so rather than the publish silently
         doing nothing. */
      withinAvailabilityWindow: isWithinAvailabilityWindow(
        { availableFrom: course.availableFrom, availableUntil: course.availableUntil },
        new Date(),
      ),
    });

    await this.prisma.course.update({ where: { id: courseId }, data: { status } });

    return { status, learnersHolding };
  }

  /** Enrolled and passed counts for one course. See the list service for why
   *  passing is read from `completions` rather than from the course status. */
  private async enrolmentStats(
    courseId: string,
    moodleCourseId: number,
  ): Promise<{ enrolled: number; passed: number }> {
    const holders = await this.prisma.enrollment.findMany({
      where: { courseId },
      select: { userId: true },
    });

    if (holders.length === 0) {
      return { enrolled: 0, passed: 0 };
    }

    const passed = await this.prisma.completion.count({
      where: {
        moodleCourseId,
        passed: true,
        userId: { in: holders.map((row) => row.userId) },
      },
    });

    return { enrolled: holders.length, passed };
  }
}
