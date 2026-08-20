# progress.md — Running Implementation Log

> **Read this right after `CLAUDE.md` at the start of every session.** It tells you the last thing implemented so you can continue from there.
> **Update this file at the end of every session** (every meaningful output): what was done, what's next, blockers. Newest entry on top.

---

## Current status
- **Current phase:** Phase 1 — Assessment (RIASEC) + path core — **COMPLETE, user approved the test, awaiting human review of the PR.**
- **Last completed task:** All of Phase 1. Checkpoints A–C reviewed and approved by the user, plus a hands-on run of the built app. PR opened from `phase-1-assessment-core` → `main`; **not merged** (human review gate, D-008).
- **Next task:** After the Phase 1 PR is merged, begin **Phase 2 — Moodle integration**. First step is the **spike**, before any other Phase 2 work: prove *enrol a user via API → they complete a course in Moodle → the backend detects completion + grade*. Then swap `MOODLE_MODE=real` and run `describeLmsContract` against `MoodleHttpService`; if it passes, no caller changes (D-030).
- **Active branch:** `phase-1-assessment-core` (5 commits, based on `main` @ b478327).
- **Open blockers / questions for the human:**
  1. **CI failed on its first Phase 1 run and has been fixed** — the workflow never seeded, and from Phase 1 the tests need real content. Verified by running the workflow's exact sequence against a fresh database. Confirm the re-run is green before merging.
  2. **GitHub CLI is still not installed on the dev machine**, so the PR could not be opened from the terminal. The branch is pushed; see the log entry below for the compare URL and the PR body.
  3. **The Arabic question wording is a reviewed first draft** (D-032). Question keys are stable, so revisions need no migration — hand over edits whenever the ministry has them.
  4. **Ministry values still placeholders** (not blocking, needed before Phase 7): the real allowed email domain (currently `ministry.gov.example`) and the real employee-ID format (currently a permissive regex).

---

## Deferred / owed (carried into later phases)
- **The landing page describes features the codebase does not have** (D-043): an AI advisor, AI-matched opportunities, a skills record, application tracking, employer and provider portals, a demo account. Either CLAUDE.md §1 is out of date or the page is. **Blocking for launch.**
- **Partner logos now ship** (D-045): 41 institution marks plus two partner marks and the university emblem, ~2.9 MB in `public/brand/`. Neither the marks nor the "in partnership with" line can be verified from this repository — they need written confirmation before launch, and the folder is worth an optimisation pass. **Phase 7.**
- **Superseded:** partner names ship; partner logos do not (D-044).
- **The footer names eight pages that do not exist** (opportunities, skills record, assessment, four role dashboards, about, contact, privacy, terms). They render as labels, not links, until their routes are built; `FOOTER_GROUPS` has the `href` slot ready.
- **The landing copy names specific companies as opportunity sources** (D-043). Ported verbatim from the reference at the user's request; unverifiable from this repository. Needs confirmation before launch. **Phase 7.**
- **The authenticated screens have not been reviewed since the palette swap** (D-042). They pass the contrast suite; nobody has looked at them. **Before the PR is approved.**
- **Brand assets were copied from the reference repo, which has no LICENSE file.** Used on the user's confirmation that it is their team's repo. Worth a written confirmation before launch. **Phase 7.**
- **The landing sections below the hero do not match the reference** — they are the ministry-brief structure. Porting the reference's own sections is outstanding.
- **The English catalog is an unreviewed first draft** (D-041). 370 strings translated by the implementer; needs a native review, and confirmation that an English surface is wanted at all. **Phase 6 Arabic/content QA.**
- **The API and its documents stay Arabic-only.** Certificates, CV and email ignore the UI locale by design (D-041). If English documents are ever wanted, that is a separate decision with its own PDF work.
- **The landing hero's four figures (78% / 1,247+ / 312+ / 18+) are unverified marketing claims.** They are not computed from anything in the repo. They need an owner and a confirmation date before the page is published. **Phase 7 acceptance.**
- **The landing hero addresses university students; the rest of the page and the whole app address ministry employees.** Either CLAUDE.md §1 is out of date or the other sections need the same copy pass. Blocking for launch, not for the branch.
- **The header's language switcher is a non-functional placeholder** (D-039). It shows "English" but there is no English build; it must be either implemented (full `en.json` + LTR pass, which reverses D-024) or removed before launch. **Phase 6/7.**
- **Profile is read-only.** §4.12 also lists change-password, email re-verification and a language switch. None is a Phase 1 deliverable; the page exists because §4.2 puts Profile in the pre-assessment nav and that link must lead somewhere real. **Phase 5/6** owns the rest.
- **Certificates and CV are absent from the navigation** until **Phase 3** builds them (D-037). Deliberate: a nav item leading nowhere advertises what the product cannot do.
- **A confirmed path can exist without its LMS enrolments.** Enrolment is best-effort after the commitment is recorded and is audited on failure; **Phase 2's sync job** owns reconciliation (D-036).
- **My Path reads live LMS progress but never persists it.** Writing `completions` is **Phase 2's** job; two writers on those rows would be a race (D-036).
- **`courseUrl` points at the mock (`localhost:8080`) and does not resolve.** Expected until **Phase 2** stands up Moodle and the seamless handoff.
- **`user_path_courses.enrolledAt` stands in for the optional `enrollments` table** (§6). It earns its own table in **Phase 2**, when sync debugging needs more than a timestamp.
- **The balance rule must survive Phase 5's assessment editor.** `isBalancedBank` fails CI if an edit unbalances the bank; **Phase 5** must either keep it balanced or move ranking to normalised percentages (D-032).
- **Rate limiting is in-process** — per-instance counters, so horizontal scaling multiplies the effective limit. **Phase 7** must swap in a shared store when deployment topology is decided. Per-account lockout is in the database and unaffected. (D-028)
- **`postcss` / `sharp` are pinned via npm `overrides`** to clear 3 high CVEs while holding Next 15. Each Next upgrade must re-check the pins. **Phase 6** dependency review owns this, and should consider dropping the `sharp` pin by disabling `next/image` optimisation entirely. (D-022)
- **Narrow-viewport layout not visually verified.** The `md:` breakpoint logic exists; the browser resize did not take effect during the Checkpoint C review, so no claim is made. **Phase 6** accessibility/responsive pass.
- **Employee IDs are format-validated, not verified.** Real verification needs a ministry roster or `admin-only` provisioning; the `REGISTRATION_MODE` switch exists for that decision. (D-017)
- **Entity scoping is not built.** RBAC is role-based only; which courses/learners an entity may see is data-scoped filtering and belongs with the entity model in **Phase 4**. (D-027)
- **`packages/types` holds only roles, locale and formatting.** RIASEC/path/certificate types arrive with the phases that define them.

