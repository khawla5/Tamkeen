# progress.md — Running Implementation Log

> **Read this right after `CLAUDE.md` at the start of every session.** It tells you the last thing implemented so you can continue from there.
> **Update this file at the end of every session** (every meaningful output): what was done, what's next, blockers. Newest entry on top.

---

### 2026-08-30 — The English assessment run for real: migration, seed and the whole loop against live Postgres — branch `english-assessment`

At the user's request the stack was brought up and the feature exercised end to end. **This closes E.4's stated limitation** ("not run against a real database") and covers part of E.5 by hand; the automated integration and browser specs E.5 owns are still outstanding.

**Environment.** Docker Desktop was not running and had to be started; `npm run db:up` then found the existing `tamkeen-postgres` / `redis` / `mailpit` containers and started them. The database already held prior development data — 206 Holland results among it — so this was a migration onto a **populated** database, not a fresh one, which is the more useful test.

**`prisma migrate deploy` applied `20260830120000_english_assessment` cleanly** — six tables, two enums, the partial unique indexes — with no effect on any existing row. `npm run db:seed` then reported *"30 questions (150 options), 30 English placement questions, 48 courses, 12 paths, 133 memberships"*.

**What the database actually holds, read back directly:**
- `english-cefr` v1 ACTIVE · 30 questions · 6 bands · 0 results
- bands `A1 0-14 | A2 15-24 | B1 25-34 | B2 35-44 | C1 45-53 | C2 54-60`
- per level `A1 5q/5m | A2 5q/5m | B1 5q/10m | B2 5q/10m | C1 5q/15m | C2 5q/15m`, attainable total **60**
- **30/30 questions carry exactly one correct option**
- correct-answer positions `{1:8, 2:8, 3:7, 4:7}` — E.4's rotation fix working on real rows rather than in a constant

**The loop, over HTTP against the running API:** sign in → `GET /api/english-assessment` returns 30 questions and **no `isCorrect`, no `marks`, no level** (grepped over the whole response body) → submit 20 correct answers → **30/60 → B1**, `canRetake: false` → **second submit refused 409 `ENGLISH_ASSESSMENT_ALREADY_TAKEN`**. The answer key had to be read out of the database to build that submission, which is the property being demonstrated: a client cannot know the answers from the API alone.

**Holland, live and side by side:** `GET /api/assessment` still returns `تقييم الميول المهنية`, 30 Arabic RIASEC items, version 1, with no weight, dimension or points anywhere in the payload — **with a second ACTIVE instrument now present in the system**. That is the precise failure D-124 was written to prevent (`getActive` and `createDraft` both call `findFirst({ status: 'ACTIVE' })` with no key filter), and it is now demonstrated not to occur rather than only argued. `riasec-core` v1 remains ACTIVE with its **206 results untouched**.

**Operational note, not a code change:** the three seeded demo accounts already existed, so `seedSuperAdmin` / `seedDemoEntity` / `seedDemoStudent` correctly declined to touch their passwords (D-080's discipline — a seed must not reset a credential somebody is using), leaving their generated passwords unrecoverable. A known password was set on those three plus four throwaway learners (`en1`–`en4`) **directly in the development database**. Four learners rather than one because the test is taken once per account (D-123), so a single demo learner allows exactly one trial run. No application code was involved and nothing in the repository changed.

**Worth chasing in Phase 6, unconfirmed:** during the hand-over the user reported "email or password is wrong" while the credentials verified correctly at the API. Sign-in is throttled at 5 attempts/minute/IP, and if the page renders a **429** as `INVALID_CREDENTIALS` then a rate-limited person is told their password is wrong and sent off changing a password that was fine. Not reproduced, so not recorded as a defect — but the auth error mapping is worth an explicit look.

### 2026-08-30 — E.4: the thirty seeded English questions — branch `english-assessment`

The content: thirty MCQs across grammar, vocabulary, reading and practical English, five per CEFR level from A1 to C2, seeded as editable data in `seed-data/english-assessment.ts` and written by `seedEnglishAssessment` in the same pass as the band table.

**Marks rise with the level** — A1/A2 worth 1, B1/B2 worth 2, C1/C2 worth 3, **sixty marks in total**. This is the distinction that made the sibling schema necessary in the first place: weighting a harder item more heavily is difficulty weighting doing its job, not a skew, and D-032's balance rule has nothing to say about it (D-125). The seeded band table partitions 0–60 with the middle bands widest.

**Items run in ascending level order**, where the RIASEC bank deliberately interleaves (D-032). The reasoning that makes interleaving right there makes ascending order right here: a Holland item invites a self-description that can be answered in blocks, so the bank breaks up the blocks; a placement item has a right answer, and opening with C2 grammar makes a genuine A2 speaker give up on a test that was about to place them correctly.

**A real defect found in my own content, and fixed.** Every one of the thirty items was authored with its correct answer as the **first option** — which is how a human reviews an answer key (reading down the file, the first option is the one being asserted correct) and is a catastrophe if seeded that way: a taker who noticed would score sixty out of sixty without a word of English, and *every structural property would still have held*. The stored bank now rotates each item's options by its index — deterministic, never random, because a shuffled seed would put the answer somewhere new on every run, so a stored response could not be re-read against the bank that produced it and two environments would hold different instruments under the same version number. Two tests guard it: the correct answer's **distribution** across positions (not merely "not always zero" — one stray item would satisfy that while twenty-nine others gave the game away), and a spot-check that rotation moved the options without moving the *answer*.

**The items are in English, and the spec asserts it.** §2 is Arabic-first and `messages.test.ts` enforces that over the message catalogue — but an English proficiency item cannot be posed in Arabic without ceasing to measure anything. D-047's rule for course content, applied to assessment content; the chrome stays Arabic, and the spec asserts *both* halves (no Arabic in any item, Arabic in the instrument's own title and description).

**The seed bootstraps; it does not maintain** (D-083, applied to the second instrument). Once §4C.9 has published an edit, re-running the seed leaves every row alone and says so. For this instrument the loss it prevents includes the band boundaries that decide what every future placement *means*.

**Tested: 750 API unit (46 suites, +32 new) · 865 web · 51 types.** Two new specs. `english-assessment.spec.ts` (24) asserts the content properties that must fail CI rather than be noticed later — thirty items, five per level, all four skills, a reading and a practical item at every level, exactly one existing correct answer each, no duplicate or blank options, marks non-decreasing up the scale, the band table partitioning 0–60 with **every one of the sixty-one integers in exactly one band**, and the whole bank passing `assessEnglishBank` with no blockers *and no warnings*. It also asserts two things about the instrument's shape: a taker answering every A and B item correctly (30 marks) lands below C1, and one answering only the A-level items lands at A1. `english-seed-runner.spec.ts` (8) covers D-083 against a Prisma stub — the ministry-owned case asserts **every write mock is untouched**, enumerated over the whole set rather than the ones that came to mind, because the failure it guards is a *new* write added later without the guard in front of it.

**Honest limitation, unchanged from the standing note:** there is no Docker or Postgres in this environment and no `.env`, so `npm run db:seed` has **not been run** against a real database. The seed function is verified by typecheck and by the stub-based spec, which asserts which writes are issued — a stronger property than reading rows back, but not the same as having run it. **E.5 owns running it for real.**

**Next:** E.5 — integration and the full verification, including the explicit Holland-intact proof.

### 2026-08-30 — E.3: the sibling admin editor at `/admin/english` — branch `english-assessment`

§4C.9 built: the version overview, the draft-then-publish editor over copy-on-write, question text / level / skill / marks, the correct answer, and **the band table as the configurable scoring rule**. The RIASEC editor is not touched — no file under §4C.3 changed, and `admin-assessment.test.tsx` runs unaltered.

**A parallel surface, not a retrofit.** `AdminEnglishService` imports nothing from `AdminAssessmentService` and vice versa; `AdminEnglishController` is mounted at `admin/english`. It joins `ADMIN_CONTROLLERS`, which is the list `AdminModule` registers **and** `admin-rbac.e2e-spec.ts` enumerates — so every new route is covered against an employee, an entity and an anonymous caller the moment it is routable, with no second place to remember.

**Two invalid states are made unreachable rather than merely refused, and both guards stay in the gate anyway.**
- *The correct answer is a radio.* `updateOption` with `isCorrect: true` clears the question's other options in the same transaction, so two-correct cannot be produced from the screen. `MULTIPLE_CORRECT_OPTIONS` stays in `assessEnglishBank` precisely because it is now unreachable through the UI: it guards rows arriving another way — an import, a hand-run SQL fix — and nothing else would catch those.
- *The band table is edited as five numbers, not twelve.* A partition of `0 … maxScore` is completely determined by its five internal ceilings; A1 starts at 0, each band starts one above the previous ceiling, and C2 is pinned to the attainable total. Gaps and overlaps are **not representable** in the editor. The server still validates the complete table.

**`setBands` takes the whole table, `PUT` not `PATCH`.** Moving one boundary necessarily changes two bands, so a per-band endpoint would force the administrator through states that are invalid by construction. Same reasoning as `reorder` taking the complete order. Validation is the publish gate's, not the save's (D-073): a draft whose bank has just grown has a stale table *by definition*, and refusing the save would leave no way to fix it.

**Where §4C.9 deliberately diverges from §4C.3.** (a) **`createDraft` works with no active version**, creating an empty version 1 — the RIASEC bank is seeded and has always had an ACTIVE row to copy, so its refusal is right there and would be an editor that cannot create what it edits here. (b) **Adding a question asks for its options**, where §4C.3 generates five Likert levels from a dimension — a RIASEC item's options are the same five agreement levels every time, but an English item's distractors are content somebody wrote, and generating them would be inventing assessment content. Blank rows are dropped on submit and **the correct index is re-pointed at the option it was actually on**, which a test guards: filling options 1 and 3 and marking 3 correct must not silently move the right answer.

**Nav.** A ninth admin item, `/admin/english`, beside the career assessment rather than inside it. §3's six-item rule governs the *learner's* nav; §4C's own note already explains why an administrator's surface is the whole product.

**Files:** `admin-english.{service,controller,dto}.ts`, `admin.controllers.ts`, `admin.module.ts`, `audit.ts` (+3 actions, +1 reason), `english-assessment.ts` (the admin half of the contract, kept in the same file so "what is English" is one file to read), `api-client.ts`, `components/admin/english-{assessment-editor,band-editor,readiness-panel}.tsx`, `app/(admin)/admin/english/page.tsx`, `admin-nav-items.ts`, `messages/ar.json` (the §4C.9 namespace, 9 blocker strings, 23 error codes, the audit copy).

**Tested: 865 web (61 files, +21 new) · 719 API · 51 types — all green.** The new suite asserts the properties: five ceilings and no twelfth field, the derived table's contiguity checked **across the whole table** rather than one pair, the top band pinned, publish refused with the blocker named in the dialog, publish allowed past a warning that names the missing levels, the radio sending exactly one call, the correct-index re-pointing, and — explicitly — that **no RIASEC concept appears anywhere on this screen** and no RIASEC endpoint is reachable from it. Typecheck, lint, prettier clean; `messages.test.ts` (158 assertions) passes, so every new audit code has Arabic copy and the catalogue is still free of Latin letters and bare digits.

**Owed to E.5:** API integration tests for the fourteen new routes (the RBAC suite covers them structurally today), and the browser e2e for admin-edits-then-learner-takes.

**Next:** E.4 — the thirty seeded questions.

### 2026-08-30 — E.2: the English taking flow, the CEFR result, and the entry points — branch `english-assessment`

The learner half of §4.13. A learner can now take the placement test and see their level; the admin surface (E.3) and the real thirty questions (E.4) are still to come.

**API.** `EnglishAssessmentModule` — `GET /api/english-assessment`, `GET /api/english-assessment/result`, `POST /api/english-assessment/submit`, all `@Roles('EMPLOYEE')`. **`JourneyModule` is deliberately not imported**: the Holland assessment needs it because its retake rule turns on whether a path is confirmed (D-015), and the English test gates on nothing and is gated by nothing (D-123) — not importing it is what keeps that true as both grow.

**The absence rule carries over, and further.** `getActive` selects options without `isCorrect` — the answer key outright — and questions without `marks` or their CEFR `level`. Neither of the latter two is the key, but both let a taker triage: knowing an item is worth three marks, or is a C1 item, tells them where to guess, and a placement test is only useful if it measures what somebody can do unaided across the whole range.

**"Taken once" is enforced twice, on purpose.** A read-then-refuse gives the learner a clear 409 and an audited `ENGLISH_ASSESSMENT_ALREADY_TAKEN`; the unique index on `user_id` catches the race that no read-then-write can, and its `P2002` is answered *identically* — a caller must not be able to tell the two apart, and the second request genuinely did nothing either way.

**Entry points, per D-123.** A dashboard card in **all three states**, below the state's own card and carrying an **outline** action, so §4.2's one-primary-action rule survives — a new employee's single primary call is still «ابدأ التقييم» for the career assessment. A read-only card on the profile. **No new learner nav item** (§4's steady-state six stands; the test is a flow page reached from its card, exactly as `/assessment` and `/results` are), and **no change to `DashboardState`, `navForState`, `JourneyStateService`, or the path-confirm gate.** The only change to an existing shared contract is one nullable `englishLevel` on `DashboardView`.

**`CefrLevelBadge` shows the Latin code, where `HollandCodeChips` deliberately hides its letters.** A RIASEC letter is a storage key — "S" means nothing to an Arabic-speaking employee and «الاجتماعي» is the whole result. A CEFR level is the opposite: "B2" is the internationally recognised name of the thing and the token an employee would put on the CV §4.11 exports in English, so hiding it would withhold the useful half. The code is rendered from the data, never from `ar.json`, which is what keeps the catalogue free of Latin letters and bare digits — the two rules `messages.test.ts` enforces.

**One existing test was changed, and it should be read rather than skimmed.** `dashboard.test.tsx`'s "offers the assessment as the single primary action" asserted a raw count of **one link** on the pre-assessment dashboard. The English card puts a second one there by design. The count was never the rule — §4.2's rule is one *primary* action — so the assertion now says that directly: exactly one filled (`bg-primary-600`) link, which is the career assessment, and the only other link is named explicitly as «ابدأ تقييم اللغة». A future change that promoted the English action to primary now fails here rather than quietly doubling the call to action a new employee is given. No Holland behaviour changed; the test's intent is intact and better expressed.

**Files:** `english-assessment.{service,controller,dto,module}.ts`, `app.module.ts`, `enrollment.service.ts` (the one `englishLevel` read, done directly rather than through `JourneyStateService` — nothing about the level depends on the result or the path, and putting it there would imply a relationship that does not exist), `audit.ts` (+1 action, +6 reasons), `journey.ts`, `api-client.ts`, `components/english/cefr-level-badge.tsx`, `app/(portal)/english-assessment/page.tsx` and `…/result/page.tsx`, the dashboard and profile pages, `messages/ar.json` (the `english` namespace, 9 error codes, the audit copy).

**Tested: 844 web component tests green (60 files, +30 new) · 719 API unit · 51 types.** The new web tests assert the properties rather than the rendering: the answer key never appears in the DOM, a learner who already holds a result is redirected instead of being offered a second attempt, the draft resumes across a remount and is discarded when the bank changes, the result page has **no button at all** (absence, not a disabled control), the level is named in Arabic *and* keeps its code, and the English card never renders as the primary action. Typecheck, lint and prettier clean across all three workspaces.

**Owed, and deliberate:** the flow is unreachable in practice until E.4 seeds a bank — `getActive` answers `ENGLISH_ASSESSMENT_NOT_FOUND` and the page shows its empty state, which is the honest behaviour for a version nobody has published. API integration tests for the three endpoints, and the browser e2e, belong to E.5.

**Next:** E.3 — the sibling admin editor at `/admin/english`, including the band-threshold editor.

### 2026-08-30 — E.1: the English (CEFR) data model and scoring engine — branch `english-assessment`

