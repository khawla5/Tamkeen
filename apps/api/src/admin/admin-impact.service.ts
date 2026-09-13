import { Injectable } from '@nestjs/common';

import type {
  AdminImpactCourseRow,
  AdminImpactDepartmentRow,
  AdminImpactPathRow,
  AdminImpactPlacementShare,
  AdminImpactTrendPoint,
  AdminImpactView,
} from '@tamkeen/types';

import { PrismaService } from '../prisma/prisma.service';
import type { AdminImpactQueryDto } from './admin.dto';
import {
  bucketByMonth,
  monthKey,
  previousRangeOf,
  rangeToJson,
  resolveRange,
  spanOf,
  trailingMonths,
  withDelta,
  type ImpactRange,
} from './impact-period';

/** How many rows the "what they learnt" lists carry. */
const TOP_ROWS = 10;

/**
 * §4C.8's «الأثر» — participation and learning by period and department
 * (TAM-149).
 *
 * **Aggregation only.** Every column it reads exists already —
 * `users.created_at` / `email_verified_at`, `assessment_results.completed_at`,
 * `user_paths.confirmed_at`, `completions.completed_at` / `passed` /
 * `grade_percent`, `certificates.issued_at`, `courses.duration_minutes`,
 * `users.department` — and nothing here writes, caches or materialises. A report
 * is a question about the present; a stored one is a second copy of the truth
 * that goes stale, which is the same reasoning §4C.8's other tab is built on.
 *
 * **Every count is people, de-duplicated.** The participation figures are read
 * through `user` with a relation filter rather than by counting rows in the
 * child table, so a retake (D-033) is one assessed employee and six passed
 * courses are one active learner. Counting the child rows would have been
 * shorter and would have reported the enthusiastic twice.
 *
 * **The previous period is the same query, shifted.** `participationCounts` and
 * `learningTotals` each take a range and are called twice; there is no second
 * implementation that could drift from the first and quietly invent growth.
 */
@Injectable()
export class AdminImpactService {
  constructor(private readonly prisma: PrismaService) {}

  async view(query: AdminImpactQueryDto): Promise<AdminImpactView> {
    const period = resolveRange(query.from, query.to);
    const previous = previousRangeOf(period);
    const department = query.department ?? null;

    const [
      participation,
      previousParticipation,
      departments,
      learning,
      previousLearning,
      trend,
      topPaths,
      placements,
      rate,
      previousRate,
    ] = await Promise.all([
      this.participationCounts(period, department),
      this.participationCounts(previous, department),
      this.departmentsWithAccounts(department),
      this.learningTotals(period, department),
      this.learningTotals(previous, department),
      this.trend(period, department),
      this.topPaths(period, department),
      this.placementShare(period, department),
      this.participationRate(period.to, department),
      this.participationRate(previous.to, department),
    ]);

    return {
      period: rangeToJson(period),
      previousPeriod: rangeToJson(previous),
      department,
      participation: {
        registered: withDelta(
          participation.registered.length,
          previousParticipation.registered.length,
        ),
        assessed: withDelta(participation.assessed.length, previousParticipation.assessed.length),
        committed: withDelta(
          participation.committed.length,
          previousParticipation.committed.length,
        ),
        active: withDelta(participation.active.length, previousParticipation.active.length),
        participationRate: rate.rate,
        previousParticipationRate: previousRate.rate,
        accountsToDate: rate.accounts,
      },
      byDepartment: byDepartment(departments, participation),
      learning: {
        coursesPassed: withDelta(learning.coursesPassed, previousLearning.coursesPassed),
        learningMinutes: withDelta(learning.learningMinutes, previousLearning.learningMinutes),
        passesWithoutDuration: learning.passesWithoutDuration,
        certificatesCourse: withDelta(
          learning.certificatesCourse,
          previousLearning.certificatesCourse,
        ),
        certificatesPath: withDelta(learning.certificatesPath, previousLearning.certificatesPath),
      },
      trend,
      topCourses: learning.topCourses,
      topPaths,
      placements,
    };
  }

