# decisions.md — Decision Rationale Log

> **Consult this whenever you need to understand *why* something is the way it is before changing it.**
> **Add an entry whenever a decision is made or revised.** Newest on top. Each entry: the decision, why, and alternatives considered/rejected.

---

## D-022 — Clear transitive CVEs with npm `overrides` rather than moving off the locked Next.js 15
**Decision:** The first install carried **3 high-severity transitive advisories** through Next 15.5.23 — four `postcss` issues (XSS via unescaped `</style>` in stringify output; arbitrary `.map` file read via attacker-controlled `sourceMappingURL`) and the `sharp`/libvips set (CVE-2026-33327/33328/35590/35591). `npm audit fix --force` resolves them only by installing **Next 16**, which is a breaking change and contradicts D-013. Instead, root `overrides` pin `postcss@^8.5.26` and `sharp@^0.35.3` for the whole tree, including inside `next` (which pins `postcss` exactly at `8.4.31` and `sharp` at `^0.34.3`). Result: **`npm audit` reports 0 vulnerabilities** and Next 15.5.23 still builds, serves, and passes tests.
**Why:** A government system should not begin Phase 0 with known highs baked into its lockfile, and it should not silently defer them to Phase 6 either. Overriding a patch/minor within the same major is low-risk (stable public APIs), and it was verified end-to-end rather than assumed: full production build, the Tailwind v4 CSS pipeline still emitting the brand tokens to the served stylesheet, both apps booting, all tests green. `npm ls` labels the overridden packages `invalid` because they fall outside Next's declared ranges — that is the expected, cosmetic signal of a deliberate override, not a broken tree.
**Why not just accept them:** real exposure here is genuinely low (the postcss issues need attacker-controlled CSS at build time, and ours is repo-authored; the sharp issues need attacker-supplied images through `next/image`). But "low exposure" is an argument for not panicking, not for shipping a red audit — and the override cost nothing.
**Consequence / revisit:** overrides are a standing maintenance obligation — each Next upgrade must re-check that the pins are still needed and still compatible. Phase 6's dependency review owns that check, and should also decide whether to drop the `sharp` pin by disabling `next/image` optimisation entirely (the app has no need to process untrusted images).
**Rejected:** Next 16 now (breaks the locked stack mid-Phase-0, and 15.x is the version the rest of the plan assumes); accepting 3 highs and deferring to Phase 6 (leaves the baseline red for six phases); `npm audit fix --force` (same as adopting Next 16, but without the decision being explicit).

## D-021 — Local dev dependencies run in Docker; Mailpit is the dev mail sink
**Decision:** A root `docker-compose.yml` provides PostgreSQL 16, Redis 7 and **Mailpit** for local development (`npm run db:up` / `db:down`). Development `SMTP_HOST/PORT` point at Mailpit (`localhost:1025`, inbox at `http://localhost:8025`). Postgres/Redis image versions match the CI service containers. This file is a **development convenience only** — real environments, secrets management and deployment topology are Phase 7.
**Why:** No local PostgreSQL was installed (Docker was), so Docker is the lowest-friction path to a working DB and gives dev/CI parity on image versions. Email verification and password reset (0.5) are unusable without somewhere for mail to land; Mailpit makes the verification link readable with **no real SMTP credentials and no risk of mailing a real inbox from a dev box** — which matters because these are ministry-employee addresses.
**Rejected:** Requiring a hand-installed local Postgres (per-machine drift, no CI parity); logging verification links to the console only (works, but hides the actual rendered Arabic email, so RTL email bugs would go unnoticed until late); pointing dev at a real SMTP relay (risks sending mail to real employees during development).

