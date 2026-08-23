/**
 * The Platforms Code (كود المنصات) palette as data — the DGA's national design
 * system, adopted in full (D-069, superseding D-009/D-025).
 *
 * `globals.css` is the runtime source of truth; this mirror exists so the
 * contrast tests can compute against the same values. The test suite asserts
 * the two stay in sync, so this cannot silently drift.
 *
 * Values are the system's published tokens (Figma variable export): the
 * Saudi-flag green primary scale, the neutral scale and the semantic status
 * colours. The system's gold secondary is deliberately NOT adopted: the
 * product uses the primary for recommendation and achievement too, so one
 * colour means "this matters" (D-069 addendum). Only the steps the UI actually consumes are
 * mirrored here; the scale steps exist in globals.css for the same reason.
 */
export const PALETTE = {
  /* Primary — Saudi flag green. 600 is the system's "primary". */
  'primary-50': '#f3fcf6',
  'primary-100': '#dff6e7',
  'primary-200': '#b8eacb',
  'primary-600': '#1b8354',
  'primary-700': '#166a45',
  'primary-800': '#14573a',
  'primary-900': '#104631',
  /* Ministry-requested hero ground; deeper than the system's 900. */
  'primary-deep': '#00663d',

  /* Neutrals. 800 is display text, 500 secondary text, 300 borders. */
  'neutral-50': '#f9fafb',
  'neutral-100': '#f3f4f6',
  'neutral-200': '#e5e7eb',
  'neutral-300': '#d2d6db',
  'neutral-400': '#9da4ae',
  'neutral-500': '#6c727e',
  'neutral-700': '#384250',
  'neutral-800': '#1f2a37',
  'neutral-900': '#111927',

  surface: '#ffffff',
  /* Alias of neutral-500 kept as a named token for the opacity utilities. */
  muted: '#6c727e',

  /* Semantic status — the system's text/border values, with their 50 fills. */
  success: '#067647',
  'success-50': '#ecfdf3',
  info: '#175cd3',
  'info-50': '#eff8ff',
  warning: '#b54707',
  'warning-50': '#fffaeb',
  danger: '#b42318',
  'danger-50': '#fef3f2',
  /* The destructive button's own states: default 600, hover = danger, pressed 900. */
  'danger-600': '#d92c20',
  'danger-900': '#7a2619',
} as const;

export type PaletteToken = keyof typeof PALETTE;