  /**
   * Who took part, as one row per person — carrying their department, so the
   * totals and the per-department table come from the same four reads rather
   * than from a second set of queries that could disagree with them.
   */
  private async participationCounts(
    range: ImpactRange,
    department: string | null,
  ): Promise<ParticipationRows> {
    const employee = this.employeeWhere(department);
    const within = between(range);

    const [registered, assessed, committed, active] = await Promise.all([
      /* Verified, not merely created: an unverified account cannot sign in
         (§4.1), so counting it as participation would overstate the reach of
         the programme by exactly the people who never arrived. */
      this.prisma.user.findMany({
        where: { ...employee, emailVerifiedAt: { not: null }, createdAt: within },
        select: { department: true },
      }),
      /* Placed in the period: the assessment ran and put them on a rung. That
         is the moment training actually starts for somebody, which is what this
         column is asking about. */
      this.prisma.user.findMany({
        where: { ...employee, placements: { some: { placedAt: within } } },
        select: { department: true },
      }),
      /* Assigned in the period. `assigned_at` is written only by an
         administrator's decision (D-130), so its presence *is* the assignment —
         no status check is needed, and one that read `status: ACTIVE` would drop
         everyone who has since finished. */
      this.prisma.user.findMany({
        where: { ...employee, userPaths: { some: { assignedAt: within } } },
        select: { department: true },
      }),
      /* "Active" is evidence of work, from either side of the sync: a course
         finished in the period, or one that first showed progress in it.
         `completions.synced_at` is deliberately not a signal — the scheduled
         job rewrites it for every enrolled learner on every run, so it would
         report the whole cohort as active every five minutes. */
      this.prisma.user.findMany({
        where: {
          ...employee,
          OR: [
            { completions: { some: { completedAt: within } } },
            /* Or enrolled in the period: with no per-learner course rows left
               (D-134), the enrolment is what records that somebody was put in
               front of a course at all. */
            { enrollments: { some: { enrolledAt: within } } },
          ],
        },
        select: { department: true },
      }),
    ]);

    return { registered, assessed, committed, active };
  }

  /**
   * The share of accounts the ministry has put on a path, as of an instant.
   *
   * **Cumulative, not per-period, and the tile says so.** A rate of "assigned
   * this quarter" over "registered this quarter" can exceed one hundred per
   * cent — someone who registered last year and was assigned this one is in the
   * numerator and not the denominator — so it would not be a rate at all.
   *
   * The denominator is *accounts*, not the ministry's headcount, which this
   * platform has no way of knowing. Null over an empty denominator, as
   * everywhere else: 0% of nobody reads as failure rather than as "nobody has
   * registered yet".
   */
  private async participationRate(
    asOf: Date,
    department: string | null,
  ): Promise<{ rate: number | null; accounts: number }> {
    const employee = this.employeeWhere(department);

    const [accounts, committed] = await Promise.all([
      this.prisma.user.count({
        where: { ...employee, emailVerifiedAt: { not: null }, createdAt: { lte: asOf } },
      }),
      this.prisma.user.count({
        where: { ...employee, userPaths: { some: { assignedAt: { lte: asOf } } } },
      }),
    ]);

    return { rate: accounts === 0 ? null : Math.round((committed / accounts) * 100), accounts };
  }

  /**
   * Every department that has an account, whether or not it took part.
   *
   * A directorate whose people did nothing this quarter is the finding the
   * table exists to surface, and a row that simply vanishes cannot be read as
   * a zero.
   */
  private async departmentsWithAccounts(department: string | null): Promise<string[]> {
    const rows = await this.prisma.user.groupBy({
      by: ['department'],
      where: this.employeeWhere(department),
    });

    return rows.map((row) => row.department).sort((a, b) => a.localeCompare(b, 'ar'));
  }

