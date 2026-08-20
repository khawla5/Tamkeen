/**
 * The brand palette as data (D-042, superseding the values D-009 locked).
 *
 * `globals.css` is the runtime source of truth; this mirror exists so the
 * contrast tests can compute against the same values. The test suite asserts
 * the two stay in sync, so this cannot silently drift.
 *
 * Each entry earns its place by being used: `goldDeep` is the only gold that
 * may carry body-size text (on white), `sky` is the border line, `goldPale` is
 * the warm section wash behind the stakeholder selector, and `ink` is the
 * near-black olive the closing section sits on. `navyDeep` and `blue` are in
 * the reference but nothing here uses them yet, so they are deliberately
 * absent — an unused token is one more thing a reviewer has to check.
 */
export const BRAND = {
  navy: '#0A2E42',
  navySoft: '#045D84',
  gold: '#99823F',
  goldDeep: '#806B30',
  goldLight: '#B7A362',
  goldPale: '#F5F0E3',
  sky: '#B3DDF5',
  cream: '#DFE7F4',
  surface: '#FFFFFF',
  muted: '#566577',
  ink: '#1A1409',
} as const;

export type BrandToken = keyof typeof BRAND;