---

## Decisions locked (see `decisions.md` for rationale)
- Assessment is **Holland (RIASEC)**: scoring tallies per dimension → ranked profile → top-three **Holland Code**.
- **Each path is tagged with one RIASEC letter**; a path is gold if its letter is in the user's top-three code, ranked by the user's letter order. (See CLAUDE.md §3A.)
- Arabic-first, RTL, from day one.
- One path per user; no switching once confirmed.
- 5–10 courses required to confirm a path.
- One Moodle course can belong to multiple paths; reuse completion for shared courses.
- Gold = recommendation highlight, not restriction.
- Certificates issued by our app (Arabic PDF), idempotent; pass threshold is a product setting.
- Email/password auth only, with email verification.
- MVP Moodle integration: scheduled sync job + token-mapped handoff; OAuth2/SSO is a hardening target.
- Color system fixed (see CLAUDE.md §3).
- **Stack locked (D-013):** Next.js 15 + Tailwind + shadcn/ui + next-intl (frontend); NestJS (backend); PostgreSQL + Prisma; Redis + BullMQ; headless-Chromium PDF; Moodle 4.5 LTS + REST + Catalyst RESTful plugin, isolated behind one NestJS module.
- **Engineering standards + Definition of Done (D-014):** testing (unit+integration+e2e, explicit RIASEC tests, mock shares real Moodle contract), mandatory loading/empty/error states, WCAG 2.1 AA, Conventional Commits, CI gates. This is what "the test" in the PR rule means.
- **Assessment retake pre-commitment only; course-edit protection (D-015).**
- **Certificate verification: unique ID + QR/public page (D-016).**
- **Restricted (ministry-scoped) registration, not open sign-up (D-017).**
- **Digits/dates: Western Arabic numerals default + single locale switch (D-018).**
- **Security/privacy baseline:** audit log, rate-limiting/lockout, PII minimization + retention (see CLAUDE.md §2).
- **Ties break on canonical R-I-A-S-E-C order (D-031)** — the ordering is total, so a Holland Code is reproducible.
- **The question bank is 30 Likert items, 0-4, balanced by construction and enforced in CI (D-032).**
- **Assessment retakes append; results are never overwritten (D-033).**
- **RIASEC ranking + the gold rule live in `packages/types`; the tally and the weights never leave the server (D-034).**
- **Schema constraints carry the product rules — unique `user_paths.user_id`, weights as an enum table, `Restrict` from responses to the bank (D-035).**
- **LMS provisioning is lazy at confirm; enrolment is best-effort after the commitment is recorded; live progress is read, never persisted (D-036).**
- **Authenticated pages sit behind one `PortalProvider`; Certificates/CV stay out of the nav until Phase 3 builds them (D-037).**

---

## Log (newest first)

### 2026-08-20 — Landing page extended to the full seven-section bar (side-track, `feature/landing-page`)

**Asked for:** the reference design's complete top bar — الرئيسية، التحديات، المزايا، كيف تعمل، المنظومة، الشراكات، العرض التوضيحي — with smooth in-page scrolling, an active-section indicator, and section-by-section reference screenshots to match.

**Built (D-040):**
- **Four new sections** so every link lands somewhere real: `features-section` (المزايا), `ecosystem-section` (المنظومة), `partnerships-section` (الشراكات), `demo-section` (العرض التوضيحي), plus `gap-panel` — the navy "كيف يسد تمكين الفجوة" panel that answers the challenge cards.
- **التحديات rebuilt by audience**: eyebrow → two-line headline → gold rule → body → 2×2 cards (employees / training directorate / supplying entities / whoever must trust a certificate), three bullets each.
- **Smooth scrolling**: `scroll-behavior: smooth` on `html`, already overridden back to `auto` by the existing `prefers-reduced-motion` block — a long glide is exactly the motion that preference exists to stop. Every target carries `scroll-mt-20` (clears the sticky header) and `tabIndex={-1}` (focus follows the scroll instead of staying in the bar).
- **Active-section pill**: gold-outlined, driven by an `IntersectionObserver` over a thin strip below the header.

**Two defects found and fixed during the work, both real:**
1. The active pill sat **one section behind** on every click. Cause: `scroll-mt-20` parks the arriving section below the strip while the previous section's bottom edge is still inside it, so both intersect and the "first match" rule always picked the previous one. Now the last match in document order wins. Verified by driving Chromium through all five anchors and reading `aria-current` at each stop.
2. A test asserted an **exact count of 11 `h3`s**, which broke the moment the page grew and taught nothing when it did. Replaced with a heading-outline assertion — one `h1`, no skipped levels — which is the WCAG 1.3.1 property that actually matters and survives new sections.

