# English (CEFR) placement assessment

Adds a second assessment instrument alongside the Holland/RIASEC one: thirty
multiple-choice questions across grammar, vocabulary, reading and practical
English, spanning A1–C2, scored to a single CEFR level.

**The Holland assessment is not modified.** No file under §4C.3 changes, no
RIASEC query changes, and `admin-assessment.test.tsx` runs unaltered — see
_Holland is provably intact_ below.

Sub-phases E.1–E.4, five commits, on `english-assessment`.
`progress.md` entries: 2026-08-30 (×5, newest first).

---

## What was built

### The product decision (D-123)

The English test is **independent, optional and taken once**. It is takeable at
any time from a dashboard card in every dashboard state, produces a standalone
CEFR level shown on the dashboard and Profile, and **does not gate path
selection** — Holland alone drives recommendation. There is no retake: a
learner's one result is final.

What that shape costs the existing journey: `DashboardState` gains no fourth
member, `navForState` gains no branch, `JourneyStateService` gains no fact, path
confirmation gains no gate, and no learner nav item is added. The only change to
an existing shared contract is **one nullable `englishLevel` on `DashboardView`**.

### E.1 — Data model and scoring engine

Six sibling tables (`english_assessments` / `_questions` / `_options` / `_bands`
/ `_results` / `_responses`), `CefrLevel` and `EnglishSkill` enums, and a
hand-written migration carrying the Holland instrument's copy-on-write semantics
verbatim — including the per-key partial unique indexes for one ACTIVE and one
DRAFT.

**Why sibling tables rather than a `kind` discriminator (D-124).** This was not a
style preference. `AssessmentService.getActive`, `AdminAssessmentService.createDraft`
and `requireDraft` all call `findFirst({ where: { status: 'ACTIVE' } })` — or
`'DRAFT'` — **with no filter on `key`**, and `overview()` reads the whole table.
The partial unique indexes are per-key, so the _database_ would accept a second
ACTIVE instrument quite happily and the _code_ would then serve whichever row
Postgres returned first as the learner's Holland assessment. Making those queries
key-aware means editing the live RIASEC path. Separate tables make "Holland is
unchanged" a property of the diff rather than a claim about care.

**What English adds that Holland lacks:** `options.is_correct` and
`questions.marks`. Marks sit on the _question_, not the option, because exactly
one option scores and the rest score nothing — on the option it would invite a
bank where two options are worth different amounts of "correct".

**The balance rule is deliberately absent.** `assessEnglishBank` does not import,
call or modify `isBalancedBank` or `assessBank`. D-032 protects a comparison
_across_ six dimensions; English has one scale, and an item worth four marks is
difficulty weighting doing its job. What takes its place is the rule English
actually has — **the band table must partition `0 … maxScore` exactly**.

### E.2 — Learner flow and result

`EnglishAssessmentModule` (get / result / submit, `@Roles('EMPLOYEE')`), the
taking flow reusing the Holland presentation shape and its per-tab draft, and the
CEFR result page. `JourneyModule` is deliberately **not** imported: the test
gates on nothing and is gated by nothing, and not importing it is what keeps that
true as both grow.

**The absence rule carries further than Holland's.** `getActive` omits
`isCorrect` (the answer key outright) _and_ `marks` _and_ each item's CEFR level.
Neither of the latter is the key, but both let a taker triage, and a placement
test is only useful if it measures unaided ability across the whole range.

**"Taken once" is enforced twice, on purpose.** A read-then-refuse gives the
clear audited 409; the unique index on `user_id` catches the race no
read-then-write can, and its `P2002` is answered _identically_ — a caller must
not be able to tell them apart, since the second request did nothing either way.

The result page offers **no retake control at all**. Absence, not a disabled
button.

### E.3 — Admin editor at `/admin/english` (§4C.9)

A parallel surface to §4C.3, not a retrofit: `AdminEnglishService` imports nothing
from `AdminAssessmentService` and vice versa. Version overview with the
frozen-results notice, draft→publish over copy-on-write (bands copied alongside
the questions), per-question text / level / skill / marks, the correct answer, and
the band-threshold editor.

The controller joins `ADMIN_CONTROLLERS`, which `AdminModule` registers **and**
`admin-rbac.e2e-spec.ts` enumerates — so all thirteen admin routes are covered
against employee, entity and anonymous callers the moment they are routable.

**Two invalid states are made unreachable rather than merely refused, and both
guards stay in the gate anyway (D-127).** Marking an option correct clears its
siblings server-side (radio semantics), and the band editor exposes **five
ceilings, not twelve bounds** — A1 starts at 0, each band starts one above the
previous ceiling, C2 is pinned to the attainable total, so gaps and overlaps are
not representable. The blockers remain in `assessEnglishBank` precisely because
they are now unreachable through the UI: they guard rows arriving another way — a
seed, an import, a hand-run SQL fix during an incident — and nothing else would
catch those.

**The bands live on the version, not in `settings` (D-125).** A band table is
what turns a raw total into the level a person is told they are. Held globally,
moving the B2 boundary would silently re-interpret every result ever issued — the
exact gap copy-on-write exists to close. Held on the version, they are frozen
with it, so "38 out of 60 meant B2" stays true afterwards.

### E.4 — The thirty seeded questions

Five items per CEFR level, at least one reading and one practical item at every
level, seeded as editable data. **Marks rise with the level** (1/1/2/2/3/3 —
sixty in total) and the seeded band table partitions 0–60. Items run in ascending
level order, where the RIASEC bank deliberately interleaves: opening with C2
grammar makes a genuine A2 speaker give up on a test that was about to place them
correctly.

The seed **bootstraps but does not maintain** (D-083): once §4C.9 has published an
edit, re-running it leaves every row alone and says so.

