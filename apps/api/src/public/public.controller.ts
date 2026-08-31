import { Controller, Get, Header } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import type { PublicPathSummary } from '@tamkeen/types';

import { Public } from '../auth/auth.decorators';
import { PublicPathsService } from './public-paths.service';

/**
 * What the ministry's front page may read without a session (§4.0, TAM-150).
 *
 * The second unauthenticated read in the product, after certificate
 * verification — and it carries the same three disciplines, for the same
 * reasons:
 *
 *  - **`@Public()` is deliberate and greppable.** Authentication is on by
 *    default through a global fail-closed guard, so this decorator is the whole
 *    of the exposure and a reviewer can find every instance of it in one grep.
 *  - **Rate-limited well below the default**, because an open endpoint is a way
 *    to make the front door expensive. The service's own five-minute cache is
 *    the second half of that: however many callers arrive, the database is
 *    asked at most once per window.
 *  - **Nothing about people.** The response is path names, what they develop
 *    and how many courses they offer. No learner counts, no course titles, no
 *    internal keys — a visitor is told what the ministry trains its employees
 *    to do, not handed the shape of its catalogue.
 *
 * Indexing is deliberately *allowed* here, unlike the verification route: this
 * is public information the ministry would print, and a search engine finding
 * the training programme is a feature rather than a leak.
 */
@Controller('public')
export class PublicController {
  constructor(private readonly paths: PublicPathsService) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  /* A shared cache too, so a proxy in front of the API answers most of these
     without reaching Nest at all. `stale-while-revalidate` keeps the front page
     fast through the moment the cache turns over. */
  @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=600')
  @Get('paths')
  list(): Promise<PublicPathSummary[]> {
    return this.paths.list();
  }
}
