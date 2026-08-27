import { checkPathMembership, distinctLetters, exceedsLimits } from './path-membership-rules';

/**
 * TAM-141. The rules are pure, so the whole matrix is cheap to pin: the cap,
 * coherence, the order they are reported in, grandfathering as remove-only,
 * and the general-course exemption.
 */

const P = (id: string, riasecLetter: 'R' | 'I' | 'A' | 'S' | 'E' | 'C') => ({ id, riasecLetter });
const limits = { maxPaths: 3, maxLetters: 2 };

describe('path membership rules (TAM-141)', () => {
  it('derives distinct letters in first-seen order', () => {
    expect(distinctLetters([P('a', 'S'), P('b', 'S'), P('c', 'E')])).toEqual(['S', 'E']);
  });

  it('accepts up to the cap within two letters', () => {
    expect(
      checkPathMembership({
        current: [],
        next: [P('a', 'S'), P('b', 'S'), P('c', 'E')],
        limits,
        isGeneral: false,
      }),
    ).toEqual({ ok: true });
  });

  it('refuses a fourth path', () => {
    expect(
      checkPathMembership({
        current: [],
        next: [P('a', 'S'), P('b', 'S'), P('c', 'S'), P('d', 'S')],
        limits,
        isGeneral: false,
      }),
    ).toEqual({ ok: false, error: 'PATH_LIMIT_EXCEEDED' });
  });

  it('refuses three letters even under the cap — the cap alone does not protect the signal', () => {
    expect(
      checkPathMembership({
        current: [],
        next: [P('a', 'R'), P('b', 'S'), P('c', 'C')],
        limits,
        isGeneral: false,
      }),
    ).toEqual({ ok: false, error: 'PATH_MIX_INCOHERENT' });
  });

  it('reports the cap before coherence when both are broken', () => {
    expect(
      checkPathMembership({
        current: [],
        next: [P('a', 'R'), P('b', 'I'), P('c', 'A'), P('d', 'S')],
        limits,
        isGeneral: false,
      }),
    ).toEqual({ ok: false, error: 'PATH_LIMIT_EXCEEDED' });
  });

  describe('grandfathering', () => {
    const over = [P('a', 'R'), P('b', 'I'), P('c', 'A'), P('d', 'S')];

    it('lets a course already over the limits remove memberships', () => {
      expect(
        checkPathMembership({ current: over, next: over.slice(0, 2), limits, isGeneral: false }),
      ).toEqual({ ok: true });
      /* Still over the cap after the removal — allowed, it is moving the right way. */
      expect(
        checkPathMembership({ current: over, next: over.slice(0, 3), limits, isGeneral: false }),
      ).toEqual({ ok: true });
    });

    it('does not let it add, even while removing others', () => {
      expect(
        checkPathMembership({
          current: over,
          next: [P('a', 'R'), P('z', 'R')],
          limits,
          isGeneral: false,
        }),
      ).toEqual({ ok: false, error: 'PATH_MEMBERSHIP_FROZEN' });
    });

    it('is recognised by either limit', () => {
      expect(exceedsLimits([P('a', 'R'), P('b', 'I'), P('c', 'A')], limits)).toBe(true);
      expect(exceedsLimits([P('a', 'R'), P('b', 'R'), P('c', 'R'), P('d', 'R')], limits)).toBe(
        true,
      );
      expect(exceedsLimits([P('a', 'R'), P('b', 'S')], limits)).toBe(false);
    });
  });

  it('exempts a general course entirely', () => {
    expect(
      checkPathMembership({
        current: [],
        next: [P('a', 'R'), P('b', 'I'), P('c', 'A'), P('d', 'S'), P('e', 'E')],
        limits,
        isGeneral: true,
      }),
    ).toEqual({ ok: true });
  });
});
