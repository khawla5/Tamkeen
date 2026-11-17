import { Controller, Get, Header } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import type { PublicPathSummary } from '@tamkeen/types';

import { Public } from '../auth/auth.decorators';
import { PublicPathsService } from './public-paths.service';

/**
 * The landing explorer's data source (§1, TAM-150) — a second unauthenticated
 * read alongside certificate verification, and marked the same deliberate way.
 *
 * A separate controller from `PathsController` rather than a `@Public()`
 * method on it: that controller is `@Roles('EMPLOYEE')` at the class level and
 * every one of its fields answers "for *this* learner" (recommendation rank,
 * selection state). Nothing here does, and sharing the prefix would only
 * invite the two to drift toward the same shape.
 */
@Controller('public/paths')
export class PublicPathsController {
  constructor(private readonly paths: PublicPathsService) {}

  /**
   * Every active path, in display order — name, RIASEC letter, description,
   * skill outcomes, course count, typical duration. Nothing else: no ids of
   * people, no course titles, nothing an unauthenticated reader should not
   * have.
   *
   * Rate-limited well below the default, matching certificate verification's
   * reasoning: an open route that hits the database on every call is a cost
   * worth bounding even though nothing here is secret. The service's own
   * cache does the heavier lifting — this is the floor under a client that
   * ignores it.
   */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Header('Cache-Control', 'public, max-age=60')
  @Get()
  list(): Promise<PublicPathSummary[]> {
    return this.paths.list();
  }
}
