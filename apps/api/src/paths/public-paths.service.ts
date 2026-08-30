import { Injectable } from '@nestjs/common';

import type { PublicPathSummary } from '@tamkeen/types';

import { PrismaService } from '../prisma/prisma.service';

/** How long a read may serve a stale catalogue before the next visitor pays
 *  for a fresh query (TAM-150) — "a few minutes", not real-time: the landing
 *  page is marketing, not a build screen, and nothing here changes minute to
 *  minute. */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * The landing explorer's data source — every active path, unauthenticated
 * (§1, TAM-150).
 *
 * **In-memory, process-local cache**, not Redis: this is one read-mostly query
 * behind the product's single most-hit anonymous page, and a cache that can be
 * wrong for up to five minutes after an administrator edits a path needs
 * nothing more durable than that. A cold start or a second API instance simply
 * pays for one real query — cheap, and self-correcting on the next tick.
 */
@Injectable()
export class PublicPathsService {
  private cached: { at: number; paths: PublicPathSummary[] } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<PublicPathSummary[]> {
    if (this.cached && Date.now() - this.cached.at < CACHE_TTL_MS) {
      return this.cached.paths;
    }

    const paths = await this.prisma.path.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        skillOutcomes: true,
        riasecLetter: true,
        typicalDurationMinutes: true,
        /* The same "on offer" definition the authenticated catalogue uses
           (`PathsService.listForUser`) — a course a learner could not actually
           pick does not belong in a count meant to answer "how much is here". */
        _count: {
          select: {
            pathCourses: { where: { status: 'APPROVED', course: { status: 'AVAILABLE' } } },
          },
        },
      },
    });

    const summaries = paths.map((path) => ({
      id: path.id,
      name: path.name,
      riasecLetter: path.riasecLetter,
      description: path.description,
      skillOutcomes: path.skillOutcomes,
      courseCount: path._count.pathCourses,
      typicalDurationMinutes: path.typicalDurationMinutes,
    }));

    this.cached = { at: Date.now(), paths: summaries };

    return summaries;
  }

  /** Test seam — lets a suite prove the cache is populated and cleared, the
   *  same pattern `certificate-emblem.ts` uses. */
  clearCache(): void {
    this.cached = null;
  }
}
