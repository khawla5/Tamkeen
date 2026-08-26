import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { courseStatusesFor, type AdminCoursePage, type AdminCourseRow } from '@tamkeen/types';

import { AuditAction, AuditReason } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import {
  availabilityDay,
  availabilityWindowFrom,
  availabilityWindowUntil,
  effectiveCourseStatus,
  isCalendarDay,
  isWithinAvailabilityWindow,
  type CoursePublicationValue,
} from '../catalog-sync/catalog-mapping';
import { LmsUnavailableError } from '../moodle/lms.types';
import { LMS_PORT, type LmsPort } from '../moodle/lms.port';
import { PrismaService } from '../prisma/prisma.service';
import { isForeignKeyViolation } from './prisma-errors';
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
    @Inject(LMS_PORT) private readonly lms: LmsPort,
  ) {}

  async list(query: AdminCourseQueryDto): Promise<AdminCoursePage> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const where = {
      ...(query.publication ? { publication: query.publication } : {}),
      /*
       * The administrator's two words, resolved to the statuses they cover
       * (§4C.5). `courseStatusesFor` is the same mapping the badge renders
       * with — filtering on a second, hand-written list here is how a query
       * comes to return rows the badge contradicts.
       */
      ...(query.visibility ? { status: { in: courseStatusesFor(query.visibility) } } : {}),
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

    const facts = await this.courseFacts(rows);

    return {
      rows: rows.map((row) => toRow(row, facts.get(row.id) ?? EMPTY_FACTS)),
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

    const facts = await this.courseFacts([course]);

    return toRow(course, facts.get(courseId) ?? EMPTY_FACTS);
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
      select: {
        id: true,
        moodleCourseId: true,
        publication: true,
        lmsPresent: true,
        lmsVisible: true,
        availableFrom: true,
        availableUntil: true,
      },
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
    const facts = await this.courseFacts([course]);

    /*
     * The window as it will be *after* this write, not as it was before it.
     *
     * `undefined` means the administrator did not touch that bound and `null`
     * means they cleared it, so the two cannot be collapsed — and the status
     * below has to be derived from the new window or a course closed by today's
     * date would stay AVAILABLE until the next sync run, which is exactly the
     * lag the immediate recompute exists to remove.
     */
    for (const day of [dto.availableFrom, dto.availableUntil]) {
      if (typeof day === 'string' && !isCalendarDay(day)) {
        /* Shape passed the DTO; the calendar decides the rest. Refused here
           rather than turned into an Invalid Date the database reports in its
           own words. */
        throw new ConflictException('COURSE_AVAILABILITY_WINDOW_INVALID');
      }
    }

    const availableFrom =
      dto.availableFrom === undefined
        ? course.availableFrom
        : availabilityWindowFrom(dto.availableFrom);
    const availableUntil =
      dto.availableUntil === undefined
        ? course.availableUntil
        : availabilityWindowUntil(dto.availableUntil);

    if (availableFrom !== null && availableUntil !== null && availableFrom > availableUntil) {
      /* A window that ends before it starts is never open, so a course given one
         would vanish with no visible reason. Refused rather than stored. */
      throw new ConflictException('COURSE_AVAILABILITY_WINDOW_INVALID');
    }

    const status = effectiveCourseStatus({
      publication,
      lmsPresent: course.lmsPresent,
      lmsVisible: course.lmsVisible,
      heldByAnyLearner: (facts.get(courseId)?.heldByLearners ?? 0) > 0,
      withinAvailabilityWindow: isWithinAvailabilityWindow(
        { availableFrom, availableUntil },
        new Date(),
      ),
    });

    await this.prisma.course.update({
      where: { id: courseId },
      data: {
        ...(dto.publication === undefined ? {} : { publication: dto.publication }),
        ...(dto.ownerEntityId === undefined ? {} : { ownerEntityId: dto.ownerEntityId }),
        ...(dto.availableFrom === undefined ? {} : { availableFrom }),
        ...(dto.availableUntil === undefined ? {} : { availableUntil }),
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

  /**
   * Deletes a course permanently — from the LMS and from the catalogue (§4C.5).
   *
   * **Hiding and deleting are different decisions, and this is the one that
   * cannot be undone.** Hiding is `intervene({ publication: 'UNPUBLISHED' })`:
   * reversible, and it leaves anybody mid-course able to finish. This removes
   * the course from Moodle and then removes our row, and what it refuses is what
   * makes it safe to offer — anything a learner has ever selected, anything a
   * certificate names, anything with a completion behind it. A course a learner
   * holds is protected by §2/D-015; a course a certificate names would falsify a
   * credential somebody is holding; and a completion outliving its course would
   * leave a learner's own history pointing at something the catalogue can no
   * longer name.
   *
   * What remains deletable is the case hiding handles badly: the course created
   * by mistake, the duplicate, the test course nobody ever took. Hidden, it sits
   * in the oversight list forever as a permanent invitation to wonder what it
   * was for.
   *
   * **The LMS first, our row second, and the order is load-bearing.** Our
   * `courses` row is a mirror of what the LMS holds (§1), so deleting only our
   * side would have the next catalogue sync rediscover the course and re-enter
   * it as an unowned draft. If the LMS refuses — most likely because the
   * integration role has not been granted `moodle/course:delete` — nothing is
   * deleted here either, and the administrator gets a refusal rather than a
   * catalogue and an LMS that disagree.
   */
  async remove(courseId: string, actorId: string, ipAddress: string | null): Promise<void> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, moodleCourseId: true, title: true },
    });

    if (!course) {
      throw new NotFoundException('COURSE_NOT_FOUND');
    }

    const facts = (await this.courseFacts([course])).get(courseId) ?? EMPTY_FACTS;

    if (!canDelete(facts)) {
      await this.audit.record({
        action: AuditAction.ADMIN_COURSE_DELETED,
        outcome: 'FAILURE',
        actorUserId: actorId,
        ipAddress,
        targetType: 'course',
        targetId: courseId,
        reason: AuditReason.COURSE_HELD_BY_LEARNERS,
        detail: {
          learners: facts.heldByLearners,
          certificates: facts.certificatesIssued,
          completions: facts.completions,
        },
      });

      throw new ConflictException('COURSE_IN_USE');
    }

    try {
      await this.lms.deleteCourse(course.moodleCourseId);
    } catch (error) {
      await this.audit.record({
        action: AuditAction.ADMIN_COURSE_DELETED,
        outcome: 'FAILURE',
        actorUserId: actorId,
        ipAddress,
        targetType: 'course',
        targetId: courseId,
        reason: AuditReason.LMS_COURSE_DELETE_FAILED,
        detail: { moodleCourseId: course.moodleCourseId },
      });

      /* Told apart deliberately: an LMS that is down is a "try again shortly",
         while a rejection is a capability the integration role does not have and
         retrying will never fix. */
      throw new ConflictException(
        error instanceof LmsUnavailableError ? 'LMS_UNAVAILABLE' : 'COURSE_LMS_DELETE_FAILED',
      );
    }

    try {
      await this.prisma.course.delete({ where: { id: courseId } });
    } catch (error) {
      /*
       * The checks above and this delete are separate statements, and a learner
       * can select the course in between. `Restrict` on `user_path_courses` and
       * on `certificates` is what actually stops it; this turns the foreign-key
       * violation into the same refusal the check would have given, so the race
       * reads as a sentence rather than as a 500.
       *
       * The LMS course is gone by this point, which the next sync run reports as
       * `lmsPresent: false` — the course becomes HIDDEN_BUT_COMPLETABLE for the
       * learner who won the race, which is the outcome §2/D-015 asks for.
       */
      if (isForeignKeyViolation(error)) {
        await this.audit.record({
          action: AuditAction.ADMIN_COURSE_DELETED,
          outcome: 'FAILURE',
          actorUserId: actorId,
          ipAddress,
          targetType: 'course',
          targetId: courseId,
          reason: AuditReason.COURSE_HELD_BY_LEARNERS,
          detail: { race: 'true', moodleCourseId: course.moodleCourseId },
        });

        throw new ConflictException('COURSE_IN_USE');
      }

      throw error;
    }

    await this.audit.record({
      action: AuditAction.ADMIN_COURSE_DELETED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'course',
      targetId: courseId,
      /* Named, not merely identified: after this returns there is no row left
         for the id to resolve against. */
      detail: { title: course.title, moodleCourseId: course.moodleCourseId },
    });
  }

  /**
   * What each course is *held by* — the three facts that decide both the held
   * count on the row and whether the course may be deleted at all.
   *
   * Gathered in one place for the whole page rather than per row: three grouped
   * queries for twenty-five courses, instead of seventy-five.
   *
   * **Completions are counted by `moodle_course_id`, not by our row id**, and
   * that is not an inconsistency. `completions` is keyed on the LMS course (§6)
   * precisely so a shared course is never re-taken, and it has no foreign key to
   * `courses` — so deleting the row would leave a learner's completion history
   * pointing at a course the catalogue can no longer name. The database will not
   * stop that; this count is what does.
   */
  private async courseFacts(
    rows: ReadonlyArray<{ id: string; moodleCourseId: number }>,
  ): Promise<Map<string, CourseFacts>> {
    if (rows.length === 0) {
      return new Map();
    }

    const courseIds = rows.map((row) => row.id);
    const moodleCourseIds = rows.map((row) => row.moodleCourseId);

    const [held, certificates, completions] = await Promise.all([
      this.prisma.userPathCourse.groupBy({
        by: ['courseId'],
        where: { courseId: { in: courseIds } },
        _count: { _all: true },
      }),
      this.prisma.certificate.groupBy({
        by: ['courseId'],
        where: { courseId: { in: courseIds } },
        _count: { _all: true },
      }),
      this.prisma.completion.groupBy({
        by: ['moodleCourseId'],
        where: { moodleCourseId: { in: moodleCourseIds } },
        _count: { _all: true },
      }),
    ]);

    const heldBy = new Map(held.map((row) => [row.courseId, row._count._all]));
    const certificatesBy = new Map(
      certificates
        .filter((row): row is typeof row & { courseId: string } => row.courseId !== null)
        .map((row) => [row.courseId, row._count._all]),
    );
    const completionsBy = new Map(completions.map((row) => [row.moodleCourseId, row._count._all]));

    return new Map(
      rows.map((row) => [
        row.id,
        {
          heldByLearners: heldBy.get(row.id) ?? 0,
          certificatesIssued: certificatesBy.get(row.id) ?? 0,
          completions: completionsBy.get(row.moodleCourseId) ?? 0,
        },
      ]),
    );
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
  availableFrom: true,
  availableUntil: true,
  publishedAt: true,
  lastSyncedAt: true,
  ownerEntity: { select: { name: true } },
  pathCourses: { select: { path: { select: { id: true, name: true } } } },
} as const;

/** The three facts that decide whether a course may be deleted (§4C.5). */
interface CourseFacts {
  heldByLearners: number;
  certificatesIssued: number;
  completions: number;
}

const EMPTY_FACTS: CourseFacts = { heldByLearners: 0, certificatesIssued: 0, completions: 0 };

/**
 * One rule for deletability, read by the row the screen renders and by the
 * endpoint that acts on it.
 *
 * Written once so the button and the refusal cannot disagree — the failure mode
 * being a delete offered by the screen and refused by the server, which reads to
 * an administrator as a broken product rather than as a protected course.
 */
function canDelete(facts: CourseFacts): boolean {
  return facts.heldByLearners === 0 && facts.certificatesIssued === 0 && facts.completions === 0;
}

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
    availableFrom: Date | null;
    availableUntil: Date | null;
    publishedAt: Date | null;
    lastSyncedAt: Date | null;
    ownerEntity: { name: string } | null;
    pathCourses: Array<{ path: { id: string; name: string } }>;
  },
  facts: CourseFacts,
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
    heldByLearners: facts.heldByLearners,
    certificatesIssued: facts.certificatesIssued,
    canDelete: canDelete(facts),
    availableFrom: availabilityDay(course.availableFrom),
    availableUntil: availabilityDay(course.availableUntil),
    publishedAt: course.publishedAt?.toISOString() ?? null,
    lastSyncedAt: course.lastSyncedAt?.toISOString() ?? null,
  };
}
