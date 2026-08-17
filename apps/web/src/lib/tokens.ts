/**
 * The brand palette as data (CLAUDE.md §3 / D-009).
 *
 * `globals.css` is the runtime source of truth; this mirror exists so the
 * contrast tests can compute against the same seven values. The test suite
 * asserts the two stay in sync, so this cannot silently drift.
 */
export const BRAND = {
  navy: '#222E42',
  navySoft: '#2E3A50',
  gold: '#A8863C',
  goldLight: '#C9A85C',
  cream: '#F4F3F1',
  surface: '#FFFFFF',
  muted: '#5E6B85',
} as const;

export type BrandToken = keyof typeof BRAND;
