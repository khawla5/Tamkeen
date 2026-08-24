# progress.md — Running Implementation Log

> **Read this right after `CLAUDE.md` at the start of every session.** It tells you the last thing implemented so you can continue from there.
> **Update this file at the end of every session** (every meaningful output): what was done, what's next, blockers. Newest entry on top.

---

## Current status
- **Current phase:** Phase 5 — the super-admin portal (CLAUDE.md §4C) — **complete and verified; [PR #13](https://github.com/AbdullahDamati/tamkeen/pull/13) open against `main`, awaiting human review.**
- **Last completed task:** **The Phase 5 verification pass.** It found a missing deliverable (email re-verification, §4.12 — now built, D-088) and two defects (the portals unmounting themselves on a refetch, D-089; a duplicate field label). Browser coverage added for the five admin screens and the profile, which had none.
- **Next task:** **human review of PR #13.** Do not merge it (CLAUDE.md §0). Once it lands: **Phase 6 — hardening**, which already inherits a named list (see Deferred/owed).
- **Active branch:** `phase-5-admin-portal`, cut from `origin/main` @ `f1f0dcd`, which contains Phases 0-4. Pushed, with **PR #13** covering the whole of Phase 5 (D-008) — 13 commits, one per sub-phase plus the verification pass.
- **Phase 4 is merged** (PR #6, `origin/main` @ `f1f0dcd`). Phases 0-3 merged before it (PRs #1-#4), plus the landing page (PR #5).
- **Test totals:** 599 API unit · 403 web component · 515 API integration against real PostgreSQL · 84 browser e2e in Chromium — **1601 automated**, plus the real-Chromium verification scripts from Phase 3. All green; the integration suite was run three consecutive times end to end. Typecheck, lint and format clean. **One transient integration failure is recorded in the 2026-08-24 entry and was never reproduced — read it before dismissing a similar one.**

### Phase 5 sub-phase tracker
- [x] **5.1 Admin foundation + Dashboard** (§4C.1) — RBAC, route group, shell, integration health
- [x] **5.2 User Management** (§4C.2) — employees + entities, suspend/activate, **entity-account creation**
- [x] **5.3 Assessment Management** (§4C.3) — draft/publish, balance guard, copy-on-write versioning
- [x] **5.4 Path Management** (§4C.4) — paths, `path_courses` membership + ordering, safe retirement
- [x] **5.5 Course Oversight** (§4C.5) — global catalogue, ownership assignment, intervention
- [x] **5.6 System Settings** (§4C.6) — `settings` table, one `SettingsService`, env fallback
- [x] **5.7 Certificate Templates** (§4C.7) — signatory fields, future issuances only
- [x] **5.8 Audit & Reports** (§4C.8) — filterable log, reports, CSV export with BOM
- [x] **5.9 Deferred Profile items + verification pass** — change password, **email re-verification**, digits preference

- **Open blockers / questions for the human:**
  0a. **The registration department list (`DEPARTMENTS` in `apps/web/src/lib/auth-constants.ts`) is a placeholder** — the ministry must supply the official list of الإدارات; when it does, the server should validate against it too.
  0. **⚠ PLATFORMS CODE (D-069) — three questions for the ministry/team:** (a) is Platforms Code compliance **mandatory** for this platform or adopted by choice — it decides how much deviation is allowed; (b) **who has access to the official Figma library** — the token values in `globals.css` came from the system's published export and must be re-checked against the official foundations, and the mandatory government header/footer/national-identity elements for TAM-116 must be read from the official guidelines, not guessed; (c) the ministry emblem (D-051) is needed by the landing and auth designs.
  1. **⚠ THE MINISTRY LOGO AND SEAL ARE STILL MISSING.** Certificates ship with a neutral placeholder mark and an empty signature block (name + title). The slot is sized and positioned, so dropping in the real artwork is not a layout change — but **no certificate should reach a real employee until this is supplied** (D-051).
  2. **⚠ MINISTRY APPROVAL OF CUSTOM MOODLE PLUGINS IS STILL UNCONFIRMED.** Unchanged since Phase 2 and still the longest-lead dependency: seamless login uses `local_tamkeensso`, and if the ministry refuses custom PHP the fallback is the OAuth2-IdP route (D-044). Phase 4 deliberately did **not** enlarge that surface — the authoring handoff reuses the plugin unmodified (D-060).
  3. **⚠ `MOODLE_TEACHER_ROLE_ID` and `MOODLE_COURSE_CATEGORY_ID` are placeholders** (3 and 1, Moodle's stock values). Both are per-instance and **must be confirmed against the ministry's Moodle before Phase 7** — a wrong teacher role hands an outside organisation capabilities nobody intended, and a wrong category files ministry courses wherever that instance happens to number one (D-060).
  4. **Production Moodle is 4.5 LTS, development is 5.2.2** (D-039). Seamless login must still be re-verified on a real 4.5 — and now `core_course_create_courses` and `core_course_get_contents` with it.
  5. **`CERT_STORAGE_DIR` must be set to an ABSOLUTE path in every deployment** (D-052). It defaults to a relative path, which resolves against the process's working directory. For credentials this is not a detail.
  6. **`npm audit` reports the same 3 high advisories** for `deepmerge-ts` via `prisma` → `@prisma/config` — accepted and deferred (D-043), owned by the Phase 6 dependency review. Phase 4 added no dependencies at all.
  7. **GitHub CLI is still not installed on the dev machine**, so PRs are opened from the compare URL rather than the terminal.
  8. **Ministry values still placeholders** (needed before Phase 7): the real allowed email domain (currently `ministry.gov.example`) and the real employee-ID format.

---

## Deferred / owed (carried into later phases)
- **An email change does not warn the OLD address.** Only the new address is written to (§4.12, D-088). §2's notification list is short and locked, and the current-password requirement means an attacker already holds the password before this endpoint is any use to them — so this is defence in depth. **Phase 6's security review** should decide whether to add the notice.
- **`EnrollmentService.addCourse` is not actually idempotent under concurrency** (found during the Phase 5 verification pass; pre-existing, and enrolment is untouched by Phase 5). Its duplicate guard is a read-then-write, so two concurrent adds of the same course both pass and the second raises P2002 → 500 rather than the no-op its own comment promises. **Phase 6** should catch P2002 there and return the intended success.
- **The UI language switch (§4.12)** is deferred until an English UI exists (D-086). The digits preference ships in its place; this is a decision, not a gap.
- **The ministry logo, seal and signatory are not on the certificate.** A placeholder mark and an empty signature block hold their positions (D-051). **Phase 6/7** must drop in the real artwork before anything is issued to a real employee.
- **`CERT_STORAGE_DIR` is relative by default and must be absolute in deployment** (D-052). **Phase 7** owns setting it, backing that directory up, and deciding on object storage.
- **Jest cannot exercise the real PDF renderer.** Puppeteer 25 is ESM-only and Jest's CommonJS runtime cannot load it (D-055), so integration tests stub the renderer and assert the HTML contract. Real rendering is covered by the spike scripts and the browser e2e. **Phase 6** may revisit if Jest gains usable ESM support.
- **The certificate browser e2e seeds its certificate rather than earning it.** The mock LMS cannot be told to report a pass over HTTP, and shipping a test-only endpoint that manufactures completions into a government system is the wrong trade. Issuance itself is covered by unit tests and `spike/pdf/verify-issuance.ts`. **Phase 7's acceptance test** against a real Moodle closes this properly.
- **Certificates are not tagged/accessible PDFs.** Chromium emits untagged output, so Arabic extracts in visual order from naive extractors (the codepoints are correct and the CV's English body extracts perfectly). If the ministry wants PDF/UA, that is a **Phase 6** item.
- **The CV ships one template and no gallery**, per §4.11. A fully-localised all-Arabic CV remains possible later (D-050); the section model does not preclude it.
- **Profile is read-only.** §4.12 also lists change-password, email re-verification and a language switch. None is a Phase 1 deliverable; the page exists because §4.2 puts Profile in the pre-assessment nav and that link must lead somewhere real. **Phase 5/6** owns the rest.
- **Certificates and CV are absent from the navigation** until **Phase 3** builds them (D-037). Deliberate: a nav item leading nowhere advertises what the product cannot do.
- **A confirmed path can exist without its LMS enrolments.** Enrolment is best-effort after the commitment is recorded and is audited on failure; **Phase 2's sync job** owns reconciliation (D-036).
- **My Path reads live LMS progress but never persists it.** Writing `completions` is **Phase 2's** job; two writers on those rows would be a race (D-036).
- **`courseUrl` points at the mock (`localhost:8080`) and does not resolve.** Expected until **Phase 2** stands up Moodle and the seamless handoff.
- **The optional `enrollments` table (§6) is still not built**, now deliberately: `user_path_courses.enrolledAt` answers the only question anything asks, and a table whose sole consumer is a hypothetical debugger is speculative schema (D-041).
- ~~The balance rule must survive Phase 5's assessment editor.~~ **Closed in sub-phase 5.3** — `assessBank` refuses an unbalanced publish server-side, expressed over attainable maxima rather than question counts, and the seeded bank is still asserted balanced in CI (D-071).
- **Rate limiting is in-process** — per-instance counters, so horizontal scaling multiplies the effective limit. **Phase 7** must swap in a shared store when deployment topology is decided. Per-account lockout is in the database and unaffected. (D-028)
- **`deepmerge-ts` carries 3 high advisories** through `prisma` → `@prisma/config`, accepted and deferred (D-043). **Phase 6** must re-check whether Prisma bumped the pin upstream; do not downgrade Prisma to silence it (D-026).
- **`postcss` / `sharp` are pinned via npm `overrides`** to clear 3 high CVEs while holding Next 15. Each Next upgrade must re-check the pins. **Phase 6** dependency review owns this, and should consider dropping the `sharp` pin by disabling `next/image` optimisation entirely. (D-022)
- **Narrow-viewport layout not visually verified.** The `md:` breakpoint logic exists; the browser resize did not take effect during the Checkpoint C review, so no claim is made. **Phase 6** accessibility/responsive pass.
- **Employee IDs are format-validated, not verified.** Real verification needs a ministry roster or `admin-only` provisioning; the `REGISTRATION_MODE` switch exists for that decision. (D-017)
- **Completion sync processes every eligible learner in one pass**, with no batching or rotation. A silent cap would starve whoever fell outside it; **Phase 6** (sync reliability + load testing) owns making this scale. (D-042)
- **Seamless login is a custom Moodle plugin pending governance approval** (D-044). If the ministry refuses custom PHP, **Phase 6** must replace it with the OAuth2-IdP route, which is a larger piece of work — the decision should be chased early, not at hardening.
- ~~Entity scoping is not built.~~ **Closed in Phase 4** — `EntityScopeService` filters every entity query server-side, fails closed on a missing scope, and is proven by 14 integration tests (D-062).
- **`packages/types` now also carries the entity-portal contracts.** RIASEC/path/certificate/entity types arrive with the phases that define them.

**Newly owed, from Phase 4:**
- **`MOODLE_TEACHER_ROLE_ID` and `MOODLE_COURSE_CATEGORY_ID` are Moodle's stock values, not the ministry's.** Both are per-instance and unverified. **Phase 7** must confirm them against the real instance before an entity creates a course there — a wrong teacher role hands an outside organisation capabilities nobody intended (D-060).
- **`core_course_create_courses` and `core_course_get_contents` have not run against a real Moodle.** They are covered by the contract suite and the mock; the Phase 2 spike predates them. **Phase 7's acceptance test** exercises them for the first time in anger, and D-039's 4.5-vs-5.2 re-verification now covers them too.
- **The successful-publish path is proven in integration, not in the browser.** The mock reports a newly created course as having no completion criteria — the honest simulation, since a real Moodle course is empty until someone authors it — and `simulateAuthoring` lives in the API process, out of Playwright's reach. So the browser proves the *refusal* on a course it creates through the UI, and proves publish/withdraw on a seeded course the mock considers completable. **Phase 7** closes this against a real Moodle.
- ~~Entity accounts are created by a seed, not by a screen.~~ **Closed in sub-phase 5.2** — the super-admin provisions an organisation and its accounts from §4C.2, by invitation, and never sees a password (D-077).
- ~~An entity's own record is read-only, and an entity cannot add a colleague to its organisation.~~ **Closed in sub-phase 5.2** — the super-admin edits an organisation and adds accounts to it. An entity still cannot do either itself, which is the point: who a ministry supplier is, and who speaks for them, is a contractual fact rather than a self-service setting.
- ~~Course ordering within a path is not editable.~~ **Closed in sub-phase 5.4** — §4C.4 edits `path_courses.display_order` by submitting the complete order, which decides how the build screen offers courses and how My Path numbers them.
- **A course withdrawn from the LMS side is still only detectable by sync.** An entity sees `lms_present: false` reflected in the status, but nothing tells them *why* a course they published is no longer available. **Phase 6**'s sync-reliability work owns surfacing that.
- **Eight API error codes have no Arabic copy** — `CERTIFICATE_NOT_FOUND`, `CERTIFICATE_FILE_UNAVAILABLE`, `CERTIFICATE_FILE_CORRUPT`, `COURSE_NOT_ENROLLED`, `CV_INVALID_DATE`, `CV_TOO_MANY_ENTRIES`, `ENTITY_NOT_FOUND`, `USER_NOT_FOUND`. `useErrorMessage` falls back to the generic Arabic message, so none reaches a user as a raw code, but the specific ones would help. **Phase 6**'s Arabic content QA owns them.
- **`published_at` is written and nothing reads it.** Correct as of D-067's sibling fix, and asserted both ways; **Phase 5**'s §4C.5 course oversight is what will finally display it.

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
- **Course authoring uses Model 1 — entities author content in Moodle via handoff; the portals wrap only the product layer (D-046).**
- **Each course is single-language as authored (Arabic OR English); no per-course bilingual requirement (D-047).**
- **Admins edit assessment questions + weightings, NOT the core scoring algorithm (D-048).**
- **Assessment edits freeze existing results — versioning; past results never mutate (D-049).**
- **The CV is an ENGLISH document with Arabic proper nouns passed through as authored (D-050).** Supersedes the earlier "Arabic CV" wording; the Phase 3 PDF pipeline must prove English-body-with-inline-Arabic.
- **Entity & super-admin portals now fully specified in CLAUDE.md §4A/4B/4C; Phase 4/5 deliverables updated accordingly.**
- **The certificate face is austere: placeholder logo slot, both Hijri and Gregorian dates, no grade (D-051).**
- **Certificates are rendered once and stored immutably; the CV renders on demand (D-052).**
- **The verification id is public and stored unhashed; stored files are named by the row id (D-053).**
- **Path completion requires every chosen course PASSED, not merely completed — correcting a Phase 2 defect (D-054).**
- **Node 24 LTS replaces end-of-life Node 20; Puppeteer is imported lazily (D-055).**
- **One CV renderer serves both the live preview and the PDF; `en` joins LOCALES for the CV only (D-056).**
- **The CV stores only what the learner authored; certifications are re-read on every load (D-057).**
- **The in-app notification is a dot, cleared by opening the gallery (D-058).**
- **Publication is ours, LMS visibility is theirs, and `courses.status` is derived from both (D-059).** Corrects a live defect: sync used to recompute status from the LMS's `visible` flag and would silently undo an entity's decision to withdraw a course. Revises D-040's sticky-`RETIRED` sub-rule, which existed only because there was nowhere else to record that decision.
- **The course shell is created in the LMS, and entities author it as `editingteacher` (D-060).** A database-only draft would be withdrawn by the next sync. The `local_tamkeensso` plugin is left untouched — the entity lands on the course page and uses Moodle's own Edit mode — so D-044's open governance question does not grow.
- **The content read-back exists to stop an uncompletable course being published (D-061).** Publishing is refused, not warned about, when the LMS reports no completion criteria — the D-042 dead end, caught before anyone enrols rather than after.
- **`@Roles` on every endpoint; scoping is a query filter, not a guard (D-062).** Role answers "may this kind of account call this"; scope answers "which rows may *this* account see". `RolesGuard` honours `@Public()` first, so class-level roles cannot take the public verification page offline.
- **`entities` is a first-class model and course ownership is nullable (D-063).** The organisation owns the courses, not whoever created them; the seeded catalogue legitimately has no owner.
- **An entity sees a learner's name, department, progress and grade — and nothing else (D-064).** No email, no employee ID, no Holland Code, no path, no certificates.
- **The entity portal is its own route group, and sign-in routes by role (D-065).**
- **A course's RIASEC letters are derived from its paths, never authored beside them (D-066).** §3A makes the path the owner of the letter, so a stored copy could contradict it and nothing downstream would notice.
- **Both providers correct a mis-routed account, and 403 is why the second was missing (D-067).** Makes real the claim D-065 already made; the redirect stays a courtesy, never a control.
- **Every id the mock LMS hands out derives from a natural key, never a counter (D-068).** The mock's state dies with the process, the rows do not, and both LMS id columns are UNIQUE. Asserted in the shared contract.
- **Assessment versioning is copy-on-write; the old bank is kept (D-069).** Draft-then-publish, with the balance guard at publish and adjacency only warned about (D-070, D-071).
- **The product knobs move to a `settings` table with env as fallback; secrets stay in the environment (D-072).**
- **Certificate template settings are text-only until the ministry supplies artwork (D-073); the 5-10 bounds stay hardcoded (D-074).**
- **The super-admin keeps unscoped API access to entity data but has its own screens (D-075); reports export as CSV with a BOM (D-076).**
- **An administrator provisions accounts by invitation and never sees a password (D-077).** Redeeming a reset token now also verifies the address, which closes a dead end that already existed.
- **Two lockouts are guarded, and converting a learner who holds a record is refused (D-078).**
- **Two integration suites share one assessment, and an advisory lock serialises them (D-079).**
- **The seed bootstraps the assessment; it does not maintain it (D-080).**
- **An active path always offers at least five selectable courses (D-081).**
- **Retiring a path removes it from new selections and strands nobody (D-082).**
- **Catalogue sync tolerates a row that vanished under it (D-083).**

---

## Log (newest first)

### 2026-08-23 — Sub-phase 5.4: path management, and a flake chased to its cause

§4C.4 built: create and edit paths, `path_courses` membership **and ordering** (owed since Phase 4), the attach picker, and retirement that cannot strand anybody. The 5-10 rule is printed on the page and has no control anywhere (D-074).

**Test totals: 579 API unit · 324 web component · 400 API integration · 52 browser e2e — 1355 automated.** Typecheck, lint and format clean. No new dependencies. **The integration suite was run five consecutive times, all green**, which is the only claim worth making about a suite that was intermittently failing an hour earlier.

**Two rules that make a forbidden state unreachable rather than guarded against.**

`PATH_TOO_FEW_COURSES` (D-081) refuses to *offer* a path with fewer than five selectable courses, and refuses any detach that would drop an active one below the floor. The failure it prevents is invisible from every screen: the learner reaches the build page, selects all four courses there are, and the confirm button stays disabled with nothing to act on. Nothing logs it, nothing alerts, and the path sits in the catalogue looking like a choice. Creation therefore always produces an *inactive* path — an empty path could not be offered anyway, so accepting `isActive: true` at creation would mean either refusing every creation or admitting one nobody can confirm.

`COURSE_HELD_BY_LEARNERS` refuses to detach a course learners hold *through this path*. Nothing cascades, so a confirmed learner would keep seeing it — what breaks is everyone still building, whose next save is refused with `COURSE_NOT_IN_PATH` about a course they chose from that very screen. Scoped to the path deliberately: a course may belong to several (D-003), and a learner holding it through another one is not stranded.

**A stranding that already existed, found by reading rather than by a test.** D-002 reconciles retirement with commitment for the *confirmed* learner — My Path and certificates read through `user_paths` and never consulted `paths.is_active`. Nobody had reconciled it for the learner still **building**: a plain `isActive: true` filter turned a retirement into a 404 on their build page, while `confirm` never checked the flag at all, so they could still commit to a path they could no longer see. Retirement now means what it means for courses (§2/D-015): hidden from new selections, untouched for whoever already chose it (D-082). The integration suite asserts it against the *learner's* endpoint, not by reasoning about the query.

**The detail screen prints the numbers the decision turns on.** Learners building, active and completed are shown separately and never summed: only the building count is affected by a retirement, and the retirement audit entry records it. An administrator retiring a path knowing "three people are part way through choosing this" is making a different decision from one taken blind.

**A one-in-five flake, chased to three separate causes rather than re-run.** It failed different suites on different runs, which is the shape of shared state rather than of a bug.

| cause | what it broke | fix |
|---|---|---|
| cleanup keyed on `version > 1`, not namespaced to the run | one run's `afterAll` deleted the *next* run's fresh draft, so an endpoint 404'd on a draft that demonstrably existed two tests earlier | track the ids this run created and delete exactly those |
| a course created here does not exist in the LMS, so every catalogue sync correctly withdrew it | the five-course-floor assertions, by the product working as designed | borrow catalogue courses instead — they are in the LMS, so sync leaves them alone |
| the draft copy made ~180 sequential statements inside one transaction | Prisma's five-second interactive-transaction budget under parallel load, surfacing as a timeout with nothing wrong in it | nest options and weights inside each question's create — 30 statements — and give the copy an explicit budget |

**And one that was not mine.** `withdrawVanished` used `update`, which throws when the row is gone, abandoning every course after it in the list. Several suites create and remove courses of their own, so a sync running during another suite's cleanup failed a *third* suite. It is now `updateMany` with the count checked, so a vanished row is skipped without being counted or audited (D-083). Nothing in the product deletes a course, so this is defensive in production — but a reconciliation job that crashes because the world changed under it is reconciling badly, and this one is the Phase 6 sync-reliability item arriving early.

**A brittle assertion removed on the way.** `journey.e2e-spec.ts` asserted `paths` had length 12 — the seed's count stated as though it were a product rule. The rule is "every *offered* path comes back, recommended or not"; it now counts against the database, and stops breaking the moment another suite legitimately offers a thirteenth.

### 2026-08-23 — Sub-phase 5.3: the assessment editor, and results that stay frozen

§4C.3 built: the version overview, the draft-then-publish editor over copy-on-write versioning, question text and order, per-dimension option weights, per-dimension question counts, the publish gate, and the read-only history. The largest and most consequential piece of Phase 5 — every Holland Code the product issues after a publish comes from a different instrument.

**Test totals: 573 API unit · 308 web component · 341 API integration · 52 browser e2e — 1274 automated.** Typecheck, lint and format clean. No new dependencies.

**The schema change is where D-069 became real.** `assessments.key` stopped being unique — several rows share `riasec-core` and differ by version — and `is_active` was replaced by a three-state `status`, because keeping both would be the D-059 mistake in a new place. Two things the schema language cannot say are written by hand in the migration: **partial unique indexes** giving at most one ACTIVE and one DRAFT per instrument, so two concurrent publishes cannot both retire the old version and both insert a live one; and the **backfill**, which marks the existing row ACTIVE rather than taking the DRAFT default. Phase 4 learned that lesson on `courses.publication` — a defaulted enum on a backfill is a silent withdrawal of live content, and here it would have made the whole product answer `ASSESSMENT_NOT_FOUND`. Verified against the live database: one row, `riasec-core` v1, ACTIVE, with an effective date.

**Copy-on-write turned two guarantees into properties rather than promises.** A draft is a full copy, so no `assessment_responses` row can ever reference a draft's questions — which is why the draft is freely editable and freely deletable while the `Restrict` that protects published banks has nothing to refuse. And there is no code path in the whole service that touches `assessment_results`: D-049 holds not because the code is careful but because there is nothing to be careful about. The integration suite checks the strong form — the same row, the same six scores, the same code, still pointing at version 1, and **the question text a historical response resolves to is still the text that was asked**. That last one is the half a scores-only guarantee misses: edit in place and a row claims version 1 while reading as version 2's wording.

**The balance guard refuses; adjacency warns** (D-071), and the editor tries to make balance easy rather than only reporting failure. Adding a question asks for a *dimension* and copies the bank's own agreement levels, so growing five items per dimension to six is six clicks rather than a weighting exercise — and the full weight editor is still one click away on every option, because D-048 promises it. When the bank is unbalanced the panel prints what each dimension can attain: "الاجتماعي ٢٤ / الواقعي ٢٠" says which dimension to even up, where "غير متوازن" sends somebody to count questions by hand.

**Balance is expressed over attainable maxima, not question counts** — and a unit test proves why that matters. A bank with one item per dimension passes any count-based check while a strongly Enterprising taker scores twice what a strongly Realistic one can, because the weights differ. The same definition also *permits* a ministry to rescale the whole instrument to 0-8, which a count-based rule would have had no opinion about.

**The seed stopped maintaining and became a bootstrap.** `seedAssessment` used to upsert the bank by key on every run. After 5.3 that would overwrite a published ministry version with whatever wording shipped in the code — data loss dressed as a convenience. It now writes only while version 1 is the only version there is, and says so when it stands back. D-032 always claimed the bank was seeded data "precisely so Phase 5 can edit it without a deploy"; this is the other half of that sentence.

**The one genuinely hard test problem this phase created.** Every integration suite namespaces its rows by a per-run id and they run in parallel against one database. The assessment cannot be namespaced — §4.3 has *one* instrument and `getActive` finds the one ACTIVE row — so publishing a version mid-run made `journey.e2e-spec.ts` fail eight tests with `ASSESSMENT_NOT_FOUND`. **That refusal is correct product behaviour**: a taker whose instrument was replaced mid-attempt must not be scored against a bank they never saw. So the fix serialises the two suites with a Postgres advisory lock rather than weakening either assertion — held on its own connection, released by the server if a worker dies, and costing four seconds of wall clock across the whole run.

**Three smaller decisions worth knowing.** The weights DTO names all six letters explicitly rather than accepting a `Record<string, number>`, because a record would let `{ "X": 4 }` past validation and leave the enum column to answer 500 — the DTO is the outermost gate and naming the six is the only shape in which it can say no. Reordering takes the complete order rather than a move-up/move-down, so the result is what the administrator arranged rather than a replay of their clicks, and it writes negative orders first because `display_order` would otherwise collide with itself mid-shuffle. And an option's weights are replaced wholesale rather than merged, because "this option now contributes to S only" has to be expressible and a merge cannot say it.

### 2026-08-24 — Phase 5 verification pass: a missing deliverable built, two defects found and fixed

Asked to test Phase 5 thoroughly before the PR. Four things came out of it, in order of how much they mattered.

**1. A Phase 5 deliverable was missing.** CLAUDE.md's Phase 5 lists "change-password, email re-verification, language switch" among the deferred Profile items. Change-password shipped in 5.9 and the language switch is deliberately deferred (D-086) — **email re-verification had simply not been built**, and nothing recorded it as owed. It is built now (D-088): request-then-confirm, with the pending address held on an `EMAIL_CHANGE` token rather than on the user row, so `users.email` never points at an inbox nobody has proved they can read. The current password is required — whoever can move the address can then use "forgot password" and own the account outright — and the ministry-domain gate applies, extracted from the registration policy into `checkEmailDomain` so the two rules cannot drift. A taken address is answered exactly like a free one, because the profile form must not become the address oracle registration refuses to be. Completing the change revokes **every** session, the caller's included: the identifier the person signs in with has just changed.

**2. The portals unmounted themselves on an ordinary refetch.** All three providers gated their loading state on `isLoading` rather than `isInitialLoad`, so `refreshSession` after saving a preference swapped the whole portal for a spinner and tore down everything below it. `PreferenceProvider` made it worse by returning `children` unwrapped when the preference was null — a different element type at that position, so the *first* save changed the tree shape and remounted the entire subtree. Either way the confirmation the person had just earned vanished, along with any half-filled form or open dialog. Fixed at all four points (D-089).

> **How it was found is the part worth remembering.** The browser test asserted `getByRole('status')` after saving — and passed, against the **loading state**, which carries that role too. The bug and the test that should have caught it were hiding each other. Assertions now name the confirmation's actual words.

**3. Two screens' worth of browser coverage was missing.** Sub-phases 5.4-5.8 and 5.9 had unit, integration and component tests but no end-to-end browser test at all. Two new specs, 26 tests, aimed at the rules rather than the rendering: the 5-10 bounds and rate limits shown but with **no control to write them**; no secret appearing in any settings payload; the audit trail offering no write route (404 on POST/PATCH/DELETE, asserted from the browser); the CSV exports carrying the UTF-8 BOM byte-for-byte; a setting saved on the screen read back **through the API**; an employee refused by URL and by API; and the digits preference proving itself by changing a number several screens away from the control that set it.

Two of the new tests were themselves vacuous when first written — `getByRole('listitem')` unscoped was matching the navigation rail — which is why the audit trail is now marked up as a named list. That is also a real accessibility improvement: a screen reader announces how many entries there are and lets its user move between them.

**4. A duplicate label.** The profile page ended up with two fields both labelled "كلمة المرور الحالية" — the password card's and the email card's. A screen reader announces the same thing twice with no way to tell them apart, so the email card's is now "كلمة المرور للتأكيد".

**Verification.** 599 API unit · 515 API integration · 403 web component · 84 browser e2e in Chromium — **1601 automated**, all green. Typecheck, lint and format clean.

> **One transient failure, honestly reported.** The first full integration run after the new migration failed 7 tests in `admin-assessment.e2e-spec.ts`. It has not recurred in three subsequent full runs, the suite passes in isolation, and the assessment table was verified clean afterwards (one ACTIVE version 1). **The cause was not identified.** Given this suite's history of cross-suite collisions (D-079, D-083), it should not be assumed benign — if it reappears, capture the failure text before re-running.

**Also carried forward:** the old address is *not* warned when an email change is requested. §2's notification list is short and locked, and the current-password requirement means an attacker already holds the password before this endpoint helps them — so it is defence in depth, not the primary control. On the Phase 6 list rather than silently absent.

**Files:** `auth.{service,controller,dto}.ts`, `registration-policy.ts`, `email.{service,templates}.ts`, `audit.actions.ts`, a migration (`phase_5_email_change`), `verify-email-change/page.tsx`, the profile page, `preference-provider.tsx`, the three portal providers, the audit page, and their tests plus `e2e/phase-5-admin.spec.ts` and `e2e/phase-5-profile.spec.ts`.

**Decisions recorded:** D-088 (email change: request, confirm, token-held address), D-089 (a provider never unmounts the page it provides to).

**Next:** the PR for the whole of Phase 5.

---

### 2026-08-23 — Sub-phases 5.5-5.9: oversight, settings, templates, audit, and the Profile debt paid

Run straight through at the user's instruction, on the same branch, one commit per step.

**5.5 — Course Oversight (§4C.5).** The global catalogue: every entity's courses plus the ~40 the
seeded catalogue holds that nobody supplies — which no entity portal can show by construction, and
are therefore only ever the administrator's to place. The screen answers one question, *why can
nobody see this course*, and the answer is always the publication decision and the two LMS facts
disagreeing, so all three sit on the row rather than only the conclusion. Intervention lands on
publication and ownership only: the DTO has no `status` field, so `effectiveCourseStatus` stays its
sole author (D-059) and hiding a course a learner holds degrades to `HIDDEN_BUT_COMPLETABLE` rather
than retiring it. Returning a published course to DRAFT is refused — that state is reachable
forward only, and going back would bypass the protection entirely. Also finally renders
`published_at`, written since Phase 4 and read by nothing until now.

**5.6 — System Settings (§4C.6).** A `settings` table, one `SettingsService`, and the screen. The
pass threshold had **four independent readers** — three chances to disagree about the number that
decides whether a learner passed; they now read one source, and the entity portal's dead fifth copy
is gone. An absent row means the environment, so a fresh deployment behaves exactly as it did
before the table existed and `.env.example` stays meaningful as documentation of the defaults; a
malformed row falls back the same way and is logged, because refusing to boot over one setting
takes the product down for something the portal could fix. Secrets are not settings: the Moodle
token, the database URL and the SMTP credentials have no key, no endpoint and no route. The 5-10
bounds and the auth rate limits are shown read-only (D-074) — a product rule and a security floor,
not knobs. Changing the sync interval re-registers the repeatable job on its fixed id, so lowering
it changes the polling instead of producing two schedules.

**5.7 — Certificate Templates (§4C.7).** The signature block becomes three settings read at issue
time, so each certificate freezes the block current when it was earned (D-052). The page leads with
the notice that an edit reaches *future* issuances only — stated as the property that makes a
credential a credential, not as a limitation, because an administrator who thinks a correction will
propagate is one who will not make the correction. The still-missing ministry seal is named on the
screen, where the person who can supply it is looking, rather than only in this file. The preview is
the real `renderCertificateHtml` with sample data in a sandboxed `iframe`; the three fields are
written through the settings endpoints so those rows keep one writer (D-072).

**5.8 — Audit & Reports (§4C.8).** A cursor-paged read-only trail — filters by action, outcome and
actor; the action filter offers every action the codebase can emit, not only those already logged,
so options do not quietly vanish as old entries age out. Five reports: journey funnel, path
popularity, Holland-code distribution, certificate issuance, and course outcomes sorted worst-first,
which is what makes them actionable. Both export as CSV with a UTF-8 BOM (D-076) and
formula-defusing.

> **The bug worth remembering.** Adding `auditAction: 'الإجراء'` as a column heading overwrote the
> `admin.auditAction` **namespace** with a seven-character string — `Object.assign` onto a string
> yields `{0..6}` — so every ADMIN_* action rendered as its raw code and next-intl's fallback made
> it look intentional. The screen worked, every test passed. Renamed to `auditActionLabel`, and a
> permanent test now asserts every dynamically-keyed namespace is still an object of strings
> (D-084).

**5.9 — the deferred Profile items (§4.12).** Owed since Phase 1. Change-password requires the
current password and revokes every other session while keeping the one doing the changing (D-085):
a session cookie is enough to *be* the user, so without the check an unlocked machine is a permanent
takeover, and the usual reason to change a password is that it may be known elsewhere — which a
change that leaves those sessions alive does not address. In place of the language selector §4.12
names, a digits preference through D-018's switch point (D-086): the interface is Arabic-only, so a
control offering English would be a promise the product cannot keep. Stored nullable, where null
means "follow whatever §4C.6 has set", so the ministry can change the default without overwriting
anybody's choice. **The language switch is deferred, not dropped** — it returns when an English UI
exists.

Two drifted literals surfaced here, both caught by the new integration tests rather than by review:
the option value was `'arabic'` where `NUMBER_FORMATS` says `'arabic-indic'`, so **every save was
refused with a 400**, and the `NUMBER_FORMAT` settings hint told administrators to type the same
wrong value. The options now come from a typed list, so a third drift is a build error.

**Verification pass.** 593 API unit · 502 API integration (run three consecutive times end to end,
all green) · 397 web component · 52 browser e2e in Chromium. Typecheck, lint and format clean across
all three workspaces.

**One pre-existing defect found and deliberately NOT fixed here.** `EnrollmentService.addCourse`
guards duplicates with a read-then-write (`selectedCourseIds.includes`) whose own comment says
"idempotent", but two concurrent adds of the same course both pass the check and the second gets a
P2002 → 500 instead of the intended no-op. It appeared in the API log during the browser e2e run.
Enrolment is untouched by Phase 5 (`git diff origin/main -- apps/api/src/enrollment` is empty), so
fixing it here would widen the branch past its scope. **Carried to Phase 6** — see Deferred/owed.

**Files:** `admin-{courses,settings,templates,audit}.{service,controller}.ts`, `csv.ts`,
`settings.{schema,service}.ts`, `certificate-{template,issuance.service}.ts`,
`auth.{service,controller,dto}.ts`, `session.service.ts`, the
`(admin)/admin/{courses,settings,templates,audit}` and `(portal)/profile` pages,
`preference-provider.tsx`, two migrations (`phase_5_settings`, `phase_5_number_format`), and their
tests.

**Decisions recorded:** D-084 (a namespace is never also a label), D-085 (password change ends other
sessions), D-086 (per-user digits preference; language switch deferred), D-087 (the guard's third
exception, for glyph specimens). D-069-D-083 were recorded earlier in the phase.

**Next:** the user's test. On approval: one PR for the whole of Phase 5. Nothing more on this branch.

---

### 2026-08-23 — Sub-phase 5.2: user management, and Phase 4's provisioning seam closed

§4C.2 built: the account list with search across name, email and employee id; the per-account view; suspend/reactivate and role change; **provisioning accounts and creating organisations**. An entity used to exist only if `prisma/seed.ts` created one, so onboarding a ministry supplier needed a developer with database access — that is now a screen.

**Test totals: 556 API unit · 290 web component · 268 API integration · 40 browser e2e — 1154 automated.** Typecheck, lint and format clean. No new dependencies.

**No password reaches the administrator, and the tests are written so a regression cannot hide.** An account is created with a hash of 32 random bytes that nothing retains, and an invitation goes to the address; the person chooses their own password from the link. The obvious alternative — generate one and show it once, as `prisma/seed.ts` does — produces a credential two people know, relayed over whatever channel the admin then uses, which in a ministry is a chat message. The seed does it that way because a terminal has no mailbox to send to; a portal does. Both the integration and browser suites assert the *absence* against the whole serialised response and the whole rendered page rather than against named fields, because a later refactor adding `temporaryPassword` would satisfy every other assertion in either file.

**A dead end that already existed, found while making the invitation work.** `requestPasswordReset` accepts an unverified account, but `resetPassword` never set `emailVerifiedAt` — so it was possible to register, skip verification, use "forgot password", set a new password, and still be refused at sign-in with `EMAIL_NOT_VERIFIED`, having just proved control of the mailbox. Redeeming a token emailed to an address *is* what verification asserts, so the reset now sets the timestamp when it is null (`??`, never overwriting — the original is when the address was first proven). This is also what makes an invited account work at all, since it has never seen a verification email.

**Two lockouts, and they are not the same failure.** Refusing self-modification stops an administrator suspending themselves mid-session, where the screen that would undo it is the one they just lost. Refusing to remove the last *active* administrator stops the ministry losing the portal entirely — and no amount of individual care prevents that one: two administrators can each demote the other, one after the other, and neither has done anything wrong. Both live in `account-changes.ts` as pure functions over gathered facts, on the same reasoning as `checkRegistrationPolicy` and `publishBlockers`: every rule here prevents a lockout or an orphaned record, which are exactly the cases an integration test reaches only by arranging the disaster first.

**A third refusal the schema does not enforce.** Converting an EMPLOYEE who holds a result, a path or a certificate is refused. Their record survives — `user_paths.pathId` is `Restrict` and certificates are immutable — but every screen that reads it is `@Roles('EMPLOYEE')`, so the person could no longer reach their own training history while their certificate stayed publicly verifiable in their name. The ministry case this resembles, an employee seconded to run a supplier account, is properly served by a second account.

**Suspension revokes sessions, and the reason is not the obvious one.** `SessionService.resolve` already refuses a suspended owner on every request, so the suspension takes effect either way. What revoking prevents is the *reactivation*: without it, restoring an account silently hands back every session that was live when it was suspended — including whichever one may have been the reason for suspending it. A role change revokes for a different reason: a demotion would otherwise keep resolving against the old role until the session expired, which is precisely the window that matters.

**A defect the audit test caught.** `Object.keys(dto)` on a class-validator DTO returns every declared optional, because `transform: true` instantiates the class and absent fields exist as `undefined` own properties. The entity-update trail therefore claimed all four fields changed on every edit — worse than recording nothing, because a reviewer would stop believing the payload. Now filtered on `!== undefined`.

**`ADMIN_CONTROLLERS` replaced the single controller.** 5.1's RBAC suite reflected routes off one class; §4C is roughly forty endpoints across eight pages, and one file holding all of them makes the boundary between "users" and "settings" a matter of scrolling. The suite now enumerates the same array `AdminModule` registers, so a controller added later is covered the moment it is routable — **46 RBAC assertions across 11 routes**, with no second place to remember. Each denial is still checked for `INSUFFICIENT_ROLE` rather than only for a 403, since a CSRF refusal is indistinguishable from outside.

**Administrative provisioning bypasses D-017 deliberately.** The domain and employee-id gate governs *self*-registration; the whole point of `admin-only` mode is that an administrator is the gate. It also has to: an entity contact is by definition not at a ministry address and could never be provisioned otherwise. Uniqueness is still the database's, and the browser suite provisions to `@authority.example` to prove it.

**The Phase 4 refetch defect, written a second time.** Saving from the admin user panel triggered a refetch, `useApiQuery` set `isLoading` on every refetch, and `DataView` swapped to its loading state — unmounting the confirmation the administrator had just earned. Phase 4 hit exactly this on the entity manage screen and fixed it by writing `isLoading && data === undefined` at the call site. Two occurrences of a rule nobody can be expected to remember is enough: the hook now exposes **`isInitialLoad`**, documented as what `DataView` almost always wants, so a third occurrence needs a deliberate choice rather than a forgotten one. Only the browser suite could see it — the component test passes because a mocked fetch resolves before React can render the loading state.

**Two smaller things the browser found.** The entity dashboard has computed `entityName` since Phase 4 and rendered it nowhere; harmless while an account's organisation was fixed at seeding, and no longer, because §4C.2 lets an administrator move an account between organisations — so "whose courses am I looking at" is now a question the screen has to answer. And Next.js renders its own `role="alert"` route announcer at the document root, which makes every unscoped alert assertion ambiguous; the e2e scopes to the dialog rather than weakening the assertion.

**One state the database has no column for.** An account created but never activated looks identical to a working one on `status` alone, and "why can this person not sign in" is the question this screen is most often asked — so the list renders a third badge, بانتظار التفعيل, derived from a null `email_verified_at`. Suspension outranks it: an account that was cut off is not waiting for anything.

### 2026-08-23 — Phase 5 planned; sub-phase 5.1: the admin foundation and the §4C.1 dashboard

Branch `phase-5-admin-portal`, cut from `origin/main` @ `f1f0dcd` — which now contains Phase 4 (PR #6 merged). **Phase 5 is divided into nine sub-phases**, run back to back on this one branch with a single PR at the end; the tracker is in Current Status above so a cleared chat can resume mid-phase.

**Eight decisions were taken before any code was written** (D-069 … D-076), because four of them shape the schema and would have been expensive to reverse. The one that matters most is **D-069, copy-on-write assessment versioning**: D-049 says existing results are "frozen as taken", and that is only literally true if the *instrument* survives beside the scores. Editing in place and bumping an integer freezes the numbers but lets a wording change rewrite the questions a past response points at, so a row would claim version 3 and resolve to version 7's text. `assessment_results.assessmentId onDelete: Restrict` (D-035) has been promising since Phase 1 that the instrument still exists; 5.3 is where that promise is either kept or quietly broken.

**Test totals: 540 API unit · 271 web component · 198 API integration · 34 browser e2e — 1043 automated.** Typecheck, lint and format clean. No new dependencies.

**A live defect, found by reading the routing rather than by a failing test.** A `SUPER_ADMIN` who signed in was sent to the *entity* portal. Three separate files each asked `role === 'EMPLOYEE'` and treated everything else as an entity — correct when written, because until this phase there were only two portals, and wrong the moment a third role could sign in. The account with the most authority in the system was being handed somebody else's screens, and no test could see it because every test asserted the two roles that existed. It is now one `Record<UserRole, string>` map with four readers, so adding a role fails the typecheck at every site instead of defaulting silently. This is the second time a half-implemented redirect rule has surfaced (D-067 was the first) — the pattern is that these rules read correctly one branch at a time and are only wrong as a set.

**The RBAC test enumerates its own routes.** `admin-rbac.e2e-spec.ts` reflects Nest's own `PATH_METADATA` / `METHOD_METADATA` off `AdminController` rather than listing paths by hand, so every endpoint added in sub-phases 5.2-5.8 is automatically asserted against an employee, an entity and an anonymous caller the moment it exists. A hand-maintained list would go stale exactly where it matters: the endpoint nobody remembers to add is the one that ships unproven while the suite stays green. Each request carries a valid CSRF token and each denial is checked for `INSUFFICIENT_ROLE`, because a 403 from `CsrfGuard` and a 403 from `RolesGuard` are indistinguishable from outside and one of them would mean the role check never ran.

**The dashboard adds no source of truth.** Every figure on §4C.1 already existed — users, entities, paths, courses, results, completions, certificates, the audit trail. The service only asks the existing tables the questions an administrator has, which is what stops it disagreeing with the screens it summarises. Three pieces of arithmetic were worth unit-testing because a plausible implementation gets each wrong: a retake must not count as a second assessed person (D-033), the code distribution must use each person's *newest* result or it describes the indecisive rather than the ministry, and a completion rate over nobody is undefined rather than 0%.

**Integration health asks two questions, not one.** "Is Moodle answering?" is a live `checkHealth()` call; "did the sync actually run?" is read from the audit trail, because that is the only place a *run* is recorded — `courses.lastSyncedAt` would report a healthy catalogue while every recent run had failed. A Moodle that answers while the scheduler is dead is the outage that a single green tick hides, and it is the one an operator must act on. The failure code is surfaced too: a rejected token and an unreachable host need different fixes, and collapsing them costs the operator their first hour.

**Two smaller things the work forced.** `audit_log.id` is a `BigInt`, and `JSON.stringify` throws on one rather than rounding it — so the conversion happens in the service and is asserted with a value above `Number.MAX_SAFE_INTEGER`. And an audit action with no Arabic copy falls back to its raw code rather than to an empty string, because a blank row hides the event entirely, which is worse than an untranslated one.

**Eight nav items, not six.** §3 caps the *learner's* steady-state nav at six so a person is not shown places they cannot act on; §4C names eight administrative destinations and each is a distinct thing the ministry runs. `ADMIN_NAV` currently holds one entry and gains the others in the sub-phase that builds each page — the same rule `navForState` follows, that an item leading to a 404 advertises what the product cannot do.

### 2026-08-22 — Phase 4 verification pass: four defects found, fixed, and the PR opened

The phase was already written and green. This session tried to break it, and did — four times. **1012 automated tests** now pass: 530 API unit, 256 web component, 192 API integration against real PostgreSQL, 34 browser e2e in Chromium. Lint, format and typecheck clean.

**`main` had moved.** The landing page merged as PR #5 while this branch sat unpushed, touching the same `ar.json` and `api-client.ts` this phase extends. Merged into the branch rather than left to GitHub: the merge was clean, but "the tests pass" means nothing if the suite never ran against what the code will actually land on.

**Four defects, none of which the existing 998 tests could see.**

| what | how it was found | why no test caught it |
|---|---|---|
| an entity on any learner page got a dead error card | driving the merged build in a browser | `@Roles` made the dashboard answer 403, not 401 — no suite asked what a non-employee sees on `/` (D-067) |
| the mock reissued a course id after a restart | a 500 in the first test of the entity suite | the mock's state dies with the process; the rows do not, and `moodle_course_id` is UNIQUE (D-068) |
| `published_at` never set on a course withdrawn while still a draft | reading the publish path, then reproducing it against a running API | nothing renders the column yet — §4C.5 will |
| the e2e fixture borrowed a created course, not a catalogue one | the suite failed on the publish bridge, which was not at fault | `MAX(moodle_course_id)` is not the same question as "the last catalogue course" |

**The one that mattered most was the cheapest to fix.** D-065 already claimed "each provider redirects a caller who does not belong to it". It was half true: the entity portal returned a mis-routed employee, and the learner portal left a mis-routed entity staring at a retry button that could never succeed — §2B's forbidden state, shipped, in the phase that created the role which reaches it. Applying `@Roles` is what turned the dashboard's answer from 401 into 403 and broke the assumption the provider rested on.

**The mock was easier to satisfy than reality for the fourth time** (D-036, D-045, D-060, now D-068). Its own comment records fixing exactly this for user ids and explains why a counter cannot work across a restart; course ids kept the counter anyway. Both now derive from a natural key through one helper, and the property is asserted in the **shared contract** rather than the mock's own spec — the real adapter gets it free from Moodle's database, which is what makes it a property of the port.

**`published_at` asked the wrong question.** It was set only when the course was currently a `DRAFT`, so a course withdrawn before it was ever published reached `PUBLISHED` with no date, permanently — the condition never comes true again. It now asks whether the column is null, which is the fact it records. Nothing reads it yet; that is the argument for fixing it now rather than in the phase that builds the screen.

**A fixture that blamed the wrong code.** The e2e entity fixture lends out `MAX(moodle_course_id)` among unowned courses, meaning the last catalogue course. Created courses are numbered above the catalogue, so one left behind — by an aborted run, or by catalogue sync legitimately re-mirroring a course the LMS still holds — became the borrowed course instead, and the suite failed asserting a learner could see a draft that was never publishable. Bounded, and proven with two consecutive full runs holding a created course in the database throughout.

**Also checked, and correct:** every controller carries `@Roles`; `courses.status` has exactly three writers and all go through `effectiveCourseStatus`; the migration backfill still reads 47 `AVAILABLE` + 1 `HIDDEN_BUT_COMPLETABLE` against the live database; the six entity pages render RTL Arabic with no console errors and no failed requests; unknown API error codes fall back to generic Arabic copy rather than surfacing a raw code.

**One observation, not fixed:** eight API error codes have no Arabic entry (`CERTIFICATE_NOT_FOUND`, `CV_INVALID_DATE`, `CV_TOO_MANY_ENTRIES` among them). All are Phase 3's, all degrade to the generic message rather than to a crash or a raw code, and none is Phase 4's to widen. **Phase 6's Arabic content QA** owns them.

### 2026-08-20 — Phase 4 complete; awaiting the user's test approval

Branch `phase-4-entity-portal`, off `origin/main` @ `f2a6b4d` (which includes Phases 0-3). **PR not yet opened** — D-008 puts the user's approval of the test first. `gh` is still not installed, so it will be opened from the compare URL.

**Test totals:** 529 API unit · 247 web component · 190 API integration against real PostgreSQL · 32 browser e2e in Chromium — **998 automated**. Typecheck, lint and format clean. No new dependencies.

**Five commits**, one per checkpoint.

**The phase found a live defect before it built anything on top of it.** `courses.status` was two facts wearing one column — what the LMS says about a course, and what we have decided about it — and catalogue sync recomputed it from the LMS's `visible` flag on every run, protecting only `RETIRED`. So an entity hiding a course would have had it flipped back to `AVAILABLE` by the next scheduled sync, silently, minutes later, with their decision recorded nowhere. That is the whole reason D-059 exists, and everything else in the phase rests on it.

**What was built, in order:**

```
schema       publication / lms_visible / lms_present split; entities; ownership
rbac         @Roles applied for the first time; scope as a query filter
port         createCourse + the content read-back; author enrolment role
api          §4B.1-4B.6 — create, metadata, publish gate, withdraw, review
web          the (entity) route group and its six pages
e2e          the whole thing through a real browser, twice over
```

**Course-edit protection stopped being a check and became a property.** `effectiveCourseStatus` is now the only thing that decides `courses.status`, from four inputs, and **there is no combination of them in which a course a learner holds becomes invisible to that learner**. The forbidden state cannot be expressed, rather than being guarded against at each call site. A unit test asserts it over every input combination; the browser suite proves both halves against a real database, with two learners — one holding the course and one not — because one learner can only ever prove half of the rule.

**`@Roles` had never guarded anything.** It shipped in Phase 0 and `grep` found it only in its own definition, so until this phase an `ENTITY` account could take the assessment, build a path and confirm it. Applying it at class level then exposed a second problem: class metadata reaches `@Public()` routes too, and decorating `CertificatesController` would have taken the public certificate verification page offline for the third parties it exists to serve. `RolesGuard` now honours `@Public()` first, with tests both ways.

**Two things the work forced that were not in the brief.** The publish gate had to refuse rather than warn, because a warning on a publish button is dismissed and the cost of dismissing this one is a cohort of learners on a course nobody can ever pass (D-061, closing the detection-only half of D-042). And the RIASEC letter had to be derived from path membership rather than authored beside it (D-066) — §3A makes the path its owner, so a stored copy could contradict the path and nothing downstream would notice, because the gold recommendation never reads a course's letter.

**Three corrections worth recording.** The generated migration would have failed on PostgreSQL 12+, which refuses to *use* a new enum value in the transaction that added it — split into two migrations. The backfill was the part that mattered: `publication` defaults to `DRAFT`, and taking that default would have withdrawn all 48 existing courses from every learner the moment the migration ran; existing rows are marked `PUBLISHED` with LMS flags chosen to reproduce each row's current status exactly, verified against the live database as 47 `AVAILABLE` and 1 `HIDDEN_BUT_COMPLETABLE`, unchanged. And the browser suite caught a real bug: `DataView` was showing its loading state on every refetch rather than only the first, so saving metadata unmounted the whole view and the confirmation vanished the instant it was earned.

**The contract suite earned its keep for the third time.** It caught `MockLmsService.createCourse` throwing synchronously where the real adapter rejects — which would have escaped a caller's `.catch()` entirely. After D-036's user-id counter and D-045's stable launch URL, this is the third occasion the mock was easier to satisfy than reality.

**Two tests that were passing for the wrong reason, fixed rather than left.** Mocking `@/lib/api-client` wholesale dropped `ApiError`, so `useErrorMessage` threw and every failure translated as `UNKNOWN_ERROR` while the test still looked like it exercised the error path. And the save-confirmation test passed on timing luck, catching the message during the unmount window rather than after it; it now waits for the refetch to settle.

### 2026-08-20 — Phase 3 complete; PR opened for review

Branch `phase-3-certificates-cv` (off `phase-3-arabic-pdf-spike`, off `origin/main`). **Not merged** (human review gate, D-008). PR body in `.github/PR_BODY_phase-3.md`; `gh` is still not installed, so the PR is opened from the compare URL.

**Test totals:** 455 unit · 137 API integration against real PostgreSQL · 19 browser e2e in Chromium — **611 automated**. Typecheck, lint and format clean.

**Thirteen commits**, one per checkpoint plus the spike and the docs.

**The phase rests on one claim: the Arabic PDF problem was solved before anything was built on it.** The spike proved letter shaping, lam-alef ligatures, bidi runs, an English document with inline Arabic, and a QR decodable at 72 dpi — then every later checkpoint reused that same pipeline. Nothing about Arabic rendering was discovered late.

**What was built, in order:**

```
spike        four sample PDFs; QR decoded back out at 72/144/288 dpi
course cert  issued at Phase 2's onCoursePassed seam, idempotent three ways
path cert    new onPathCompleted seam — and a Phase 2 defect corrected
verify       the one public route in the product; four fields, nothing more
gallery      §4.10, plus the nav items D-037 had withheld
notifications a dot, and the emails folded in rather than doubled
cv           model + pre-fill, builder + live preview, English PDF export
e2e          the whole thing through a real browser
```

**A defect found and fixed (D-054).** Phase 2 finished a path when every chosen course read `COMPLETED` — a status that comes from the LMS's completion signal alone. A learner could finish all five courses and pass none, and Phase 3 would have certified it. Both the path status and the certificate now gate on `completions.passed`. Proven against a real database: refused at 5/5 `COMPLETED` with one course at 45% against a threshold of 70, then issued once it passed.

**Two things the work forced that were not in scope.** Node 20 is past end of life and was still pinned; Puppeteer's ESM-only packaging forced the question and it was overdue anyway (D-055). And `CERT_STORAGE_DIR` being relative meant the API and the browser suite resolved credential storage to different directories — caught by a 500 on download, and now flagged for deployment (D-052).

**Two corrections worth recording.** A reported bidi defect in the CV's career line was not real — measured glyph positions put the full stop correctly to the right of the Arabic run, and the speculative `&lrm;` fix was reverted rather than left carrying a false rationale. And the API's copy of the Arabic RIASEC names had `C` as "التقليدي" against the catalogue's "التنظيمي"; the drift guard that now compares the two caught it on its first run.

### [DATE] — Phase 4/5 portals specified + language decisions (planning, no code)
- CLAUDE.md gained §4A (Model 1 authoring + cross-portal linking rules), §4B (Entity/reviewer portal full page spec), §4C (Super-admin portal full page spec). Phase 4 + Phase 5 in §7 rewritten to reference them and to fold in the deferred items they own (D-027 entity scoping, D-035 objectives/prerequisites editable, deferred Profile items).
- Locked D-046 (Model 1 authoring), D-047 (single-language courses), D-048 (admins edit questions/weightings not the algorithm), D-049 (assessment-edit result freezing), D-050 (English CV with pass-through Arabic).
- §4.11 CV spec changed from Arabic-first to English-document. NOTE for Phase 3: the CV is English with inline Arabic proper nouns — the PDF spike must cover that case, not only pure Arabic.
- **Reminder:** Phase 2's PR is approved but still NOT merged (gh not installed; open/merge it on GitHub). Phase 3 must branch off a main that includes Phase 2.

### 2026-08-19 — Phase 2 complete; PR opened for review

Branches `phase-2-moodle-spike` and `phase-2-moodle-integration` pushed. **Not merged** (human review gate, D-008). PR body in `.github/PR_BODY_phase-2.md`; `gh` is still not installed on this machine, so the PR is opened from the compare URL.

**Test totals:** 352 API unit · 96 API integration against real PostgreSQL · 142 web unit · 14 browser e2e in Chromium — **604 automated**, plus the real-Moodle pass. Typecheck, lint and format clean.

**Nine commits**, one per checkpoint plus the spike, the dependency decision and the final pass.

**The claim the phase rests on:** the mock→real swap changed only the implementation. No caller of `LmsPort` was touched in any checkpoint — the port, the executable contract and the mock were built in Phase 0 for exactly this, and they held.



### 2026-08-19 — Phase 2 test pass: the whole loop, against a real Moodle

`MOODLE_MODE=real`, an isolated database, the **BullMQ scheduler polling every minute**, and a human taking a real quiz. Every effect landed in Moodle 5.2.2.

**The journey, over HTTP only** — so nothing it proves can be a rule living solely in a React component:

```
health      {"moodleMode":"real","lms":"up","lmsSiteName":"Dockerized_Moodle"}
register    → verified with a token read out of the delivered mail
assessment  → Holland Code: RIA
path        → 7 courses offered (the hidden one correctly excluded)
confirm     → 5 courses committed
```

**Enrolment, asked of Moodle rather than trusted from our own status field:** all five present on user 7.

**The loop closed on its own.** The scheduler logged `1 newly passed` at 15:26:48 and `0 newly passed` at 15:27:48 — the transition fired exactly once, with no manual trigger.

```
PASS  the app records the course as completed        status = COMPLETED
PASS  the grade came back from Moodle                gradePercent = 100
PASS  passed against the product threshold           passed=true at threshold 70
PASS  exactly one course-passed email was sent       1 email(s)
PASS  a second sync changes nothing                  COMPLETED/100 -> COMPLETED/100
PASS  and does NOT send the email again              1 email(s) after a second sync
```

**The `completions` table, read directly:** course 2 is `completed=t, grade=100, passed=t, pass_threshold_used=70` with a real `completed_at`; the four unattempted courses carry `grade_percent = NULL`, **not 0** — the distinction that would otherwise read as a failed attempt. **5 rows, 5 distinct `(user, moodle_course_id)` keys** after a dozen sync cycles.

**Setup the pass needed:** the dev Moodle had one usable course and the 5-10 rule needs five, so six test courses were created on it through Moodle's own PHP API. `scripts/real-pass-setup.ts` seeds the assessment, mirrors the live catalogue and builds one path over it — the last part is test scaffolding, since the seeded twelve paths are built on mock course ids. **Phase 7 owns real catalogue and path data.**

**Two things learned while doing it:**
- `tsx` cannot boot the Nest container — esbuild does not emit `emitDecoratorMetadata`, which is exactly what Nest reads to resolve constructor parameters, and the failure presents as a misleading "dependency at index [0] is undefined". Scripts that need DI must run compiled.
- The 60-second handoff TTL is right for production and impractical for a human step; the pass ran at the 300-second cap. The verify script now reads the lifetime out of the token rather than printing a constant that would quietly become wrong.

**Phase 2's "done when" is met:** a real user, from the app, entered a real Moodle course, took its quiz, and the app reflected completion and pass/fail automatically and idempotently. The mock→real swap changed only the implementation — no caller of `LmsPort` was touched in any checkpoint.

**Awaiting the user's approval of this test before opening the PR** (D-008).



### 2026-08-19 — Phase 2 checkpoint 6: the course player

§4.8's page, and it is now the **only** route into a course.

**The handoff is minted per click, never rendered.** `POST /api/courses/:id/launch` returns a fresh signed URL; the page contains no credential until the learner asks for one. A component test and a browser test both assert the markup does not contain it — the point of minting on click is defeated the moment a URL sits in the DOM waiting.

**`courseUrl` is gone from `CourseDetail` and `MyPathCourseView` (D-045).** Both screens previously linked straight at the Moodle deep link, which **carries no session** — a learner following it would land on a Moodle page that did not know who they were. Now that the handoff works, leaving the unauthenticated link in the API contract would leave the wrong thing equally available.

**Enrolment now also happens on demand at launch.** A learner who confirmed while the LMS was down had a committed path with no enrolments (D-036) and would have hit a Moodle access-denied page. `ensureEnrolledForLaunch` enrols right then, idempotently — "wait a sync interval and hope" becomes "it works".

**The mock got stricter, again.** Its launch URL was stable, and an integration test asserting freshness failed against it. A handoff is single-use, so a stable URL hands back an already-spent token; the mock now varies per call and the **contract** requires it. This is the second time a too-permissive mock would have let a real bug through (D-036 was the first).

**Two of my own test mistakes, both instructive:** a component test rendered twice in one case without unmounting, so the "absent" assertion found the first render's link; and an integration test asserted a property the mock did not have. Both are fixed at the cause rather than by loosening the assertion.

**Totals:** 352 API unit, 96 API integration, 142 web unit — all green. Typecheck, lint and format clean across both apps. The browser e2e now walks My Path → player → back, and was run against built apps.

**Next:** the full Phase 2 test pass — the whole loop against the real Moodle end to end — then the PR.



### 2026-08-19 — Phase 2 checkpoint 5: seamless login, proven end to end

`local_tamkeensso` (D-044) plus app-side token minting. **Verified against the live Moodle, including the refusals** — a handoff that only proves it lets people in has demonstrated nothing about who it keeps out:

| check | result |
|---|---|
| fresh token | `303 → /course/view.php?id=2`, and the course page renders the learner's Arabic name — a real session, no login form |
| replayed token | refused ("already been used") |
| tampered payload (user id edited to 1) | refused ("not valid") |
| expired but validly signed | refused ("expired") |

Repeatable as `npx tsx spike/verify-sso.ts`.

**Cross-language agreement is asserted, not assumed.** The plugin verifies in PHP what we mint in TypeScript, so a unit test pins the wire format exactly — unpadded base64url, HMAC-SHA256 over the *encoded* payload string, camelCase claims — and a live check ran a TS-minted token through the plugin's PHP verification inside the container. Two implementations read side by side would have drifted.

**Why core Moodle could not do this** (established, not assumed): every core mechanism mints a session for the **web-service token's own user**, and our token is `tamkeen-integration`, not the learner. `tool_mobile_get_autologin_key` fails on that plus three other counts.

**A version difference worth knowing:** Moodle 5.x moved the web-facing tree into `public/`, so the plugin installs to `public/local/tamkeensso` on 5.x but `local/tamkeensso` on the 4.5 production target. Getting it wrong means the plugin silently never loads. Both paths are in `moodle-plugin/README.md`.

**Installed on the dev Moodle** to verify rather than shipping untested PHP — a throwaway instance the user said can be wiped.

**Totals:** 351 API unit tests (was 331), 90 integration tests, all green; typecheck, lint, format clean.

**Owed:** re-verification on a real **4.5** (D-039), and the governance answer on custom plugins (D-044) — the longest-lead item in the project.

**Next checkpoint:** the course player (§4.8) — now unblocked — then the full Phase 2 test pass.



### 2026-08-19 — Phase 2 checkpoint 4: completion sync

The loop now closes in the product, not just in a spike. `getCourseProgress`/`listProgressForUser` are real, `completions` exists, and a scheduled job drives catalogue sync, enrolment reconciliation and completion sync in that order (D-042).

**Verified against the live Moodle**, reading the learner who actually took the quiz: `{"completed":true,"completedAt":"2026-08-18T13:57:59.000Z","gradePercent":100}` → our verdict `passed: true` at `PASS_THRESHOLD=70`. A course they are not enrolled in returns `null`; an unknown learner returns `[]`; three consecutive reads are identical.

**One constraint carries three rules.** `completions` unique on `(user_id, moodle_course_id)`: polling cannot duplicate a row, a shared course reuses the one completion instead of being re-taken (D-003), and Phase 3 gets a stable idempotency key. Keyed on the *LMS* course id so a completion survives our catalogue row being retired.

**The email fires only on the transition into passing** — the single irreversible act in a job that re-reads the same data forever. Tested by running the sync three times and asserting one email.

**A hazard the spike had already shown us** is now guarded: a Moodle course with no completion criteria reports `completed:false` forever, so nobody on it can ever pass however well they score, and the symptom is "certificates never arrive" with nothing in any log. `isGradedButNotComplete` detects that exact shape and names the course.

**My Path's live-progress overlay is gone, closing D-036.** Phase 1 read the LMS on every render because nothing persisted progress; this job is the writer that was missing. It also removes an N+1 LMS call from a page load — the page no longer needs Moodle to be up to render.

**Totals:** 331 API unit tests (was 285), 90 integration tests against real PostgreSQL, all green; typecheck, lint, format clean. One migration (`phase_2_completions`). Callers of `LmsPort` still unchanged.

**A security finding, not introduced here:** `npm audit` now reports **3 high** advisories for `deepmerge-ts`, reached through `prisma` → `@prisma/config`. It is not from BullMQ (verified by tracing the tree) — it is a newly published advisory against a dependency we already had. An npm `overrides` pin in the D-022 style **does not take effect** here, and npm's own fix downgrades Prisma to 6.x, breaking D-026. Exposure is low: it is a CLI/config-time dependency reached when loading a Prisma config file, not in the request path. **Flagged for a decision rather than silently absorbed** — see the blocker list above.

**Next checkpoint:** the seamless-login spike, before any course-player UI is built (D-039).



### 2026-08-18 — Phase 2 checkpoint 3: enrolment

`enrol`/`isEnrolled` are real, and enrolment now survives a Moodle that misbehaves (D-041).

**Verified against the live Moodle** — `spike/verify-enrol.ts`: provision → `isEnrolled` false → `enrol` → `isEnrolled` true → `enrol` again, no error, and false for a course the learner does not hold.

**Two defects that only exist against a real LMS.** `enrol` now **verifies before believing its own error**, because Moodle throws *after* committing the enrolment — the spike proved it, and the same reasoning covers a timeout, where the request may well have landed. And each course is enrolled **independently**: the old single `try` around the whole 5–10 course loop would abandon every course after a refused one and audit the batch as failed, leaving a learner half-enrolled in a path they cannot switch out of.

**`retryPendingEnrolments` closes the loop D-036 left open** — best-effort enrolment is only defensible if something reconciles the leftovers. Bounded per run, safe any time, attributed to no IP address because it is a background job rather than a person.

**A new unit suite for enrolment resilience**, which did not exist: Phase 1 tested enrolment only through the journey integration suite, where the mock never fails, so none of this was reachable. Nine cases covering partial failure, provisioning failure, double-enrol prevention and multi-path reconciliation.

**Also fixed while here:** the reconciler counted enrolments by subtracting a global pending tally, which reports zero on a run that enrolled plenty whenever more rows are outstanding than the batch limit. It now sums what each attempt actually did.

**Not built, deliberately:** the optional `enrollments` table (§6). `user_path_courses.enrolledAt` answers the only question anything asks; a table whose sole consumer is a hypothetical future debugger is speculative schema. Recorded in D-041.

**Next checkpoint:** completion sync — the `completions` table keyed on `(user, moodle_course_id)`, the pass threshold, and the BullMQ scheduler that will also drive catalogue sync and enrolment reconciliation.



### 2026-08-18 — Phase 2 checkpoint 2: catalogue sync

`listCourses`/`getCourse` are real, and `CatalogSyncService` mirrors the LMS catalogue into `courses`.

**Verified against the live Moodle**, not just mocks — `spike/verify-catalog.ts` reads the real catalogue through the adapter: two courses returned, **the site course (id 1) correctly discarded**, the hidden course present with `visible: false` so sync can see it, `getCourse(9999)` → `null`, and `durationMinutes: null` exactly as D-039 predicted.

**Three destructive defaults avoided, recorded as D-040.** A vanished course is never deleted and is only retired if **no learner holds it** — `RETIRED` is invisible even to someone who already selected it, so retiring an in-use course would breach D-015. An empty catalogue is treated as a fault and writes nothing, rather than withdrawing everything in one pass. And sync writes only what Moodle owns: letting the LMS's `null` overwrite an authored `durationMinutes` would have erased every duration on the first run *without erroring*, since the column is nullable.

**Two stale tests updated honestly rather than deleted.** `moodle.module.spec` asserted the real adapter throws `NotImplementedException`; it now reaches an unreachable host and reports the LMS down. The property under test — an unusable LMS must never present as an empty catalogue — is unchanged, and the test still asserts it.

The seed runner now shares `fieldsForPublishedCourse` with the sync, so a seeded and a synced database cannot describe the same course differently.

**Totals:** 268 API unit tests (was 234) and **90 integration tests against real PostgreSQL**, all green; typecheck, lint and format clean. Callers still unchanged.

**Next checkpoint:** enrolment — including the verify-before-believing-the-error rule the spike proved necessary (D-038).



### 2026-08-18 — Phase 2 checkpoint 1: real Moodle client + user provisioning

Branch `phase-2-moodle-integration`, off `phase-2-moodle-spike` so the proof stays in the history rather than being orphaned.

**Built.** `MoodleWsClient` — the only thing that speaks HTTP to Moodle: PHP nested form encoding, timeouts, and the protocol's dangerous quirk, that **core REST answers HTTP 200 for errors** with the failure in the body. It handles real status codes too, so installing the Catalyst plugin later is not a behavioural change. `moodle-identity.ts` holds the derived-username scheme D-038 rests on. `MoodleHttpService` now really implements `checkHealth`, `provisionUser` and `findUserByEmail`; catalogue, enrolment and progress still refuse, by checkpoint.

**Verified three ways**, deliberately: 86 unit tests over the module with the HTTP layer mocked (our logic); the spike's raw REST calls (Moodle's behaviour); and `spike/verify-adapter.ts` driving the **real adapter against the live Moodle** — `checkHealth` → `5.2.2`, `provisionUser` twice → same id, uppercased email → same id, no duplicate. The gap between "our logic is right" and "it works against a real server" is where integrations usually fail, so it is closed explicitly.

**A test changed the code.** Asserting that no failure mode puts the token into a thrown error found that `MoodleWsError` was carrying Moodle's raw `message`, which a debug response can echo the request into. It now carries only the errorcode.

**Totals:** 234 API unit tests (was 189), all green; typecheck + lint clean. `LmsOperationError` added to `lms.types` to separate "retry this" from "a human must look" — the mock is unaffected, so the swap stays intact.

**Decisions:** D-039 records the version split (4.5 LTS production / 5.2 dev, adapter version-agnostic, seamless login to be re-verified on 4.5), `durationMinutes` as our product metadata, handoff-plus-early-login-spike for v1, and the client shape choices.

**Next checkpoint:** catalogue sync — `core_course_get_courses_by_field` per D-038, skipping the site course, idempotent and re-runnable.

### 2026-08-18 — Phase 2 spike: the Moodle loop is proven

Branch `phase-2-moodle-spike` off `origin/main` @ `f25b644`. One file, `spike/moodle-spike.mjs` — plain Node ESM, no build step, talks to Moodle's REST endpoint **directly** rather than through our adapter, so what it proves is a property of Moodle and not of code we wrote to satisfy ourselves.

**The loop closes.** Against real Moodle **5.2.2** at `localhost:8080`: provision user → enrol in course 2 → learner took the quiz in Moodle → we detect `completed: true`, `completedAt: 2026-08-18T13:57:59Z`, `gradePercent: 100` ⇒ **PASS** at `PASS_THRESHOLD=70`. Three consecutive reads returned byte-identical results.

**Five findings became D-038**, each a defect that would otherwise have shipped: email lookup silently returns empty under least privilege (→ key on a username we derive); `enrol` throws *after* committing (→ verify before believing the error); `core_course_get_courses` omits `visible` (→ use `..._by_field`); only a course-total grade item is returned (→ always evaluate the course total); `completionstatus.timecompleted` does not exist (→ derive from the criteria).

**Four Moodle-side gaps the spike surfaced**, all fixed by the human: `moodle/role:assign` plus the Allow-role-assignments matrix row (enrolment returned `wsusercannotassign` for *every* role id until both were set); the manual-enrolment welcome message (no mail transport in the container); and the test course, which turned out to contain no quiz at all — `core_course_get_contents` showed only the default Announcements forum, which explained both `nocriteriaset` and the missing grade item.

**Not yet built:** anything in `apps/`. The spike is deliberately disposable and no application code has changed. `MoodleHttpService` still throws `NotImplementedException`; `MOODLE_MODE` is still `mock`; no `completions` table, no BullMQ.

**Next:** on approval, branch `phase-2-moodle-integration` and build the real adapter against `describeLmsContract`, in the order: client + provisioning → catalogue sync → enrolment → completion sync → seamless login + player.

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

---

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
- [x] **Phase 0 — Foundations** (skeleton, RTL/i18n, color tokens, auth+email verification, user model, mocked Moodle service, CI) — **merged** (PR #1, `main` @ `b478327`)
- [x] **Phase 1 — Assessment (RIASEC) + path core** (RIASEC questions+scoring→Holland Code, gold ranked results, letter-tagged paths, catalog+detail from mock, 5-10 build + single-path commit, dashboard's 3 states, My Path) — **merged** (PR #2)
- [x] **Phase 2 — Moodle integration** (spike first; web services, provisioning, catalog sync, enrollment, scheduled completion sync + pass threshold + shared-course reuse, seamless login, course player) — **merged** (PR #3, `origin/main` @ `dcb8aad`)
- [x] **Phase 3 — Certificates + CV** (idempotent course/path certs, Arabic PDF solved, verification page + QR, gallery, CV builder + English PDF export) — **merged** (PR #4, `origin/main` @ `f2a6b4d`)
- [x] **Phase 4 — Entity / reviewer portal** (entity accounts + server-side data scoping, course creation in the LMS, authoring handoff, product metadata, publish gate + course-edit protection, learner review) — **merged** (PR #6, `origin/main` @ `f1f0dcd`)
- [ ] **Phase 5 — Super-admin portal** (user/path/assessment/settings/certificate-template management, global + integration-health dashboards) — **complete and verified; PR #13 open, awaiting review** (sub-phase tracker in Current Status)
- [ ] **Phase 6 — Hardening** (Arabic QA, RTL PDF polish, security review, sync reliability + load, a11y, states)
- [ ] **Phase 7 — Deployment, acceptance & launch** (deploy app+Moodle, seed data, full end-to-end acceptance, docs/handover, sign-off)

> When a phase is complete AND the user approved the test: create branch `phase-<n>-<slug>`, open a PR to `main`, and record it here. **Never merge/push to main.**