## D-020 — npm workspaces as the monorepo tool
**Decision:** Use **npm workspaces** (`apps/web`, `apps/api`, `packages/types`) rather than pnpm or yarn. `packages/types` is compiled to `dist` and consumed via its `main`/`types` entry points, built by an explicit `build:types` step that runs before typecheck/build.
**Why:** §2A left the workspace tool open ("pnpm/npm/yarn"). npm ships with Node so there is no bootstrap step for a new developer or for CI, and the provided CI workflow already assumed `npm ci`. Compiling the shared package (instead of importing raw source) keeps NestJS's `tsc` build and Next's bundler both working without special-casing, and means the published type surface is exactly what consumers see.
**Rejected:** pnpm (fastest and best at monorepos, but not installed locally and adds an install-pnpm step to CI for no benefit at this repo's size); yarn (same bootstrap cost, no advantage here); a single package with folders (loses the enforced boundary that stops the frontend importing backend internals).

## D-019 — Auth is email/password only (no AD/LDAP); Moodle target = latest 4.5.x LTS
**Decision:** (a) The ministry does not require AD/LDAP integration; the system uses **email/password authentication only** (app is the identity owner, provisioning Moodle accounts behind the scenes). The AD/LDAP hardening path in D-004 is dropped unless the ministry later requests it. (b) Deploy the **latest Moodle 4.5.x LTS** patch (from github.com/moodle/moodle, newest `v4.5.x` tag / download.moodle.org). Requires PHP ≥ 8.1 (8.3 supported), sodium extension, `max_input_vars ≥ 5000`.
**Why:** (a) User confirmed email login is the intended, sole mechanism — removes the biggest Phase 2 auth unknown. (b) 4.5 is the current LTS with security support to 4 Oct 2027; the next LTS (5.3) isn't out yet, so 4.5.x is the stable choice for a government system. General bug-fix support for 4.5.x ended Oct 2025, so always run the newest 4.5 patch for security.
**Rejected:** AD/LDAP/OAuth2 SSO (not wanted); Moodle 5.x non-LTS (shorter support, less stable for gov); pinning an old 4.5.x patch (misses security fixes).

## D-018 — Digits/dates default with a single locale switch
**Decision:** Default to Western Arabic numerals (0-9) and Arabic date presentation (Hijri optional), routed through one locale/formatting layer so Arabic-Indic numerals (٠-٩) can be switched on without touching feature code. Same choice applied to UI, certificates, CV, and all PDFs.
**Why:** Arabic-Indic vs Western digits is a real, visible choice; centralizing it prevents inconsistent mixes across the app and PDFs.
**Rejected:** Hardcoding digits per component (guarantees inconsistency); deferring the choice (RTL/number formatting is painful to retrofit).

## D-017 — Restricted registration (not open public sign-up)
**Decision:** Registration is ministry-scoped by default: admin-provisioned accounts and/or self-registration gated by allowed email domain + valid employee ID. Open public registration is not shipped. A settings toggle allows pure admin-provisioning.
**Why:** Internal government system for ministry employees; open registration would be a security and data-integrity hole.
**Rejected:** Open self-registration (inappropriate for an internal system). *Confirm exact policy with the ministry.*

## D-016 — Certificate verification (ID + QR/public page)
**Decision:** Every certificate has a unique public `verification_id` and a QR/public verification URL that confirms validity (name, course/path, date) without login and without extra PII.
**Why:** Government-issued credentials are commonly verified by third parties; without this the certificates aren't trustworthy artifacts.
**Rejected:** Certificates with no verification (can't be authenticated); exposing full profile on the verification page (unnecessary PII).

## D-015 — Assessment retake locked to pre-commitment; course-edit protection
**Decision:** (a) Users may retake the assessment and get a new Holland Code only before confirming a path; after commitment, both path and result are locked. (b) A course in any user's confirmed path cannot be deleted/unpublished — only hidden from new selections while enrolled users finish; `courses.status` = available / hidden-but-completable / retired.
**Why:** (a) A new code is meaningless once the path is permanent (one-path rule) and inviting retakes post-commitment contradicts it. (b) Prevents pulling content out from under a mid-path learner — an operational hazard left undefined before.
**Rejected:** Unlimited retakes anytime (conflicts with one-path rule); hard-deleting courses (breaks in-progress learners).

## D-014 — Engineering standards & Definition of Done; "the test" defined
**Decision:** Locked §2B: per-task Definition of Done, required testing (unit + integration + at least one e2e happy path per phase; explicit RIASEC scoring tests; mock Moodle must share the real module's contract), mandatory loading/empty/error states, WCAG 2.1 AA, and conventions (branch naming, Conventional Commits, `.env.example`, CI gates). This defines what "the test" in the git/PR rule means.
**Why:** The PR rule referenced "the test" without defining it; an agent needs concrete, uniform quality gates or testing/coverage will be inconsistent. Government context demands accessibility, security, and reliability baselines.
**Rejected:** Leaving testing/quality implicit (inconsistent, unverifiable "done"); UI without mandated states (dead/blank/error-swallowing screens).

## D-013 — Tech stack & architecture
**Decision:**
- **Frontend:** Next.js 15 (React + TypeScript), Tailwind CSS, shadcn/ui, `next-intl` (Arabic-first RTL).
- **Backend:** NestJS (Node.js + TypeScript) as a **dedicated API**, not Next.js route handlers.
- **DB:** PostgreSQL + Prisma ORM.
- **Async/jobs:** Redis + BullMQ (scheduled Moodle completion sync, certificate generation).
- **PDF:** headless-Chromium (Puppeteer) HTML→PDF for Arabic-correct certificates + CVs.
- **Moodle:** v4.5 LTS, Web Services (REST) + Catalyst RESTful plugin; access isolated behind one NestJS "Moodle integration" module (anti-corruption layer). Least-privilege token, stored server-side only.
- **Auth:** app is IdP (email/password, verified); JWT/session for the app; token-mapped Moodle handoff for MVP, OAuth2/AD-LDAP as hardening target.
**Why:** The system is integration-heavy and long-lived with background jobs, RIASEC scoring, certificate generation, three role-based portals, and government-grade audit/security needs. A dedicated opinionated backend (NestJS) keeps that maintainable and scalable far better than packing logic into Next.js handlers (industry consensus: Next.js-only backends accrue refactor debt past ~18 months for team-scale, logic-heavy systems). Shared TypeScript lets front/back share the RIASEC + path types. Postgres/Prisma is the safe system-of-record choice. Chromium-based PDF is the most reliable route to correct Arabic RTL shaping. Moodle 4.5 LTS is supported to late 2027; the RESTful plugin gives real HTTP status codes instead of always-200. Isolating Moodle behind one module means an LMS change touches one place.
**Rejected:** Next.js-only full-stack (logic/jobs/roles outgrow route handlers); Express (less structure than NestJS for a multi-portal system); Django/Laravel (loses shared-TypeScript benefit); non-LTS Moodle (shorter support window); common PDF libs without robust Arabic shaping (RTL/ligature bugs).

## D-012 — Comprehensive 8-phase plan with done-criteria
**Decision:** Expand the phase plan to 0–7, each with goal/deliverables/"done when"; split entity and super-admin into separate phases; add a dedicated deployment + acceptance phase. Project isn't "done" until Phase 7 acceptance passes.
**Why:** User asked for the phases to make the system comprehensive and fully functional. Explicit done-criteria and a deployment/acceptance phase prevent a "features built but not launchable" outcome.
**Rejected:** The earlier 6-phase sketch (bundled admin portals, no explicit deployment/acceptance, no per-phase done-criteria).

## D-011 — Assessment is Holland (RIASEC); paths tagged by letter; gold = letter in top-three code
**Decision:** Use the Holland Codes / RIASEC framework. Scoring tallies points per dimension → ranked profile → top-three **Holland Code**. Every path is tagged with one **primary RIASEC letter**. A path is recommended (gold) if its letter is in the user's top-three code, ranked by the user's letter order. Non-matching paths remain selectable. Store all six dimension scores, not just the code.
**Why:** User specified a Holland-based assessment with each path linked to a Holland category. Top-three code is the standard Holland output and richer than a single letter; storing all six enables ranking and later re-explanation. Matching by "letter ∈ top-three code" preserves the single-path rule while using the real framework and keeps gold meaningful without caging the user.
**Alternatives considered:** Match only the single #1 letter (too narrow — most careers are blends, and few paths would be gold); reduce the result to one opaque letter (loses the framework's value). If stricter/looser matching is wanted later, revise this entry.

## D-010 — Three-file context engineering (CLAUDE.md / progress.md / decisions.md)
**Decision:** Maintain three files: `CLAUDE.md` (rules Claude Code follows), `progress.md` (running state), `decisions.md` (this file, rationale). Every session reads CLAUDE.md → progress.md → decisions.md as needed, and updates progress.md (and decisions.md on any decision) before ending.
**Why:** Survives cleared chats / new sessions. State and rationale persist outside the conversation so a fresh session can continue coherently.
**Rejected:** Relying on chat memory alone (lost on reset); a single README (mixes stable rules with volatile state).

## D-009 — Color system fixed as design tokens
**Decision:** Navy `#222E42`, Secondary Navy `#2E3A50`, Gold `#A8863C`, Cream `#F4F3F1`, White `#FFFFFF`, Light Gold `#C9A85C`, Muted Blue `#5E6B85`. Gold reserved for recommended-path highlight and achievement accents.
**Why:** Consistency + the gold signal only works if gold is scarce.
**Rejected:** Ad-hoc coloring; heavy gold usage (dilutes the "recommended" signal).

## D-008 — PR-only workflow, never touch main
**Decision:** All work on feature branches; open a PR to `main` only after the user approves the test; never merge or push to `main` directly.
**Why:** Government system — human review gate is essential; protects main.
**Rejected:** Direct commits to main (unsafe, unreviewable).

## D-007 — Pass threshold is a product setting, evaluated against Moodle grade
**Decision:** The "passed well enough for a certificate" threshold lives in our system config and is checked against the grade Moodle returns.
**Why:** Lets us control certification policy without editing Moodle quizzes; keeps product logic in the product.
**Rejected:** Encoding the threshold inside Moodle (splits product logic into the LMS).

## D-006 — Certificates issued by our app, idempotent
**Decision:** Generate certificates as Arabic PDFs from our own templates; check "already issued?" before creating one.
**Why:** Consistent branding/Arabic template control; polling-based sync would otherwise create duplicates.
**Rejected:** Moodle certificate plugin (less control over Arabic template + product coupling); non-idempotent issuance (duplicate certs).

## D-005 — Completion sync via scheduled job (MVP)
**Decision:** Backend polls Moodle completion/grade functions for enrolled users every few minutes; webhooks are a later optimization.
**Why:** Simpler and more reliable to build first; minutes of latency is fine for training.
**Rejected (for now):** Webhooks/events first (more moving parts before the core loop is proven).

## D-004 — MVP auth = token-mapped handoff; SSO/OAuth2 = hardening target
> **Update (D-019):** the AD/LDAP option is dropped — auth is email/password only. OAuth2 remains only an optional internal convenience for the Moodle handoff, not a ministry SSO requirement.
**Decision:** App is the identity owner (email/password). Create a Moodle user per registrant (`moodle_user_id`), use token-mapped auto-login/handoff for course entry in MVP. Move to OAuth2 IdP (or AD/LDAP if the ministry has it) during hardening.
**Why:** Get a working single-login experience fast; defer the heavier SSO build until the flow is proven. AD/LDAP existence must be confirmed early as it reshapes auth.
**Rejected:** Building full OAuth2 SSO up front (slower MVP); two separate logins (bad UX).

## D-003 — One Moodle course, multiple paths; reuse completion
**Decision:** A single Moodle course can belong to several paths. If a user already completed a shared course, reuse that completion — no retake.
**Why:** Avoids duplicate content and pointless repeat work; one source of truth per course.
**Rejected:** Duplicating courses per path (content maintained twice); forcing retakes (frustrating, wasteful).

## D-002 — One path per user, no switching
**Decision:** A user commits to exactly one path; it cannot be switched after confirmation. Confirm is a hard gate with an Arabic confirmation dialog.
**Why:** Simplifies state (effectively one active `user_paths` record), keeps the experience focused. (User instruction, "for now.")
**Rejected:** Multiple concurrent paths / free switching (more complex state, diluted focus). Revisit only if the user later requests it.

## D-001 — Arabic-first is architecture, not styling
**Decision:** RTL layout, Arabic default locale, Arabic-capable PDF rendering set from Phase 0.
**Why:** Retrofitting RTL and Arabic PDF shaping later is painful and error-prone; it's a primary requirement.
**Rejected:** English-first with later Arabic pass (would compromise the core requirement).

## D-000 — App is the experience layer, Moodle is the learning engine
**Decision:** Our app owns users/auth, assessment, paths, path membership, certificates, CV, UX. Moodle owns course content, quizzes, grading, completion. Bridges are only `moodle_user_id` and `moodle_course_id`; completion flows one direction (Moodle → our DB → certificate logic). Course content is never authored twice.
**Why:** Don't rebuild what Moodle does well; keep product logic in the product and a single source of truth per concern.
**Rejected:** Building our own LMS (huge, redundant); duplicating course content in both systems (sync hell).
