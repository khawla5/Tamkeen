# Design foundation on the DGA's Platforms Code, the brand assets, and the landing page rebuilt on the BRD

**Branch:** `feature/dga-alignment` → `main` · 4 commits · Decision **D-069**

## What was built

**1. Platforms Code foundations (D-069) — the whole app recolours**

- The DGA's national design system replaces the navy/gold brand: primary green, neutrals and status colours as tokens in `globals.css`; every shadcn role derives from them. **Gold is not adopted at all** — the recommendation and achievement highlights move onto the primary (border + "موصى به" badge, never colour alone). Buttons follow the system's default → hovered → pressed model.
- The contrast proof (`contrast.test.ts`) was rewritten for the new pairings — 34 assertions, including negative ones recording why the system's own gold-600 (2.3:1 on white) may not carry text — and asserts the retired tokens no longer exist.
- 24 web files migrated through one fixed class mapping; the certificate PDF, emails and QR code take the same values so the brand does not split at the PDF boundary.
- `CLAUDE.md §3` rewritten; stale "gold" wording replaced across CLAUDE.md; `decisions.md` D-069 (with the no-gold addendum).

**2. Brand assets**

- The Tamkeen lockup (from the reference repo) and the **Ministry of Interior emblem** (supplied by the ministry; viewBox tightened to the artwork) as `Logo` / `MinistryEmblem` — Arabic accessible names only, the emblem never a link. Header, footer, sidebar.
- `SaudiMap`: the thirteen administrative regions with their official Arabic names (Simplemaps data, attributed), a sequenced reveal, an ambient drift, and a hover that deliberately never sets `fill` so the drift keeps running under the pointer (test-guarded).

**3. Landing page rebuilt on the BRD**

- The previous page (PR #5) was a faithful port of the reference repo and read as a template. Every section was rewritten in the Directorate's register from BRD §1–3, §8, §9 — specific nouns, no slogans, no symmetrical card grids, numbers interpolated from the shared constants.
- **Hero → "عن المنصة" explorer → FAQ → Footer.** The hero on the ministry's deep green (`primary-deep`, AA-proven) with the emblem above the named map; the explorer in the Absher pattern (stage tabs → steps → explanation + the one action, 13 steps from the functional requirements), which supersedes the separate steps section; six FAQ answers that are locked product rules; a government footer with identity, the three real links, and policy names as text until their pages exist. The problem, trust and closing-CTA sections were removed as marketing.
- `CLAUDE.md §4.0` now specifies the page.

## How it was tested

- **287 web unit tests** (was 256): the landing suite drives the explorer and FAQ; new suites for `Logo`, `MinistryEmblem`, `SaudiMap`, the header lockup, the contrast proof.
- **531 API unit tests** green (certificate/email template tests updated for the new colours and the no-gold rule).
- Typecheck (web + api), ESLint, Prettier clean.
- Visual review in the browser by the product owner at each step; SVG placement additionally verified by rasterising the live markup at panel scale.

## Decisions

- **D-069** — Platforms Code adopted in full; gold not adopted; buttons on the system model; supersedes D-009/D-025.

## Open items (tracked in progress.md)

- **Blocker 0:** the token values came from the system's published export and must be re-checked against the official Figma by someone with access; whether Platforms Code compliance is mandatory for this platform; the certificate PDF still carries the placeholder mark (D-051, web surfaces now closed).
- All landing copy is placeholder until الإدارة العامة للتدريب signs it off.
- Next: the `auth-ui-port` epic (`tickets.md`) — the auth pages are the last public surface still on the old `AuthCard`.

## Done-when

The public surface and the token layer are on the national design system; the signed-in portal is recoloured by construction and its component alignment is a follow-up epic (TAM-117).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
