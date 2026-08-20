import { Controller, Get, Query } from '@nestjs/common';

import type { EntityCourseSummary, EntityProfileView } from '@tamkeen/types';

import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/session.service';
import { EntityCoursesService } from './entity-courses.service';
import { EntityProfileService } from './entity-profile.service';
import { EntityScopeService } from './entity-scope.service';
import { EntityCourseQueryDto } from './entity.dto';

/**
 * The entity / reviewer portal (§4B).
 *
 * **`@Roles` is declared once, at class level**, so a handler added in a later
 * phase inherits it rather than shipping unguarded until someone notices — the
 * same fail-closed posture SessionGuard takes for authentication. `SUPER_ADMIN`
 * is admitted alongside `ENTITY` because §4C.5 gives an admin global oversight
 * of every entity's courses; the scope resolver, not the guard, is what decides
 * they see all of them rather than one organisation's (D-062).
 *
 * Every handler resolves the scope before it reads anything. That is deliberate
 * repetition: a controller that resolved it once into a field would be sharing
 * one caller's scope across concurrent requests.
 */
@Controller('entity')
@Roles('ENTITY', 'SUPER_ADMIN')
export class EntityController {
  constructor(
    private readonly scope: EntityScopeService,
    private readonly courses: EntityCoursesService,
    private readonly profile: EntityProfileService,
  ) {}

  /** §4B.6. Null for a super-admin, who has no organisation of their own. */
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser): Promise<EntityProfileView | null> {
    return this.profile.get(await this.scope.resolve(user));
  }

  /** §4B.2 — this entity's courses, and only this entity's. */
  @Get('courses')
  async listCourses(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: EntityCourseQueryDto,
  ): Promise<EntityCourseSummary[]> {
    return this.courses.list(await this.scope.resolve(user), query);
  }
}
