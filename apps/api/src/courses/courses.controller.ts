import { Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import type {
  CourseDetail,
  CourseLaunchView,
  CoursePlayerView,
  CourseSummary,
} from '@tamkeen/types';

import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/session.service';
import { CoursePlayerService } from './course-player.service';
import { CourseQueryDto } from './courses.dto';
import { CoursesService } from './courses.service';

/**
 * §4.6 / §4.7.
 *
 * Authenticated, like everything else — "available even pre-assessment" means
 * before taking the assessment, not before signing in. This is an internal
 * ministry system; there is no anonymous browsing of it.
 */
@Controller('courses')
@Roles('EMPLOYEE')
export class CoursesController {
  constructor(
    private readonly courses: CoursesService,
    private readonly player: CoursePlayerService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CourseQueryDto,
  ): Promise<CourseSummary[]> {
    return this.courses.list(user.id, query);
  }

  @Get(':id')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) courseId: string,
  ): Promise<CourseDetail> {
    return this.courses.getDetail(user.id, courseId);
  }

  /** §4.8 — the context around the Moodle course, not the course itself. */
  @Get(':id/player')
  getPlayer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) courseId: string,
  ): Promise<CoursePlayerView> {
    return this.player.getPlayer(user.id, courseId);
  }

  /**
   * Mints a seamless-login handoff into this course (D-044).
   *
   * **POST, though it reads like a GET.** It issues a credential, so it must not
   * be prefetched by a browser, cached, or arrived at by following a link — and
   * as a POST it is covered by the CSRF protection every mutating endpoint gets.
   */
  @Post(':id/launch')
  launch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) courseId: string,
    @Req() request: Request,
  ): Promise<CourseLaunchView> {
    return this.player.launch(user.id, courseId, request.ip ?? null);
  }
}
