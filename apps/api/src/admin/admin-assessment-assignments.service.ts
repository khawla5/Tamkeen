import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type { AdminAssessmentAssignmentRow, AdminAssessmentGroupRow } from '@tamkeen/types';

import { AuditAction } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateAssessmentAssignmentDto,
  SaveAssessmentGroupDto,
  UpdateAssessmentAssignmentDto,
} from './admin.dto';

/**
 * §4C.3's Assignments tab — who is handed which instrument (TAM-147).
 *
 * **This writes the rule, never the outcome.** `assessment_assignments` and
 * `assessment_groups` are read live by `AssessmentAssignmentResolutionService`
 * on every dashboard load; nothing here computes or stores who currently has
 * what assigned. Editing a group's membership or an assignment's scope takes
 * effect for every learner it now reaches on their next read, with no
 * migration and nothing to re-run — the same relationship §4C.4's path editor
 * has to `path_courses`.
 *
 * `assessmentKey` is validated against *either* key space — an instrument's
 * or a group's — because the column intentionally does not say which; the
 * resolver tries the group table first (see `AssessmentAssignmentResolutionService`)
 * and falls back to treating the key as an instrument's.
 */
@Injectable()
export class AdminAssessmentAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<AdminAssessmentAssignmentRow[]> {
    const [assignments, resolvable] = await Promise.all([
      this.prisma.assessmentAssignment.findMany({ orderBy: { displayOrder: 'asc' } }),
      this.resolvableTitles(),
    ]);

    const userTargets = assignments
      .filter((row) => row.scope === 'USER' && row.target)
      .map((row) => row.target!);

