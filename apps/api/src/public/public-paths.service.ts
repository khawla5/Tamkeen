import { Injectable } from '@nestjs/common';

import type { PublicPathSummary } from '@tamkeen/types';

import { PrismaService } from '../prisma/prisma.service';

/**
 * How long a read is served from memory before the database is asked again.
 *
 * The catalogue changes when an administrator edits a path — a few times a
 * month at most — and the front page is the most-requested URL in the product.
 * Five minutes is far longer than any burst and far shorter than the delay a
 * ministry editor would notice after publishing a change.
 */
export const PUBLIC_PATHS_TTL_MS = 5 * 60_000;

/**
 * The one read an unauthenticated visitor can make against the catalogue
 * (TAM-150).
 *
 * **It is cached, and that is a security property as much as a performance
 * one.** An open endpoint that queries the database on every call is a way to
 * make the ministry's front door expensive from a laptop; the throttle on the
 * controller bounds one caller, and this bounds all of them together — under
 * any load the database sees at most one query every five minutes.
 *
 * **It selects columns rather than filtering rows after the fact.** The
 * difference matters: `select` cannot leak a field that is added to the model
 * later, whereas a "load the path and delete what we don't want" shape starts
 * publishing every new column the day it is written.
 */
@Injectable()
export class PublicPathsService {
  private cached: { at: number; paths: PublicPathSummary[] } | null = null;

  /** Coalesces concurrent misses so a cold cache is one query, not fifty. */
  private inFlight: Promise<PublicPathSummary[]> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async list(now = Date.now()): Promise<PublicPathSummary[]> {
    if (this.cached !== null && now - this.cached.at < PUBLIC_PATHS_TTL_MS) {
      return this.cached.paths;
    }

    this.inFlight ??= this.read()
      .then((paths) => {
        /* Stamped with the caller's clock, not `Date.now()`: the freshness
           check above reads the same value, and two clocks in one cache is how
           an injectable `now` silently stops expiring anything. */
        this.cached = { at: now, paths };
        return paths;
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }

  /** Drops the cache — for tests, and for anything that edits a path. */
  invalidate(): void {
    this.cached = null;
  }

  private async read(): Promise<PublicPathSummary[]> {
    const paths = await this.prisma.path.findMany({
      /* Active only. A retired path is not on offer, and the front page saying
         otherwise would invite an employee to register for something they
         cannot choose. */
      where: { isActive: true },
      /*
       * By career type, then the ministry's own order within it.
       *
       * `displayOrder` is curated *within* a letter — six paths share the value
       * 1 — so ordering by it alone interleaves the types and puts the two
       * paths of one kind at opposite ends of the tab strip. Sorting by the
       * letter first groups them, and the enum's declaration order is the
       * canonical R-I-A-S-E-C (D-031), so this is the same sequence the product
       * uses everywhere else rather than a second opinion about it.
       */
      orderBy: [{ riasecLetter: 'asc' }, { displayOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        riasecLetter: true,
        description: true,
        skillOutcomes: true,
        typicalDurationMinutes: true,
        /* The number, never the titles: how much choice a path offers is what
           the visitor is being told, and the catalogue itself is behind the
           session. Approved membership only, so the figure agrees with what a
           learner would actually be offered on the build page (D-119). */
        _count: { select: { pathCourses: { where: { status: 'APPROVED' } } } },
      },
    });

    return paths.map((path) => ({
      id: path.id,
      name: path.name,
      riasecLetter: path.riasecLetter,
      description: path.description,
      skillOutcomes: path.skillOutcomes,
      courseCount: path._count.pathCourses,
      typicalDurationMinutes: path.typicalDurationMinutes,
    }));
  }
}