**A defect found in the authored content and fixed.** Every item was written with
its correct answer as the **first option** — which is how a human reviews an
answer key, and a catastrophe if seeded that way: a taker who noticed would score
60/60 without a word of English, and every structural property would still have
held. The stored bank now rotates each item's options by its index —
deterministic, never random, because a shuffled seed would put the answer
somewhere new on every run, so a stored response could not be re-read against the
bank that produced it.

---

## How it was tested

**Automated: 750 API unit (46 suites) · 865 web component (61 files) · 51 shared
types — all green.** Typecheck, lint and prettier clean across all three
workspaces. `messages.test.ts` (158 assertions) passes, so every new audit code
has Arabic copy and the catalogue is still free of Latin letters and bare digits.

The tests assert properties rather than rendering:

- **Scoring:** every internal band boundary from both sides, both ends of the
  scale, a single-score band (a half-open reading would make B2 unreachable _with
  no symptom_), an uncovered score refused rather than defaulted to a level, and
  all four submission refusals.
- **The publish gate:** every way a band table can fail to be a partition, that
  one fault is named for one mistake, and that a table ordered by number rather
  than by CEFR level is rejected.
- **The learner flow:** the answer key never reaches the DOM, a learner holding a
  result is redirected rather than offered a second attempt, the draft resumes
  across a remount and is discarded when the bank changes, and the result page
  has no button at all.
- **The admin editor:** the five-ceiling shape, contiguity across the whole
  derived table, publish refused with its blocker named in the dialog, publish
  allowed past a warning that names the missing levels.
- **The seeded content:** exactly one correct option per item, every one of the
  sixty-one attainable scores in exactly one band, the bank passing the gate with
  no blockers _and no warnings_, and the correct answer's distribution across
  positions.

**Manual, against a live stack.** The migration was applied to a **populated**
development database (206 existing Holland results) and the seed run for real,
then the loop exercised over HTTP:

- `english-cefr` v1 ACTIVE · 30 questions · 6 bands; bands
  `A1 0-14 | A2 15-24 | B1 25-34 | B2 35-44 | C1 45-53 | C2 54-60`; attainable
  total 60; **30/30 questions with exactly one correct option**; correct-answer
  positions `{1:8, 2:8, 3:7, 4:7}`.
- Sign in → `GET /api/english-assessment` returns 30 questions with **no
  `isCorrect`, no `marks`, no level** (grepped over the whole body) → submit 20
  correct → **30/60 → B1**, `canRetake: false` → second submit **409
  `ENGLISH_ASSESSMENT_ALREADY_TAKEN`**. The answer key had to be read out of the
  database to build that submission, which is the property being demonstrated.

### Holland is provably intact

- **No file under §4C.3 changed**; `admin-assessment.test.tsx` and
  `bank-readiness.spec.ts` run unaltered.
- A test in `english-bank-readiness.spec.ts` asserts the **seeded RIASEC bank
  still passes `assessBank` balanced with no blockers** — where a stray import
  would surface.
- A test in `admin-english.test.tsx` asserts **no RIASEC concept or endpoint is
  reachable from the English screen**.
- **Live, side by side:** `GET /api/assessment` still returns
  `تقييم الميول المهنية`, 30 Arabic RIASEC items, version 1, with no weight,
  dimension or points in the payload — **with a second ACTIVE instrument present
  in the system**. That is the precise failure D-124 was written to prevent, now
  demonstrated rather than only argued. `riasec-core` v1 remains ACTIVE with its
  206 results untouched.

### Not done in this PR

**E.5 is outstanding.** API integration specs for the sixteen new routes (thirteen admin, three learner) (the
RBAC suite covers them structurally today) and the browser e2e for
admin-edits → learner-takes are not written. The manual run above covers the same
ground by hand but is not repeatable in CI.

---

## Decisions recorded

D-123 (independent, optional, taken once) · D-124 (sibling tables, with the
`findFirst`-without-key-filter evidence) · D-125 (bands on the version; the
partition rule replaces balance) · D-126 (the CEFR code is shown where the RIASEC
letter is not) · D-127 (make the invalid state unreachable in the editor; keep the
guard in the gate).

CLAUDE.md gains §4.13 and §4C.9 — **not yet written**; flagged below.

## Reviewer notes

- **One existing test was changed.** `dashboard.test.tsx`'s "offers the assessment
  as the single primary action" asserted a raw count of **one link** on the
  pre-assessment dashboard. The English card adds a second by design. The count
  was never the rule — §4.2's rule is one _primary_ action — so it now asserts
  that directly: exactly one filled (`bg-primary-600`) link, which is the career
  assessment, and the only other link named explicitly. No Holland behaviour
  changed.
- **A numbering drift, noticed not fixed.** The Phase 5 assessment code comments
  cite D-069/D-070/D-071 for copy-on-write / draft-then-publish / the balance
  guard. Those are pre-rebase numbers; `decisions.md` renumbered them
  D-072/D-073/D-074, and D-069 is now the Platforms Code design system. Correcting
  the comments touches live Holland files, so it is left for a separate change.
- **CLAUDE.md is not yet amended** with §4.13 (the learner-facing English
  assessment) and §4C.9 (its admin surface). Both are referenced throughout the
  code comments. Worth doing before merge if the reviewer prefers the spec to lead
  the code.

## Entity authoring guide

- [ ] This PR touches `moodle-plugin/`, the entity Content page, or publish
      readiness — I re-read the affected section(s) of
      [`docs/entity-authoring-guide.md`](../docs/entity-authoring-guide.md)
      and updated it if the editor's behaviour changed (TAM-134).
- [x] N/A — this PR touches none of the above.