    const users = userTargets.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userTargets } },
          select: { id: true, fullName: true },
        })
      : [];
    const userNameById = new Map(users.map((user) => [user.id, user.fullName]));

    return assignments.map((row): AdminAssessmentAssignmentRow => {
      const resolved = resolvable.get(row.assessmentKey);

      return {
        id: row.id,
        assessmentKey: row.assessmentKey,
        resolvedTitle: resolved?.title ?? row.assessmentKey,
        resolvedKind: resolved?.kind ?? 'INSTRUMENT',
        scope: row.scope,
        target: row.target,
        targetLabel: row.scope === 'USER' && row.target ? (userNameById.get(row.target) ?? null) : null,
        required: row.required,
        displayOrder: row.displayOrder,
      };
    });
  }

  async create(
    dto: CreateAssessmentAssignmentDto,
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminAssessmentAssignmentRow[]> {
    await this.requireResolvableKey(dto.assessmentKey);

    if (dto.scope === 'ALL' && dto.target) {
      throw new BadRequestException('ASSIGNMENT_TARGET_NOT_ALLOWED');
    }
    if (dto.scope !== 'ALL' && !dto.target) {
      throw new BadRequestException('ASSIGNMENT_TARGET_REQUIRED');
    }
    if (dto.scope === 'USER' && dto.target) {
      const user = await this.prisma.user.findUnique({
        where: { id: dto.target },
        select: { id: true },
      });
      if (!user) {
        throw new NotFoundException('USER_NOT_FOUND');
      }
    }

    const row = await this.prisma.assessmentAssignment.create({
      data: {
        assessmentKey: dto.assessmentKey,
        scope: dto.scope,
        target: dto.scope === 'ALL' ? null : (dto.target ?? null),
        required: dto.required,
        displayOrder: dto.displayOrder,
      },
      select: { id: true },
    });

    await this.audit.record({
      action: AuditAction.ADMIN_ASSESSMENT_ASSIGNED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'assessment_assignment',
      targetId: row.id,
      detail: { assessmentKey: dto.assessmentKey, scope: dto.scope, required: dto.required },
    });

    return this.list();
  }

  async update(
    id: string,
    dto: UpdateAssessmentAssignmentDto,
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminAssessmentAssignmentRow[]> {
    const existing = await this.prisma.assessmentAssignment.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('ASSESSMENT_ASSIGNMENT_NOT_FOUND');
    }

    await this.prisma.assessmentAssignment.update({
      where: { id },
      data: {
        ...(dto.required === undefined ? {} : { required: dto.required }),
        ...(dto.displayOrder === undefined ? {} : { displayOrder: dto.displayOrder }),
      },
    });

    await this.audit.record({
      action: AuditAction.ADMIN_ASSESSMENT_ASSIGNED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'assessment_assignment',
      targetId: id,
      detail: { assessmentKey: existing.assessmentKey, edited: 'true' },
    });

    return this.list();
  }

  async remove(id: string, actorId: string, ipAddress: string | null): Promise<AdminAssessmentAssignmentRow[]> {
    const existing = await this.prisma.assessmentAssignment.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('ASSESSMENT_ASSIGNMENT_NOT_FOUND');
    }

    await this.prisma.assessmentAssignment.delete({ where: { id } });

    await this.audit.record({
      action: AuditAction.ADMIN_ASSESSMENT_UNASSIGNED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'assessment_assignment',
      targetId: id,
      detail: {
        assessmentKey: existing.assessmentKey,
        scope: existing.scope,
        target: existing.target ?? '',
      },
    });

    return this.list();
  }

  // ── Groups ──────────────────────────────────────────────────────────────

  async listGroups(): Promise<AdminAssessmentGroupRow[]> {
    const [groups, resolvable] = await Promise.all([
      this.prisma.assessmentGroup.findMany({ orderBy: { name: 'asc' } }),
      this.resolvableTitles(),
    ]);

    return groups.map((group) => ({
      id: group.id,
      key: group.key,
      name: group.name,
      memberKeys: group.memberKeys,
      /* Empty for a member key that no longer resolves — a stale reference to
         surface for cleanup, not to error over (mirrors the resolver's own
         tolerance for a group member that has since been retired). */
      memberTitles: group.memberKeys.map((key) => resolvable.get(key)?.title ?? ''),
    }));
  }

  /**
   * Creates or edits a group by its `key` — one screen for both, the way
   * `path.upsert` already reads in the seed.
   */
  async saveGroup(
    dto: SaveAssessmentGroupDto,
    actorId: string,
    ipAddress: string | null,
  ): Promise<AdminAssessmentGroupRow[]> {
    if (dto.memberKeys.length === 0) {
      throw new BadRequestException('ASSESSMENT_GROUP_EMPTY');
    }

    const key = dto.key.trim().toLowerCase();

    const group = await this.prisma.assessmentGroup.upsert({
      where: { key },
      create: { key, name: dto.name, memberKeys: dto.memberKeys },
      update: { name: dto.name, memberKeys: dto.memberKeys },
      select: { id: true },
    });

    await this.audit.record({
      action: AuditAction.ADMIN_ASSESSMENT_GROUP_CHANGED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'assessment_group',
      targetId: group.id,
      detail: { key, memberCount: dto.memberKeys.length },
    });

    return this.listGroups();
  }

  async removeGroup(id: string, actorId: string, ipAddress: string | null): Promise<AdminAssessmentGroupRow[]> {
    const existing = await this.prisma.assessmentGroup.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('ASSESSMENT_GROUP_NOT_FOUND');
    }

    const inUse = await this.prisma.assessmentAssignment.findFirst({
      where: { assessmentKey: existing.key },
      select: { id: true },
    });
    if (inUse) {
      throw new ConflictException('ASSESSMENT_GROUP_ASSIGNED');
    }

    await this.prisma.assessmentGroup.delete({ where: { id } });

    await this.audit.record({
      action: AuditAction.ADMIN_ASSESSMENT_GROUP_CHANGED,
      outcome: 'SUCCESS',
      actorUserId: actorId,
      ipAddress,
      targetType: 'assessment_group',
      targetId: id,
      detail: { key: existing.key, deleted: 'true' },
    });

    return this.listGroups();
  }

  // ── Shared resolution ──────────────────────────────────────────────────

  private async requireResolvableKey(assessmentKey: string): Promise<void> {
    const resolvable = await this.resolvableTitles();
    if (!resolvable.has(assessmentKey)) {
      throw new NotFoundException('ASSESSMENT_KEY_NOT_FOUND');
    }
  }

  /**
   * Every key an assignment or a group member could name, mapped to a display
   * title and which kind it turned out to be.
   *
   * An instrument's row wins over a group sharing the same key — key spaces
   * are meant to be disjoint (an admin picks one or the other when naming a
   * group), so a collision here is an authoring mistake, not a case to design
   * resolution order around.
   */
  private async resolvableTitles(): Promise<Map<string, { title: string; kind: 'INSTRUMENT' | 'GROUP' }>> {
    const [assessments, groups] = await Promise.all([
      this.prisma.assessment.findMany({ select: { key: true, status: true, title: true } }),
      this.prisma.assessmentGroup.findMany({ select: { key: true, name: true } }),
    ]);

    const map = new Map<string, { title: string; kind: 'INSTRUMENT' | 'GROUP' }>();

    for (const group of groups) {
      map.set(group.key, { title: group.name, kind: 'GROUP' });
    }

    /* Instruments last, so an ACTIVE version's title overwrites a DRAFT or
       RETIRED one sharing the same key rather than the other way round —
       `assessments` are inserted in no guaranteed order otherwise. */
    const rank: Record<string, number> = { RETIRED: 0, DRAFT: 1, ACTIVE: 2 };
    const bestByKey = new Map<string, { title: string; status: string }>();
    for (const assessment of assessments) {
      const current = bestByKey.get(assessment.key);
      if (!current || (rank[assessment.status] ?? 0) > (rank[current.status] ?? 0)) {
        bestByKey.set(assessment.key, { title: assessment.title, status: assessment.status });
      }
    }
    for (const [key, { title }] of bestByKey) {
      map.set(key, { title, kind: 'INSTRUMENT' });
    }

    return map;
  }
}
