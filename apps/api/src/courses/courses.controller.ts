import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import type {
  CourseDetail,
  CourseLaunchView,
  CourseOutlineView,
  CoursePlayerView,
  CourseSummary,
} from '@tamkeen/types';

import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/session.service';
import { CompletionSyncService } from '../completion-sync/completion-sync.service';
import { CoursePlayerService } from './course-player.service';
import { CourseQueryDto, LaunchDto } from './courses.dto';
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
    private readonly completionSync: CompletionSyncService,
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
  /** The framed player's previous / next (D-119). */
  @Get(':id/outline')
  outline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) courseId: string,
  ): Promise<CourseOutlineView> {
    return this.player.outline(user.id, courseId);
  }

  @Post(':id/launch')
  launch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) courseId: string,
    @Body() dto: LaunchDto,
    @Req() request: Request,
  ): Promise<CourseLaunchView> {
    return this.player.launch(user.id, courseId, request.ip ?? null, { embed: dto.embed === true });
  }

  /**
   * An on-demand completion sync for the signed-in learner (D-118).
   *
   * The framed course reports a submitted quiz; waiting up to the scheduled
   * interval to show the grade would make the frame feel broken. Same code
   * path as the scheduled run — idempotent by construction — for this learner
   * only, and cooled down per learner so a burst of messages is one read.
   * The course id is accepted for the route's shape; the sync is per learner.
   */
  @Post(':id/sync')
  @HttpCode(HttpStatus.OK)
  async sync(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) _courseId: string,
  ): Promise<{ synced: boolean }> {
    return { synced: await this.completionSync.syncLearner(user.id) };
  }
}
