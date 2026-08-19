# Phase 1 — Assessment (RIASEC) + path core

Implements CLAUDE.md Phase 1 in full, against the mock LMS. Five commits on `main` @ `b478327`.

**Do not merge without reading §"What to check first".** CI has run exactly once before (the Phase 0 PR); this is its second run.

---

## What was built

| Area          | What                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Scoring**   | Per-dimension tally → ranked profile of all six letters → top-three Holland Code, persisted with all six scores                                        |
| **Content**   | 30 Arabic Likert items, five per dimension, seeded as data with stable keys                                                                            |
| **Catalogue** | 12 paths (two per RIASEC letter), 48 mock courses, `path_courses` many-to-many                                                                         |
| **API**       | `/api/assessment{,/result,/submit}` · `/api/paths{,/:id}` · `/api/courses{,/:id}` · `/api/my-path{,/select,/courses,/confirm}` · `/api/dashboard`      |
| **Web**       | Assessment flow · Results & gold ranking · Path build + commitment gate · Catalogue + course detail · My Path · Dashboard (3 states) · minimal Profile |

## "Done when" (CLAUDE.md §7)

> _A user can take the assessment, get a correct Holland Code, see correctly-gold-highlighted-and-ranked paths, pick one, build a 5–10 course path, confirm it (hard commit), and see it in My Path — entirely against the mock. Dashboard reflects all three states. Retake works only pre-commitment._

Satisfied, and asserted end to end by `apps/web/e2e/journey-happy-path.spec.ts`, which drives a real browser through registration → verification → sign-in → 30 questions → results → build → confirm → My Path against the built apps, real PostgreSQL and a real SMTP sink.

## How it was tested

| Suite                 |   Count | Against                                       |
| --------------------- | ------: | --------------------------------------------- |
| `packages/types` unit |      38 | —                                             |
| API unit              |     189 | —                                             |
| Web unit              |     128 | jsdom                                         |
| API integration       |      90 | real PostgreSQL + mock LMS                    |
| Browser e2e           |      14 | Chromium, built apps, real Postgres + Mailpit |
| **Total**             | **459** |                                               |

`format:check`, `lint`, `typecheck` and `build` clean. No skipped tests.

The user additionally ran the built application by hand and approved it.

## What to check first

Three things are worth a reviewer's attention because they are where the product rules actually live.

**1. The scoring key never reaches the browser.** `AssessmentService.getActive` selects questions and options _without_ their weights. An integration test greps the entire response for `weight`, `dimension`, `points` and `riasec`; the e2e suite has to read weights out of the database to produce a chosen Holland Code. An assessment whose scoring key is visible in a network response is one a user can steer toward whichever result they already wanted, which would make every recommendation downstream theatre.

**2. Single-path is a database constraint, not a convention.** `user_paths.user_id` is unique, and `confirm()` re-counts inside the transaction and guards on `confirmedAt IS NULL` in the `UPDATE … WHERE` — so two concurrent confirms cannot both succeed, and the 5–10 rule is checked against the row that gets written rather than a snapshot.

**3. Ties are deterministic (D-031).** Six dimensions over thirty items produce ties routinely. Left to `Array.sort`, a user's code would depend on row order from the database — the same answers could yield a different career recommendation on a different day. Canonical R-I-A-S-E-C makes the ordering total.

## Defects found during verification

Each is fixed and now carries the test that would have caught it earlier.

- **Empty array flattened to `null`.** The `{}`→`null` normalisation in the API client also converted an empty _array_, so an empty catalogue never reached its empty state and rendered a heading above nothing. Caught by the catalogue e2e.
- **Mock LMS id collision.** The mock numbered users from a per-process counter, so after an API restart it handed a new user an id an existing `users` row already held and enrolment died on the `moodle_user_id` unique index. Ids now derive from the email — the invariant a real Moodle has — and `describeLmsContract` asserts stability across instances, so the Phase 2 adapter is held to it too.
- **`PathCard` announced everything twice.** A visually-hidden `<dt>` beside each value made a screen reader say _"دورة متاحة، 11 دورة متاحة"_.
- **Three visual defects** only found by driving the built app: the modal pinned to the top of the viewport (Tailwind's preflight zeroes the `margin:auto` the UA stylesheet centres a `<dialog>` with), the progress track invisible at 0% (cream on white), and course detail printing its title twice.

## Decisions recorded

`decisions.md` D-031 … D-037: tie-breaking · the balanced question bank · append-only results · where the RIASEC rules live · schema constraints as rules · LMS identity and best-effort enrolment · frontend shape. D-030's mock is revised (deterministic ids).

## Known gaps, stated plainly

- **Profile is read-only.** §4.12's change-password, email re-verification and language switch are not Phase 1 deliverables and are not built. The page exists because §4.2 puts Profile in the pre-assessment nav, so that link must lead somewhere real.
- **Certificates and CV are absent from the navigation** until Phase 3 builds them. Deliberate — a nav item leading nowhere advertises what the product cannot do.
- **`courseUrl` points at the mock (`localhost:8080`) and does not resolve.** Expected until Phase 2.
- **A confirmed path can exist without its LMS enrolments.** Enrolment is best-effort _after_ the commitment is recorded, because failing the request would tell a user their irreversible decision did not take when it did. Failures are audited; Phase 2's sync job owns reconciliation.
- **My Path reads live LMS progress but never writes it back.** Persisting completions is Phase 2's job; two writers on those rows would be a race.
- **The Arabic question wording is a reviewed first draft.** Keys are stable, so revisions need no migration.
- **Narrow-viewport layout still unverified** — carried from Phase 0, owned by the Phase 6 accessibility/responsive pass.

## Notes for the reviewer

- One migration: `20260817133909_phase_1_assessment_paths_courses`. `npm run db:seed` is idempotent and safe to re-run.
- `schema.spec.ts`'s "no product tables" block is replaced by positive assertions on the Phase 1 shapes; the later-phase guard now covers `Completion`, `Certificate`, `CvProfile` and `Enrollment`.
- The API `tsconfig` now includes `prisma/` so the seed script is typechecked; `tsconfig.build.json` excludes it again so `dist/main.js` does not move.

Linked entry: `progress.md` → **2026-08-18 — Phase 1 complete; PR opened for review**.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
