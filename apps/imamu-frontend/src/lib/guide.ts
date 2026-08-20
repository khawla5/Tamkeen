// The AI assistant is named قايد (CLAUDE.md rule 6). In Arabic it must render as
// «قايد (Guide)» with the Latin gloss bidi-isolated (FSI … PDI) so RTL never
// reorders the parentheses. In English it is just "Guide".
//
// This is the plain-string form for non-JSX contexts (e.g. driver.js popover
// copy). A React <GuideName> component is Workstream A's; reuse this helper for
// its string needs rather than re-implementing the bidi handling.

const FSI = '⁨' // First Strong Isolate
const PDI = '⁩' // Pop Directional Isolate

export function guideName(lang: 'en' | 'ar'): string {
  return lang === 'ar' ? `قايد${FSI} (Guide)${PDI}` : 'Guide'
}
