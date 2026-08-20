# Phase 4 — Entity / reviewer portal

Implements CLAUDE.md §4B in full, under the §4A authoring model. An entity creates a course, authors its content in Moodle through the existing handoff, sets the product metadata our app owns, publishes it into the learner catalogue, and reviews only its own learners — with data scoping and course-edit protection enforced server-side.

Branch: `phase-4-entity-portal`, off `origin/main` @ `f2a6b4d`. Five commits, one per checkpoint.

---

## The defect this phase found first

`courses.status` held two facts in one column: **what the LMS says about a course**, and **what we have decided about it**. Catalogue sync recomputed it from Moodle's `visible` flag on every run and protected only `RETIRED` — so an entity who hid a course would have had it flipped back to `AVAILABLE` by the next scheduled sync. Silently, minutes later, with their decision recorded nowhere to appeal to.

Everything else here rests on fixing that (**D-059**):

| column | owner | written by |
|---|---|---|
| `publication` (`DRAFT`/`PUBLISHED`/`UNPUBLISHED`) | ours | entity or admin only |
| `lms_visible`, `lms_present` | the LMS's | sync only |
| `status` | **derived** | nobody — one pure function |

`effectiveCourseStatus` combines all three plus whether a learner holds the course. **There is no combination of inputs in which a course a learner holds becomes invisible to that learner** — §2/D-015's course-edit protection is now a property of the derivation rather than a check someone has to remember. A unit test asserts it across every combination.

This deliberately **revises D-040**'s "a RETIRED course is not resurrected by the LMS" sub-rule, which existed only because `status` was the sole place a human decision could live. It now lives in `publication`, where the LMS cannot reach it.

The migration needed care in two ways: PostgreSQL 12+ refuses to *use* a new enum value in the transaction that added it (split into two migrations), and `publication` defaults to `DRAFT` — taking that default would have withdrawn all 48 existing courses from every learner the moment it ran. The backfill marks existing rows `PUBLISHED` with LMS flags chosen to reproduce each row's current status exactly. Verified against the live database: 47 `AVAILABLE`, 1 `HIDDEN_BUT_COMPLETABLE`, unchanged.

## What was built

**RBAC, finally enforced (D-062, closing D-027).** `RolesGuard` shipped in Phase 0 and `grep` found `@Roles` only in its own definition — so until now an `ENTITY` account could take the assessment, build a path and confirm it. Every learner controller now declares `@Roles('EMPLOYEE')`, the entity controller `@Roles('ENTITY', 'SUPER_ADMIN')`. Applying it at class level exposed a second problem: class metadata reaches `@Public()` routes, and decorating `CertificatesController` would have taken the **public certificate verification page** offline for third parties who have no account at all. `RolesGuard` now honours `@Public()` first.

Scope is a separate mechanism, in the service layer: `EntityScopeService` builds the `where` fragment, **fails closed** when an `ENTITY` account has no organisation, and reports another entity's course as *absent* rather than *forbidden* (a 403 confirms the id exists). The filter is an equality on the caller's own id — never "anything with an owner" — so the seeded courses nobody authored stay invisible to every entity.

**The LMS port gained exactly two methods (D-060, D-061).** `createCourse`, because our `courses.moodle_course_id` is non-null and unique and sync withdraws any row the LMS stops returning — a database-only draft is not a lighter shell, it is a row that self-destructs. And `getCourseContentSummary`, which reports whether completion criteria are actually configured. That is the **D-042 dead end** — a course reporting `completed: false` forever, so nobody on it can pass and no certificate can ever issue — caught before publication rather than weeks later through a confused learner.

**The `local_tamkeensso` plugin is untouched.** The obvious change was a `target` claim to land on `/course/edit.php`; it was not worth enlarging the custom-PHP surface still awaiting ministry approval (D-044) to save a click. The entity lands on the course page and uses Moodle's own Edit mode, with an `editingteacher` enrolment conferring the capability.

**The publish gate refuses rather than warns**, and returns *every* blocker at once — one problem per click makes an entity fix, click, fix, click. It fails closed on an unreachable LMS: "we could not confirm this is completable" is not "it is completable", and the costs are asymmetric.

