import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import type { AdminAttachableCourse, AdminPathDetail, AdminPathRow } from '@tamkeen/types';

import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/session.service';
import { AdminLevelsService } from './admin-levels.service';
import { AdminPathsService } from './admin-paths.service';
import {
  AdminEntityQueryDto,
  AttachCourseDto,
  CreateLevelDto,
  CreatePathDto,
  PlaceCourseDto,
  ReorderLevelCoursesDto,
  ReorderLevelsDto,
  UpdateLevelDto,
  UpdatePathDto,
} from './admin.dto';

const uuid = () => new ParseUUIDPipe({ errorHttpStatusCode: 400 });

/**
 * §4C.4 — study paths, their ladders, and what is placed on them.
 *
 * **Every route here is `SUPER_ADMIN`, and that is the product policy, not a
 * convenience.** An entity offers a course to a path; which rung it goes on, in
 * what order, and whether the path is published at all are the ministry's
 * decisions. There is no entity-facing route to any of it.
 *
 * **Two different removals, because they are two different decisions.**
 * `PATCH { status: 'DRAFT' }` unpublishes a path: it leaves new assignments and
 * every learner holding it is untouched, which is what §2 needs and is
 * reversible. `DELETE` removes it permanently and is refused for any path
 * somebody was ever assigned — `user_paths.path_id` is `Restrict` and a path
 * certificate names the path on a document somebody holds, so that deletion
 * would falsify a credential. What is left deletable is the path created by
 * mistake.
 */
@Controller('admin/paths')
@Roles('SUPER_ADMIN')
export class AdminPathsController {
  constructor(
    private readonly paths: AdminPathsService,
    private readonly levels: AdminLevelsService,
  ) {}

  @Get()
  list(): Promise<AdminPathRow[]> {
    return this.paths.list();
  }

  /** The admin view: every membership, placed and unassigned alike. */
  @Get(':id')
  get(@Param('id', uuid()) pathId: string): Promise<AdminPathDetail> {
    return this.paths.get(pathId);
  }

  @Get(':id/attachable')
  attachable(
    @Param('id', uuid()) pathId: string,
    @Query() query: AdminEntityQueryDto,
  ): Promise<AdminAttachableCourse[]> {
    return this.paths.attachableCourses(pathId, query.q);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePathDto,
    @Req() request: Request,
  ): Promise<AdminPathDetail> {
    return this.paths.create(dto, user.id, request.ip ?? null);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid()) pathId: string,
    @Body() dto: UpdatePathDto,
    @Req() request: Request,
  ): Promise<AdminPathDetail> {
    return this.paths.update(pathId, dto, user.id, request.ip ?? null);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid()) pathId: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.paths.remove(pathId, user.id, request.ip ?? null);
  }

  /* ── membership: a course is in the path, or it is not ─────────────────── */

  /** Adds a course to the path. It lands unassigned, always (D-134). */
  @Post(':id/courses')
  @HttpCode(HttpStatus.CREATED)
  attach(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid()) pathId: string,
    @Body() dto: AttachCourseDto,
    @Req() request: Request,
  ): Promise<AdminPathDetail> {
    return this.paths.attachCourse(pathId, dto, user.id, request.ip ?? null);
  }

  /** Removes it from the path entirely. Refused while a learner here holds it. */
  @Delete(':id/courses/:pathCourseId')
  detach(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid()) pathId: string,
    @Param('pathCourseId', uuid()) pathCourseId: string,
    @Req() request: Request,
  ): Promise<AdminPathDetail> {
    return this.paths.detachCourse(pathId, pathCourseId, user.id, request.ip ?? null);
  }

  /* ── the ladder ────────────────────────────────────────────────────────── */

  @Post(':id/levels')
  @HttpCode(HttpStatus.CREATED)
  createLevel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid()) pathId: string,
    @Body() dto: CreateLevelDto,
    @Req() request: Request,
  ): Promise<AdminPathDetail> {
    return this.levels.createLevel(pathId, dto, user.id, request.ip ?? null);
  }

  /** Before `:levelId`, so "order" is never read as a level id. */
  @Patch(':id/levels/order')
  reorderLevels(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid()) pathId: string,
    @Body() dto: ReorderLevelsDto,
    @Req() request: Request,
  ): Promise<AdminPathDetail> {
    return this.levels.reorderLevels(pathId, dto, user.id, request.ip ?? null);
  }

  @Patch(':id/levels/:levelId')
  updateLevel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid()) pathId: string,
    @Param('levelId', uuid()) levelId: string,
    @Body() dto: UpdateLevelDto,
    @Req() request: Request,
  ): Promise<AdminPathDetail> {
    return this.levels.updateLevel(pathId, levelId, dto, user.id, request.ip ?? null);
  }

  /** Deletes a rung. Its courses revert to unassigned; none is deleted. */
  @Delete(':id/levels/:levelId')
  deleteLevel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid()) pathId: string,
    @Param('levelId', uuid()) levelId: string,
    @Req() request: Request,
  ): Promise<AdminPathDetail> {
    return this.levels.deleteLevel(pathId, levelId, user.id, request.ip ?? null);
  }

  @Patch(':id/levels/:levelId/order')
  reorderLevelCourses(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid()) pathId: string,
    @Param('levelId', uuid()) levelId: string,
    @Body() dto: ReorderLevelCoursesDto,
    @Req() request: Request,
  ): Promise<AdminPathDetail> {
    return this.levels.reorderLevelCourses(pathId, levelId, dto, user.id, request.ip ?? null);
  }

  /* ── placement ─────────────────────────────────────────────────────────── */

  /**
   * Places a course on a rung, moves it, or takes it off (`levelId: null`).
   *
   * Admin only, like everything else here — and the one endpoint in the product
   * that writes `path_courses.level_id`.
   */
  @Patch(':id/courses/:pathCourseId/placement')
  place(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid()) pathId: string,
    @Param('pathCourseId', uuid()) pathCourseId: string,
    @Body() dto: PlaceCourseDto,
    @Req() request: Request,
  ): Promise<AdminPathDetail> {
    return this.levels.place(pathId, pathCourseId, dto, user.id, request.ip ?? null);
  }
}
