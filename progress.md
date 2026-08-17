# progress.md — Running Implementation Log

> **Read this right after `CLAUDE.md` at the start of every session.** It tells you the last thing implemented so you can continue from there.
> **Update this file at the end of every session** (every meaningful output): what was done, what's next, blockers. Newest entry on top.

---

## Current status
- **Current phase:** Phase 0 — Foundations — **COMPLETE, awaiting human review of the PR.**
- **Last completed task:** All seven Phase 0 steps (0.1–0.7). Checkpoints A–G reviewed and approved by the user. PR opened from `phase-0-foundations` → `main`; **not merged** (human review gate, D-008).
- **Next task:** After the Phase 0 PR is merged, begin **Phase 1 — Assessment (RIASEC) + path core**. First step: author the ~20–30 RIASEC questions with each option's per-dimension weighting (CLAUDE.md §3A), then the scoring engine (per-dimension tally → ranked profile → top-three Holland Code) with the explicit tie / clear-top-three / gold-ranking test cases §2B demands.
- **Active branch:** `phase-0-foundations` (7 commits, based on `main` @ 6442ed4).
- **Open blockers / questions for the human:**
  1. **CI has never executed.** The workflow is complete and every gate it runs passes locally, but it has not run on GitHub. It will run for the first time on this PR — confirm it is green before merging.
  2. **GitHub CLI is not installed on the dev machine**, so the PR could not be opened from the terminal. The branch is pushed; see the log entry below for the compare URL and the PR body.
  3. **Ministry values still placeholders** (not blocking, needed before Phase 7): the real allowed email domain (currently `ministry.gov.example`) and the real employee-ID format (currently a permissive regex). See "Deferred / owed" below.

---

## Deferred / owed (carried into later phases)
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

---

## Log (newest first)

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
- [x] **Phase 0 — Foundations** (skeleton, RTL/i18n, color tokens, auth+email verification, user model, mocked Moodle service, CI) — **PR open, not merged**
- [ ] **Phase 1 — Assessment (RIASEC) + path core** (RIASEC questions+scoring→Holland Code, gold ranked results, letter-tagged paths, catalog+detail from mock, 5–10 build + single-path commit, dashboard's 3 states, My Path)
- [ ] **Phase 2 — Moodle integration** (spike first; web services, provisioning, catalog sync, enrollment, scheduled completion sync + pass threshold + shared-course reuse, auth/SSO, course player)
- [ ] **Phase 3 — Certificates + CV** (idempotent course/path certs, Arabic PDF solved, gallery, CV builder + PDF export)
- [ ] **Phase 4 — Entity / reviewer portal** (entity roles, course publishing + path/RIASEC tagging + ordering, learner review dashboards, scoping)
- [ ] **Phase 5 — Super-admin portal** (user/path/assessment/settings/certificate-template management, global + integration-health dashboards)
- [ ] **Phase 6 — Hardening** (Arabic QA, RTL PDF polish, security review, sync reliability + load, a11y, states)
- [ ] **Phase 7 — Deployment, acceptance & launch** (deploy app+Moodle, seed data, full end-to-end acceptance, docs/handover, sign-off)

> When a phase is complete AND the user approved the test: create branch `phase-<n>-<slug>`, open a PR to `main`, and record it here. **Never merge/push to main.**