First of five sub-phases adding an English proficiency test alongside the Holland instrument. **Logic and schema only — no UI, no endpoints, no seeded content.**

**The architecture call, and the evidence for it.** The English test gets **sibling tables**, not a `kind` discriminator on `assessments` (D-124). The deciding fact came out of the inspection rather than from preference: `AssessmentService.getActive`, `AdminAssessmentService.createDraft` and `requireDraft` all call `findFirst({ where: { status: 'ACTIVE' } })` — or `'DRAFT'` — **with no filter on `key`**, and `overview()` reads the whole table. The partial unique indexes from the Phase 5 versioning migration are per-key, so the database would accept a second ACTIVE instrument quite happily and the code would then serve whichever row Postgres returned first as the learner's Holland assessment. Making those queries key-aware means editing the live RIASEC path, which this work is forbidden to touch. Separate tables make "Holland is unchanged" a property of the diff.

**Schema** (`20260830120000_english_assessment`, hand-written as every migration since Phase 5 has been): `english_assessments` / `_questions` / `_options` / `_bands` / `_results` / `_responses`, plus `CefrLevel` (declared ascending, so `ORDER BY level` sorts A1→C2) and `EnglishSkill`. `AssessmentStatus` is reused — DRAFT/ACTIVE/RETIRED is a lifecycle, not a RIASEC fact. Copy-on-write and the partial unique indexes are carried over verbatim from D-072, because D-049 applies here unchanged. **Nothing existing is altered** beyond one new foreign key into `users` and one back-relation on the `User` model.

**What English adds that Holland lacks:** `options.is_correct` and `questions.marks`. Marks sit on the *question* rather than the option because exactly one option scores and the rest score nothing — on the option it would invite a bank where two options are worth different amounts of "correct". "Exactly one correct option" is checked at publish, not by a constraint, on D-073's reasoning that a draft must be free to be temporarily invalid.

**The bands are on the version, not in `settings`** (D-125). A band table is what turns a total into the level a person is told they are; held globally, moving the B2 boundary would silently re-interpret every result ever issued — the exact gap copy-on-write exists to close. Held on the version, they are frozen with it.