**Not copied from the reference, deliberately:** its adoption metrics (78% / 1,247+ / 312+) are invented numbers for an unlaunched platform, and no partner is named or badged. The partnerships section describes the shape of a partnership and says the list is published at launch; the demo panels say on the page that the example profile is not a real result.

**Also unchanged on purpose:** eyebrows stay as bordered badges rather than the reference's small gold text — gold is 3.42:1 on white and fails AA for body-size text (D-025), and `contrast.test.ts` enforces it.

**How it was tested:** 147 web tests green (13 files), typecheck and lint clean, prettier applied. Rendered in Chromium at 1280×900 and inspected section by section; the nav-integrity test resolves all seven hrefs against the DOM.

**Hero copy replaced on request (same day):** the user supplied the exact hero text and asked for it verbatim, so the ministry framing ("منصة داخلية لموظفي الوزارة" / "مسارك المهني — من التقييم إلى الشهادة") is now university framing ("منصة تمكين المهنية لطلاب الجامعات" / "تمكين مسيرتك المهنية في الجامعة"), with the CTAs "ابدأ رحلتك" / "استكشف الفرص" and the four figures 78% / 1,247+ / 312+ / 18+. The hero's "لديك حساب بالفعل؟" line is gone — it was not in the supplied copy, and the header still carries a sign-in action.

**Two things this raises, both flagged to the user and both still open:**
1. **The figures are unverifiable from this repository.** Nothing here counts placements, assessed students, or an employment rate; the previous four were catalogue facts checkable against `apps/api/src/seed-data/catalog.ts`, and these are not. The concern was raised twice and the user asked for them explicitly, which is their call — but the page now asserts numbers that need a named owner and a confirmation date before it is published. `HERO_STATS` carries a provenance comment saying so.
2. **The hero now describes a different product than the rest of the page and the rest of the app.** The hero addresses university students; the challenges section addresses ministry employees and directorates, and the whole application behind it (RIASEC, 5–10 courses, ministry-restricted registration) is the CLAUDE.md §1 product. Either the product is pivoting — in which case CLAUDE.md is now out of date and should be updated first — or the remaining sections need the same copy pass. Not resolved in this session.

**Hero figures animate on load (`use-count-up.ts`):** each stat counts from zero to its value over 1.4s with an ease-out, once per page load.

Three copies of every figure, because one cannot serve all three readers: the counting one, a `motion-reduce:` twin that CSS swaps in for readers who asked for less motion — correct from the *first paint*, with no JavaScript involved (WCAG 2.3.3) — and a visually-hidden twin that is the only copy in the accessibility tree, so the number is announced once at its final value rather than re-announced on every tick.

**A defect found by measuring rather than by reading the code:** the first version initialised state to the target so the server-rendered HTML would carry the real figure. Driving Chromium and sampling the DOM showed what that actually does — the browser paints "1,247", then hydration runs ~700ms later, snaps it to zero, and counts back up. Initialising at zero makes the first paint and the first animation frame agree, and the number now only ever moves upward. Verified again after the fix: 0 → 35% → 75% → 78% and landing exactly on target, with the reduced-motion page showing the final figures from the first paint. Five hook tests cover the reduced-motion path, the exact landing (an easing function that never quite reaches 1 would leave the page advertising "1,246" forever), and an environment with no `requestAnimationFrame`.

**Language switch built for real (D-041, supersedes the RTL-only half of D-024).** The header placeholder is now a working control. The locale lives in a `tamkeen.locale` cookie; the request config picks the catalog from it and the root layout derives `<html lang>` and `<html dir>` from the same value, so the document cannot end up Arabic-but-LTR.

**The whole catalog was translated — 370 strings, every namespace**, not just the landing page's share. Translating only the landing page was the cheaper option and a trap: switch to English, click "Sign in", land in Arabic. `messages.test.ts` grew five assertions to keep the two catalogs from drifting — identical key sets, identical ICU placeholders per key, no leftover Arabic in `en.json`, no hardcoded digits. The placeholder check matters most: a dropped `{count}` still reads as a fluent sentence, so nothing else would catch it.

Direction-sensitive pieces flip rather than duplicate: the hero artwork is drawn once for RTL and mirrored with `ltr:-scale-x-100`, and the directional glyphs rotate under `ltr:` instead of being swapped for `ArrowRight`.

**Held out of scope on purpose:** the API stays Arabic-only (`DEFAULT_LOCALE: z.literal('ar')`), so certificates, the CV and transactional email are unaffected — an English certificate is a document decision for the ministry, not a side effect of a UI toggle. All 189 API tests still pass.

**Verified in Chromium, not just in tests:** clicking the switch takes the page from `lang=ar dir=rtl` with Arabic headings to `lang=en dir=ltr` with English ones and back again, the cookie following each time, with no horizontal overflow in either direction. One layout defect found and fixed on the way: "How it works" wrapped to two lines and pushed the header out of alignment, so nav labels are now `whitespace-nowrap`.

**Owed:** the English copy is a **first draft by the implementer, not a reviewed translation** — same standing as the Arabic question wording (D-032). It needs a native review, and the ministry needs to confirm it wants an English surface at all.

**Rebranded onto the reference frontend's palette and artwork (D-042).** The user pointed at `AhmadIbrahiem/frontend` and asked for an exact match; three decisions were put to them first and answered: the authoritative branch is **`master`** (the branch named `Tamkeen` is a different, dark design), the reference's palette wins over CLAUDE.md §3, and the hero background image is copied rather than redrawn.

**Done:** brand tokens repointed at the reference values under the same names, so the whole app inherits the brand with no component edits; `hero-backdrop` now renders the reference's background image through `next/image` with the direction-aware legibility wash it uses; the hand-drawn wordmark replaced by the brand's real logo lockup; the hero eyebrow is gold text in the reference's tracked-uppercase style, scoped to `ltr:` because Arabic has neither uppercase nor room for letter-spacing.

