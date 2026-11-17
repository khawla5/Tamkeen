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
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import type { AdminCoursePage, AdminCourseRow } from '@tamkeen/types';

import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/session.service';
import { AdminCoursesService } from './admin-courses.service';
import { AdminCourseQueryDto, InterveneCourseDto } from './admin.dto';

/**
 * §4C.5 — course oversight.
 *
 * **The one catalogue view with no scope** (D-075). Every organisation's
 * courses, plus the ones no organisation supplies — which no entity portal can
 * show, by construction, and which are therefore only ever the administrator's
 * to place.
 *
 * **There is no `status` field to write.** An intervention lands on the
 * publication decision or the availability window, and the derivation decides
 * what a learner sees — so course-edit protection holds here for the same
 * structural reason it holds everywhere else (§2/D-015, D-059).
 *
 * There *is* a delete, added at the ministry's direction (TAM-134), and it is
 * the one operation on this controller that cannot be undone. Its refusals are
 * the service's: anything a learner holds, a certificate names, or a completion
 * records stays.
 */
@Controller('admin/courses')
@Roles('SUPER_ADMIN')
export class AdminCoursesController {
  constructor(private readonly courses: AdminCoursesService) {}

  @Get()
  list(@Query() query: AdminCourseQueryDto): Promise<AdminCoursePage> {
    return this.courses.list(query);
  }

  @Get(':id')
  get(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) courseId: string,
  ): Promise<AdminCourseRow> {
    return this.courses.get(courseId);
  }

  /** Hide, restore, or place a course with an organisation. */
  @Patch(':id')
  intervene(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) courseId: string,
    @Body() dto: InterveneCourseDto,
    @Req() request: Request,
  ): Promise<AdminCourseRow> {
    return this.courses.intervene(courseId, dto, actor.id, request.ip ?? null);
  }

  /**
   * Permanently deletes a course — in the LMS and here (§4C.5).
   *
   * 409 `COURSE_HELD_BY_LEARNERS` for anything anybody has taken or been
   * certified for, where hiding is the operation the administrator wants;
   * 409 `COURSE_LMS_DELETE_FAILED` / `LMS_UNAVAILABLE` when the LMS refuses,
   * in which case nothing was deleted on either side.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) courseId: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.courses.remove(courseId, actor.id, request.ip ?? null);
  }
}