**The balance rule is not here, deliberately.** `assessEnglishBank` does not import, call or modify `isBalancedBank` or `assessBank`. D-032 protects a comparison *across* six dimensions; English has one scale and an item worth four marks is difficulty weighting doing its job. What takes its place is the rule English actually has — **the band table must partition `0 … maxScore` exactly** (all six levels once, no inverted range, no gap, no overlap, starting at 0 and ending at the attainable total), plus per-question well-formedness, and one *warning* for a CEFR level with no item targeting it (D-074's severity reasoning, applied to content coverage).

**Files:** `packages/types/src/english-assessment.ts` (vocabulary + contract; the D-034 absence rule carries over — no view type exposes `isCorrect`, and none exposes `marks` or an item's level either, because both let a taker triage), `apps/api/src/english-assessment/english-scoring.ts`, `apps/api/src/admin/english-bank-readiness.ts`, both specs, the migration, `schema.prisma`, `packages/types/src/index.ts`.

**Tested: 719 API unit tests green (44 suites), of which 55 are new.** The boundary cases are the point — every internal band boundary asserted from both sides, the two ends of the scale, a single-score band (a half-open reading would make B2 unreachable with no symptom), an uncovered score refused rather than defaulted, and each of the four submission refusals. The readiness spec asserts every way a band table can fail to be a partition, that one fault is named for one mistake, that a table ordered by number rather than by level is rejected, and — explicitly — **that the seeded Holland bank still passes `assessBank` balanced with no blockers**, which is where a stray import would show. Typecheck, lint and prettier clean across all three workspaces. (Four pre-existing prettier warnings remain in files this work does not touch: `apps/web/e2e/auth-happy-path.spec.ts` and three `.tmp.mjs` scratch files.)

**Not done here, by design:** no endpoints, no module, no UI, no seed content, no admin surface. E.2 builds the learner flow, E.3 the sibling admin editor, E.4 the thirty questions, E.5 the integration and the Holland-intact proof.

**Decisions recorded:** D-123 (independent, optional, taken once), D-124 (sibling tables), D-125 (bands on the version; the partition rule replaces balance).

**Also noticed, not fixed:** the Phase 5 assessment code comments cite **D-069/D-070/D-071** for copy-on-write / draft-then-publish / the balance guard. Those are the pre-rebase numbers; `decisions.md` renumbered them **D-072/D-073/D-074**, and D-069 is now the Platforms Code design system. The comments are stale, not wrong, and correcting them touches live Holland files — a one-line-per-site cleanup for a separate change, noted so the next reader is not sent to the wrong entry.

**Next:** E.2 — the learner taking flow and the CEFR result, wired to the dashboard card in all three states.

### 2026-08-27 — TAM-133: per-course resync on the frame's own edit signal — branch `feature/tam-133-per-course-resync`

Closes the gap where a rename made in the frame's Settings tab took up to `COMPLETION_SYNC_INTERVAL_MINUTES` (5 min) to appear anywhere in the portal, while a content edit already refreshed within seconds via the existing `tamkeen:content-changed` message.

**Plugin.** `db/events.php` now also observes `\core\event\course_updated` through the same `observer::content_changed` callback — one message type for both kinds of edit, not a second one. `tests/observer_test.php` added (Moodle PHPUnit conventions; there is no Moodle instance in this repo to run it against, so it is verified by inspection rather than a green run).

**API.** `CatalogSyncService.upsertLmsCourse` extracted from `sync()`'s loop body — byte-identical behaviour, now shared. New public `syncOne(moodleCourseId)`: reads the one course via the LMS port's existing `getCourse` (no new port method needed — `core_course_get_courses_by_field` by id was already there), applies the same upsert, and coalesces concurrent callers for the same course behind one in-flight promise. `EntityCourseManagementService.resync` wraps it with the usual scoping (`requireOwnedCourse`) and an `ENTITY_COURSE_RESYNCED` audit entry (new action + `LMS_COURSE_RESYNC_FAILED` reason, both in `@tamkeen/types`), then returns the full `EntityCourseDetail` via `get()`. `POST /api/entity/courses/:id/resync`, `@Throttle` at 30/min.

**Web.** The Content page's author launch now opens **inline**, framed (`authorLaunch(id, { embed: true })`), rather than a full-page redirect — TAM-129 built the `embed: 'author'` contract at the API layer but the web side had never actually used it. A new `useFrameContentChanged` hook listens for the frame's message, checked against the frame's own origin, and calls `resync`; the page's existing «تحديث» button now calls it too. Manage Course gets a new quiet «تحديث» beside the status line. Both apply the resync response **directly** rather than triggering a second `getCourse` — the endpoint returns the full detail precisely so the page needs no second request, and the first draft of this got that wrong (refetched instead of applying the response) until the tests caught it.

**Unclaimed-course note (D-060, restated):** the framed editor cannot reach "create course", so a course born directly in Moodle still has no owner and is not auto-claimed by whoever's resync first notices it — Phase 5's Course Oversight remains the only place that ownership is assigned.

D-115 recorded. CLAUDE.md §4B.4 amended.

**Tested:** 24 new/changed web component tests (`entity-content.test.tsx` new, `entity-manage-course.test.tsx` extended) — the inline frame, the origin check (a message from the wrong origin or of the wrong type is ignored), both resync triggers applying the response with no second request, and the failure path. 5 new API unit tests in `catalog-sync.service.spec.ts` — `syncOne` and `sync()` write an identical row for the same LMS course, two concurrent `syncOne` calls for one course make one LMS read, two different courses are not coalesced with each other, and a vanished LMS course refuses cleanly. 7 new API e2e tests added to `entity-courses.e2e-spec.ts` (rename propagates, content/blockers refresh together, cross-entity refusal, response equals a subsequent GET, audit entry, concurrent calls still leave the row correct) plus a separate-app-instance rate-limit suite mirroring `auth.e2e-spec.ts`'s pattern — **written but not run**, same as the e2e suite generally in this environment (no Docker/Postgres available here). Full web (766) and full API (654) unit suites green; typecheck and lint clean on both workspaces; prettier clean.

**Next:** the user's review, then run the e2e/browser suites for real before merging, and open the PR.

### 2026-08-26 — TAM-113 + TAM-114: the results page is organised by the user's own ranking — branch `feature/tam-113-results-groups`

The `results` epic, both tickets, on `main` (which already carries TAM-119's restyle of this page).

**TAM-113 — ranked letter groups, compact cards, other paths collapsed.** Twelve seeded paths rendered as six identical recommended cards and six plain ones, each with a paragraph, under a tall result card: correct, and illegible. Now one `<section>` per letter of the Holland Code, in the user's rank order — «الأقرب إلى ميلك الأول — المبادِر», then «مناسب أيضًا — {type}» with a quiet «ميلك الثاني» / «ميلك الثالث» tag — so the heading carries the ranking and answers "why is this recommended?" once per group instead of per card. A letter with no paths produces no heading. `PathCard` lost its description paragraph (it lives on the path page the card opens) and is otherwise unchanged. The paths outside the code sit behind one native `<details>`/`<summary>`, «عرض المسارات الأخرى (6)», collapsed on every visit, marker replaced by a mirrored caret, its own focus ring. Grouping reads `recommendationRank`, already on every `PathSummary` — **no API change, and the order inside a group is still the API's** (the existing anti-re-sort test is kept).

**TAM-114 — post-commitment state.** After confirmation the page stopped pretending the decision was open. The chosen path's card carries a «مسارك» marker in the **neutral** tag — never the primary accent, which means *recommended* — and its one action becomes a link to مساري; every other card, in the groups and behind the toggle alike, has **no button at all** (absence, not a disabled control). `committedPathId` is passed into `PathCard` as a prop, read once on the page from `usePortal().dashboard.path?.id` (non-null exactly in `ACTIVE_PATH`), so the card stays presentational and a user mid-build still sees every card as choosable. **The shared `HollandCodeChips` half of this ticket was already closed by TAM-108** — Results consumes it and no second implementation exists; a test now asserts the two render through the same component so a future copy fails rather than drifts.

**D-113 and D-114 recorded. CLAUDE.md §4.4 rewritten and §3A's "shown normally below" amended to "available one click below"** — the ticket's spec-change, recorded rather than assumed.

**Also fixed, off-ticket and pre-existing on `main`:** `packages/types` did not typecheck — `AUDIT_ACTION_CATEGORY` was missing `ENTITY_PROFILE_UPDATED`, so `npm run build:types` failed and `dist/` had been stale since. The stale build is why `messages.test.ts` reported that action as one "the code cannot emit". One line (categorised as `administration`, the same subject as `ADMIN_ENTITY_UPDATED`); `packages/types` typechecks and its 51 tests pass.

**Tested:** **744 web component tests green** (56 files; +11 new across `path-card.test.tsx` and `results.test.tsx` — the groups in rank order, no empty heading for a letter with no paths, no description anywhere in the list, the API's order preserved, the toggle's count and native semantics, the committed state's single action and the absence of every other one). Typecheck and lint clean in `apps/web` and `packages/types`; prettier clean. `journey-happy-path.spec.ts` updated for both tickets — the three group headings, the rank tags, 6 links collapsed → 12 after Enter on the summary, and after commitment one «مسارك» + one «الانتقال إلى مساري» + zero «استعرض المسار» including behind the toggle. **Driven in a real Chromium against the dev stack** (two provisioned learners, assessed-no-path and path-confirmed): both states render as specified. jsdom does not implement `<summary>` activation, so the component test asserts the element *is* the native one and Chromium asserts the toggling.

**Next:** the user's approval on the test, then the PR. Then the rest of the backlog — profile (TAM-109–111), portal-dga (TAM-120/121), the width/paths/courses batch (TAM-124–128).

## Current status

- **Current phase:** Phase 5 — the super-admin portal (CLAUDE.md §4C) — **merged** (PR #13, with PR #12 merging TAM-106 before it). In parallel, the **design-direction workstream** (Platforms Code, D-069) continues on stacked feature branches off the old `feature/dga-alignment` line, now being rebased onto `main`.
- **Last completed task:** **TAM-125 + TAM-127 — the path-build page and the courses catalogue** (2026-08-27, branch `feature/tam-125-127-build-catalogue` off `main` @ `08d1b4e`): the build page gained a header card (RIASEC type · «موصى به» · courses on offer · a live selected-hours total) and became a 1/2/3-column grid **whose whole card is the toggle**; the catalogue now opens where the reader is — the committed learner's own path preselected, everyone else on the whole catalogue **grouped by path** with the recommended groups first — carries **one personal status chip** on the learner's own courses and none on the rest, and its filters moved onto the shared Platforms Code primitives. No API change in either ticket: `PathDetail` already extended `PathSummary`, and the chips come from `myPathApi.get()` with the grouping from `pathsApi.list()`'s existing `recommendationRank`. The status chip is **one component shared with §4.7** (TAM-128, which was already built). D-115/D-116 recorded; CLAUDE.md §4.5 and §4.6 amended. **Complete, verified in a browser, user-approved; on `feature/tam-125-127-build-catalogue`, merged up to `origin/main` @ `e3600d4` and pushed.** Not merged into main. Before that, **TAM-113 + TAM-114 — the `results` epic** (2026-08-26, branch `feature/tam-113-results-groups`): the Results page is now organised by the user's own ranking — one heading per letter of their Holland Code in rank order, compact cards with the description moved to the path page, the non-matching paths behind one collapsed native `<details>` — and after a path is confirmed exactly one card keeps an action (a link to مساري, marked «مسارك» in the neutral tag) while every other card loses its button entirely. No API change; `recommendationRank` was already on every `PathSummary`. D-113/D-114 recorded; CLAUDE.md §4.4 and §3A amended. Also fixed a pre-existing `packages/types` typecheck failure on `main` (`AUDIT_ACTION_CATEGORY` was missing `ENTITY_PROFILE_UPDATED`, leaving `dist/` stale). **Merged as PR #35.** Before that, **TAM-138 — records and reports, second pass** (2026-08-26): two audit entries that named the wrong thing or nothing at all (`LMS_COURSE_PASSED` stored the *Moodle* course id as ours; the refused path-building entries carried an id with no type, so the screen dropped the subject); a category per action so the fifty-three-option filter is grouped; detail **values** in Arabic rather than `HIDDEN_BUT_COMPLETABLE`/`SUPER_ADMIN`/`department,fullName`; a date-range filter over the `from`/`to` the API has always accepted; the trail export rebuilt in the browser so the file says what the screen says (`/api/admin/audit.csv` removed, `toCsv` shared from `packages/types`); and the Holland-code distribution §4C.8 asks for — computed and exported since Phase 5, never shown. D-106/D-107 recorded. **Complete and verified; PR #31 open, awaiting review** — it stacks on the TAM-134 branch, so it carries TAM-134 → TAM-138 together. Before that, the **`admin-courses-settings-certs` epic (TAM-134 to TAM-137)** on `feature/tam-134-admin-courses-settings-certs` — the second ministry-directed pass over the super-admin portal (2026-08-26): two course states with a self-applying availability period and a real delete; the settings page rebuilt around editors derived from the validating schema, with the pass threshold removed entirely and Settings moved to the bottom of the sidebar; the ministry emblem on the certificate face; and §4C.8's audit trail rewritten to name what each entry was about and to carry no raw code or identifier. D-101 to D-105 recorded. **Complete and verified; no PR opened yet.** Before that, the **`admin-polish` epic (TAM-130 to TAM-133)** — home, accounts, assessment and paths — **merged as PR #24**; D-098/D-099/D-100. Before that, in the design-direction workstream: **TAM-112 — sign-out in the sidebar footer**, through one shared `useSignOut()`; **TAM-123 — a meaningful dashboard** (D-095, authored as D-074); TAM-108 (chips + status strip), TAM-107 (D-094), the loader (TAM-122, D-093). TAM-106 and the auth epic are merged.
- **Next task:** await review on the TAM-125 + TAM-127 PR. **Check the board before picking anything up:** `origin/main` moved fourteen commits while this branch was open, and PRs are being opened from more than one place — TAM-126 already has an open PR (#34), TAM-128 merged as #36, and #37 is TAM-133, not this work. TAM-113/114 merged as #35.
- **Phase 4 is merged** (PR #6). Phases 0-3 merged before it (PRs #1-#4), plus the landing page (PR #5).
- **Test totals (after TAM-138):** **648 API unit · 670 web component · 554 API integration against real PostgreSQL · 114 browser tests in Chromium against the built apps** — 113 of 114 passed, the one failure a flake in `phase-5-profile` that passes on re-run in a file this work never touched. The API unit and integration counts fell against TAM-137's figures because `csv.spec.ts` moved into `packages/types` (51 tests there now) and the trail-CSV endpoint test was replaced by two narrower ones. **Earlier figures, TAM-137: 657 API unit · 663 web component · 557 API integration · 114 browser** — all run in this session, not deferred; typecheck / lint / format clean. 113 of the 114 passed; the one failure is a **pre-existing flake** in the learner path-build counter, which passes on re-run and is recorded below. **⚠ The API integration suite passes in full only serially (`--runInBand`);** run with Jest's default parallelism against one database, fifteen suites collide and ~39 tests fail. Pre-existing test isolation, not a product defect — and almost certainly the explanation for the "transient integration failure never reproduced" recorded in the 2026-08-24 entry. **Read this before chasing a similar one.**

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
  1. **⚠ THE MINISTRY SEAL AND THE SIGNATORY ARE STILL MISSING** (half of D-051 is closed). TAM-136 put the ministry **emblem** on the certificate face, in the slot the placeholder mark held. What is still absent is the **seal** and a named signatory — the signature block prints «الاسم» until §4C.7 is filled in. **No certificate should reach a real employee until both are supplied.**
  2. **⚠ MINISTRY APPROVAL OF CUSTOM MOODLE PLUGINS IS STILL UNCONFIRMED.** Unchanged since Phase 2 and still the longest-lead dependency: seamless login uses `local_tamkeensso`, and if the ministry refuses custom PHP the fallback is the OAuth2-IdP route (D-044). Phase 4 deliberately did **not** enlarge that surface — the authoring handoff reuses the plugin unmodified (D-060).
  3. **⚠ `MOODLE_TEACHER_ROLE_ID` and `MOODLE_COURSE_CATEGORY_ID` are placeholders** (3 and 1, Moodle's stock values). Both are per-instance and **must be confirmed against the ministry's Moodle before Phase 7** — a wrong teacher role hands an outside organisation capabilities nobody intended, and a wrong category files ministry courses wherever that instance happens to number one (D-060).
  4. **Production Moodle is 4.5 LTS, development is 5.2.2** (D-039). Seamless login must still be re-verified on a real 4.5 — and now `core_course_create_courses` and `core_course_get_contents` with it.
  5. **`CERT_STORAGE_DIR` must be set to an ABSOLUTE path in every deployment** (D-052). It defaults to a relative path, which resolves against the process's working directory. For credentials this is not a detail.
  6. **`npm audit` reports the same 3 high advisories** for `deepmerge-ts` via `prisma` → `@prisma/config` — accepted and deferred (D-043), owned by the Phase 6 dependency review. Phase 4 added no dependencies at all.
  7. **GitHub CLI is still not installed on the dev machine**, so PRs are opened from the compare URL rather than the terminal.
  8. **Ministry values still placeholders** (needed before Phase 7): the real allowed email domain (currently `ministry.gov.example`) and the real employee-ID format.

---

## Deferred / owed (carried into later phases)
- **`journey-happy-path` flakes on the path-build counter.** The test clicks «أضف» five times and asserts the counter after each; occasionally a click lands while the list is re-rendering and is lost, so the counter reads one behind. Passes on re-run, and the branch never touched the file. The fix is to await the counter's new value rather than the button's presence before clicking again. **Phase 6.**
- **The API integration suite is not isolated between Jest workers.** Fifteen suites against one database: green with `--runInBand`, ~39 failures at default parallelism (found 2026-08-26, pre-existing). **Phase 6**'s reliability work owns it — per-suite schemas or a serial CI step, whichever is cheaper. Until then, run it serially before trusting a red result.
- **A path's `typicalDurationMinutes` is shown on the learner's path card and has no editor** (D-098 removed the admin field at the ministry's direction). Existing values stand; new paths have none. **Deriving it from the path's courses** is the fix and belongs with the learner-facing screens.
- **`attachableCourses` / `attachCourse` have no UI caller** since D-098 removed the add-course button from §4C.4. Path membership is set from the course side (§4B.3); the endpoints and their integration coverage are intact for the screen that wants them.
- **While an assessment draft exists, §4C.3's overview (active version + history) is unreachable** — the page routes to the editor whenever a draft exists. Pre-existing; TAM-132 neither caused nor fixed it.
- **An email change does not warn the OLD address.** Only the new address is written to (§4.12, D-091). §2's notification list is short and locked, and the current-password requirement means an attacker already holds the password before this endpoint is any use to them — so this is defence in depth. **Phase 6's security review** should decide whether to add the notice.
- **`EnrollmentService.addCourse` is not actually idempotent under concurrency** (found during the Phase 5 verification pass; pre-existing, and enrolment is untouched by Phase 5). Its duplicate guard is a read-then-write, so two concurrent adds of the same course both pass and the second raises P2002 → 500 rather than the no-op its own comment promises. **Phase 6** should catch P2002 there and return the intended success.
- **The UI language switch (§4.12)** is deferred until an English UI exists (D-089). The digits preference ships in its place; this is a decision, not a gap.
- **The ministry seal and a named signatory are not on the certificate.** The emblem is (TAM-136, D-104); the seal and the signature block are not (D-051). **Phase 6/7** must supply them before anything is issued to a real employee.
- **`PASS_THRESHOLD` is deployment configuration now, with no screen behind it** (D-102). **Phase 7** must set it deliberately in every environment: no administrator can correct it afterwards, and a wrong value silently decides who earns a certificate.
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
- ~~The balance rule must survive Phase 5's assessment editor.~~ **Closed in sub-phase 5.3** — `assessBank` refuses an unbalanced publish server-side, expressed over attainable maxima rather than question counts, and the seeded bank is still asserted balanced in CI (D-074).
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
- **The successful-publish path is proven in integration, not in the browser.** The mock reports a newly created course as having no completion criteria — the honest simulation, since a real Moodle course is empty until someone authors it — and `simulateAuthoring` lives in the API process, out of Playwright's reach. So the browser proves the _refusal_ on a course it creates through the UI, and proves publish/withdraw on a seeded course the mock considers completable. **Phase 7** closes this against a real Moodle.
- ~~Entity accounts are created by a seed, not by a screen.~~ **Closed in sub-phase 5.2** — the super-admin provisions an organisation and its accounts from §4C.2, by invitation, and never sees a password (D-080).
- ~~An entity's own record is read-only, and an entity cannot add a colleague to its organisation.~~ **Closed in sub-phase 5.2** — the super-admin edits an organisation and adds accounts to it. An entity still cannot do either itself, which is the point: who a ministry supplier is, and who speaks for them, is a contractual fact rather than a self-service setting.
- ~~Course ordering within a path is not editable.~~ **Closed in sub-phase 5.4** — §4C.4 edits `path_courses.display_order` by submitting the complete order, which decides how the build screen offers courses and how My Path numbers them.
- **A course withdrawn from the LMS side is still only detectable by sync.** An entity sees `lms_present: false` reflected in the status, but nothing tells them *why* a course they published is no longer available. **Phase 6**'s sync-reliability work owns surfacing that.
- **Moodle's stock PHP upload ceiling (`upload_max_filesize` / `post_max_size`, 2MB) and site-wide `maxbytes` are unraised on the dev instance, and no Arabic language pack is installed.** The entity authoring guide (TAM-134, `docs/entity-authoring-guide.md`) documents the 2MB default as the entity's actual ceiling today rather than a target, so the guide does not go stale the moment this is fixed. **Phase 7's deployment setup** owns raising both limits to a real ceiling and installing the `ar` language pack so entities author against Moodle's own interface in Arabic, not English.
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
- **`@Roles` on every endpoint; scoping is a query filter, not a guard (D-062).** Role answers "may this kind of account call this"; scope answers "which rows may _this_ account see". `RolesGuard` honours `@Public()` first, so class-level roles cannot take the public verification page offline.
- **`entities` is a first-class model and course ownership is nullable (D-063).** The organisation owns the courses, not whoever created them; the seeded catalogue legitimately has no owner.
- **An entity sees a learner's name, department, progress and grade — and nothing else (D-064).** No email, no employee ID, no Holland Code, no path, no certificates.
- **The entity portal is its own route group, and sign-in routes by role (D-065).**
- **A course's RIASEC letters are derived from its paths, never authored beside them (D-066).** §3A makes the path the owner of the letter, so a stored copy could contradict it and nothing downstream would notice.
- **Both providers correct a mis-routed account, and 403 is why the second was missing (D-067).** Makes real the claim D-065 already made; the redirect stays a courtesy, never a control.
- **Every id the mock LMS hands out derives from a natural key, never a counter (D-068).** The mock's state dies with the process, the rows do not, and both LMS id columns are UNIQUE. Asserted in the shared contract.
- **Assessment versioning is copy-on-write; the old bank is kept (D-072).** Draft-then-publish, with the balance guard at publish and adjacency only warned about (D-073, D-074).
- **The product knobs move to a `settings` table with env as fallback; secrets stay in the environment (D-075).**
- **Certificate template settings are text-only until the ministry supplies artwork (D-076); the 5-10 bounds stay hardcoded (D-077).**
- **The super-admin keeps unscoped API access to entity data but has its own screens (D-078); reports export as CSV with a BOM (D-079).**
- **An administrator provisions accounts by invitation and never sees a password (D-080).** Redeeming a reset token now also verifies the address, which closes a dead end that already existed.
- **Two lockouts are guarded, and converting a learner who holds a record is refused (D-081).**
- **Two integration suites share one assessment, and an advisory lock serialises them (D-082).**
- **The seed bootstraps the assessment; it does not maintain it (D-083).**
- **An active path always offers at least five selectable courses (D-084).**
- **Retiring a path removes it from new selections and strands nobody (D-085).**
- **Catalogue sync tolerates a row that vanished under it (D-086).**

---

## Log (newest first)

### 2026-08-27 — Second merge of `main`: TAM-125/127 absorbed, the resync joins the frame, decisions shifted to D-118–D-122

`origin/main` gained TAM-125/127 (`feature/tam-125-127-build-catalogue`, PR-merged) while this branch carried today's fixes, so a second merge: **main's catalogue page and its 17-case test win outright** — its state-aware default supersedes this branch's smaller auto-select of the same morning. **The Course Content page keeps this branch's frame** (auto-launched `MoodleEmbed`, publish gate in the header, read-back strip) **and adopts main's D-115 resync** as the refresh path: `tamkeen:content-changed` and «تحديث» now call `POST /entity/courses/:id/resync` and apply its response directly — no second read. Main's click-to-open `AuthorCard`, its `entity-content.test.tsx` and the now-unconsumed `useFrameContentChanged` hook were dropped; their resync assertions were ported into `entity-course-content.test.tsx`. Manage Course keeps the branch's description-under-title plus main's quiet `ResyncButton`. **Numbering:** main took D-115–D-117 (resync, build page, catalogue), so this branch's five decisions shifted once more — **D-118 authoring-loop, D-119 membership, D-120 guide, D-121 learner frame, D-122 previous/next** — across decisions.md, tickets.md, CLAUDE.md (whose §4B.4/§4.8 still carried the original D-098/D-100/D-102, missed by the first renumber) and the code comments. Duplicate `entity.guideTitle`/`guideLink` keys and the dead guide/blockerHow strings removed from `ar.json`.

### 2026-08-27 — The embed branch rejoins `main`: renumbered, merged, both iframes back (`feature/tam-139-entity-content-embed`)

At the user's direction («return the iframe in both the student and entity»), the unmerged embed branch — the entity Course Content page framing Moodle's editor, the learner player framing the course with the handoff as fallback, previous/next, and the path-membership rules — was merged with `main` (40 commits ahead) and its numbering moved onto free numbers: tickets **TAM-130→139, 131→140, 132→141, 133→142, 134→143, 135→144, 136→145, 137→146**; decisions **D-099→D-118, D-100→D-119, D-101→D-120, D-102→D-121, D-103→D-122** (shifted once more in the second merge below — `main` took D-115–D-117 the same day), and the branch's D-098 collapsed into `main`'s **D-101** (same decision, merged via PR #26). The branch was renamed to match. Merge calls: the branch's framed Course Content page **wins** over `main`'s launch-card version (the frame is the point); `main`'s authoring guide (`/entity/guide`, `lib/markdown.ts`) **wins** over the branch's duplicate (`/entity/courses/guide`, `lib/simple-markdown.ts` — both deleted; D-120 amended; the content test re-pointed); `main`'s `deleteCourse` and the branch's `getCourseOutline` both kept in the LMS port; the three TAM-141 setting keys moved into `@tamkeen/types`' `SETTING_KEYS` (where TAM-135 had moved the list) and their `PASS_THRESHOLD` sibling dropped with it (D-103 main); TAM-144 (entity profile) marked **SUPERSEDED** by TAM-138. The `tam_132` migration folder keeps its name — it is applied on real databases and renaming applied migrations breaks `_prisma_migrations`. Verified: typecheck + lint clean, web 775 (two first-run load flakes, both known), API unit 659. The API integration suites stay CI-gated as documented. **Next:** the user's test of both frames → push + PR.

### 2026-08-27 — TAM-125 + TAM-127: the build page and the catalogue

Two learner-facing screens on `feature/tam-125-127-build-catalogue`. **Neither needed an API change**, which was checked rather than assumed: the build page's ticket asked whether the detail payload carries `riasecLetter` and `recommendationRank` — `PathDetail extends PathSummary`, so it always has, along with `recommended` and `courseCount`.

**TAM-125 — the build page (D-115).** The page's subject is a comparison, pick five to ten of eleven, and it was rendering as six screenfuls of mostly-empty full-width rows with the decision pushed below all of them. Nothing about the *path* was on the page either — its type and its recommendation lived only on Results, so arriving by link or reloading lost the one fact explaining why the path was suggested. It now opens with a **header card** (description · type tag · «موصى به» when it applies · "11 دورة متاحة" · a **live selected-hours total**), then a 1/2/3-column grid where **the whole card is the toggle**: one `<button>` per course, `aria-pressed`, a decorative tick plus the primary border, and the state word on the card. The hours total exists because "5 to 10 courses" is not what the user is committing to — time is, and it should move while it is still changing.

The accessible name is explicit (`«{state}: {title}»`) rather than the card's concatenated content: without it a screen reader reads the title, the summary, the duration and the state at every tab stop. It still contains both visible labels the control offers, so WCAG 2.5.3 holds. Unavailable and at-max cards stay disabled buttons with their reason printed — a `<div>` would announce nothing about why it cannot be used.

**TAM-127 — the catalogue (D-116).** The product already did not treat two readers alike, and the page did. `assertCoursesSelectable` refuses any course outside a confirmed path, so a committed learner browsing forty-eight courses was looking at roughly forty they can never act on, with nothing marking the eight that are theirs. For the *un*committed learner the catalogue is the opposite tool — how "what does this path actually teach?" gets answered — and a flat grid of forty-eight answers it for nobody. So: **browse stays global**, and only the starting position changes. Committed → their path preselected, «كل المسارات» one selection away and their choice wins. Otherwise → the whole catalogue **grouped by path** in the API's order, heading + «موصى به» + count, recommended groups first in the user's letter rank. **Any filter collapses the grouping into the flat grid**; clearing it restores the grouping, because a filtered result is an answer, not a tour.

Three things the ticket did not ask for but the data demanded. A course in two paths appears in **both** groups — the grouping is a lens, not a partition. A course belonging to **no** listed path gets a final «دورات خارج المسارات» section, because the count line above still counts it and a view that silently drops rows contradicts its own total. And the my-path lookup that feeds the chips is deliberately **not** wired into the `DataView`: a missing chip costs a reader nothing, and blocking the whole catalogue on a decoration trades the page for a badge. A test asserts the catalogue still renders when that lookup fails.

**One shared chip, one shared badge.** The status chip's resolution had been written inline on the course page (TAM-128, already built, its comment promising TAM-127 would share it). It is now `CourseStatusChip` over a new `courseStatus` message namespace — three screens share those three words, and a namespace named after one of them would make the other two look like borrowers. `courseDetail.statusInPath` was removed with its last caller. Likewise «موصى به» became `RecommendedBadge`: three call sites, one string, and the recommendation rule is the product.

**One e2e repair this branch made on the way, and one it withdrew.** `phase-4`'s withdrawal test asserted a held course was still in the learner's catalogue — true, but it reads the *default* view, and the fixture creates its holder by writing `user_path_courses` directly, so the course sits outside the learner's confirmed path in a way `assertCoursesSelectable` would never allow through the API. The test now clears the filter and says why; that repair stands, because TAM-127 is what made it necessary.

The second one is gone. This branch had also repaired `phase-4`'s stale "the entity profile is read-only", and `main` moved underneath it: **PR #33 fixed the same test first** and merged. On the merge, that hunk was resolved **in favour of `origin/main`** — the owner's fix is the reviewed one, and keeping mine would have renamed a test main had already settled. Same story for the `profile-a11y` failure this branch had filed under *Deferred / owed*: `c3b3c98` and `c4a1556` fixed it upstream, so the owed item is **removed rather than carried**.

**The branch is merged up to `origin/main` @ `e3600d4`**, which also brought TAM-128 (PR #36) into the course-detail page this work refactored. Merging before opening the PR was not optional: the branch was cut from `08d1b4e` and was fourteen commits behind, two of them touching files it changes.

**Verified.** 770 web component tests (up from 744: 9 new on the build page, 17 new on the catalogue, which had **no page test at all** before this), typecheck / lint / format clean, and both screens driven by hand in Chromium against the running stack — the committed default with its preselected filter and «في مسارك» chips, the grouped view with «موصى به» on the headings, the collapse under a filter, and the build card toggling with the border, the tick, «مضافة» and the hours total moving 0 → 3. The journey e2e's build and catalogue selectors were updated for the card-as-control name and for a shared course now having a card per group.

### 2026-08-26 — TAM-134: the entity authoring guide (`feature/tam-134-entity-authoring-guide`)
### 2026-08-26 — TAM-138: records and reports, second pass

The ministry's two asks were the action vocabulary and the page's information. TAM-137 had done most of the second; this pass is what a fresh reading of the *writers* turned up, plus the parts of §4C.8 that were computed and never shown.

**Two entries were not telling the truth.** `LMS_COURSE_PASSED` recorded `String(moodleCourseId)` under `targetType: 'course'` — a number from a system the ministry does not administer, filed as though it were one of our uuids. TAM-137 had just added server-side label resolution keyed on that id, so it never resolved: every pass in the trail read «دورة: 12». The row it needed was already loaded two lines above for the certificate. And `EnrollmentService.auditFailure` took a `targetId` with no `targetType`; the screen renders a target only when it knows the kind, so every refused path-building attempt showed no subject at all while its id sat unused in the row — the failures a review most wants to find were the ones naming nothing. `targetType` is required there now, which forced each of the five call sites to say whether the id it holds is a path or one learner's journey through one.

**A category per action.** `AUDIT_ACTION_CATEGORY` is a `Record<AuditActionCode, …>`, so an action added without one fails the build, and a test checks the other direction — a category map holding a code the vocabulary no longer defines, or a category nothing uses, which would show the ministry an empty group. The filter groups by it. Not a database column: it is a property of the action, not of the event, and storing it lets the two disagree (D-106).

**The keys were translated and the values were not.** Rows read «الحالة: HIDDEN_BUT_COMPLETABLE», «الدور: SUPER_ADMIN», «الحقول المعدَّلة: department,fullName» — an Arabic label followed by the codebase's own vocabulary. Now: a coded value is Arabic, a comma-joined list is split and each part translated, a boolean is a word, and a Holland code is spelled out in the six type names. A route on an `AUTHZ_DENIED` entry still falls through as itself, deliberately.

**The export said something different from the screen it came from** — `ADMIN_SETTING_CHANGED,SUCCESS,setting,BAD_PASSWORD`. Every column of that file is Arabic copy, and Arabic copy lives in the message catalogue, which the API does not have. So the trail export is built in the browser now, over the same `toCsv` — moved to `packages/types` rather than reimplemented, because its BOM and its `=`/`+`/`-`/`@` guard are not cosmetic and two copies means one is eventually wrong. `/api/admin/audit.csv` is gone; what the API owes the export is a page big enough to fill it, honouring the same filters (D-107).

**And the reports were incomplete against their own export.** §4C.8 asks for the Holland-code distribution; the API has always computed it and the CSV has always carried it; the page never showed it. It is there now, in Arabic type names — and the journey stats show all six stages the export reports rather than four.

**Verified:** 648 API unit · 670 web component · 554 API integration against real PostgreSQL (serially, per the note above) · the full 114-test browser suite against freshly built apps — 113 passed; the one failure was `phase-5-profile`'s email-change test, which passes on re-run and lives in a file this work never touched. format / lint / typecheck clean.

**One environmental trap worth recording:** the browser suite failed twice for reasons that had nothing to do with the code. A web and an API server from an earlier session were still listening on 3000 and 4000, and Playwright reuses an existing server rather than starting its own — so the suite was driving hours-old code. Killing them exposed the second: `next build` had been run *while* that server held `.next`, leaving a build missing a vendor chunk. `rm -rf apps/web/.next` and a rebuild fixed it. If the admin suite ever fails at sign-in with the login page still on screen, check for a stale server before reading anything into the failure.


### 2026-08-26 — TAM-119: the learner pages on the primitives (`feature/tam-119-learner-sweep`)

Branch off `feature/tam-118-shared-components` @ `8faca04`. An audit first (hex, physical classes, retired tokens, `bg-accent` chips, hand-rolled `rounded-card border` cards): sixteen sites across dashboard, assessment, results, PathCard, path build, catalogue, course detail, player, My Path and the CV, plus the shared Holland chips. All moved to `cardVariants` / `Card edge` / `Badge` tones / the token colours; My Path's course state became a status tag; results reuses `HollandCodeChips`; the assessment's `accent-navy` — a retired token still in the tree — is now the primary. One test updated (chips: `bg-accent` → the primary tag). Page tests 523 green, typecheck/lint clean, dashboard + profile axe green (profile's 5th/6th sign-in per file hits the dev login throttle; green singly). **Next:** the user's test → PR (after TAM-118 merges, or stacked); TAM-120 (entity sweep) the same way; then TAM-121's gate.

### 2026-08-26 — TAM-118: the shared primitives on Platforms Code (`feature/tam-118-shared-components`, D-109)

Branch off `main` @ `814c6f7`. The inventory first: `Card / Badge / Progress / Skeleton / Textarea` and the three states existed, nothing for tables or tabs, the "selected" edge hand-rolled in nine places, the card token on 16. Shipped: `--radius-card` → 8; `Card` with `variant="selected"` and `edge` (nine hand-rolled sites migrated: My Path ×1, Certificates, verification, admin assessment/templates/readiness ×5); `Badge` on the tag anatomy with six tones and the old names as aliases, `Tag` alias; `Progress` on neutral-200 / primary-600; `Table` (six parts, caption required, own scroll frame) with the entity learners list migrated; `Tabs` extracted from the landing explorer (which now composes it) with direction read from the nearest `dir` — jsdom does not inherit computed direction, which the first test caught; `Skeleton` on neutral-200, `EmptyState` hairline, `ErrorState` on the Alert error tone, `Textarea` on the Input classes. No toasts (none needed). Tests: 34 new across six primitive files, contrast +5 pairs (178), web 710, typecheck/lint clean; landing, learners and dashboard screenshotted. Admin tables left to the admin epic. **Next:** the user's test → PR; then TAM-119 (learner sweep) / TAM-120 (entity sweep) compose these.

### 2026-08-26 — TAM-110 closed: the password change joins the sign-in lockout (`feature/tam-110-change-password`, D-107)

Branch `feature/tam-134-entity-authoring-guide`, off `main`. `docs/entity-authoring-guide.md` — one Arabic, section-per-question document covering the whole entity journey: create → metadata → open the content editor → add video/documents/images/text → the quiz → completion criteria → publish → limits. Rendered at `/entity/guide` by a server component that reads the file once and parses it; not in the entity nav (D-071's reasoning — reached from the three places the question it answers actually comes up, not a fifth destination competing with the four that exist). Wired in from those three places: the create-course card (`/entity/guide`), the content read-back strip (`/entity/guide#completion`), and `BlockerList`'s `NO_COMPLETION_CRITERIA` item specifically — the one blocker fixed inside Moodle rather than on this portal's own forms, so it is the only one that gets a link (the others would send someone looking in Moodle for a field that has always been right here).

**No Markdown library added.** `apps/web/src/lib/markdown.ts` is a bespoke parser scoped to exactly what the guide file uses — headings with an explicit `{#id}` anchor (never auto-slugified from Arabic, so publish-blocker deep links stay stable), paragraphs, bold/code/links, lists, tables, blockquotes, `---`. One static, internally-authored document does not carry the usual reasons for a full Markdown ecosystem (untrusted input, CommonMark edge cases), and an unused dependency in a government system is one more thing to review, patch and justify at every audit — the same call D-037 made about a query library. 9 new unit tests on the parser; `entity-manage-course.test.tsx`'s existing `NO_COMPLETION_CRITERIA` case gained an assertion that the guide link is there with the right anchor.

**Two discrepancies between the ticket and the actual codebase, resolved by describing reality rather than the ticket's assumption:**
- The ticket repeatedly describes a **framed editor** ("«افتح في منصة التعلّم» if the frame does not load"). The real handoff (D-045) is a full-page navigation — `window.location.href` to a short-lived signed URL — never an iframe. The guide's "فتح محرّر المحتوى" section documents the real navigation and its actual failure mode (an expired one-time link) instead of writing iframe troubleshooting steps for a mechanism that isn't there.
- The ticket cites **"D-100"** for a limit of three paths within two RIASEC letters. `decisions.md`'s real D-100 is the `AdminDialog` centering fix (2026-08-25, unrelated); no path-count or RIASEC-letter limit exists anywhere in the client or server. The guide states current behaviour (any number of paths, no letter cap) and flags the gap inline in a blockquote, so a reader who has seen the internal ticket is not left thinking the product disagrees with itself.

**Environment ceiling, disclosed rather than worked around:** this instance runs `MOODLE_MODE=mock` — no real Moodle exists here. Screenshots of the real content editor, verifying the actual upload ceiling against a live instance, and a timed real 30-minute authoring walkthrough are not things this environment can produce; the guide's steps are grounded in the real Moodle 4.5/5.x UI as documented elsewhere in this repo (the Phase 2 spikes, `moodle-plugin/README.md`) rather than in a live session here.

Typecheck, lint, and the full web suite (528 tests, +9 for the parser) all clean. Live-verified in Chrome as the seeded entity account: `/entity/guide` renders correctly RTL with working anchors (`#completion` etc.), and all three wired links resolve to the right destination.

**Owed:** no `.github/pull_request_template.md` exists in this repo, so the ticket's "add a line to the PR body template" has no file to add it to — flagged rather than guessed at, since creating a repo-wide PR template is a bigger, unrequested change; the note belongs in this PR's own body once it is opened instead.

### 2026-08-25 — The admin portal, four pages at the ministry's direction (`feature/tam-130-admin-polish`)

Branch `feature/tam-130-admin-polish`, rebased onto `origin/main` @ `4d0f683`. **PR #24 open, awaiting review — not merged. CI run #59 green** (8m 29s: migrate → seed → format → lint → typecheck → unit → integration → build → 114 Playwright tests passed; the only annotations are GitHub's own Node-20-deprecation warning about `actions/checkout@v4` et al., which is unrelated to this branch and applies repo-wide). One ticket per page — TAM-130 to TAM-133 in tickets.md — worked in that order.

**TAM-130, the home page.** The «توزيع الأنماط المهنية» section counted Holland codes: «SIA» and «RIC» as Latin strings in an RTL page, one of thirty-odd values, and §4C.8's reports already computed exactly the same thing. It now counts employees by their **dominant letter** — six rows, Arabic type names, count and share — with the number of paths offered for that letter beside each, and «لا مسار معروض» in words where there are none (D-099). That pairing is the point: this is the only screen where "where our people's interests are" and "what the catalogue offers" appear together. `codeDistribution` → `letterDistribution` in the shared contract. Also: the unverified-accounts tile removed (it cannot say *which* accounts; §4C.2 badges each one beside the resend button), recent activity moved into its own focusable, labelled scroll region so integration health stays near the fold, and **`assessment.hasDraft` finally rendered** — the server had reported it since §4C.1 was built, described in its own comment as "the one thing waiting on the administrator personally", and nothing displayed it.
**Found while there:** `bg-gold` / `border-s-gold` / `border-gold` survived D-069's retirement of the token across five admin files, so the distribution bars had **no fill at all** and three notice edges no colour. Swept to primary / info / warning.

**TAM-131, accounts.** The «الحسابات»/«الجهات» tab bar is gone. Organisations — with `إضافة جهة` — now appear under the role filter «جهة», above the accounts they explain, which is the only moment they are relevant and keeps onboarding readable in its natural order. Three e2e steps had leaned on the tab and were updated with their reasons (the tab click; an ambiguous «الدور» label now that the page filters stay mounted behind the dialog; the filter reset the tab used to perform by remounting the view).

**TAM-132, assessment.** «رجوع» removed. It could not work: entering the editor creates the draft and the page renders the editor whenever a draft exists, so the button returned to the overview for the length of one refetch and landed straight back. Publish and discard are the exits, both already in the editor's header.

**TAM-133, paths — and the modal complaint, which was one defect for the whole portal.** `AdminDialog` had no `m-auto`: Tailwind's preflight zeroes the `margin: auto` the UA stylesheet centres a modal `<dialog>` with, which pins it to the block-start inline-start corner — **the top right in RTL**. The learner portal's confirm dialog carries that fix and a comment explaining it; the admin one was written later and never got it. The same file also had a backdrop painted in retired `navy` (so: transparent), no height cap (a twelve-course panel pushed its own cancel button off-screen), a hardcoded title id in a component that nests, and — the real one — a `<form method="dialog">` wrapper around content whose `Button`s have no default `type`, so **save, retire and activate submitted that form and closed the panel behind the request they had just fired** (D-100).
Then the page work: the duration field and the add-course button are gone from the manage form, and a path now has **two removals** (D-098) — retirement, unchanged and reversible, and `DELETE /api/admin/paths/:id`, refused for any path somebody ever chose or a certificate names, reported in advance as `canDelete` so the reason stands where the button would be, audited on both outcomes, with the count-then-delete race caught as P2003 and returned as the same refusal rather than a 500. Separate sections, different words, and a confirmation that names the path and offers hiding in the same breath.

**Tests.** 519 web unit (+16), 608 API unit (+6), 27 in the paths integration suite (+5) against real PostgreSQL, 19 admin + 9 users browser tests green including a new one that deletes the path the suite creates. format / lint / typecheck clean. **Verified by hand in Chrome against the built apps**, which is where the modal and the invisible bars had to be confirmed: the account and path modals open centred with a dimmed backdrop and a scrolling body, the path form has no duration field and no add-course button, and the delete section shows its refusal with no button on a path 25 learners hold.

**Owed, and deliberate:**
- **`typicalDurationMinutes` still appears on the learner's path card and now has no editor** — it is settable only through the API. Deriving it from the path's courses is the fix and belongs with the learner-facing screens, not the admin form.
- **`attachableCourses` / `attachCourse` remain on the API with no UI caller.** Path membership is set from the course side (§4B.3); the endpoints and their integration tests are left intact for the screen that will want them.
- **While an assessment draft exists, the overview (active version + history) is unreachable.** Pre-existing; removing the back control neither caused nor fixed it.


### 2026-08-24 — TAM-117: the shell framed like a government application (D-097)

Branch `feature/tam-117-portal-shell`, on the TAM-124 branch. The dark neutral-900 rail — the last surface of the navy era — is gone: the shell is now a top owner's bar (lockup start, the D-096 identity line + avatar menu end), a light rail on the Platforms Code nav anatomy (primary start-edge bar, tinted ground, primary text on the active item; the certificates dot turns primary-600 because the accent tint vanishes on white), the page header inside the content column aligned to the TAM-124 width — which AppShell now owns for all three portals, so the entity and admin frames inherited everything by construction — and the auth pages' footer strip. CLAUDE.md §3's dark-surface row is amended to the landing footer only. A new e2e (`portal-a11y.spec.ts`) gates the shell with axe (WCAG 2.1 A/AA) on the dashboard in all three journey states — clean on the first run. 493 web unit tests unchanged and green (the nav suites untouched, as the ticket required), typecheck, lint; journey + auth e2e green (the two known counter-race flakes clean on serial rerun).

### 2026-08-24 — The profile organized: two columns by intent (on the TAM-124 branch)

The narrow four-card scroll became a two-column layout at the standard width: who you are (the facts card + the digits preference) beside account security (change password, change email), stacking below lg. The facts card gained الرقم الوظيفي and الإدارة — TAM-109's display half, marked on the ticket; editing remains open. profile.employeeId/department message keys added surgically (a JSON round-trip that stripped the catalogue's blank separator lines was caught and reverted). 493 web tests, typecheck, lint.

### 2026-08-24 — TAM-124: one content width, owned by the frame

Branch `feature/tam-124-page-width`, on the TAM-112 branch. `PortalPage` now wraps every page in الرئيسية's container (`mx-auto w-full max-w-6xl`) in both chrome variants, with an explicit `width="narrow"` opt-in taken by the assessment, the profile and the player; the eight per-page `max-w-*` wrappers (2xl–6xl, all disagreeing) are gone, and the path-build page's fixed counter bar shares the exported `PAGE_MAX_WIDTH` constant instead of a second literal. A filesystem guard test (`page-width.test.ts`) fails the suite if any portal page declares `max-w-` again. The 360px gate caught one real overflow — the dashboard's journey tracker could not fit four labels beside their nodes — fixed by keeping only the current stage's visible label below `sm` (every stage keeps its accessible name). 493 web unit tests, lint, typecheck clean; journey e2e 4/4 (one flake at the known counter-race step, clean on rerun); zero horizontal overflow at 360px across the six portal pages, checked against the live app.

### 2026-08-24 — TAM-112 revised (D-096): the exit moves to a header user menu, and login was silently broken

Testing the sidebar sign-out in the browser, the user asked for the header-avatar pattern instead — and for the dashboard's identity line to live in the chrome. Both done (D-096): an initials avatar in the page header on every shell page opens to the identity block, the role's own profile link and the one «تسجيل الخروج»; the sidebar footer now only names who is signed in; the profile page's button and the dashboard's identity line were removed as the redundancy §3 forbids; the identity line (department · الرقم الوظيفي) renders in the header from md up. The requirement "a standard exit for every role" exposed that the admin shell passed no user at all — AdminPage now feeds the shell from useAdmin(), so the super-admin has the same menu. Along the way: the e2e's "unexpected error" at sign-in was traced through the Playwright trace to main's dropped HOME_FOR_ROLE import (login POST 200, client throws) — the fix/phase-5-typecheck commit is cherry-picked onto this branch so the stack is testable before that PR merges; and the demo student's Arabic name/department were mojibake in the database (Windows curl mangled the registration payload) — repaired in place. 492 web unit tests, shell suite rewritten for the menu (7 tests), the header sign-out e2e green end to end.

### 2026-08-24 — The stack rebased over Phase 5; three decisions renumbered; main repaired

Phase 5 (PR #13) and TAM-106 (PR #12) merged while the stack was open, and the two workstreams had each claimed the same decision numbers. Main is immutable, so ours moved: **D-072→D-093 (loader), D-073→D-094 (assessment sidebar), D-074→D-095 (dashboard)** — each entry carries a numbering note, and every reference in code, CLAUDE.md and this file follows. Phase 5's own merge resolution had the mirror problem — its decisions.md entries were renumbered +3 but its progress.md references were not — reconciled here in one commit. The whole stack (navigation-loader → 107 → 108 → 123 → 112) was rebased bottom-up onto main; the profile page reconciles Phase 5's password/email/digits cards with useSignOut(), the session select unions numberFormat with employeeId/department, and the TAM-106 log entry PR #13's resolution dropped was restored. **Main itself did not parse or typecheck** (a doubled brace in portal-provider, a dropped HOME_FOR_ROLE import, verify-email-change on the deleted AuthCard, eight gold/navy badges) — fixed on `fix/phase-5-typecheck`, pushed, PR to open; until it merges the stack inherits those ten typecheck errors and adds none of its own. 489 web + 600 API unit tests green on the stack tip.

### 2026-08-24 — Tickets: the width standard (TAM-124), path build (TAM-125), My Path timeline (TAM-126), the catalogue (TAM-127) and course detail (TAM-128)

TAM-127/128 came from asking who the catalogue is actually for: once a path is confirmed the server only accepts adds from that path (`assertCoursesSelectable`), so the global list is mostly un-actionable for committed users — the catalogue now defaults state-aware (their path preselected; grouped-by-path with recommended groups first for the uncommitted), cards gain a personal status chip mapped client-side from the my-path payload (no API change), and the filter row moves onto the shared Select (it still used dead pre-token classes). Course detail (TAM-128) keeps its content but moves the single server-chosen action into the page header's `action` slot and turns the comma path list into tags. Decided against: pagination (until real data), player deep-links from cards, a RIASEC-type filter. An approved mockup artifact covers TAM-125/126 and is linked from both tickets.

### 2026-08-24 — (earlier) Tickets: the page width standard (TAM-124), the path-build redesign (TAM-125), My Path as a timeline (TAM-126)

Ticket-writing session, no code. Reviewing `/results` and `/paths/[id]` against the running app surfaced the same complaint twice: every page picks its own content width (2xl–6xl across the portal) and floats in whitespace. Decided with the user: **الرئيسية (max-w-6xl) is the reference**, enforced structurally — TAM-124 moves the container into `PortalPage` (both chrome variants) with an explicit `narrow` opt-in for the assessment, profile and player, and sweeps the per-page wrappers. TAM-125 rebuilds the path-build page on that width: a header card with meta (RIASEC tag, موصى به when earned, course count, live selected-hours total) and a selectable-card grid where the whole card is the one accessible control per course. TAM-126 rebuilds My Path as a vertical timeline: it fixes a real §3 violation (every unfinished course currently carries a button — the page's comment states the right rule, the code below it doesn't follow it), makes the certificate the final stop on the rail with its unlock condition spelled out, adds «عرض الشهادة» on done stops (needs `certificateId` + `riasecLetter` added to the my-path payload), and finally surfaces §4.9's quiet post-commitment add — the server (`addCourse`) and the course detail page have supported it all along; My Path just never pointed there. The /results complaints turned out to be already covered by TAM-113/114 — left as written, with a note that their "gold" wording predates D-069 and that the shared chips component now exists. Also seeded a demo learner (student@ministry.gov.example) — first through the real registration flow, then made permanent in prisma/seed.ts as seedDemoStudent() (SEED_STUDENT_PASSWORD, same no-default-password discipline as the admin and entity; the LMS counterpart stays lazily provisioned at first enrolment).

### 2026-08-23 — TAM-112: the way out, on every page

Branch `feature/tam-112-sidebar-signout`. The sidebar gained a footer — the signed-in user's name and a quiet "تسجيل الخروج" — on every shell page, learner and entity alike, kept outside the navigation landmark so it is never announced as a destination. The logout-then-leave-regardless behaviour that lived only in the profile page is now `useSignOut()`, used by both buttons so they cannot drift. 342 web tests (3 new), typecheck, lint; the e2e signs out from the sidebar and verifies the session cookie is gone.

### 2026-08-23 — TAM-123: the dashboard stops being blank

Branch `feature/tam-123-dashboard-content`, on the TAM-108 branch. The user's verdict on the §4.2-literal dashboard — one card and a greeting — was "super blank", and they were right: "near-empty" was a rule against empty widgets and competing actions, not against information. The page now answers the questions a person has on arrival: a four-stage journey tracker (where am I), a personal header with department and employee id (is this mine — the session and `/me` now carry both, which was TAM-109's first bullet), the top three recommended paths while choosing (what should I decide — a reversal of the TAM-108 call, recorded in D-095, authored as D-074), the next courses and the latest certificate while working (what is next), and the last three events throughout (what happened). Everything arrives in the one dashboard payload; the activity feed reads the product tables, not the audit log, because those rows carry titles. The `/me` endpoint was shaping its own response and had to be taught the two new fields — caught by looking at the screenshot, not by a test, so the auth integration spec now asserts them. 339 web tests, 531 API unit tests, the journey and auth integration specs against `tamkeen_test`, screenshots of both states reviewed.

### 2026-08-23 — TAM-108: the dashboard speaks Arabic about the result, and says where you are

Branch `feature/tam-108-dashboard`, on the TAM-107 branch. The assessed-no-path card showed the Holland Code as "SIA" — a storage key, not a result an employee can read. It now shows three chips with the Arabic type names in rank order, through a new shared `HollandCodeChips` so Results (TAM-114) cannot render the code differently. The active-path state gained a status strip — the path by name and type, and مكتملة / قيد التنفيذ / لم تبدأ — which needed two fields the dashboard payload did not carry: `riasecLetter` and `inProgressCount`, added server-side so the page renders one payload, and asserted in the API journey spec against a real database (a local `tamkeen_test` database now exists for that suite, matching CI). The strip is a labelled list with nothing clickable; the continue card stays the only action. 331 web unit tests, typecheck, lint; API unit + integration green.

### 2026-08-23 — TAM-107: the assessment keeps its sidebar; a draft makes leaving free

Branch `feature/tam-107-assessment-sidebar`, stacked on the loader branch so the stack stays linear. Removing one `chrome="bare"` prop put the assessment inside the shell with the two-item nav; the real work is the draft — answers and the current question written through to `sessionStorage` on every change, restored on return, discarded if the bank has changed, cleared on submit. The rationale in `portal-page.tsx` that justified hiding the rail on _every_ flow page now says why the assessment is the exception (D-094 — authored as D-073, renumbered at rebase). The journey e2e proves it against the live app: answer two, leave to the profile through the sidebar, come back, statement 3 is waiting. A leftover invalid class from the token migration (`hover:border-neutral-400-foreground/50`) was fixed in passing. 326 web unit tests, typecheck, lint, prettier, journey e2e.

### 2026-08-23 — One loader for every navigation (TAM-122, D-093 — authored as D-072, renumbered at rebase)

Branch `feature/navigation-loader`, off `feature/dga-alignment`. Moving between pages showed nothing for the few hundred milliseconds between the old page leaving and the new page's `LoadingState` arriving — long enough to click twice. `NavigationProgress` is now mounted once in the root layout: a top progress bar that starts at the click (a capture-phase listener, so it catches every internal link without wrapping `Link`), on back/forward, and on programmatic navigations through `useAppRouter()`, which replaces `useRouter` at all seven call sites so nothing can bypass it. It completes on the route change — the only honest signal the App Router gives. One polite announcement per navigation; the bar is decoration. `loading.tsx` files were rejected: with client-side fetching they would flash and hand over to `LoadingState`, two loaders for one wait. 292 web unit tests, typecheck, lint, prettier.

### 2026-08-23 — TAM-106: the catalogue does not exist before the assessment (entry restored — dropped in PR #13's merge resolution)

Branch `feature/tam-106-nav-gating`, off `feature/dga-alignment` — it touches nothing the auth stack touches. One branch in `navForState` and one redirect in `PortalProvider`, beside the 401 and wrong-portal redirects it already owns; the test that pinned the old three-item nav was updated rather than duplicated, and a new `PortalProvider` test covers the redirect, including that the loading state shows and the page never renders. The spec change is recorded (D-071, CLAUDE.md §4.2/§4.6), including the deliberate choice to leave the courses API open.

**The e2e told the truth about the old rule:** two catalogue flows browsed the catalogue _before_ the assessment — exactly what §4.2 used to permit — and had to become post-assessment flows. The journey now asserts two nav items and the bounce before the assessment, and الدورات appearing after it without a reload. One run failed at the pre-existing path-build counter step while the dev server was recompiling (46s run); two clean re-runs at 10s each say it is that step's race under load, not the gate — worth a look in the Phase 6 reliability pass.

### 2026-08-23 — Sub-phase 5.4: path management, and a flake chased to its cause

§4C.4 built: create and edit paths, `path_courses` membership **and ordering** (owed since Phase 4), the attach picker, and retirement that cannot strand anybody. The 5-10 rule is printed on the page and has no control anywhere (D-077).

**Test totals: 579 API unit · 324 web component · 400 API integration · 52 browser e2e — 1355 automated.** Typecheck, lint and format clean. No new dependencies. **The integration suite was run five consecutive times, all green**, which is the only claim worth making about a suite that was intermittently failing an hour earlier.

**Two rules that make a forbidden state unreachable rather than guarded against.**

`PATH_TOO_FEW_COURSES` (D-084) refuses to _offer_ a path with fewer than five selectable courses, and refuses any detach that would drop an active one below the floor. The failure it prevents is invisible from every screen: the learner reaches the build page, selects all four courses there are, and the confirm button stays disabled with nothing to act on. Nothing logs it, nothing alerts, and the path sits in the catalogue looking like a choice. Creation therefore always produces an _inactive_ path — an empty path could not be offered anyway, so accepting `isActive: true` at creation would mean either refusing every creation or admitting one nobody can confirm.

`COURSE_HELD_BY_LEARNERS` refuses to detach a course learners hold _through this path_. Nothing cascades, so a confirmed learner would keep seeing it — what breaks is everyone still building, whose next save is refused with `COURSE_NOT_IN_PATH` about a course they chose from that very screen. Scoped to the path deliberately: a course may belong to several (D-003), and a learner holding it through another one is not stranded.

**A stranding that already existed, found by reading rather than by a test.** D-002 reconciles retirement with commitment for the _confirmed_ learner — My Path and certificates read through `user_paths` and never consulted `paths.is_active`. Nobody had reconciled it for the learner still **building**: a plain `isActive: true` filter turned a retirement into a 404 on their build page, while `confirm` never checked the flag at all, so they could still commit to a path they could no longer see. Retirement now means what it means for courses (§2/D-015): hidden from new selections, untouched for whoever already chose it (D-085). The integration suite asserts it against the _learner's_ endpoint, not by reasoning about the query.

**The detail screen prints the numbers the decision turns on.** Learners building, active and completed are shown separately and never summed: only the building count is affected by a retirement, and the retirement audit entry records it. An administrator retiring a path knowing "three people are part way through choosing this" is making a different decision from one taken blind.

**A one-in-five flake, chased to three separate causes rather than re-run.** It failed different suites on different runs, which is the shape of shared state rather than of a bug.

| cause                                                                                          | what it broke                                                                                                                          | fix                                                                                                           |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| cleanup keyed on `version > 1`, not namespaced to the run                                      | one run's `afterAll` deleted the _next_ run's fresh draft, so an endpoint 404'd on a draft that demonstrably existed two tests earlier | track the ids this run created and delete exactly those                                                       |
| a course created here does not exist in the LMS, so every catalogue sync correctly withdrew it | the five-course-floor assertions, by the product working as designed                                                                   | borrow catalogue courses instead — they are in the LMS, so sync leaves them alone                             |
| the draft copy made ~180 sequential statements inside one transaction                          | Prisma's five-second interactive-transaction budget under parallel load, surfacing as a timeout with nothing wrong in it               | nest options and weights inside each question's create — 30 statements — and give the copy an explicit budget |

**And one that was not mine.** `withdrawVanished` used `update`, which throws when the row is gone, abandoning every course after it in the list. Several suites create and remove courses of their own, so a sync running during another suite's cleanup failed a _third_ suite. It is now `updateMany` with the count checked, so a vanished row is skipped without being counted or audited (D-086). Nothing in the product deletes a course, so this is defensive in production — but a reconciliation job that crashes because the world changed under it is reconciling badly, and this one is the Phase 6 sync-reliability item arriving early.

**A brittle assertion removed on the way.** `journey.e2e-spec.ts` asserted `paths` had length 12 — the seed's count stated as though it were a product rule. The rule is "every _offered_ path comes back, recommended or not"; it now counts against the database, and stops breaking the moment another suite legitimately offers a thirteenth.

### 2026-08-23 — Sub-phase 5.3: the assessment editor, and results that stay frozen

§4C.3 built: the version overview, the draft-then-publish editor over copy-on-write versioning, question text and order, per-dimension option weights, per-dimension question counts, the publish gate, and the read-only history. The largest and most consequential piece of Phase 5 — every Holland Code the product issues after a publish comes from a different instrument.

**Test totals: 573 API unit · 308 web component · 341 API integration · 52 browser e2e — 1274 automated.** Typecheck, lint and format clean. No new dependencies.

**The schema change is where D-072 (copy-on-write) became real.** `assessments.key` stopped being unique — several rows share `riasec-core` and differ by version — and `is_active` was replaced by a three-state `status`, because keeping both would be the D-059 mistake in a new place. Two things the schema language cannot say are written by hand in the migration: **partial unique indexes** giving at most one ACTIVE and one DRAFT per instrument, so two concurrent publishes cannot both retire the old version and both insert a live one; and the **backfill**, which marks the existing row ACTIVE rather than taking the DRAFT default. Phase 4 learned that lesson on `courses.publication` — a defaulted enum on a backfill is a silent withdrawal of live content, and here it would have made the whole product answer `ASSESSMENT_NOT_FOUND`. Verified against the live database: one row, `riasec-core` v1, ACTIVE, with an effective date.

**Copy-on-write turned two guarantees into properties rather than promises.** A draft is a full copy, so no `assessment_responses` row can ever reference a draft's questions — which is why the draft is freely editable and freely deletable while the `Restrict` that protects published banks has nothing to refuse. And there is no code path in the whole service that touches `assessment_results`: D-049 holds not because the code is careful but because there is nothing to be careful about. The integration suite checks the strong form — the same row, the same six scores, the same code, still pointing at version 1, and **the question text a historical response resolves to is still the text that was asked**. That last one is the half a scores-only guarantee misses: edit in place and a row claims version 1 while reading as version 2's wording.

**The balance guard refuses; adjacency warns** (D-074), and the editor tries to make balance easy rather than only reporting failure. Adding a question asks for a _dimension_ and copies the bank's own agreement levels, so growing five items per dimension to six is six clicks rather than a weighting exercise — and the full weight editor is still one click away on every option, because D-048 promises it. When the bank is unbalanced the panel prints what each dimension can attain: "الاجتماعي ٢٤ / الواقعي ٢٠" says which dimension to even up, where "غير متوازن" sends somebody to count questions by hand.

**Balance is expressed over attainable maxima, not question counts** — and a unit test proves why that matters. A bank with one item per dimension passes any count-based check while a strongly Enterprising taker scores twice what a strongly Realistic one can, because the weights differ. The same definition also _permits_ a ministry to rescale the whole instrument to 0-8, which a count-based rule would have had no opinion about.

**The seed stopped maintaining and became a bootstrap.** `seedAssessment` used to upsert the bank by key on every run. After 5.3 that would overwrite a published ministry version with whatever wording shipped in the code — data loss dressed as a convenience. It now writes only while version 1 is the only version there is, and says so when it stands back. D-032 always claimed the bank was seeded data "precisely so Phase 5 can edit it without a deploy"; this is the other half of that sentence.

**The one genuinely hard test problem this phase created.** Every integration suite namespaces its rows by a per-run id and they run in parallel against one database. The assessment cannot be namespaced — §4.3 has _one_ instrument and `getActive` finds the one ACTIVE row — so publishing a version mid-run made `journey.e2e-spec.ts` fail eight tests with `ASSESSMENT_NOT_FOUND`. **That refusal is correct product behaviour**: a taker whose instrument was replaced mid-attempt must not be scored against a bank they never saw. So the fix serialises the two suites with a Postgres advisory lock rather than weakening either assertion — held on its own connection, released by the server if a worker dies, and costing four seconds of wall clock across the whole run.

**Three smaller decisions worth knowing.** The weights DTO names all six letters explicitly rather than accepting a `Record<string, number>`, because a record would let `{ "X": 4 }` past validation and leave the enum column to answer 500 — the DTO is the outermost gate and naming the six is the only shape in which it can say no. Reordering takes the complete order rather than a move-up/move-down, so the result is what the administrator arranged rather than a replay of their clicks, and it writes negative orders first because `display_order` would otherwise collide with itself mid-shuffle. And an option's weights are replaced wholesale rather than merged, because "this option now contributes to S only" has to be expressible and a merge cannot say it.

### 2026-08-24 — Phase 5 verification pass: a missing deliverable built, two defects found and fixed

Asked to test Phase 5 thoroughly before the PR. Four things came out of it, in order of how much they mattered.

**1. A Phase 5 deliverable was missing.** CLAUDE.md's Phase 5 lists "change-password, email re-verification, language switch" among the deferred Profile items. Change-password shipped in 5.9 and the language switch is deliberately deferred (D-089) — **email re-verification had simply not been built**, and nothing recorded it as owed. It is built now (D-091): request-then-confirm, with the pending address held on an `EMAIL_CHANGE` token rather than on the user row, so `users.email` never points at an inbox nobody has proved they can read. The current password is required — whoever can move the address can then use "forgot password" and own the account outright — and the ministry-domain gate applies, extracted from the registration policy into `checkEmailDomain` so the two rules cannot drift. A taken address is answered exactly like a free one, because the profile form must not become the address oracle registration refuses to be. Completing the change revokes **every** session, the caller's included: the identifier the person signs in with has just changed.

**2. The portals unmounted themselves on an ordinary refetch.** All three providers gated their loading state on `isLoading` rather than `isInitialLoad`, so `refreshSession` after saving a preference swapped the whole portal for a spinner and tore down everything below it. `PreferenceProvider` made it worse by returning `children` unwrapped when the preference was null — a different element type at that position, so the _first_ save changed the tree shape and remounted the entire subtree. Either way the confirmation the person had just earned vanished, along with any half-filled form or open dialog. Fixed at all four points (D-092).

> **How it was found is the part worth remembering.** The browser test asserted `getByRole('status')` after saving — and passed, against the **loading state**, which carries that role too. The bug and the test that should have caught it were hiding each other. Assertions now name the confirmation's actual words.

**3. Two screens' worth of browser coverage was missing.** Sub-phases 5.4-5.8 and 5.9 had unit, integration and component tests but no end-to-end browser test at all. Two new specs, 26 tests, aimed at the rules rather than the rendering: the 5-10 bounds and rate limits shown but with **no control to write them**; no secret appearing in any settings payload; the audit trail offering no write route (404 on POST/PATCH/DELETE, asserted from the browser); the CSV exports carrying the UTF-8 BOM byte-for-byte; a setting saved on the screen read back **through the API**; an employee refused by URL and by API; and the digits preference proving itself by changing a number several screens away from the control that set it.

Two of the new tests were themselves vacuous when first written — `getByRole('listitem')` unscoped was matching the navigation rail — which is why the audit trail is now marked up as a named list. That is also a real accessibility improvement: a screen reader announces how many entries there are and lets its user move between them.

**4. A duplicate label.** The profile page ended up with two fields both labelled "كلمة المرور الحالية" — the password card's and the email card's. A screen reader announces the same thing twice with no way to tell them apart, so the email card's is now "كلمة المرور للتأكيد".

**Verification.** 599 API unit · 515 API integration · 403 web component · 84 browser e2e in Chromium — **1601 automated**, all green. Typecheck, lint and format clean.

> **One transient failure, honestly reported.** The first full integration run after the new migration failed 7 tests in `admin-assessment.e2e-spec.ts`. It has not recurred in three subsequent full runs, the suite passes in isolation, and the assessment table was verified clean afterwards (one ACTIVE version 1). **The cause was not identified.** Given this suite's history of cross-suite collisions (D-079, D-083), it should not be assumed benign — if it reappears, capture the failure text before re-running.

**Also carried forward:** the old address is _not_ warned when an email change is requested. §2's notification list is short and locked, and the current-password requirement means an attacker already holds the password before this endpoint helps them — so it is defence in depth, not the primary control. On the Phase 6 list rather than silently absent.

**Files:** `auth.{service,controller,dto}.ts`, `registration-policy.ts`, `email.{service,templates}.ts`, `audit.actions.ts`, a migration (`phase_5_email_change`), `verify-email-change/page.tsx`, the profile page, `preference-provider.tsx`, the three portal providers, the audit page, and their tests plus `e2e/phase-5-admin.spec.ts` and `e2e/phase-5-profile.spec.ts`.

**Decisions recorded:** D-088 (email change: request, confirm, token-held address), D-089 (a provider never unmounts the page it provides to).

**Next:** the PR for the whole of Phase 5.

---

### 2026-08-23 — Sub-phases 5.5-5.9: oversight, settings, templates, audit, and the Profile debt paid

Run straight through at the user's instruction, on the same branch, one commit per step.

**5.5 — Course Oversight (§4C.5).** The global catalogue: every entity's courses plus the ~40 the
seeded catalogue holds that nobody supplies — which no entity portal can show by construction, and
are therefore only ever the administrator's to place. The screen answers one question, _why can
nobody see this course_, and the answer is always the publication decision and the two LMS facts
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
the notice that an edit reaches _future_ issuances only — stated as the property that makes a
credential a credential, not as a limitation, because an administrator who thinks a correction will
propagate is one who will not make the correction. The still-missing ministry seal is named on the
screen, where the person who can supply it is looking, rather than only in this file. The preview is
the real `renderCertificateHtml` with sample data in a sandboxed `iframe`; the three fields are
written through the settings endpoints so those rows keep one writer (D-072).

**5.8 — Audit & Reports (§4C.8).** A cursor-paged read-only trail — filters by action, outcome and
actor; the action filter offers every action the codebase can emit, not only those already logged,
so options do not quietly vanish as old entries age out. Five reports: journey funnel, path
popularity, Holland-code distribution, certificate issuance, and course outcomes sorted worst-first,
which is what makes them actionable. Both export as CSV with a UTF-8 BOM (D-079) and
formula-defusing.

> **The bug worth remembering.** Adding `auditAction: 'الإجراء'` as a column heading overwrote the
> `admin.auditAction` **namespace** with a seven-character string — `Object.assign` onto a string
> yields `{0..6}` — so every ADMIN_* action rendered as its raw code and next-intl's fallback made
> it look intentional. The screen worked, every test passed. Renamed to `auditActionLabel`, and a
> permanent test now asserts every dynamically-keyed namespace is still an object of strings
> (D-087).

**5.9 — the deferred Profile items (§4.12).** Owed since Phase 1. Change-password requires the
current password and revokes every other session while keeping the one doing the changing (D-088):
a session cookie is enough to _be_ the user, so without the check an unlocked machine is a permanent
takeover, and the usual reason to change a password is that it may be known elsewhere — which a
change that leaves those sessions alive does not address. In place of the language selector §4.12
names, a digits preference through D-018's switch point (D-089): the interface is Arabic-only, so a
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

**Decisions recorded:** D-087 (a namespace is never also a label), D-088 (password change ends other
sessions), D-089 (per-user digits preference; language switch deferred), D-090 (the guard's third
exception, for glyph specimens). D-072-D-086 were recorded earlier in the phase.

**Next:** the user's test. On approval: one PR for the whole of Phase 5. Nothing more on this branch.

---

### 2026-08-23 — Sub-phase 5.2: user management, and Phase 4's provisioning seam closed

§4C.2 built: the account list with search across name, email and employee id; the per-account view; suspend/reactivate and role change; **provisioning accounts and creating organisations**. An entity used to exist only if `prisma/seed.ts` created one, so onboarding a ministry supplier needed a developer with database access — that is now a screen.

**Test totals: 556 API unit · 290 web component · 268 API integration · 40 browser e2e — 1154 automated.** Typecheck, lint and format clean. No new dependencies.

**No password reaches the administrator, and the tests are written so a regression cannot hide.** An account is created with a hash of 32 random bytes that nothing retains, and an invitation goes to the address; the person chooses their own password from the link. The obvious alternative — generate one and show it once, as `prisma/seed.ts` does — produces a credential two people know, relayed over whatever channel the admin then uses, which in a ministry is a chat message. The seed does it that way because a terminal has no mailbox to send to; a portal does. Both the integration and browser suites assert the _absence_ against the whole serialised response and the whole rendered page rather than against named fields, because a later refactor adding `temporaryPassword` would satisfy every other assertion in either file.

**A dead end that already existed, found while making the invitation work.** `requestPasswordReset` accepts an unverified account, but `resetPassword` never set `emailVerifiedAt` — so it was possible to register, skip verification, use "forgot password", set a new password, and still be refused at sign-in with `EMAIL_NOT_VERIFIED`, having just proved control of the mailbox. Redeeming a token emailed to an address _is_ what verification asserts, so the reset now sets the timestamp when it is null (`??`, never overwriting — the original is when the address was first proven). This is also what makes an invited account work at all, since it has never seen a verification email.

**Two lockouts, and they are not the same failure.** Refusing self-modification stops an administrator suspending themselves mid-session, where the screen that would undo it is the one they just lost. Refusing to remove the last _active_ administrator stops the ministry losing the portal entirely — and no amount of individual care prevents that one: two administrators can each demote the other, one after the other, and neither has done anything wrong. Both live in `account-changes.ts` as pure functions over gathered facts, on the same reasoning as `checkRegistrationPolicy` and `publishBlockers`: every rule here prevents a lockout or an orphaned record, which are exactly the cases an integration test reaches only by arranging the disaster first.

**A third refusal the schema does not enforce.** Converting an EMPLOYEE who holds a result, a path or a certificate is refused. Their record survives — `user_paths.pathId` is `Restrict` and certificates are immutable — but every screen that reads it is `@Roles('EMPLOYEE')`, so the person could no longer reach their own training history while their certificate stayed publicly verifiable in their name. The ministry case this resembles, an employee seconded to run a supplier account, is properly served by a second account.

**Suspension revokes sessions, and the reason is not the obvious one.** `SessionService.resolve` already refuses a suspended owner on every request, so the suspension takes effect either way. What revoking prevents is the _reactivation_: without it, restoring an account silently hands back every session that was live when it was suspended — including whichever one may have been the reason for suspending it. A role change revokes for a different reason: a demotion would otherwise keep resolving against the old role until the session expired, which is precisely the window that matters.

**A defect the audit test caught.** `Object.keys(dto)` on a class-validator DTO returns every declared optional, because `transform: true` instantiates the class and absent fields exist as `undefined` own properties. The entity-update trail therefore claimed all four fields changed on every edit — worse than recording nothing, because a reviewer would stop believing the payload. Now filtered on `!== undefined`.

**`ADMIN_CONTROLLERS` replaced the single controller.** 5.1's RBAC suite reflected routes off one class; §4C is roughly forty endpoints across eight pages, and one file holding all of them makes the boundary between "users" and "settings" a matter of scrolling. The suite now enumerates the same array `AdminModule` registers, so a controller added later is covered the moment it is routable — **46 RBAC assertions across 11 routes**, with no second place to remember. Each denial is still checked for `INSUFFICIENT_ROLE` rather than only for a 403, since a CSRF refusal is indistinguishable from outside.

**Administrative provisioning bypasses D-017 deliberately.** The domain and employee-id gate governs _self_-registration; the whole point of `admin-only` mode is that an administrator is the gate. It also has to: an entity contact is by definition not at a ministry address and could never be provisioned otherwise. Uniqueness is still the database's, and the browser suite provisions to `@authority.example` to prove it.

**The Phase 4 refetch defect, written a second time.** Saving from the admin user panel triggered a refetch, `useApiQuery` set `isLoading` on every refetch, and `DataView` swapped to its loading state — unmounting the confirmation the administrator had just earned. Phase 4 hit exactly this on the entity manage screen and fixed it by writing `isLoading && data === undefined` at the call site. Two occurrences of a rule nobody can be expected to remember is enough: the hook now exposes **`isInitialLoad`**, documented as what `DataView` almost always wants, so a third occurrence needs a deliberate choice rather than a forgotten one. Only the browser suite could see it — the component test passes because a mocked fetch resolves before React can render the loading state.

**Two smaller things the browser found.** The entity dashboard has computed `entityName` since Phase 4 and rendered it nowhere; harmless while an account's organisation was fixed at seeding, and no longer, because §4C.2 lets an administrator move an account between organisations — so "whose courses am I looking at" is now a question the screen has to answer. And Next.js renders its own `role="alert"` route announcer at the document root, which makes every unscoped alert assertion ambiguous; the e2e scopes to the dialog rather than weakening the assertion.

**One state the database has no column for.** An account created but never activated looks identical to a working one on `status` alone, and "why can this person not sign in" is the question this screen is most often asked — so the list renders a third badge, بانتظار التفعيل, derived from a null `email_verified_at`. Suspension outranks it: an account that was cut off is not waiting for anything.

### 2026-08-23 — Phase 5 planned; sub-phase 5.1: the admin foundation and the §4C.1 dashboard

Branch `phase-5-admin-portal`, cut from `origin/main` @ `f1f0dcd` — which now contains Phase 4 (PR #6 merged). **Phase 5 is divided into nine sub-phases**, run back to back on this one branch with a single PR at the end; the tracker is in Current Status above so a cleared chat can resume mid-phase.

**Eight decisions were taken before any code was written** (D-072 … D-079), because four of them shape the schema and would have been expensive to reverse. The one that matters most is **D-072, copy-on-write assessment versioning**: D-049 says existing results are "frozen as taken", and that is only literally true if the _instrument_ survives beside the scores. Editing in place and bumping an integer freezes the numbers but lets a wording change rewrite the questions a past response points at, so a row would claim version 3 and resolve to version 7's text. `assessment_results.assessmentId onDelete: Restrict` (D-035) has been promising since Phase 1 that the instrument still exists; 5.3 is where that promise is either kept or quietly broken.

**Test totals: 540 API unit · 271 web component · 198 API integration · 34 browser e2e — 1043 automated.** Typecheck, lint and format clean. No new dependencies.

**A live defect, found by reading the routing rather than by a failing test.** A `SUPER_ADMIN` who signed in was sent to the _entity_ portal. Three separate files each asked `role === 'EMPLOYEE'` and treated everything else as an entity — correct when written, because until this phase there were only two portals, and wrong the moment a third role could sign in. The account with the most authority in the system was being handed somebody else's screens, and no test could see it because every test asserted the two roles that existed. It is now one `Record<UserRole, string>` map with four readers, so adding a role fails the typecheck at every site instead of defaulting silently. This is the second time a half-implemented redirect rule has surfaced (D-067 was the first) — the pattern is that these rules read correctly one branch at a time and are only wrong as a set.

**The RBAC test enumerates its own routes.** `admin-rbac.e2e-spec.ts` reflects Nest's own `PATH_METADATA` / `METHOD_METADATA` off `AdminController` rather than listing paths by hand, so every endpoint added in sub-phases 5.2-5.8 is automatically asserted against an employee, an entity and an anonymous caller the moment it exists. A hand-maintained list would go stale exactly where it matters: the endpoint nobody remembers to add is the one that ships unproven while the suite stays green. Each request carries a valid CSRF token and each denial is checked for `INSUFFICIENT_ROLE`, because a 403 from `CsrfGuard` and a 403 from `RolesGuard` are indistinguishable from outside and one of them would mean the role check never ran.

**The dashboard adds no source of truth.** Every figure on §4C.1 already existed — users, entities, paths, courses, results, completions, certificates, the audit trail. The service only asks the existing tables the questions an administrator has, which is what stops it disagreeing with the screens it summarises. Three pieces of arithmetic were worth unit-testing because a plausible implementation gets each wrong: a retake must not count as a second assessed person (D-033), the code distribution must use each person's _newest_ result or it describes the indecisive rather than the ministry, and a completion rate over nobody is undefined rather than 0%.

**Integration health asks two questions, not one.** "Is Moodle answering?" is a live `checkHealth()` call; "did the sync actually run?" is read from the audit trail, because that is the only place a _run_ is recorded — `courses.lastSyncedAt` would report a healthy catalogue while every recent run had failed. A Moodle that answers while the scheduler is dead is the outage that a single green tick hides, and it is the one an operator must act on. The failure code is surfaced too: a rejected token and an unreachable host need different fixes, and collapsing them costs the operator their first hour.

**Two smaller things the work forced.** `audit_log.id` is a `BigInt`, and `JSON.stringify` throws on one rather than rounding it — so the conversion happens in the service and is asserted with a value above `Number.MAX_SAFE_INTEGER`. And an audit action with no Arabic copy falls back to its raw code rather than to an empty string, because a blank row hides the event entirely, which is worse than an untranslated one.

**Eight nav items, not six.** §3 caps the _learner's_ steady-state nav at six so a person is not shown places they cannot act on; §4C names eight administrative destinations and each is a distinct thing the ministry runs. `ADMIN_NAV` currently holds one entry and gains the others in the sub-phase that builds each page — the same rule `navForState` follows, that an item leading to a 404 advertises what the product cannot do.

### 2026-08-22 — Phase 4 verification pass: four defects found, fixed, and the PR opened

The phase was already written and green. This session tried to break it, and did — four times. **1012 automated tests** now pass: 530 API unit, 256 web component, 192 API integration against real PostgreSQL, 34 browser e2e in Chromium. Lint, format and typecheck clean.

**`main` had moved.** The landing page merged as PR #5 while this branch sat unpushed, touching the same `ar.json` and `api-client.ts` this phase extends. Merged into the branch rather than left to GitHub: the merge was clean, but "the tests pass" means nothing if the suite never ran against what the code will actually land on.

**Four defects, none of which the existing 998 tests could see.**

| what                                                               | how it was found                                                    | why no test caught it                                                                                    |
| ------------------------------------------------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| an entity on any learner page got a dead error card                | driving the merged build in a browser                               | `@Roles` made the dashboard answer 403, not 401 — no suite asked what a non-employee sees on `/` (D-067) |
| the mock reissued a course id after a restart                      | a 500 in the first test of the entity suite                         | the mock's state dies with the process; the rows do not, and `moodle_course_id` is UNIQUE (D-068)        |
| `published_at` never set on a course withdrawn while still a draft | reading the publish path, then reproducing it against a running API | nothing renders the column yet — §4C.5 will                                                              |
| the e2e fixture borrowed a created course, not a catalogue one     | the suite failed on the publish bridge, which was not at fault      | `MAX(moodle_course_id)` is not the same question as "the last catalogue course"                          |

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

**Three corrections worth recording.** The generated migration would have failed on PostgreSQL 12+, which refuses to _use_ a new enum value in the transaction that added it — split into two migrations. The backfill was the part that mattered: `publication` defaults to `DRAFT`, and taking that default would have withdrawn all 48 existing courses from every learner the moment the migration ran; existing rows are marked `PUBLISHED` with LMS flags chosen to reproduce each row's current status exactly, verified against the live database as 47 `AVAILABLE` and 1 `HIDDEN_BUT_COMPLETABLE`, unchanged. And the browser suite caught a real bug: `DataView` was showing its loading state on every refetch rather than only the first, so saving metadata unmounted the whole view and the confirmation vanished the instant it was earned.

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

| check                                  | result                                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| fresh token                            | `303 → /course/view.php?id=2`, and the course page renders the learner's Arabic name — a real session, no login form |
| replayed token                         | refused ("already been used")                                                                                        |
| tampered payload (user id edited to 1) | refused ("not valid")                                                                                                |
| expired but validly signed             | refused ("expired")                                                                                                  |

Repeatable as `npx tsx spike/verify-sso.ts`.

**Cross-language agreement is asserted, not assumed.** The plugin verifies in PHP what we mint in TypeScript, so a unit test pins the wire format exactly — unpadded base64url, HMAC-SHA256 over the _encoded_ payload string, camelCase claims — and a live check ran a TS-minted token through the plugin's PHP verification inside the container. Two implementations read side by side would have drifted.

**Why core Moodle could not do this** (established, not assumed): every core mechanism mints a session for the **web-service token's own user**, and our token is `tamkeen-integration`, not the learner. `tool_mobile_get_autologin_key` fails on that plus three other counts.

**A version difference worth knowing:** Moodle 5.x moved the web-facing tree into `public/`, so the plugin installs to `public/local/tamkeensso` on 5.x but `local/tamkeensso` on the 4.5 production target. Getting it wrong means the plugin silently never loads. Both paths are in `moodle-plugin/README.md`.

**Installed on the dev Moodle** to verify rather than shipping untested PHP — a throwaway instance the user said can be wiped.

**Totals:** 351 API unit tests (was 331), 90 integration tests, all green; typecheck, lint, format clean.

**Owed:** re-verification on a real **4.5** (D-039), and the governance answer on custom plugins (D-044) — the longest-lead item in the project.

**Next checkpoint:** the course player (§4.8) — now unblocked — then the full Phase 2 test pass.

### 2026-08-19 — Phase 2 checkpoint 4: completion sync

The loop now closes in the product, not just in a spike. `getCourseProgress`/`listProgressForUser` are real, `completions` exists, and a scheduled job drives catalogue sync, enrolment reconciliation and completion sync in that order (D-042).

**Verified against the live Moodle**, reading the learner who actually took the quiz: `{"completed":true,"completedAt":"2026-08-18T13:57:59.000Z","gradePercent":100}` → our verdict `passed: true` at `PASS_THRESHOLD=70`. A course they are not enrolled in returns `null`; an unknown learner returns `[]`; three consecutive reads are identical.

**One constraint carries three rules.** `completions` unique on `(user_id, moodle_course_id)`: polling cannot duplicate a row, a shared course reuses the one completion instead of being re-taken (D-003), and Phase 3 gets a stable idempotency key. Keyed on the _LMS_ course id so a completion survives our catalogue row being retired.

**The email fires only on the transition into passing** — the single irreversible act in a job that re-reads the same data forever. Tested by running the sync three times and asserting one email.

**A hazard the spike had already shown us** is now guarded: a Moodle course with no completion criteria reports `completed:false` forever, so nobody on it can ever pass however well they score, and the symptom is "certificates never arrive" with nothing in any log. `isGradedButNotComplete` detects that exact shape and names the course.

**My Path's live-progress overlay is gone, closing D-036.** Phase 1 read the LMS on every render because nothing persisted progress; this job is the writer that was missing. It also removes an N+1 LMS call from a page load — the page no longer needs Moodle to be up to render.

**Totals:** 331 API unit tests (was 285), 90 integration tests against real PostgreSQL, all green; typecheck, lint, format clean. One migration (`phase_2_completions`). Callers of `LmsPort` still unchanged.

**A security finding, not introduced here:** `npm audit` now reports **3 high** advisories for `deepmerge-ts`, reached through `prisma` → `@prisma/config`. It is not from BullMQ (verified by tracing the tree) — it is a newly published advisory against a dependency we already had. An npm `overrides` pin in the D-022 style **does not take effect** here, and npm's own fix downgrades Prisma to 6.x, breaking D-026. Exposure is low: it is a CLI/config-time dependency reached when loading a Prisma config file, not in the request path. **Flagged for a decision rather than silently absorbed** — see the blocker list above.

**Next checkpoint:** the seamless-login spike, before any course-player UI is built (D-039).

### 2026-08-18 — Phase 2 checkpoint 3: enrolment

`enrol`/`isEnrolled` are real, and enrolment now survives a Moodle that misbehaves (D-041).

**Verified against the live Moodle** — `spike/verify-enrol.ts`: provision → `isEnrolled` false → `enrol` → `isEnrolled` true → `enrol` again, no error, and false for a course the learner does not hold.

**Two defects that only exist against a real LMS.** `enrol` now **verifies before believing its own error**, because Moodle throws _after_ committing the enrolment — the spike proved it, and the same reasoning covers a timeout, where the request may well have landed. And each course is enrolled **independently**: the old single `try` around the whole 5–10 course loop would abandon every course after a refused one and audit the batch as failed, leaving a learner half-enrolled in a path they cannot switch out of.

**`retryPendingEnrolments` closes the loop D-036 left open** — best-effort enrolment is only defensible if something reconciles the leftovers. Bounded per run, safe any time, attributed to no IP address because it is a background job rather than a person.

**A new unit suite for enrolment resilience**, which did not exist: Phase 1 tested enrolment only through the journey integration suite, where the mock never fails, so none of this was reachable. Nine cases covering partial failure, provisioning failure, double-enrol prevention and multi-path reconciliation.

**Also fixed while here:** the reconciler counted enrolments by subtracting a global pending tally, which reports zero on a run that enrolled plenty whenever more rows are outstanding than the batch limit. It now sums what each attempt actually did.

**Not built, deliberately:** the optional `enrollments` table (§6). `user_path_courses.enrolledAt` answers the only question anything asks; a table whose sole consumer is a hypothetical future debugger is speculative schema. Recorded in D-041.

**Next checkpoint:** completion sync — the `completions` table keyed on `(user, moodle_course_id)`, the pass threshold, and the BullMQ scheduler that will also drive catalogue sync and enrolment reconciliation.

### 2026-08-18 — Phase 2 checkpoint 2: catalogue sync

`listCourses`/`getCourse` are real, and `CatalogSyncService` mirrors the LMS catalogue into `courses`.

**Verified against the live Moodle**, not just mocks — `spike/verify-catalog.ts` reads the real catalogue through the adapter: two courses returned, **the site course (id 1) correctly discarded**, the hidden course present with `visible: false` so sync can see it, `getCourse(9999)` → `null`, and `durationMinutes: null` exactly as D-039 predicted.

**Three destructive defaults avoided, recorded as D-040.** A vanished course is never deleted and is only retired if **no learner holds it** — `RETIRED` is invisible even to someone who already selected it, so retiring an in-use course would breach D-015. An empty catalogue is treated as a fault and writes nothing, rather than withdrawing everything in one pass. And sync writes only what Moodle owns: letting the LMS's `null` overwrite an authored `durationMinutes` would have erased every duration on the first run _without erroring_, since the column is nullable.

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

**Five findings became D-038**, each a defect that would otherwise have shipped: email lookup silently returns empty under least privilege (→ key on a username we derive); `enrol` throws _after_ committing (→ verify before believing the error); `core_course_get_courses` omits `visible` (→ use `..._by_field`); only a course-total grade item is returned (→ always evaluate the course total); `completionstatus.timecompleted` does not exist (→ derive from the criteria).

**Four Moodle-side gaps the spike surfaced**, all fixed by the human: `moodle/role:assign` plus the Allow-role-assignments matrix row (enrolment returned `wsusercannotassign` for _every_ role id until both were set); the manual-enrolment welcome message (no mail transport in the container); and the test course, which turned out to contain no quiz at all — `core_course_get_contents` showed only the default Announcements forum, which explained both `nocriteriaset` and the missing grade item.

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

**1.3 Schema, migration, seed** — one migration adding assessment/paths/courses tables. Constraints carry the rules (D-035): `user_paths.user_id` is unique so single-path survives concurrent confirms; option weights are a table with an enum column, because a mistyped letter in JSON fails _silently_ into a wrong Holland Code; responses reference the bank with `Restrict` so Phase 5 edits cannot rewrite history. Mock catalogue grew 12 → 48 courses (twelve could not support twelve paths each offering a genuine 5-10 choice); 12 paths, two per letter, so the within-letter ordering is actually exercised. Seed is idempotent — verified by three consecutive runs leaving row counts identical. The API tsconfig now typechecks `prisma/`.

**1.4 API** — assessment, paths, courses, path commitment, dashboard. Rules live in services, never controllers. Confirm re-counts **inside** the transaction and guards on `confirmedAt IS NULL` in the `UPDATE … WHERE`, so two concurrent confirms cannot both succeed. Gold ordering calls the shared function rather than an `ORDER BY`. `resolveCourseAction` is pure and returns exactly one value, so §3's "never all three" is enforced by the response shape; an exhaustive sweep over all 48 state combinations asserts it. **No view type carries a weighting** — an integration test greps the whole `/api/assessment` response for `weight`, `dimension`, `points`, `riasec`, and the e2e suite has to read weights out of the database to produce a chosen code.

**1.5 Web** — assessment flow, results with the gold ranking, path build with the live counter and the native-`<dialog>` commitment gate, catalogue + detail, My Path, the dashboard's three states, minimal profile. Authenticated pages sit under a `(portal)` route group; `PortalProvider` loads session + journey state once and owns the 401 redirect (D-037), because the nav depends on that state and a per-page copy would disagree with its own content.

**Three defects the verification pass found — each now has the test that would have caught it:**

- The `{}`→`null` normalisation also flattened an empty **array**, so an empty catalogue never reached its empty state and rendered a heading above nothing. Caught by the catalogue e2e.
- The mock LMS numbered users from a **per-process counter**, so after a restart it handed a new user an id an existing row already held and enrolment died on the `moodle_user_id` unique index. Ids now derive from the email, matching the invariant a real Moodle has; the contract suite asserts stability across instances (D-036).
- `PathCard` paired each value with a visually-hidden `<dt>`, making a screen reader announce _"دورة متاحة، 11 دورة متاحة"_.

**Three more found only by driving the built app in a browser:** the modal pinned to the top (Tailwind's preflight zeroes the `margin:auto` the UA stylesheet centres a `<dialog>` with); the progress track invisible at 0% (cream on white); course detail printing its title twice.

**Also:** error codes moved from `auth.errors` to a top-level `errors` catalogue — they come from one API vocabulary, and splitting them by feature means deciding where a shared code belongs.

**Honest gaps at hand-off:** profile is read-only; `courseUrl` does not resolve until Phase 2; a confirmed path can exist without its LMS enrolments until sync runs; narrow-viewport layout still unverified (carried from Phase 0, Phase 6 owns it); CI has run once.

**Next:** Phase 2 — the Moodle spike first, then the real adapter against `describeLmsContract`.

### 2026-08-17 — Phase 0 complete; PR opened for review

Branch `phase-0-foundations`, 7 commits on `main` @ 6442ed4. **Not merged.**

**Test totals:** 199 unit (12 `packages/types`, 113 api, 74 web) · 38 API integration against real PostgreSQL · 9 browser e2e in Chromium. format / lint / typecheck clean.

**0.1 Monorepo & tooling** — npm workspaces (D-020): `apps/api` NestJS 11, `apps/web` Next 15 + React 19, `packages/types`. Strict shared tsconfig, Prettier + per-workspace ESLint flat configs, `.gitattributes` for LF parity with CI. Zod-validated env at boot. `docker-compose` for PostgreSQL 16 / Redis 7 / Mailpit (D-021). npm `overrides` cleared 3 high CVEs while holding Next 15 (D-022). **Fixed:** `gitignore`/`env.example` had no leading dots, so the ignore file was inert and `.env` was unprotected.

**0.2 Arabic-first RTL / i18n** — next-intl without locale routing (D-024); `lang="ar" dir="rtl"` fixed; all copy in `messages/ar.json` including the document title. The D-018 switch point lives in `packages/types` and is shared by web and api so screen and PDF cannot disagree; next-intl receives the extended tag (`ar-u-nu-latn-ca-gregory`) so ICU-embedded numbers honour it too. Self-hosted IBM Plex Sans Arabic (D-023) — removes a build-time network dependency _and_ a third-party disclosure of who uses an internal system. A catalog test fails the build on empty strings, unbalanced ICU braces, stray English, or hardcoded digits.

**0.3 Design tokens & UI shell** — the seven brand colours once in `globals.css` with a shadcn-compatible semantic layer. **Measured** contrast (D-025): gold `#A8863C` is 3.08–3.99:1 and **fails AA for body text on every background**, including as a fill with white _or_ navy text; it is now restricted to borders/rings/icons/large text, with light gold + navy (6.01:1) as the AA-safe achievement fill. Two functional colours added outside the palette (danger/success) because mandatory error states need a signal colour and §3 has none. 24 contrast assertions, including negative tests documenting the restriction. `LoadingState`/`EmptyState`/`ErrorState` + a `DataView` that makes the happy path unreachable without handling all three; error outranks empty so a failed request is never reported as "nothing here yet".

**0.4 Database & migrations** — Prisma 7 with the pg driver adapter (D-026); foundation tables only (`users`, `auth_tokens`, `sessions`, `audit_log`, `notifications`), with a test asserting product tables stay absent. Token hashes only; timestamps not booleans; audit references ids only and survives actor deletion via `SetNull`; UUID keys. Seed has no known default password — production requires it explicitly or refuses to run — and is idempotent. RBAC is role-based and code-defined, with no permission table (D-027).

**0.5 Auth & security** — restricted registration (D-017) failing _closed_ on an empty allow-list or bad pattern; email verification and reset via single-use hashed tokens; opaque Postgres sessions with immediate revocation (D-028); per-account lockout; double-submit CSRF; global **fail-closed** session guard so a controller added later is protected by omission rather than exposed by it; audit written from services, not controllers. Enumeration resistance end to end, including a dummy argon2 verify to equalise timing. Five Arabic RTL auth pages; a `Field` component makes label/`aria-invalid`/`aria-describedby` structural.
**Security defect found and fixed (D-029):** `@nestjs/config`'s `ConfigService` reads `process.env` in preference to the validated object, so `ALLOWED_EMAIL_DOMAINS` arrived as a _string_ and the domain check became a **substring match** — `attacker@ministry.gov` would have passed a gate set to `ministry.gov.example`. The existing domain test passed for the wrong reason (`gmail.com` fails a substring check too). Config now reads the validated object; tests assert the types and explicit prefix/substring rejection.

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


### 2026-08-25 — Tickets: the `moodle-embed` epic (TAM-129, TAM-139)

Ticket-writing session, no code. Goal: the entity publishes courses and adds content without leaving the portal. Option A chosen over an in-portal authoring UI and a hybrid: Moodle's editor framed inside the shell (D-046 Model 1 stands). TAM-129 is the Moodle/API foundation (`local_tamkeensso` `embed=author` mode with editing on, chrome hidden via the hook API keeping the secondary course nav + course index, `allowframembedding` + `frame-ancestors <APP_URL>`, `ready`/`content-changed` messages, the `embed` flag on `author-launch`); TAM-139 is the entity Course Content page (framed editor, read-back strip refreshing on change, publish as the page action shared with Manage Course, handoff as fallback — amends D-045). Premise recorded in the epic note: Moodle on a subdomain of the app's site, otherwise the cookies do not flow. Learner-side framing explicitly out of scope. Local stack brought up end-to-end today (Docker Desktop, Moodle 4.5.4, `MOODLE_MODE=real`, health `lms: up`).

### 2026-08-25 — TAM-129 built: the embed foundation (D-101) — branch `feature/tam-129-embed-foundation`

Implementation session on the user's "go with A" (Moodle's editor framed in the entity portal). Shipped: `local_tamkeensso` 0.2.0 — `login.php?embed=author` (session flag + editing on), `db/hooks.php` + `classes/hook_callbacks.php` (frame-ancestors header on every page from the new `allowedframeancestor` setting; chrome-hiding CSS and the `tamkeen:ready` / `tamkeen:content-changed` messages when framed), `db/events.php` + `classes/observer.php` (course-module/section/completion events → one message on the next render); `infra/moodle/moodle-setup.php --appurl` sets `allowframembedding` + the origin, `setup.mjs` honours `MOODLE_SSO_SECRET`/`APP_URL`, copies the plugin contents (`/.`) and runs PHP as `daemon`; API: `LmsPort.courseLaunchUrl(…, { embed: 'author' })` on both adapters + a contract case, `AuthorLaunchDto { embed? }`, `EntityAuthorLaunchView.mode: 'embed' | 'handoff'`, web client `authorLaunch(id, { embed })`; two new entity e2e cases. Proven in the browser with a throwaway Playwright probe (allowed origin: ready + content-changed + editing on + chrome hidden; foreign origin: blocked). Note for whoever runs the e2e suite: it boots `AppModule` from `.env`, which is currently `MOODLE_MODE=real` — run it with `MOODLE_MODE=mock SYNC_SCHEDULER_ENABLED=false`. Dev-data note: the seeded entity's `moodle_user_id` was a mock-era id (723670); nulled so the service re-provisioned it in the real Moodle. Pre-existing, untouched: `apps/web/e2e/portal-a11y.spec.ts` fails typecheck on `main`. **Next:** TAM-139 (the entity Course Content page on this foundation), then the user's test → PR.

### 2026-08-25 — TAM-139 built: the entity Course Content page frames Moodle's editor (D-118) — branch `feature/tam-139-entity-content-embed` (stacked on TAM-129)

TAM-129 was pushed and its PR body committed (`.github/PR_BODY_tam-129.md`; the user opens the PR from the compare URL). Then TAM-139: `components/entity/moodle-embed.tsx`, `components/entity/publish-action.tsx`, the rewritten `entity/courses/[courseId]/content/page.tsx` (publish gate as the header action, read-back strip, framed editor), Manage Course's author card as a link and its publish card on the shared component, five new `entity.*` strings, the user-tour rule in the plugin CSS. Tests: `entity-course-content.test.tsx` (9), `entity-manage-course.test.tsx` updated (12), full web suite 501 green ×2, typecheck/lint/prettier clean; `e2e/phase-4-happy-path.spec.ts` rewritten for the link and the framed page (against the mock LMS the frame never reports ready, which exercises the fallback). Live proof against the running app with a throwaway Playwright script (not committed). CLAUDE.md §4B.3/§4B.4 rewritten; D-118. **Next:** the user's test → PR for TAM-139 (after TAM-129 merges, or as a stacked PR); TAM-120's sweep of the remaining entity pages; the `lang=ar` provisioning fix noted in D-118.

### 2026-08-25 — TAM-140 (sidebar double-active) fixed on the TAM-139 branch

The user asked for the fix rather than a backlog ticket: the rail marked «الرئيسية» active on every entity page because `/entity` prefix-matched everything and only `/` was special-cased. Replaced by a segment-aware `isNavItemActive` helper (no special cases; `/admin` in Phase 5 needs nothing), unit-tested; the ticket is recorded as done in `tickets.md`.

### 2026-08-25 — TAM-141 built (entity half, D-119) — on `feature/tam-139-entity-content-embed`

At the user's direction (cap 3 · approval yes · «عامة» exists · grandfather yes). Pure rules module + spec; schema and migration (`path_courses.status/decided_by_id/decided_at`, `courses.is_general`) applied to `tamkeen` and `tamkeen_e2e`; three settings through `env.schema`/`SETTING_KEYS` with admin strings; `replacePathMembership` decides through the module and writes PENDING/APPROVED per the setting; learner-facing `path_courses` readers filter APPROVED (admin readers see all); `EntityCourseDetail` carries `pathRules`, `isGeneral`, `paths[].status`; the metadata form enforces the same three checks per checkbox. Verified: API unit 610, entity e2e 47 (4 new), journey e2e 58 on the clean `tamkeen_e2e` DB (on the dev DB it fails on registration 409s — leftover data, not the change), web 511 ×2 (one load-related one-off in the content test's first run). Phase 5 owes the approval queue, the «عامة» toggle and flipping approval on. Also on this branch today: TAM-140, the `Select` primitive + option font fix (user still sees blank options — pending their check of the register dropdown), `lang: 'ar'` provisioning (Arabic pack download still pending the user's go-ahead). **Next:** the user's test → push + PR for the TAM-139 branch; TAM-142 (per-course resync) queued.

### 2026-08-25 — TAM-143 built (D-120) — on `feature/tam-139-entity-content-embed`

The Arabic authoring guide as one Markdown file, rendered at `/entity/courses/guide` by an in-repo converter (no new dependency); links from the create card, the Content page and the publish blockers («كيف؟» → the section that fixes it); the course description shown under the title on the Content and Manage pages. Verified live (guide renders RTL with its TOC; anchors resolve) and by tests (converter 4, content page +2, web 517). Also today: the Moodle integration role now holds every module's view capability (the read-back could not see an unenrolled quiz — `moodle-setup.php`, commit 11a5ba1); the seeded student's stale Moodle id nulled for re-provisioning. Owed: guide screenshots once the Arabic pack is installed; TAM-142 (per-course resync) and TAM-144 (entity profile editing) written, not built. **Next:** the user's test → push + PR for this branch (it now carries TAM-139, 131, 132 entity half, 134 and the fixes).

### 2026-08-25 — Demo course + enrolled demo student (dev data), and a provisioning lesson

`infra/moodle/moodle-demo-content.php --courseid=<id>` fills a portal-created course with one of every content kind (video link, PDF, page with image, folder, book, label, 3-question quiz with a grade to pass, completion criteria). Five such courses (Moodle 85–89) sit published in «العمليات الميدانية والسلامة»; `demo-student@ministry.gov.example` / `Student_Demo_2026!` registered, assessed, confirmed that path with all five and launched course 85 (Moodle user 8, enrolled; the other four enrol at the next reconciliation or on launch). **Lesson:** setting Moodle's site `lang=ar` without the Arabic pack installed makes `core_user_create_users` default every new user's lang to `ar` and refuse it (`invalidparameter`) — no learner could be provisioned. Site lang reverted to `en` until the pack is installed; the adapter now retries without `lang` on that refusal (df766da). The `nest start --watch` watcher also missed a file change once and served stale code — restart the API when a change does not show.

### 2026-08-25 — The learner's course framed (D-121, TAM-145) — on `feature/tam-139-entity-content-embed`

At the user's direction after testing the entity side: `embed=learner` in the plugin (0.3.0), the learner launch flag, the on-demand `POST /courses/:id/sync`, one shared `MoodleEmbed` for both portals, the player rewritten around the frame with the handoff as fallback. Verified live as `demo-student` on the demo course (ready received, no editing, navbar + tabs hidden, course index kept, 8 activities). CLAUDE.md §4.8/§5.4 rewritten; D-121. The `nest start --watch` watcher missed the change again — restarted the API by hand. **Next:** the user's test → push + PR (the branch now carries TAM-139, 131, 132 entity half, 134, 136 and the fixes); TAM-142 and TAM-144 queued; Arabic pack download still pending.

### 2026-08-25 — Player layout and previous/next (D-122, TAM-146) — on `feature/tam-139-entity-content-embed`

The player became "the course is the page": full-height frame in the main column, a sticky context panel beside it (compact strip under `lg`), Moodle's own course heading hidden in learner mode. Then previous/next: outline endpoint + `cmid` in the plugin's ready message + `navigate` on the frame component; the panel follows the frame. Verified live and by tests. **Next:** the user's test → push + PR; TAM-142, TAM-144 queued; Arabic pack pending.
