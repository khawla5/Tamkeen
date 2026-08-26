import { Injectable, Logger } from '@nestjs/common';

import { AuditAction } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  effectiveCourseStatus,
  isWithinAvailabilityWindow,
  type CoursePublicationValue,
} from './catalog-mapping';

/**
 * Makes a course's status catch up with its availability window (§4C.5,
 * TAM-134).
 *
 * **The ministry asked for a course to become hidden by itself once its
 * availability period ends, and this is the "by itself".** The window is an
 * input to `effectiveCourseStatus` like the LMS's own flags, so nothing here
 * decides anything — it re-runs the one derivation for the courses whose answer
 * can have changed since it last ran, and writes the result.
 *
 * **Only courses that have a window are read.** A course with neither bound can
 * never change status because of one, so scanning the whole catalogue every few
 * minutes would be work with a known answer. The `available_until` index makes
 * that selection cheap.
 *
 * **The lag is one sync interval, and it is deliberate.** An expired course is
 * hidden by the next run rather than at the stroke of the second, which is the
 * same latency §5.5 already accepts for completion — and it is why the admin
 * screen recomputes immediately when the dates are *saved*: the case an
 * administrator watches is the one they just typed, and waiting five minutes to
 * see it take effect would read as the save having failed.
 */
@Injectable()
export class CourseAvailabilityService {
  private readonly logger = new Logger(CourseAvailabilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async refresh(now: Date = new Date()): Promise<{ scanned: number; changed: number }> {
    const candidates = await this.prisma.course.findMany({
      where: {
        OR: [{ availableFrom: { not: null } }, { availableUntil: { not: null } }],
      },
      select: {
        id: true,
        title: true,
        status: true,
        publication: true,
        lmsPresent: true,
        lmsVisible: true,
        availableFrom: true,
        availableUntil: true,
        _count: { select: { userPathCourses: true } },
      },
    });

    let changed = 0;

    for (const course of candidates) {
      const status = effectiveCourseStatus({
        publication: course.publication as CoursePublicationValue,
        lmsPresent: course.lmsPresent,
        lmsVisible: course.lmsVisible,
        heldByAnyLearner: course._count.userPathCourses > 0,
        withinAvailabilityWindow: isWithinAvailabilityWindow(
          { availableFrom: course.availableFrom, availableUntil: course.availableUntil },
          now,
        ),
      });

      if (status === course.status) {
        continue;
      }

      /* `updateMany` so a course deleted between the read and the write matches
         nothing rather than throwing — a reconciliation pass that dies because
         the world moved underneath it is reconciling badly. */
      await this.prisma.course.updateMany({ where: { id: course.id }, data: { status } });

      changed += 1;

      await this.audit.record({
        action: AuditAction.COURSE_AVAILABILITY_APPLIED,
        outcome: 'SUCCESS',
        /* Nobody's action: the clock reached a date somebody set earlier, and
           the entry that set it is already in the trail. */
        actorUserId: null,
        ipAddress: null,
        targetType: 'course',
        targetId: course.id,
        detail: { from: course.status, to: status },
      });
    }

    if (changed > 0) {
      this.logger.log(`Availability window: ${changed} of ${candidates.length} courses restated`);
    }

    return { scanned: candidates.length, changed };
  }
}
