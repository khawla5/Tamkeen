import type { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_PATHS_TTL_MS, PublicPathsService } from './public-paths.service';

/**
 * The one unauthenticated read of the catalogue (TAM-150).
 *
 * Two things are worth pinning down, and they are the two that would be
 * discovered late and painfully:
 *
 *  1. **What leaves the building.** This response is served to anyone who loads
 *     the front page, so the test asserts the exact key set — a field added to
 *     `Path` later must not arrive here because somebody widened a `select`.
 *  2. **That it is really cached.** An open endpoint that queries per request
 *     is how a laptop makes the ministry's front door expensive; "we added a
 *     cache" is only true if a second call does not reach the database.
 */

interface Row {
  id: string;
  name: string;
  riasecLetter: string;
  description: string;
  skillOutcomes: string[];
  typicalDurationMinutes: number | null;
  _count: { pathCourses: number };
}

function harness(rows: Row[] = [row()]) {
  const calls: Array<Record<string, unknown>> = [];

  const prisma = {
    path: {
      findMany: (args: Record<string, unknown>) => {
        calls.push(args);
        return Promise.resolve(rows);
      },
    },
  };

  return { service: new PublicPathsService(prisma as unknown as PrismaService), calls };
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'p-1',
    name: 'العمليات الميدانية والسلامة',
    riasecLetter: 'R',
    description: 'يطوّر هذا المسار القدرة على إدارة العمل خارج المكتب.',
    skillOutcomes: ['إدارة موقع ميداني', 'تقدير المخاطر التشغيلية'],
    typicalDurationMinutes: 1290,
    _count: { pathCourses: 11 },
    ...overrides,
  };
}

describe('PublicPathsService', () => {
  it('returns only what a visitor may know', async () => {
    const { service } = harness();

    const [path] = await service.list();

    /* The exact shape, asserted as a key set rather than field by field: a
       widened `select` in a later change adds a key here and fails, which is
       the only way this stays a boundary instead of a comment. */
    expect(Object.keys(path!).sort()).toEqual([
      'courseCount',
      'description',
      'id',
      'name',
      'riasecLetter',
      'skillOutcomes',
      'typicalDurationMinutes',
    ]);
    expect(path!.courseCount).toBe(11);
  });

  it('offers only active paths, in the ministrys own order', async () => {
    const { service, calls } = harness();

    await service.list();

    /* A retired path is not on offer, and the front page inviting somebody to
       register for one would be an invitation it cannot honour. */
    expect(calls[0]!.where).toEqual({ isActive: true });
    /* By career type first: `displayOrder` is curated within a letter, so on
       its own it interleaves the types and splits each pair. */
    expect(calls[0]!.orderBy).toEqual([
      { riasecLetter: 'asc' },
      { displayOrder: 'asc' },
      { name: 'asc' },
    ]);
  });

  it('counts only approved course membership, so the figure matches the build page', async () => {
    const { service, calls } = harness();

    await service.list();

    /* A pending proposal is not a course a learner could pick (D-119); saying
       "eleven courses" when nine are selectable is a promise the product then
       breaks on the page after registration. */
    expect(JSON.stringify(calls[0]!.select)).toContain('APPROVED');
  });

  it('serves a second call from memory rather than from the database', async () => {
    const { service, calls } = harness();

    await service.list();
    await service.list();
    await service.list();

    expect(calls).toHaveLength(1);
  });

  it('coalesces concurrent misses into one query', async () => {
    const { service, calls } = harness();

    /* A cold cache under load — the moment the cache is worth least and the
       database is asked most. */
    await Promise.all([service.list(), service.list(), service.list()]);

    expect(calls).toHaveLength(1);
  });

  it('asks again once the window has passed', async () => {
    const { service, calls } = harness();

    const start = 1_000_000;
    await service.list(start);
    await service.list(start + PUBLIC_PATHS_TTL_MS - 1);
    expect(calls).toHaveLength(1);

    await service.list(start + PUBLIC_PATHS_TTL_MS + 1);
    expect(calls).toHaveLength(2);
  });

  it('re-reads after an explicit invalidation', async () => {
    const { service, calls } = harness();

    await service.list();
    service.invalidate();
    await service.list();

    expect(calls).toHaveLength(2);
  });

  it('carries an empty outcome list rather than inventing one', async () => {
    const { service } = harness([row({ skillOutcomes: [] })]);

    /* A path whose outcomes the directorate has not written yet is honest
       about having none; the explorer shows its description alone. */
    const [path] = await service.list();

    expect(path!.skillOutcomes).toEqual([]);
  });
});