**Four measured refusals**, each with a test: the reference's muted grey fails AA as secondary text (3.53:1) so the hue is kept and the value darkened; its pale sky line is fine for card edges but not for form-field borders (1.44:1 against WCAG 1.4.11's 3:1); its white-on-gold `--secondary` is 3.74:1; and both its functional colours fall below the floor for the error and success text they carry. The contrast suite was re-baselined and passes at 31 assertions.

**Still not matching the reference, and worth knowing:** everything *below* the hero is still the structure and copy written for the ministry brief — the reference's own sections (its problem/solution, stakeholder, user-journey, partnership and closing-CTA treatments) have not been ported. Matching those is the next chunk of work, not something this session did.

**Two things to weigh before this ships:** the palette change repaints every authenticated screen, and those have passed the contrast suite but have not been looked at; and the hero source PNG is 1.7 MB (served optimised via `next/image`, but heavy in the repo).

**Remaining sections ported from the reference (D-043).** Everything below the hero was rebuilt to `master`'s structure and copy, with matching ids and order: challenges (four audience cards + a navy panel answering them in five lines), the four-step roadmap on navy, three beneficiary journeys, five platform stakeholders, partnerships, and the closing CTA. `steps-section`, `trust-section` and `demo-section` were deleted; `journeys-section` is new; the nav's "العرض التوضيحي" now points at `#cta`, which is the reference's own demo invitation.

**The important consequence, stated plainly:** the landing page now describes an AI advisor, AI-matched employer opportunities, a skills record, application tracking, and employer and training-provider portals. **None of it exists in this repository** — what is built is the ministry system in CLAUDE.md §1. The page and the app behind it now describe two different products. This was the instruction and it is the user's call, but it needs resolving before launch: either CLAUDE.md is out of date, or the page is.

**One thing handled differently, deliberately:** the reference's two-dozen-logo partner wall is not ported — third-party trademarks, and a partnership held by one product does not transfer by being rendered in another's markup.

**The copy itself is verbatim.** Two lines were softened on the first pass and restored on request: the advisor's name keeps its Latin gloss "قايد ⁨(Guide)⁩" with its U+2068/U+2069 bidi isolates, and the line naming specific employers as opportunity sources keeps their names. The first needed the `ar.json` Latin guard to gain an allowlist — keyed by exact path, with a companion test asserting each allowlisted entry still carries Latin, so the guard keeps catching everything else. The second is a claim about commercial relationships that nothing in this repository substantiates; it is the reference site's claim, made knowingly.

**Verified:** 158 web tests green, typecheck and lint clean, both catalogs still at full parity. Driven in Chromium: all seven nav links resolve to a section that exists, no horizontal overflow, no console errors. One test was retargeted rather than deleted — it asserted the old "5–10 courses" line, which this page no longer says; it now checks that the hero's grouped figure comes from the formatting layer, allowing for the bidi isolation marks `Intl` inserts around the percent sign.

**Stakeholders, partners, CTA and footer rebuilt to the supplied content (D-044).** The stakeholder section gained the sixth actor that was missing (the graduate track) and became a real WAI-ARIA tablist — roving tabindex, arrows, Home/End, focusable panel, and arrow directions mirrored for Arabic so "next" is the key pointing at the end of the line. Partnerships now lists the academic partner and all forty participating institutions by name. The CTA gained the dashboard mock. The footer is the full four-column version, and lost the ministry classification line that read "internal — for government use" under a page about university students.

**Three judgement calls, each recorded in D-044:** the partner *logos* are not copied (three dozen third-party trademarks, a licensing question per file, nothing gained over the names); the list is wrapped rather than a marquee (a scrolling row cannot be scanned or searched, and stops under reduced motion anyway); and footer items link only where a page exists — only sign-in does, so the rest render as labels with an `href` slot ready for when their routes are built.

**Added to the shared formatting layer:** `formatYear`, because `formatNumber` renders 2026 as "2,026" and a year is the one number that must not be grouped. The copyright line still goes through the layer, so the D-018 digit switch reaches it.

**Then the layouts were matched as well**, read from the reference's source rather than guessed from screenshots: the six-across icon-topped selector with a gold underline on the active card over a white three-column panel, all on a warm gold wash; the partnership card with its filled gold band; the centred closing section on near-black with the mock beneath; and the four-column navy footer under a gold hairline. Two more tokens came across with it — `gold-pale` (#f5f0e3) and `ink` (#1a1409) — and seven new contrast assertions cover them, including the two the layouts depend on: white on gold-deep at 5.25:1 for the partner band, and light gold on navy at 5.67:1 for the footer headings.

**Verified:** 166 web tests green, typecheck and lint clean, catalogs at full parity, eight now-unused keys pruned. Driven in Chromium: the tablist moves correctly under ArrowLeft in RTL and the panel follows, no horizontal overflow, no console errors.

**Asset and motion migration, traced rather than copied (D-045).** Following every import from the reference's landing entry point turned up 44 missing asset files — the page was referencing files that were not in this repository. All are now in `apps/web/public/brand/`: 41 institution marks, the technology and training partner marks, and the university emblem. The partner row is the reference's marquee again, and the roadmap has its scroll-reveal back via `framer-motion`, wrapped once at the root in `MotionConfig reducedMotion="user"` — the CSS reduced-motion block cannot reach JavaScript-driven transforms.

