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

import type {
  AdminAttachableCourse,
  AdminPathBounds,
  AdminPathDetail,
  AdminPathRow,
} from '@tamkeen/types';

import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/session.service';
import { AdminPathsService } from './admin-paths.service';
import {
  AdminEntityQueryDto,
  AttachCourseDto,
  CreatePathDto,
  ReorderPathCoursesDto,
  UpdatePathDto,
} from './admin.dto';

/**
 * §4C.4 — study paths.
 *
 * **Two different removals, because they are two different decisions.**
 * `PATCH { isActive: false }` retires a path: it leaves new selections and every
 * learner holding it is untouched, which is what §2 needs and is reversible.
 * `DELETE` removes it permanently and is refused for any path somebody ever
 * chose — `user_paths.path_id` is `Restrict` and a path certificate names the
 * path on a document somebody holds, so that deletion would falsify a
 * credential. What is left deletable is the path created by mistake.
 *
 * The bounds endpoint returns 5-10 and nothing writes them (D-074).
 */
@Controller('admin/paths')
@Roles('SUPER_ADMIN')
export class AdminPathsController {
  constructor(private readonly paths: AdminPathsService) {}

  @Get()
  list(): Promise<AdminPathRow[]> {
    return this.paths.list();
  }

  /** The 5-10 rule, read-only (D-074, §2). */
  @Get('bounds')
  bounds(): AdminPathBounds {
    return this.paths.bounds();
  }

  @Get(':id')
  get(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) pathId: string,
  ): Promise<AdminPathDetail> {
    return this.paths.get(pathId);
  }

  /** What could be attached — drafts and hidden courses included. */
  @Get(':id/attachable')
  attachable(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) pathId: string,
    @Query() query: AdminEntityQueryDto,
  ): Promise<AdminAttachableCourse[]> {
    return this.paths.attachableCourses(pathId, query.q);
  }

  @Post()
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreatePathDto,
    @Req() request: Request,
  ): Promise<AdminPathDetail> {
    return this.paths.create(dto, actor.id, request.ip ?? null);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) pathId: string,
    @Body() dto: UpdatePathDto,
    @Req() request: Request,
  ): Promise<AdminPathDetail> {
    return this.paths.update(pathId, dto, actor.id, request.ip ?? null);
  }

  @Post(':id/courses')
  attach(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) pathId: string,
    @Body() dto: AttachCourseDto,
    @Req() request: Request,
  ): Promise<AdminPathDetail> {
    return this.paths.attachCourse(pathId, dto, actor.id, request.ip ?? null);
  }

  /** Owed since Phase 4: `path_courses.display_order` had no editor. */
  @Patch(':id/courses/order')
  reorder(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) pathId: string,
    @Body() dto: ReorderPathCoursesDto,
    @Req() request: Request,
  ): Promise<AdminPathDetail> {
    return this.paths.reorderCourses(pathId, dto, actor.id, request.ip ?? null);
  }

  /**
   * Permanently removes a path nobody ever chose (§4C.4).
   *
   * Returns 409 `PATH_HELD_BY_LEARNERS` for any other, where retirement is the
   * operation the administrator actually wants.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) pathId: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.paths.remove(pathId, actor.id, request.ip ?? null);
  }

  @Delete(':id/courses/:courseId')
  detach(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) pathId: string,
    @Param('courseId', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) courseId: string,
    @Req() request: Request,
  ): Promise<AdminPathDetail> {
    return this.paths.detachCourse(pathId, courseId, actor.id, request.ip ?? null);
  }
}
