import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, Req } from '@nestjs/common';
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
 * There is no delete and no `status` field to write. An intervention lands on
 * the publication decision and the derivation decides what a learner sees, so
 * course-edit protection holds here for the same structural reason it holds
 * everywhere else (§2/D-015, D-059).
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
}