**Two findings from the trace worth keeping:** the landing sections import nothing at all from `hooks/`, `lib/` or `utils/`, so none of those directories needed migrating; and only one animation class appears in the whole landing tree, so the float/shimmer/pulse keyframes in the reference stylesheet (they belong to a different branch's hero) stayed behind.

**Not migrated, deliberately:** `components.json` (declares `rsc: false` and `rtl: false` — it would misconfigure future shadcn additions here), the Geist typeface (IBM Plex Sans Arabic already carries Latin; the user chose to keep one face), and the reference's router, Supabase, charting and tour dependencies.

**One consequence in the test environment:** framer-motion's `whileInView` needs `IntersectionObserver`, which jsdom lacks — it took eleven landing tests down on the first run. `vitest.setup.ts` now shims it alongside the existing `showModal` shim, reporting observed elements as intersecting so assertions see the settled state.

**Verified in Chromium by walking the whole page:** 87 images, none broken, zero failed requests, zero console errors. 166 tests green across 14 files, typecheck and lint clean.

**Next:** unchanged — user sign-off, then push `feature/landing-page` and open the PR. Not pushed, not merged.

---

### 2026-08-20 — Landing hero rebuilt as an illustrated scene (side-track, `feature/landing-page`)

**Asked for:** first, that the hero copy sit at the start of the line (right in Arabic, left in an LTR layout) rather than centred; then that the hero match a supplied reference design — an illustrated sky-and-dunes scene with a left-aligned headline, pill chips, pill buttons and a stat row.

**Built:**
- **Start-aligned hero copy** — `text-start` (logical, so it is right in RTL and left in LTR without a second rule); the paragraph, chip row and button row realigned to match, so the block reads as one column instead of a centred paragraph over centred buttons.
- **`hero-backdrop.tsx`** — a new inline-SVG scene: graded sky, two-layer cloud bank (a `sky-deep` underside under white bodies, which is what makes a cloud read as a cloud), horizon haze, cream dunes that dissolve into the next section's background, and a frond drawn *on top of* the dunes so it sits in the foreground. Authored mirrored — art on the left, text column on the right (D-024).
- **Three decorative tints** in `globals.css` (`sky-pale` / `sky` / `sky-deep`), declared as tokens rather than hardcoded, and constrained by the rules in D-038.
- **Hero restyle** — rule-plus-label eyebrow (no letterspacing: Arabic is cursive and has no uppercase), larger headline with the gold second line kept, chips tinted to the sky, rounded-full buttons, and a start-aligned stat row whose leading figure is gold.
- **Header restyle** — inline brand mark + Arabic/Latin lockup, anchor links to the three sections that actually exist (`#challenges`, `#how-it-works`, `#why-tamkeen`, each given `scroll-mt-20`), and both auth actions as pills.

**Two things deliberately not copied from the reference**, because they would break rules this repo already locked:
1. **The metrics.** The reference shows "78% employment rate / 1,247+ students assessed". Those are invented adoption numbers for a pre-launch platform; the stat row keeps the real catalogue facts (4 steps / 12 paths / 48 courses / 6 RIASEC dimensions) and only borrows the *styling*.
2. **The English nav and language toggle.** D-024 is RTL-only with no locale switcher, and the reference's seven nav links point at sections this product has no equivalent of. The nav is three real anchors.

**How it was tested:** 146 web tests green (13 files), typecheck and lint clean. `contrast.test.ts` grew from 24 to 32 assertions covering the new tints — including the one that caught a real defect mid-build: the first attempt at a properly blue sky put the **gold headline at 2.72:1**, below the 3:1 large-text floor. The sky is now capped at what gold can sit on, which is a constraint the build enforces rather than a note in a comment. Rendered in Chromium at 1280×900 and 390×844 and inspected: composition mirrors the reference, no horizontal overflow, art degrades to a quiet wash on mobile where `slice` crops it.

**Header, second pass (same day, second reference image):** nav links moved from centred to packed beside the logo, a globe + "English" element added between the links and the actions, and the primary CTA relabelled "ابدأ الآن". Two calls made explicitly with the user (D-039): the language element is a **placeholder rendered as a `<span>`**, since there is no English build to switch to (D-024) and an inert `<button>` would cost a keyboard user a tab stop and tell a screen reader an action exists when it doesn't — a landing test now asserts it is not a control, so it cannot become a button without also gaining behaviour. And the nav keeps its **three real anchors** rather than the reference's seven, because §3 forbids a link that leads nowhere.

**Note:** `messages/ar.json` gained `headerCta` / `navProblem` / `navSteps` / `navTrust`. The Latin half of the logotype is **not** in the catalog — `messages.test.ts` fails any Latin string there, and a logotype is a mark rather than copy, so it lives in the component.

**Next:** still the same gate as the entry below — user sign-off on the live page, then push `feature/landing-page` and open the PR. Not pushed, not merged.

---

### 2026-08-19 — Public landing page built and verified (side-track, not phase-numbered)

**Scope:** a marketing/landing surface at `/landing`, out of the phase sequence — explicitly no auth, assessment, or application logic (brief's own boundary). Ported the section structure of the reference repo (`AhmadIbrahiem/frontend`, read-only) and adapted it to the Ministry BRD: Hero → Problem/solution → four-step journey (assessment → committed path → Moodle courses → certificate/CV) → trust/compliance → final CTA. Dropped the reference's Core Features / Stakeholder / Partnerships sections — they describe a different product's audience and have no Ministry-employee equivalent.

**Built:** `apps/web/src/app/landing/page.tsx` + 6 section components + a new `Badge` primitive, all on branch `feature/landing-page` (2 commits, based on `main` @ f25b644, post-Phase-1-merge). Reuses the existing design system (color tokens, self-hosted IBM Plex Sans Arabic, shadcn primitives, the `useFormat` digit formatter) rather than a second one. Placeholder Arabic copy only — not machine-translated, not Lorem Ipsum — reflecting realistic sentence length; final copy is still owed by the Training Directorate.

**Verified this session** (branch already existed from an earlier session; re-verified rather than trusting the prior state):
- `npm run test`, `lint`, `typecheck` all green on `apps/web`.
- Live in a second dev instance (port 3001, same DB/API): `/landing` renders correctly separate from the authenticated `/` dashboard, `lang="ar"`/`dir="rtl"` on `<html>`, the self-hosted Arabic font is actually applied (not a Latin fallback), first Tab lands on the skip link with a visible 2px gold focus ring, and the page has zero horizontal overflow at a 360px viewport.
- Cross-checked the reference repo's actual section list (`src/pages/Landing.tsx`) to confirm the port is a deliberate adaptation, not a guess.

**Not done:** not pushed to `origin`, no PR opened — this repo's own rule is PR only after a **user-approved** test (D-008), and that approval hasn't happened in this session yet. `decisions.md` already carries D-024 (RTL-only, no locale toggle) and D-025 (gold fails AA as body text; border/icon-only) from the branch's first session.

**Next:** get the user's sign-off on the live page, then push `feature/landing-page` and open the PR (never merge).

### 2026-08-18 — CI failed on the Phase 1 PR; fixed

**Cause:** the workflow applied migrations but **never seeded**. Phase 0's tests only needed authentication, so an empty database was a valid starting state; from Phase 1 the tests need real content — the assessment bank, the paths, the catalogue — and the journey suite collapsed without it. A gap in the workflow, not in the code under test.

**Fixed:**
- `ci.yml` gained a **Seed reference data** step after `db:deploy` (the seed is idempotent, so re-running is safe).
- `journey.e2e-spec.ts` now **fails once, clearly**, on an unseeded database instead of producing forty unrelated-looking assertion failures whose real cause has to be inferred.
- Fixed a genuine e2e flake found while verifying: the skip-link test tabbed immediately after the redirect to `/`, but `PortalProvider` renders only a loading state until the session and dashboard load — so there was no shell and no skip link yet. `signIn` now waits for the navigation landmark, which makes every consumer of the helper safe rather than patching one test.

**Verified** by reproducing against a fresh `tamkeen_ci` database and then running the workflow's exact sequence end to end on it: migrate → seed → format → lint → typecheck → unit → integration → build → Playwright. **459 tests pass from an empty database.**

### 2026-08-18 — Phase 1 complete; PR opened for review

Branch `phase-1-assessment-core`, 5 commits on `main` @ b478327. **Not merged.**

**Test totals:** 355 unit (38 `packages/types`, 189 api, 128 web) · 90 API integration against real PostgreSQL · 14 browser e2e in Chromium. **459 total.** format / lint / typecheck / build clean.

**1.1 Scoring engine + shared contracts** — ranking, tie-breaking, code derivation and the gold sort live in `packages/types` so web and api cannot disagree about what "gold" means (D-034); the **tally** stays server-side because it needs the weights. Ties break on canonical R-I-A-S-E-C (D-031) — without a total order the same answers could yield a different recommendation on a different day. 55 tests covering ties, a clear top-three, and gold matching + ranking, as §2B demands.

**1.2 Question bank** — 30 Arabic Likert items, five per dimension, weights 0-4, **balanced by construction** and asserted (D-032): ranking compares raw scores across dimensions, so an unbalanced bank would produce a code reflecting its own shape rather than the user's interests. Seeded data, not components, with stable keys so wording revisions need no migration. Items are interleaved so no two consecutive statements share a dimension.

**1.3 Schema, migration, seed** — one migration adding assessment/paths/courses tables. Constraints carry the rules (D-035): `user_paths.user_id` is unique so single-path survives concurrent confirms; option weights are a table with an enum column, because a mistyped letter in JSON fails *silently* into a wrong Holland Code; responses reference the bank with `Restrict` so Phase 5 edits cannot rewrite history. Mock catalogue grew 12 → 48 courses (twelve could not support twelve paths each offering a genuine 5-10 choice); 12 paths, two per letter, so the within-letter ordering is actually exercised. Seed is idempotent — verified by three consecutive runs leaving row counts identical. The API tsconfig now typechecks `prisma/`.

**1.4 API** — assessment, paths, courses, path commitment, dashboard. Rules live in services, never controllers. Confirm re-counts **inside** the transaction and guards on `confirmedAt IS NULL` in the `UPDATE … WHERE`, so two concurrent confirms cannot both succeed. Gold ordering calls the shared function rather than an `ORDER BY`. `resolveCourseAction` is pure and returns exactly one value, so §3's "never all three" is enforced by the response shape; an exhaustive sweep over all 48 state combinations asserts it. **No view type carries a weighting** — an integration test greps the whole `/api/assessment` response for `weight`, `dimension`, `points`, `riasec`, and the e2e suite has to read weights out of the database to produce a chosen code.

**1.5 Web** — assessment flow, results with the gold ranking, path build with the live counter and the native-`<dialog>` commitment gate, catalogue + detail, My Path, the dashboard's three states, minimal profile. Authenticated pages sit under a `(portal)` route group; `PortalProvider` loads session + journey state once and owns the 401 redirect (D-037), because the nav depends on that state and a per-page copy would disagree with its own content.

**Three defects the verification pass found — each now has the test that would have caught it:**
- The `{}`→`null` normalisation also flattened an empty **array**, so an empty catalogue never reached its empty state and rendered a heading above nothing. Caught by the catalogue e2e.
- The mock LMS numbered users from a **per-process counter**, so after a restart it handed a new user an id an existing row already held and enrolment died on the `moodle_user_id` unique index. Ids now derive from the email, matching the invariant a real Moodle has; the contract suite asserts stability across instances (D-036).
- `PathCard` paired each value with a visually-hidden `<dt>`, making a screen reader announce *"دورة متاحة، 11 دورة متاحة"*.

**Three more found only by driving the built app in a browser:** the modal pinned to the top (Tailwind's preflight zeroes the `margin:auto` the UA stylesheet centres a `<dialog>` with); the progress track invisible at 0% (cream on white); course detail printing its title twice.

**Also:** error codes moved from `auth.errors` to a top-level `errors` catalogue — they come from one API vocabulary, and splitting them by feature means deciding where a shared code belongs.

**Honest gaps at hand-off:** profile is read-only; `courseUrl` does not resolve until Phase 2; a confirmed path can exist without its LMS enrolments until sync runs; narrow-viewport layout still unverified (carried from Phase 0, Phase 6 owns it); CI has run once.

**Next:** Phase 2 — the Moodle spike first, then the real adapter against `describeLmsContract`.

### 2026-08-17 — Phase 0 complete; PR opened for review

Branch `phase-0-foundations`, 7 commits on `main` @ 6442ed4. **Not merged.**

**Test totals:** 199 unit (12 `packages/types`, 113 api, 74 web) · 38 API integration against real PostgreSQL · 9 browser e2e in Chromium. format / lint / typecheck clean.

**0.1 Monorepo & tooling** — npm workspaces (D-020): `apps/api` NestJS 11, `apps/web` Next 15 + React 19, `packages/types`. Strict shared tsconfig, Prettier + per-workspace ESLint flat configs, `.gitattributes` for LF parity with CI. Zod-validated env at boot. `docker-compose` for PostgreSQL 16 / Redis 7 / Mailpit (D-021). npm `overrides` cleared 3 high CVEs while holding Next 15 (D-022). **Fixed:** `gitignore`/`env.example` had no leading dots, so the ignore file was inert and `.env` was unprotected.

**0.2 Arabic-first RTL / i18n** — next-intl without locale routing (D-024); `lang="ar" dir="rtl"` fixed; all copy in `messages/ar.json` including the document title. The D-018 switch point lives in `packages/types` and is shared by web and api so screen and PDF cannot disagree; next-intl receives the extended tag (`ar-u-nu-latn-ca-gregory`) so ICU-embedded numbers honour it too. Self-hosted IBM Plex Sans Arabic (D-023) — removes a build-time network dependency *and* a third-party disclosure of who uses an internal system. A catalog test fails the build on empty strings, unbalanced ICU braces, stray English, or hardcoded digits.

**0.3 Design tokens & UI shell** — the seven brand colours once in `globals.css` with a shadcn-compatible semantic layer. **Measured** contrast (D-025): gold `#A8863C` is 3.08–3.99:1 and **fails AA for body text on every background**, including as a fill with white *or* navy text; it is now restricted to borders/rings/icons/large text, with light gold + navy (6.01:1) as the AA-safe achievement fill. Two functional colours added outside the palette (danger/success) because mandatory error states need a signal colour and §3 has none. 24 contrast assertions, including negative tests documenting the restriction. `LoadingState`/`EmptyState`/`ErrorState` + a `DataView` that makes the happy path unreachable without handling all three; error outranks empty so a failed request is never reported as "nothing here yet".

**0.4 Database & migrations** — Prisma 7 with the pg driver adapter (D-026); foundation tables only (`users`, `auth_tokens`, `sessions`, `audit_log`, `notifications`), with a test asserting product tables stay absent. Token hashes only; timestamps not booleans; audit references ids only and survives actor deletion via `SetNull`; UUID keys. Seed has no known default password — production requires it explicitly or refuses to run — and is idempotent. RBAC is role-based and code-defined, with no permission table (D-027).

**0.5 Auth & security** — restricted registration (D-017) failing *closed* on an empty allow-list or bad pattern; email verification and reset via single-use hashed tokens; opaque Postgres sessions with immediate revocation (D-028); per-account lockout; double-submit CSRF; global **fail-closed** session guard so a controller added later is protected by omission rather than exposed by it; audit written from services, not controllers. Enumeration resistance end to end, including a dummy argon2 verify to equalise timing. Five Arabic RTL auth pages; a `Field` component makes label/`aria-invalid`/`aria-describedby` structural.
  **Security defect found and fixed (D-029):** `@nestjs/config`'s `ConfigService` reads `process.env` in preference to the validated object, so `ALLOWED_EMAIL_DOMAINS` arrived as a *string* and the domain check became a **substring match** — `attacker@ministry.gov` would have passed a gate set to `ministry.gov.example`. The existing domain test passed for the wrong reason (`gmail.com` fails a substring check too). Config now reads the validated object; tests assert the types and explicit prefix/substring rejection.

**0.6 LMS port (contract-first)** — one `LmsPort` behind the `LMS_PORT` token, in **our** vocabulary; a test asserts Moodle's native field names never reach a caller. The contract is an **executable suite** (`describeLmsContract`) asserting idempotent provision/enrol, `null` for unenrolled, **null grade not 0** for unattempted, copies not shared state, and no token in the course URL — Phase 2 runs the same suite against the real adapter. `LmsCourseProgress` has no `passed` field, asserted, because the threshold is a product setting (D-007). `MOODLE_MODE=real` boots and fails loudly rather than reporting an empty catalogue. Mock-only simulation helpers stay off the port. (D-030)

**0.7 Testing & CI** — Playwright against the built apps, real PostgreSQL and real SMTP; the verification token is read out of Mailpit because the database stores only its hash. Locators are by label and role, which **caught two real accessibility defects**: the required asterisk nested inside `<label>` made the accessible name `"كلمة المرور*"` (a spurious "star"; `aria-hidden` does not help), and `AuthCard` rendered its title twice as an h2 and an h1. Both fixed with regression tests. CI runs format → lint → typecheck → unit → API integration → build → browser e2e.

**Honest gaps at hand-off:** CI has never executed (this PR is its first run); narrow-viewport layout not visually verified; the ministry's real email domain and employee-ID format are still placeholders.

**Next:** Phase 1 — RIASEC content + scoring engine.

### [DATE] — Two open questions resolved (D-019)
- Auth: **email/password only, no AD/LDAP** (user confirmed). Updated CLAUDE.md §2/§5 and Phase 2; annotated D-004.
- Moodle: **latest 4.5.x LTS** (github.com/moodle/moodle newest `v4.5.x` tag; supported to Oct 2027; PHP ≥ 8.1 + sodium + max_input_vars ≥ 5000). Recorded as D-019.
- No open blockers remain for Phase 0 or Phase 2 auth. Application code still not started.
- **Next:** run the Phase 0 kickoff prompt.

### [DATE] — Deep audit: filled 14 gaps
- Attempted to read the repo `AbdullahDamati/tamkeen` — returns 404 (private or not yet created); could not inspect current contents. Treating these files as the repo foundation. If the agent needs the real repo state, it must be made accessible.
- Audited all four files as the build agent would; found and filled gaps:
  - **§2B added** — Engineering standards + Definition of Done; defines what "the test" means (D-014).
  - **Assessment retake** locked to pre-commitment; **course edit/unpublish protection** added (D-015).
  - **Certificate verification** (unique ID + QR/public page) added (D-016).
  - **Registration policy** locked to restricted/ministry-scoped (D-017).
  - **Digits/dates** default + single switch point (D-018).
  - Added product rules for **notifications**, **security/privacy baseline (audit log, rate-limiting, retention, PII handling)**.
  - Clarified the **shared-course reuse** wording so it's coherent under single-path (completion keyed on `(user, moodle_course_id)`, idempotent — no dead cross-path machinery).
  - Data model gained: `courses.status`, `completions` uniqueness, `certificates.verification_id`, `audit_log`, `notifications`, RBAC tables.
  - Phases 0–7 augmented to actually build all of the above (RBAC + audit + mock contract + rate-limiting + states/a11y in P0; retake in P1; idempotent sync + notifications in P2; verification + notification in P3; course-edit protection in P4; retention + CVE/Moodle-pin + backups/restore + Arabic Moodle theme in P6/P7).
- Still no application code yet.
- **Next:** Phase 0 foundations after human confirms the two open questions.

### [DATE] — Stack/architecture locked + README created
- Locked the tech stack and architecture as **D-013** in `decisions.md` (Next.js 15 / NestJS / PostgreSQL+Prisma / Redis+BullMQ / Chromium PDF / Moodle 4.5 LTS behind one anti-corruption module).
- Verified Moodle baseline via web research: 4.5 LTS supported to ~late 2027, single REST endpoint, Catalyst RESTful plugin for real HTTP status codes, CVE-2025-32044 (fixed 4.5.3) noted for hardening.
- Created **`README.md`** — system overview: what it does, RIASEC model, stack, architecture diagram, Moodle integration, data model, portals & pages, design system, phases, working agreement, getting started.
- Still no application code yet.
- **Next:** Phase 0 foundations after human confirms open questions (AD/LDAP? Moodle version to deploy?).

### [DATE] — Holland/RIASEC + comprehensive phases update
- Assessment defined as **Holland (RIASEC)**: added CLAUDE.md §3A (six dimensions, scoring → Holland Code, path tagging, gold recommendation rule).
- **Paths now carry `riasec_letter`**; recommendation = path letter ∈ user's top-three code, ranked by the user's letter order.
- Updated Assessment + Results page specs and the data model (`assessment_options` with RIASEC weighting; `assessment_results` stores all six scores + code; `paths.riasec_letter`).
- Rewrote phases into a **comprehensive 8-phase plan** (0–7) with goal / deliverables / "done when" per phase; split entity and super-admin portals; added a dedicated deployment+acceptance phase.
- Recorded decisions D-011 (RIASEC) and D-012 (comprehensive phase plan) in `decisions.md`.
- Still no application code yet.
- **Next:** Phase 0 foundations after human confirms stack + open questions above.

### [DATE] — Project initialization
- Created `CLAUDE.md` (rules + full context + page specs + phases), `progress.md` (this file), `decisions.md` (rationale).
- No application code yet.
- **Next:** Phase 0 foundations after human confirms stack + open questions above.

---

## Phase tracker
- [x] **Phase 0 — Foundations** (skeleton, RTL/i18n, color tokens, auth+email verification, user model, mocked Moodle service, CI) — **merged** (PR #1, `main` @ b478327)
- [x] **Phase 1 — Assessment (RIASEC) + path core** (RIASEC questions+scoring→Holland Code, gold ranked results, letter-tagged paths, catalog+detail from mock, 5–10 build + single-path commit, dashboard's 3 states, My Path) — **PR open, not merged**
- [ ] **Phase 2 — Moodle integration** (spike first; web services, provisioning, catalog sync, enrollment, scheduled completion sync + pass threshold + shared-course reuse, auth/SSO, course player)
- [ ] **Phase 3 — Certificates + CV** (idempotent course/path certs, Arabic PDF solved, gallery, CV builder + PDF export)
- [ ] **Phase 4 — Entity / reviewer portal** (entity roles, course publishing + path/RIASEC tagging + ordering, learner review dashboards, scoping)
- [ ] **Phase 5 — Super-admin portal** (user/path/assessment/settings/certificate-template management, global + integration-health dashboards)
- [ ] **Phase 6 — Hardening** (Arabic QA, RTL PDF polish, security review, sync reliability + load, a11y, states)
- [ ] **Phase 7 — Deployment, acceptance & launch** (deploy app+Moodle, seed data, full end-to-end acceptance, docs/handover, sign-off)

> When a phase is complete AND the user approved the test: create branch `phase-<n>-<slug>`, open a PR to `main`, and record it here. **Never merge/push to main.**
