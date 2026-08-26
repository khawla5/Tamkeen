import {
  Body,
  Controller,
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
  EntityAuthorLaunchView,
  EntityCourseContentView,
  EntityCourseDetail,
  EntityCourseSummary,
  EntityDashboardView,
  EntityLearnerRow,
  EntityProfileView,
  EntityUnpublishResult,
} from '@tamkeen/types';

import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/session.service';
import { EntityCourseManagementService } from './entity-course-management.service';
import { EntityCoursesService } from './entity-courses.service';
import { EntityDashboardService } from './entity-dashboard.service';
import { EntityLearnersService } from './entity-learners.service';
import { EntityProfileService } from './entity-profile.service';
import { EntityScopeService } from './entity-scope.service';
import {
  AuthorLaunchDto,
  CreateEntityCourseDto,
  EntityCourseQueryDto,
  EntityLearnerQueryDto,
  UpdateEntityCourseDto,
} from './entity.dto';

/**
 * The entity / reviewer portal (§4B).
 *
 * **`@Roles` is declared once, at class level**, so a handler added in a later
 * phase inherits it rather than shipping unguarded — the same fail-closed
 * posture SessionGuard takes for authentication. `SUPER_ADMIN` is admitted
 * alongside `ENTITY` because §4C.5 gives an admin global oversight of every
 * entity's courses; the scope resolver, not the guard, is what decides they see
 * all of them rather than one organisation's (D-062).
 *
 * Every handler resolves the scope before it reads anything. That is deliberate
 * repetition rather than something to hoist into a field: a controller instance
 * is shared across concurrent requests, so a cached scope would be one caller's
 * scope answering another caller's request.
 *
 * There is **no delete endpoint**, and no method that writes course content.
 * Deletion is forbidden by §2/D-015; content is authored in Moodle (D-046).
 */
@Controller('entity')
@Roles('ENTITY', 'SUPER_ADMIN')
export class EntityController {
  constructor(
    private readonly scope: EntityScopeService,
    private readonly courses: EntityCoursesService,
    private readonly management: EntityCourseManagementService,
    private readonly learners: EntityLearnersService,
    private readonly dashboard: EntityDashboardService,
    private readonly profile: EntityProfileService,
  ) {}

  /** §4B.6. Null for a super-admin, who has no organisation of their own. */
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser): Promise<EntityProfileView | null> {
    return this.profile.get(await this.scope.resolve(user));
  }

  /** §4B.1 — counts for context, and the one list that is actionable. */
  @Get('dashboard')
  async getDashboard(@CurrentUser() user: AuthenticatedUser): Promise<EntityDashboardView> {
    return this.dashboard.get(await this.scope.resolve(user));
  }

  /** §4B.2 — this entity's courses, and only this entity's. */
  @Get('courses')
  async listCourses(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: EntityCourseQueryDto,
  ): Promise<EntityCourseSummary[]> {
    return this.courses.list(await this.scope.resolve(user), query);
  }

  /**
   * §4B.3 — creates the shell, in the LMS first (D-060).
   *
   * The entity then authors the content in Moodle; this endpoint deliberately
   * accepts no activities, no materials and no quiz.
   */
  @Post('courses')
  @HttpCode(HttpStatus.CREATED)
  async createCourse(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEntityCourseDto,
    @Req() request: Request,
  ): Promise<EntityCourseDetail> {
    return this.management.create(await this.scope.resolve(user), dto, user.id, request.ip ?? null);
  }

  /** §4B.3 / §4B.4 — the manage screen, including why publishing is blocked. */
  @Get('courses/:id')
  async getCourse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) courseId: string,
  ): Promise<EntityCourseDetail> {
    return this.management.get(await this.scope.resolve(user), courseId);
  }

  /**
   * §4B.4 — what Moodle holds, on its own.
   *
   * Separate from the manage screen because it is the one part that depends on
   * the LMS answering: the Course Content page can refresh it after the entity
   * has been away authoring, without re-rendering everything else.
   */
  @Get('courses/:id/content')
  async getCourseContent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) courseId: string,
  ): Promise<EntityCourseContentView | null> {
    const detail = await this.management.get(await this.scope.resolve(user), courseId);

    return detail.content;
  }

  /** §4B.3 — the product metadata our app owns (D-035, D-039). */
  @Patch('courses/:id')
  async updateCourse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) courseId: string,
    @Body() dto: UpdateEntityCourseDto,
    @Req() request: Request,
  ): Promise<EntityCourseDetail> {
    return this.management.updateMetadata(
      await this.scope.resolve(user),
      courseId,
      dto,
      user.id,
      request.ip ?? null,
    );
  }

  /** §4A's bridge into the learner catalogue. Refused unless fit (D-061). */
  @Post('courses/:id/publish')
  @HttpCode(HttpStatus.OK)
  async publishCourse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) courseId: string,
    @Req() request: Request,
  ): Promise<EntityCourseDetail> {
    return this.management.publish(
      await this.scope.resolve(user),
      courseId,
      user.id,
      request.ip ?? null,
    );
  }

  /**
   * Withdraws from *new* selections (§2, D-015).
   *
   * Returns the resulting status and how many learners still hold the course,
   * because a held course stays completable rather than being withdrawn — and an
   * entity who was not told would believe otherwise.
   */
  @Post('courses/:id/unpublish')
  @HttpCode(HttpStatus.OK)
  async unpublishCourse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) courseId: string,
    @Req() request: Request,
  ): Promise<EntityUnpublishResult> {
    return this.management.unpublish(
      await this.scope.resolve(user),
      courseId,
      user.id,
      request.ip ?? null,
    );
  }

  /**
   * Hands the entity into Moodle to author this course (D-060).
   *
   * **POST, though it reads like a GET** — the same reasoning as the learner
   * launch (D-045): it mints a live credential, so it must not be prefetched,
   * cached or arrived at by following a link, and as a POST it inherits CSRF
   * protection.
   */
  @Post('courses/:id/author-launch')
  @HttpCode(HttpStatus.OK)
  async authorLaunch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) courseId: string,
    @Body() dto: AuthorLaunchDto,
    @Req() request: Request,
  ): Promise<EntityAuthorLaunchView> {
    return this.management.authorLaunch(
      await this.scope.resolve(user),
      courseId,
      user.id,
      request.ip ?? null,
      { embed: dto.embed === true },
    );
  }

  /** §4B.5 — learners on this entity's courses, and no one else's. */
  @Get('learners')
  async listLearners(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: EntityLearnerQueryDto,
  ): Promise<EntityLearnerRow[]> {
    return this.learners.list(await this.scope.resolve(user), query.courseId);
  }
}
