# Phase 4 — Entity / reviewer portal

Implements CLAUDE.md §4B in full, under the §4A authoring model. An entity creates a course, authors its content in Moodle through the existing handoff, sets the product metadata our app owns, publishes it into the learner catalogue, and reviews only its own learners — with data scoping and course-edit protection enforced server-side.

Branch: `phase-4-entity-portal`, off `origin/main` and merged up to `d2e0506` — the landing page (PR #5) landed while this branch sat unpushed and touches the same `ar.json` and `api-client.ts`, so it was merged in rather than left to GitHub: the suite backing this work should run against what it will actually land on.

Five checkpoint commits, plus five from a verification pass that found four more defects (below).

---

## The defect this phase found first

`courses.status` held two facts in one column: **what the LMS says about a course**, and **what we have decided about it**. Catalogue sync recomputed it from Moodle's `visible` flag on every run and protected only `RETIRED` — so an entity who hid a course would have had it flipped back to `AVAILABLE` by the next scheduled sync. Silently, minutes later, with their decision recorded nowhere to appeal to.

Everything else here rests on fixing that (**D-059**):

| column                                            | owner       | written by                 |
| ------------------------------------------------- | ----------- | -------------------------- |
| `publication` (`DRAFT`/`PUBLISHED`/`UNPUBLISHED`) | ours        | entity or admin only       |
| `lms_visible`, `lms_present`                      | the LMS's   | sync only                  |
| `status`                                          | **derived** | nobody — one pure function |

`effectiveCourseStatus` combines all three plus whether a learner holds the course. **There is no combination of inputs in which a course a learner holds becomes invisible to that learner** — §2/D-015's course-edit protection is now a property of the derivation rather than a check someone has to remember. A unit test asserts it across every combination.

This deliberately **revises D-040**'s "a RETIRED course is not resurrected by the LMS" sub-rule, which existed only because `status` was the sole place a human decision could live. It now lives in `publication`, where the LMS cannot reach it.

The migration needed care in two ways: PostgreSQL 12+ refuses to _use_ a new enum value in the transaction that added it (split into two migrations), and `publication` defaults to `DRAFT` — taking that default would have withdrawn all 48 existing courses from every learner the moment it ran. The backfill marks existing rows `PUBLISHED` with LMS flags chosen to reproduce each row's current status exactly. Verified against the live database: 47 `AVAILABLE`, 1 `HIDDEN_BUT_COMPLETABLE`, unchanged.

## What was built

**RBAC, finally enforced (D-062, closing D-027).** `RolesGuard` shipped in Phase 0 and `grep` found `@Roles` only in its own definition — so until now an `ENTITY` account could take the assessment, build a path and confirm it. Every learner controller now declares `@Roles('EMPLOYEE')`, the entity controller `@Roles('ENTITY', 'SUPER_ADMIN')`. Applying it at class level exposed a second problem: class metadata reaches `@Public()` routes, and decorating `CertificatesController` would have taken the **public certificate verification page** offline for third parties who have no account at all. `RolesGuard` now honours `@Public()` first.

Scope is a separate mechanism, in the service layer: `EntityScopeService` builds the `where` fragment, **fails closed** when an `ENTITY` account has no organisation, and reports another entity's course as _absent_ rather than _forbidden_ (a 403 confirms the id exists). The filter is an equality on the caller's own id — never "anything with an owner" — so the seeded courses nobody authored stay invisible to every entity.

**The LMS port gained exactly two methods (D-060, D-061).** `createCourse`, because our `courses.moodle_course_id` is non-null and unique and sync withdraws any row the LMS stops returning — a database-only draft is not a lighter shell, it is a row that self-destructs. And `getCourseContentSummary`, which reports whether completion criteria are actually configured. That is the **D-042 dead end** — a course reporting `completed: false` forever, so nobody on it can pass and no certificate can ever issue — caught before publication rather than weeks later through a confused learner.

**The `local_tamkeensso` plugin is untouched.** The obvious change was a `target` claim to land on `/course/edit.php`; it was not worth enlarging the custom-PHP surface still awaiting ministry approval (D-044) to save a click. The entity lands on the course page and uses Moodle's own Edit mode, with an `editingteacher` enrolment conferring the capability.

**The publish gate refuses rather than warns**, and returns _every_ blocker at once — one problem per click makes an entity fix, click, fix, click. It fails closed on an unreachable LMS: "we could not confirm this is completable" is not "it is completable", and the costs are asymmetric.

**Withdrawing cannot strand a learner**, and not because of a check — the derivation degrades a held course to `HIDDEN_BUT_COMPLETABLE`. What the endpoint _does_ owe the entity is honesty, so it returns the resulting status and the number of learners still holding the course, and the confirmation dialog says so before they commit.

**Review shows name, department, progress and grade — nothing else (D-064).** The query starts from scoped courses and reaches learners through them rather than the reverse, so it cannot name a learner outside the entity's own courses. Passing is re-derived from `completions`, never from the course status — the D-054 defect, which would otherwise call a failing learner "passed".

**A course's RIASEC letters are derived from its paths (D-066).** §3A makes the path the owner of the letter; a stored copy could contradict it and nothing downstream would notice, since the gold recommendation never reads a course's letter. The metadata endpoint rejects a `riasecLetter` field outright.

**Frontend:** an `(entity)` route group with its own provider (D-065), role-based sign-in routing, and the six §4B pages. Course titles carry their own `dir`/`lang` — without it an English title inside the RTL column has its punctuation rearranged, which is correctness rather than polish.

## How it was tested

**1012 automated tests**, all passing. Typecheck, lint and format clean. **No new dependencies.**

| suite                             | count |
| --------------------------------- | ----- |
| API unit                          | 530   |
| Web component                     | 256   |
| API integration (real PostgreSQL) | 192   |
| Browser e2e (Chromium)            | 34    |

The Phase 4 browser suite runs **three sessions**: an entity, a learner holding the borrowed course, and a learner holding nothing. The third exists because §2/D-015 says two things at once — a withdrawn course leaves the catalogue for new selections _and_ stays completable for whoever already holds it — and one learner can only prove half. The first draft of that test asserted the wrong half; the app was right and the test was wrong.

Proven in a browser: role-based routing, the publish gate refusing a bare shell with every reason, the D-042 dead end named on the screen of the person who can fix it, the RIASEC letters following the path, the handoff URL never appearing in the DOM, both halves of course-edit protection, and no learner email or employee ID on the review screen. Proven against a real database: unpublish → **run a real catalogue sync** → the course stays withdrawn, which is D-059 closed rather than asserted.

Three tests that were passing for the wrong reason were fixed rather than left: a wholesale `api-client` mock dropped `ApiError` so every failure translated as `UNKNOWN_ERROR`; a save-confirmation assertion passed on timing luck; and a percentage assertion used a literal `"88%"` where the shared formatter emits bidi marks.

**A real bug the browser found:** `DataView` showed its loading state on _every_ refetch rather than only the first, so saving metadata unmounted the whole view and the confirmation vanished the instant it was earned — taking any half-typed field with it.

**The contract suite earned its keep for the third time**, catching `MockLmsService.createCourse` throwing synchronously where the real adapter rejects, which would have escaped a caller's `.catch()` entirely.

## The verification pass, and the four defects it found

The phase was already green at 998 tests. A pass that set out to break it found four things, none of which those tests could see.

**An entity on any learner page reached a dead end (D-067).** D-065 claimed "each provider redirects a caller who does not belong to it". It was half true — the entity portal returned a mis-routed employee, and the learner portal left a mis-routed entity on the generic error card with a retry that could never succeed, which is the one state §2B says no data view may rest in. The cause is this phase's own doing: applying `@Roles` made the journey dashboard answer **403** rather than 401, so nothing above it read the failure as a routing problem. Found by driving the merged build in a browser, not by a test. Both directions are now asserted, including on `/`, since that path is also the public landing page and the redirect must not disturb it.

**The mock LMS reissued a course id after a restart (D-068).** It surfaced as a 500 in the _first_ test of the entity suite, nowhere near its cause. The mock's state dies with the process; the rows it seeded do not, and `courses.moodle_course_id` is UNIQUE — so any course outliving its process made the next creation collide. `idFor` had already fixed exactly this for user ids and explains why in its own comment; course ids kept the counter anyway. Both now derive from a natural key through one helper, and the property is pinned in the **shared LMS contract**, not the mock's own spec: the real adapter gets it free from Moodle's database, which is what makes it a property of the port. **Fourth time** the mock has been easier to satisfy than reality (D-036, D-045, D-060).

**`published_at` asked the wrong question.** It was set only when the course was currently a `DRAFT`, so a course withdrawn before it was ever published reached `PUBLISHED` with no date — permanently, since the condition never comes true again. The endpoint allows that withdrawal and no screen offers it, but the state is reachable and was reproduced against a running API. It now asks whether the column is null, which is the fact it records. Nothing renders the field yet; §4C.5 will, and a column silently wrong until the screen that reads it exists is a defect delivered with a delay.

**An e2e fixture blamed the wrong code.** It lends the test entity `MAX(moodle_course_id)` among unowned courses, meaning the last catalogue course — but created courses are numbered above the catalogue, so one left behind became the borrowed course instead, and the suite failed on the publish bridge, which was not at fault. Bounded below the created range, and proven with two consecutive full runs holding a created course in the database throughout.

Also re-checked and correct: every controller carries `@Roles`; `courses.status` has exactly three writers and all go through `effectiveCourseStatus`; the migration backfill still reads 47 `AVAILABLE` + 1 `HIDDEN_BUT_COMPLETABLE` against the live database; the six entity pages render RTL Arabic with no console errors and no failed requests.

## "Done when" (CLAUDE.md §7, Phase 4)

> An entity can create a course, author its content in Moodle via handoff, set its path + RIASEC + product metadata, publish it so it appears in the learner catalog, and review only its own learners' progress.

All satisfied, and each is exercised in the browser suite. Objectives and prerequisites become entity-editable here, closing what D-035 owed; entity data-scoping closes what D-027 owed.

## Decisions recorded

D-059 (publication/visibility split — revises D-040) · D-060 (shell in the LMS, `editingteacher`, plugin untouched) · D-061 (publish gate refuses) · D-062 (`@Roles` + scoping as a query filter) · D-063 (`entities` model, nullable ownership) · D-064 (what an entity may see about a learner) · D-065 (own route group, role-based routing) · D-066 (RIASEC derived from paths) · **D-067** (both providers correct a mis-routed account; 403 is why the second was missing) · **D-068** (every mock LMS id derives from a natural key, never a counter).

## Needs a human before production

- **`MOODLE_TEACHER_ROLE_ID` (3) and `MOODLE_COURSE_CATEGORY_ID` (1) are Moodle's stock values, not the ministry's.** Both are per-instance. A wrong teacher role hands an outside organisation capabilities nobody intended.
- **`core_course_create_courses` and `core_course_get_contents` have not run against a real Moodle** — the Phase 2 spike predates them.
- **Ministry approval of custom Moodle plugins is still unconfirmed** (D-044). Unchanged by this phase, deliberately.
- **Entity accounts are created by a seed, not a screen** — §4C.2 gives the super-admin that in Phase 5.

Progress entries: `progress.md` → "2026-08-20 — Phase 4 complete" and "2026-08-22 — Phase 4 verification pass".

One thing left open on purpose: eight API error codes have no Arabic entry (`CV_INVALID_DATE`, `CERTIFICATE_NOT_FOUND` among them). All are Phase 3's, all fall back to the generic Arabic message rather than a crash or a raw code, and none is Phase 4's to widen — **Phase 6**'s Arabic content QA owns them.
