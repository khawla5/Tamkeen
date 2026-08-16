# progress.md — Running Implementation Log

> **Read this right after `CLAUDE.md` at the start of every session.** It tells you the last thing implemented so you can continue from there.
> **Update this file at the end of every session** (every meaningful output): what was done, what's next, blockers. Newest entry on top.

---

## Current status
- **Current phase:** Phase 0 — Foundations (NOT STARTED)
- **Last completed task:** None yet — project just scaffolded with context files.
- **Next task:** Begin Phase 0: scaffold the monorepo (Next.js `apps/web`, NestJS `apps/api`, `packages/types`) with Arabic-first RTL + i18n, define the color design tokens, set up auth/user model scaffolding + email verification, the mocked Moodle service, and CI. (Stack is locked — see D-013.)
- **Active branch:** none yet (work on `phase-0-foundations` when Phase 0 begins).
- **Open blockers / questions for the human:**
  - Confirm whether the ministry has AD/LDAP that auth must integrate with (reshapes Phase 2 auth).
  - Confirm the exact Moodle 4.5.x patch version to be deployed (must be ≥ 4.5.3 for CVE-2025-32044).

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
- [ ] **Phase 0 — Foundations** (skeleton, RTL/i18n, color tokens, auth+email verification, user model, mocked Moodle service, CI)
- [ ] **Phase 1 — Assessment (RIASEC) + path core** (RIASEC questions+scoring→Holland Code, gold ranked results, letter-tagged paths, catalog+detail from mock, 5–10 build + single-path commit, dashboard's 3 states, My Path)
- [ ] **Phase 2 — Moodle integration** (spike first; web services, provisioning, catalog sync, enrollment, scheduled completion sync + pass threshold + shared-course reuse, auth/SSO, course player)
- [ ] **Phase 3 — Certificates + CV** (idempotent course/path certs, Arabic PDF solved, gallery, CV builder + PDF export)
- [ ] **Phase 4 — Entity / reviewer portal** (entity roles, course publishing + path/RIASEC tagging + ordering, learner review dashboards, scoping)
- [ ] **Phase 5 — Super-admin portal** (user/path/assessment/settings/certificate-template management, global + integration-health dashboards)
- [ ] **Phase 6 — Hardening** (Arabic QA, RTL PDF polish, security review, sync reliability + load, a11y, states)
- [ ] **Phase 7 — Deployment, acceptance & launch** (deploy app+Moodle, seed data, full end-to-end acceptance, docs/handover, sign-off)

> When a phase is complete AND the user approved the test: create branch `phase-<n>-<slug>`, open a PR to `main`, and record it here. **Never merge/push to main.**