  /**
   * What was completed in the period.
   *
   * Called once for the period and once for the one before it; only the first
   * call's `topCourses` is used, which costs nothing and keeps "the previous
   * period" a shift of the same code rather than a parallel implementation.
   */
  private async learningTotals(
    range: ImpactRange,
    department: string | null,
  ): Promise<LearningTotals> {
    const [byCourse, certificates] = await Promise.all([
      this.prisma.completion.groupBy({
        by: ['moodleCourseId'],
        where: this.passedIn(range, department),
        _count: { _all: true },
        _avg: { gradePercent: true },
      }),
      this.prisma.certificate.groupBy({
        by: ['type'],
        where: { issuedAt: between(range), user: this.employeeWhere(department) },
        _count: { _all: true },
      }),
    ]);

    const courses = await this.prisma.course.findMany({
      where: { moodleCourseId: { in: byCourse.map((row) => row.moodleCourseId) } },
      select: { id: true, moodleCourseId: true, title: true, durationMinutes: true },
    });

    const byMoodleId = new Map(courses.map((course) => [course.moodleCourseId, course]));

    let coursesPassed = 0;
    let learningMinutes = 0;
    let passesWithoutDuration = 0;
    const topCourses: AdminImpactCourseRow[] = [];

    for (const row of byCourse) {
      const passes = row._count._all;
      const course = byMoodleId.get(row.moodleCourseId);

      coursesPassed += passes;

      /* The duration is a product field an entity may leave unset (D-035). An
         unset one contributes nothing rather than a guessed average — but it
         would then understate the total silently, so the passes it happened to
         are counted and the screen states them. */
      if (course?.durationMinutes) {
        learningMinutes += course.durationMinutes * passes;
      } else {
        passesWithoutDuration += passes;
      }

      /* A course the catalogue no longer holds still counted as learning above;
         it simply cannot be named in the list below. */
      if (course) {
        topCourses.push({
          courseId: course.id,
          title: course.title,
          passes,
          averageGrade: row._avg.gradePercent === null ? null : Math.round(row._avg.gradePercent),
        });
      }
    }

    const certificatesOf = (type: string) =>
      certificates.find((row) => row.type === type)?._count._all ?? 0;

    return {
      coursesPassed,
      learningMinutes,
      passesWithoutDuration,
      certificatesCourse: certificatesOf('COURSE'),
      certificatesPath: certificatesOf('PATH'),
      topCourses: topCourses
        .sort((a, b) => b.passes - a.passes || a.title.localeCompare(b.title, 'ar'))
        .slice(0, TOP_ROWS),
    };
  }

  /**
   * Paths finished in the period, by how many finished them.
   *
   * Read from the **path certificate** rather than from `user_paths.status`:
   * issuance is idempotent and happens the moment the last course is passed
   * (§5.5), so the certificate row is the only durable record of *when* a path
   * was completed — `user_paths` carries a status and an `updated_at` that any
   * later write moves.
   */
  private async topPaths(
    range: ImpactRange,
    department: string | null,
  ): Promise<AdminImpactPathRow[]> {
    const grouped = await this.prisma.certificate.groupBy({
      by: ['pathId'],
      where: { type: 'PATH', issuedAt: between(range), user: this.employeeWhere(department) },
      _count: { _all: true },
    });

    const pathIds = grouped
      .map((row) => row.pathId)
      .filter((pathId): pathId is string => pathId !== null);

    if (pathIds.length === 0) {
      return [];
    }

    const paths = await this.prisma.path.findMany({
      where: { id: { in: pathIds } },
      select: { id: true, name: true },
    });

    const byId = new Map(paths.map((path) => [path.id, path]));

    return grouped
      .flatMap((row) => {
        const path = row.pathId === null ? undefined : byId.get(row.pathId);
        return path
          ? [
              {
                pathId: path.id,
                name: path.name,
                completions: row._count._all,
              },
            ]
          : [];
      })
      .sort((a, b) => b.completions - a.completions || a.name.localeCompare(b.name, 'ar'))
      .slice(0, TOP_ROWS);
  }

  /**
   * The trailing twelve months, whatever period is selected.
   *
   * Anchored to the end of the period rather than to today, so a sheet printed
   * for last quarter keeps the trend as it stood then. Bucketed in memory from
   * two reads of dates: at ministry scale that is a few thousand timestamps,
   * and it keeps the month boundary the same local-time one the ranges use
   * rather than delegating it to the database's timezone.
   */
  private async trend(
    range: ImpactRange,
    department: string | null,
  ): Promise<AdminImpactTrendPoint[]> {
    const months = trailingMonths(range.to);
    const span = spanOf(months);

    const [passes, certificates] = await Promise.all([
      this.prisma.completion.findMany({
        where: this.passedIn(span, department),
        select: { completedAt: true, syncedAt: true },
      }),
      this.prisma.certificate.findMany({
        where: { issuedAt: between(span), user: this.employeeWhere(department) },
        select: { issuedAt: true },
      }),
    ]);

    const passedAt = bucketByMonth(
      passes.map((row) => row.completedAt ?? row.syncedAt),
      months,
    );
    const issuedAt = bucketByMonth(
      certificates.map((row) => row.issuedAt),
      months,
    );

    return months.map((month) => {
      const key = monthKey(month.from);
      return {
        month: key,
        coursesPassed: passedAt.get(key) ?? 0,
        certificates: issuedAt.get(key) ?? 0,
      };
    });
  }

  /**
   * The career types of the people assessed in the period.
   *
   * The **dominant letter**, exactly as §4C.1 reads it: six values each with an
   * Arabic name, rather than the thirty-odd Holland codes the reports tab keeps
   * for the analyst. One result per person — their newest *within the period* —
   * so a retake corrects rather than double-counts (D-033).
   *
   * All six letters always, including the ones nobody scored: a zero is a
   * finding, and a row that disappears cannot be compared against anything.
   */

