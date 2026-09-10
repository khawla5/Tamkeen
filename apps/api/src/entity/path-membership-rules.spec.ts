import { checkPathMembership, exceedsLimits } from './path-membership-rules';

/**
 * The path cap (TAM-141, D-134).
 *
 * The rule exists to stop one course becoming every path's filler — a supplier
 * putting a generic item into all twelve paths has edited every ladder in the
 * ministry, which is path content the admin owns (§4C.4).
 */
const limits = { maxPaths: 3 };
const paths = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `path-${index + 1}` }));

describe('checkPathMembership', () => {
  it('permits a set at the cap', () => {
    expect(checkPathMembership({ current: [], next: paths(3), limits })).toEqual({ ok: true });
  });

  it('refuses one over the cap', () => {
    expect(checkPathMembership({ current: [], next: paths(4), limits })).toEqual({
      ok: false,
      error: 'PATH_LIMIT_EXCEEDED',
    });
  });

  it('permits leaving a path even from over the cap', () => {
    /* Grandfathering: a course seeded before the cap, or one left over after the
       limit was lowered, keeps what it has — learners may hold it through an
       assigned path — but may only shrink. */
    const over = paths(5);

    expect(checkPathMembership({ current: over, next: over.slice(0, 4), limits })).toEqual({
      ok: true,
    });
    expect(checkPathMembership({ current: over, next: over.slice(0, 2), limits })).toEqual({
      ok: true,
    });
  });

  it('refuses an addition while over the cap, with its own code', () => {
    /* Its own code so the form can say "remove only" rather than showing a cap
       message about a state the entity did not create. */
    const over = paths(5);

    expect(
      checkPathMembership({ current: over, next: [...over, { id: 'path-9' }], limits }),
    ).toEqual({ ok: false, error: 'PATH_MEMBERSHIP_FROZEN' });
  });

  it('refuses a swap while over the cap — it is an addition too', () => {
    const over = paths(5);

    expect(
      checkPathMembership({ current: over, next: [...over.slice(0, 4), { id: 'path-9' }], limits }),
    ).toEqual({ ok: false, error: 'PATH_MEMBERSHIP_FROZEN' });
  });

  it('permits emptying the set entirely', () => {
    expect(checkPathMembership({ current: paths(2), next: [], limits })).toEqual({ ok: true });
  });
});

describe('exceedsLimits', () => {
  it('is what "frozen" on the form means', () => {
    expect(exceedsLimits(paths(3), limits)).toBe(false);
    expect(exceedsLimits(paths(4), limits)).toBe(true);
  });
});