**Withdrawing cannot strand a learner**, and not because of a check — the derivation degrades a held course to `HIDDEN_BUT_COMPLETABLE`. What the endpoint *does* owe the entity is honesty, so it returns the resulting status and the number of learners still holding the course, and the confirmation dialog says so before they commit.

**Review shows name, department, progress and grade — nothing else (D-064).** The query starts from scoped courses and reaches learners through them rather than the reverse, so it cannot name a learner outside the entity's own courses. Passing is re-derived from `completions`, never from the course status — the D-054 defect, which would otherwise call a failing learner "passed".

**A course's RIASEC letters are derived from its paths (D-066).** §3A makes the path the owner of the letter; a stored copy could contradict it and nothing downstream would notice, since the gold recommendation never reads a course's letter. The metadata endpoint rejects a `riasecLetter` field outright.

**Frontend:** an `(entity)` route group with its own provider (D-065), role-based sign-in routing, and the six §4B pages. Course titles carry their own `dir`/`lang` — without it an English title inside the RTL column has its punctuation rearranged, which is correctness rather than polish.

## How it was tested

**998 automated tests**, all passing. Typecheck, lint and format clean. **No new dependencies.**

| suite | count |
|---|---|
| API unit | 529 |
| Web component | 247 |
| API integration (real PostgreSQL) | 190 |
| Browser e2e (Chromium) | 32 |

The Phase 4 browser suite runs **three sessions**: an entity, a learner holding the borrowed course, and a learner holding nothing. The third exists because §2/D-015 says two things at once — a withdrawn course leaves the catalogue for new selections *and* stays completable for whoever already holds it — and one learner can only prove half. The first draft of that test asserted the wrong half; the app was right and the test was wrong.

Proven in a browser: role-based routing, the publish gate refusing a bare shell with every reason, the D-042 dead end named on the screen of the person who can fix it, the RIASEC letters following the path, the handoff URL never appearing in the DOM, both halves of course-edit protection, and no learner email or employee ID on the review screen. Proven against a real database: unpublish → **run a real catalogue sync** → the course stays withdrawn, which is D-059 closed rather than asserted.

Three tests that were passing for the wrong reason were fixed rather than left: a wholesale `api-client` mock dropped `ApiError` so every failure translated as `UNKNOWN_ERROR`; a save-confirmation assertion passed on timing luck; and a percentage assertion used a literal `"88%"` where the shared formatter emits bidi marks.

**A real bug the browser found:** `DataView` showed its loading state on *every* refetch rather than only the first, so saving metadata unmounted the whole view and the confirmation vanished the instant it was earned — taking any half-typed field with it.

**The contract suite earned its keep for the third time**, catching `MockLmsService.createCourse` throwing synchronously where the real adapter rejects, which would have escaped a caller's `.catch()` entirely.

## "Done when" (CLAUDE.md §7, Phase 4)

> An entity can create a course, author its content in Moodle via handoff, set its path + RIASEC + product metadata, publish it so it appears in the learner catalog, and review only its own learners' progress.

All satisfied, and each is exercised in the browser suite. Objectives and prerequisites become entity-editable here, closing what D-035 owed; entity data-scoping closes what D-027 owed.

## Decisions recorded

D-059 (publication/visibility split — revises D-040) · D-060 (shell in the LMS, `editingteacher`, plugin untouched) · D-061 (publish gate refuses) · D-062 (`@Roles` + scoping as a query filter) · D-063 (`entities` model, nullable ownership) · D-064 (what an entity may see about a learner) · D-065 (own route group, role-based routing) · D-066 (RIASEC derived from paths).

## Needs a human before production

- **`MOODLE_TEACHER_ROLE_ID` (3) and `MOODLE_COURSE_CATEGORY_ID` (1) are Moodle's stock values, not the ministry's.** Both are per-instance. A wrong teacher role hands an outside organisation capabilities nobody intended.
- **`core_course_create_courses` and `core_course_get_contents` have not run against a real Moodle** — the Phase 2 spike predates them.
- **Ministry approval of custom Moodle plugins is still unconfirmed** (D-044). Unchanged by this phase, deliberately.
- **Entity accounts are created by a seed, not a screen** — §4C.2 gives the super-admin that in Phase 5.

Progress entry: `progress.md` → "2026-08-20 — Phase 4 complete".