  /**
   * Where the assessments placed people *in the period*.
   *
   * A fact about the period, like every other figure on this tab: how many
   * people were placed, and on which rungs. It replaces the career-type share,
   * which described inclination rather than capability.
   *
   * Empty when nobody was placed, which is a real finding rather than a gap —
   * a quarter in which no directorate sat an assessment is exactly what
   * management needs to see.
   */
  private async placementShare(
    range: ImpactRange,
    department: string | null,
<<<<<<< HEAD
  ): Promise<AdminImpactPlacementShare[]> {
    const placements = await this.prisma.learnerPlacement.groupBy({
      by: ['pathId', 'levelId'],
      where: { placedAt: between(range), learner: this.employeeWhere(department) },
      _count: { _all: true },
    });

    if (placements.length === 0) {
      return [];
=======
  ): Promise<AdminImpactLetterShare[]> {
    const newest = await this.prisma.assessmentResult.findMany({
      /* `kind: 'RIASEC'` (TAM-147): this table now also carries CEFR rows,
         whose `code` is null. Without the filter, a person's *newest* result
         within the period could be a CEFR attempt and `code` would be null
         here — the letter distribution is a Holland reading specifically, so
         it reads Holland rows specifically. */
      where: { kind: 'RIASEC', completedAt: between(range), user: this.employeeWhere(department) },
      distinct: ['userId'],
      orderBy: [{ userId: 'asc' }, { completedAt: 'desc' }],
      select: { code: true },
    });

    const employees = new Map<string, number>();
    for (const row of newest) {
      /* The code's first letter IS the dominant dimension: it is derived by
         ranking with ties already broken canonically (D-031), so reading it
         here cannot disagree with the profile the employee was shown. */
      const letter = row.code!.charAt(0);
      employees.set(letter, (employees.get(letter) ?? 0) + 1);
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

  /**
   * A pass that falls inside the period.
   *
   * `completed_at` is what Moodle reported and is the right date — but it can
   * legitimately be null on a course whose completion criteria carry no
   * timestamps (D-038), and a pass with no date would then belong to no period
   * at all and vanish from every report while still counting in the reports
   * tab's running total. So an undated pass is dated by when we recorded it.
   */
  private passedIn(range: ImpactRange, department: string | null) {
    return {
      passed: true,
      user: this.employeeWhere(department),
      OR: [{ completedAt: between(range) }, { completedAt: null, syncedAt: between(range) }],
    };
  }

  /**
   * The population every figure is about.
   *
   * Employees only: an administrator's or an entity contact's account is not
   * the ministry's workforce taking part in training, and counting them would
   * inflate the denominator of the participation rate by exactly the people the
   * programme is not for.
   */
  private employeeWhere(department: string | null) {
    return { role: 'EMPLOYEE' as const, ...(department === null ? {} : { department }) };
  }
}

interface ParticipationRows {
  registered: Array<{ department: string }>;
  assessed: Array<{ department: string }>;
  committed: Array<{ department: string }>;
  active: Array<{ department: string }>;
}

interface LearningTotals {
  coursesPassed: number;
  learningMinutes: number;
  passesWithoutDuration: number;
  certificatesCourse: number;
  certificatesPath: number;
  topCourses: AdminImpactCourseRow[];
}

/** Both ends inside, which is what the screen's two date inputs mean. */
function between(range: ImpactRange) {
  return { gte: range.from, lte: range.to };
}

/**
 * The four counts per department, from the rows already read.
 *
 * Tallied here rather than by four more grouped queries: the participation
 * reads already carry each person's department, and deriving the table from the
 * same rows is the only way the column totals cannot disagree with the tiles
 * above them.
 */
export function byDepartment(
  departments: readonly string[],
  rows: ParticipationRows,
): AdminImpactDepartmentRow[] {
  const tally = (people: Array<{ department: string }>) => {
    const counts = new Map<string, number>();
    for (const person of people) {
      counts.set(person.department, (counts.get(person.department) ?? 0) + 1);
    }
    return counts;
  };

  const registered = tally(rows.registered);
  const assessed = tally(rows.assessed);
  const committed = tally(rows.committed);
  const active = tally(rows.active);

  return departments.map((department) => ({
    department,
    registered: registered.get(department) ?? 0,
    assessed: assessed.get(department) ?? 0,
    committed: committed.get(department) ?? 0,
    active: active.get(department) ?? 0,
  }));
}
