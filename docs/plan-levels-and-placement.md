# Change plan — paths, levels, per-path assessment, course placement

> Status: **awaiting approval**. Nothing in this plan has been implemented.
> Audit and plan produced 2026-09-09. Implements the D-130 pivot's structural half.
> Proposed decision number: **D-134**. Proposed branch: `feature/d134-levels-and-placement`.

## 0. The eight decisions this plan is built on

Answered in session, 2026-09-09:

| #   | Question                                                   | Answer                                               |
| --- | ---------------------------------------------------------- | ---------------------------------------------------- |
| 1   | Per-path assessment, or keep the two global instruments?   | **Per-path assessment (the spec).**                  |
| 2   | What happens to `paths.riasec_letter` and recommendations? | **Retired in this work.**                            |
| 3   | How does a learner get a path?                             | **The ministry assigns it, possibly more than one.** |
| 4   | Approval vs placement on the join table?                   | **Placement replaces approval.**                     |
| 5   | May an entity unassign its own course?                     | **Only while the course is unassigned.**             |
| 6   | May a course sit in several paths?                         | **Yes, with a numeric cap (a system setting).**      |
| 7   | What does a placed learner see?                            | **All levels, theirs marked.**                       |
| 8   | Existing data?                                             | **Reset and reseed the dev database.**               |

Together these retire the Holland instrument, the recommendation model, the 5–10 build,
the one-path ceiling, the membership-approval queue and last week's instrument assignment
(D-132/D-133). That is the intended reading of the pivot, not an overreach — but it is
large, and §7 lists exactly what dies.

---

## 1. Schema

### 1.1 New

```prisma
enum PathStatus { DRAFT PUBLISHED }

model Level {
  id       String @id @default(uuid()) @db.Uuid
  pathId   String @map("path_id") @db.Uuid
  path     Path   @relation(fields: [pathId], references: [id], onDelete: Cascade)
  name     String
  position Int

  pathCourses PathCourse[]
  bands       AssessmentBand[]
  placements  LearnerPlacement[]

  @@unique([pathId, position])
  // Referenced by the composite FK below, which is what makes
  // "a level of the same path" a database fact rather than a service check.
  @@unique([id, pathId])
  @@map("levels")
}

model LearnerPlacement {
  id         String   @id @default(uuid()) @db.Uuid
  learnerId  String   @map("learner_id") @db.Uuid
  pathId     String   @map("path_id") @db.Uuid
  resultId   String   @map("result_id") @db.Uuid      // the attempt that placed them
  levelId    String   @map("level_id") @db.Uuid
  score      Int
  placedAt   DateTime @default(now()) @map("placed_at")

  @@unique([learnerId, pathId])   // one active placement per learner per path
  @@map("learner_placements")
}
```

### 1.2 `PathCourse` — the key table

```prisma
model PathCourse {
  id       String @id @default(uuid()) @db.Uuid
  pathId   String @map("path_id") @db.Uuid
  courseId String @map("course_id") @db.Uuid

  levelId  String? @map("level_id") @db.Uuid
  position Int?
  level    Level?  @relation(fields: [levelId, pathId], references: [id, pathId])

  assignedByEntityId String?   @map("assigned_by_entity_id") @db.Uuid
  assignedAt         DateTime  @default(now()) @map("assigned_at")
  placedAt           DateTime? @map("placed_at")
  placedByAdminId    String?   @map("placed_by_admin_id") @db.Uuid

  @@unique([pathId, courseId])
  @@unique([levelId, position])
  @@map("path_courses")
}
```

Three things are enforced in SQL, not only in the service:

1. `CHECK ((level_id IS NULL) = (position IS NULL))` — raw SQL in the migration.
2. `@@unique([levelId, position])` needs no `WHERE level_id IS NOT NULL`: Postgres treats
   NULLs as distinct in a unique index, so any number of unassigned rows coexist. Stated
   here because it looks like a missing partial index and is not one.
3. The composite FK `(level_id, path_id) → levels(id, path_id)` makes placing into another
   path's level impossible at the database level. The service still returns 422 first, so
   the caller gets a message rather than a constraint violation.

**Removed from `PathCourse`:** `status` (`PathMembershipStatus`), `decidedById`, `decidedAt`,
`displayOrder`. Status is now derived — `level_id is null` means unassigned and hidden from
learners. `displayOrder` is replaced by `position`, which is scoped to a level.

### 1.3 `Path`

- **Removed:** `riasecLetter`.
- **Changed:** `isActive: Boolean` → `status: PathStatus`, per the spec. `isActive: true`
  becomes `PUBLISHED`.
- **Added:** `levels Level[]`, `assessment PathAssessment?`.
- Kept: `key`, `name`, `description`, `skillOutcomes`, `typicalDurationMinutes`,
  `displayOrder`.

### 1.4 The per-path assessment

The English/CEFR instrument (D-123) is generalized into the per-path assessment; the Holland
instrument is retired. This follows from decisions 1 and 2: Holland has no right answers and
produces no score, so it cannot place anyone, and its output (the code) has no consumer once
recommendations are gone. The English bank keeps working as the assessment of an English
path whose levels are A1…C2.

`english_assessments` and its four child tables are renamed and generalized:

| Now                            | Becomes                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| `english_assessments`          | `path_assessments` (+ `path_id`)                                                             |
| `english_assessment_questions` | `assessment_questions` (`level` CEFR field dropped, `skill` kept as free authoring metadata) |
| `english_assessment_options`   | `assessment_options` (`is_correct` kept)                                                     |
| `english_assessment_bands`     | `assessment_bands` (`level: CefrLevel` → `levelId → levels.id`)                              |
| `english_assessment_results`   | `assessment_results` (+ `path_id`, `userId` no longer unique)                                |
| `english_assessment_responses` | `assessment_responses`                                                                       |

**One deviation from the spec, deliberate.** §3 says `path_id` is unique on the assessment.
Taken literally that breaks copy-on-write versioning, which is a locked rule (D-049, D-072):
publishing an edit inserts a new version and freezes the old one so existing results keep
their meaning. So the constraint is `@@unique([pathId, version])` plus a partial unique index
on `path_id WHERE status = 'ACTIVE'`. Acceptance criterion 12 is tested against that: a path
can never have two live assessments.

**Placement rule.** `AssessmentBand` rows map an inclusive score range to a `level_id` of the
same path, must partition `0 … maxTotal` with no gap or overlap, and are copied with the
version. When a path has no bands configured, placement falls back to an even split of the
score range across levels by position — a pure function, `defaultPlacementBands()`, unit
tested at every boundary.

### 1.5 The learner's paths

- `user_paths.user_id` loses its unique index; `@@unique([userId, pathId])` replaces it.
- `confirmedAt` → `assignedAt`, plus `assignedById`. Assignment is the ministry's act, and
  the confirm gate is gone.
- `UserPathStatus`: `BUILDING` is deleted. `ACTIVE` and `COMPLETED` remain.
- **`user_path_courses` is deleted.** Its per-course status, grade and enrolment stop being
  a _selection_. Progress lives where it already is, in `completions`, keyed
  `(user, moodle_course_id)` exactly as §6 requires and as §10 assumes. Enrolment moves to
  the `enrollments` table §6 already sanctions but nobody built:
  `(user_id, course_id)` unique, `enrolled_at`, `last_error`. The completion sync, the
  player, My Path and certificate issuance all read the placed set plus `completions`
  instead of a materialized per-learner list.
  _This is the riskiest single item in the plan._ The safer alternative is to keep the table
  and repopulate it from placement on every assign/place/move; it preserves more code but
  makes §10's open item a real reconciliation problem instead of a non-problem. I recommend
  deletion and will take the alternative without re-planning if you prefer it.

### 1.6 Deleted outright

`assessment_assignments` and `AssessmentInstrument` (superseded — being assigned the path is
what lets you take its assessment); the Holland chain `assessments`,
`assessment_questions` (old), `assessment_options` (old), `assessment_option_weights`,
`assessment_results` (old), `assessment_responses` (old); `courses.is_general`;
`PathMembershipStatus`.

---

## 2. Migration

One migration, `20260909xxxxxx_levels_and_placement`, reversible in structure. Per decision 8
it does **not** preserve dev content: the dev database is reset and reseeded.

Order:

1. Create `levels`, `learner_placements`, `enrollments`, and the renamed assessment tables.
2. Add `level_id`, `position`, `assigned_*`, `placed_*` to `path_courses`; migrate every
   existing row to **unassigned** (`level_id = null`), which is the honest landing state —
   no level information exists to derive one from.
3. Drop `path_courses.status`, `decided_by_id`, `decided_at`, `display_order`.
4. Drop `paths.riasec_letter`; convert `is_active` to `status`.
5. Drop `user_paths.user_id` unique; rename `confirmed_at`; drop `user_path_courses`.
6. Drop the Holland chain, `assessment_assignments`, `courses.is_general`.
7. **After** the data is in place: add the check constraint, the composite FK and the two
   unique indexes.
8. Reseed: paths with levels, one per-path assessment with bands, courses placed into levels,
   the admin and entity accounts the e2e suites need.

The migration prints any row it cannot map. With a reset there should be none, and the
listing exists for the day this runs against real data.

### Migration risks

- **Irreversible content loss by design.** The down migration restores columns, not values.
  Every path's RIASEC letter, every Holland result, every learner's course selection and
  every instrument assignment is gone. Acceptable only because this is pre-launch.
- **63 dev accounts disappear**, including any hand-made test users. The seed must recreate
  the admin, the entities and the fixture learners the e2e suites sign in as.
- **`assessment_results` holds `Restrict` foreign keys** to questions and options. The
  Holland tables can only be dropped after their results, in that order, or the migration
  fails halfway.
- **Certificates survive and must.** `certificates.path_id` and `course_id` are untouched;
  an issued certificate keeps naming a path that still exists. Verified by test.
- `tamkeen2` is on its own database since the 2026-09-09 split, so it is unaffected.

---

## 3. API and permissions

Every route below is server-guarded; the UI is never the control. 403 for a role violation,
422 for a spec violation.

### Admin (`SUPER_ADMIN`)

| Method                | Route                                              | Note                                                                            |
| --------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------- |
| POST / PATCH / DELETE | `/admin/paths`, `/admin/paths/:id`                 | exists; `status` replaces `isActive`                                            |
| POST / PATCH / DELETE | `/admin/paths/:id/levels[/:levelId]`               | new                                                                             |
| PATCH                 | `/admin/paths/:id/levels/order`                    | new, re-packs positions                                                         |
| POST / PATCH          | `/admin/paths/:id/assessment`                      | new, incl. bands                                                                |
| PATCH                 | `/admin/paths/:id/courses/:pathCourseId/placement` | `{ levelId \| null, position \| null }`                                         |
| PATCH                 | `/admin/paths/:id/levels/:levelId/order`           | `{ pathCourseIds: [...] }`                                                      |
| GET                   | `/admin/paths/:id`                                 | every row incl. unassigned, grouped by level, with entity name and `assignedAt` |
| POST / DELETE         | `/admin/paths/:id/learners`                        | assign or revoke a path for employees                                           |
| DELETE                | `/admin/paths/:id/courses/:pathCourseId`           | remove from path entirely                                                       |

Deleting a level reverts its rows to unassigned and deletes nothing else. It is **refused**
when any learner is placed at it (a placement must never point at a level that does not
exist) or when the active assessment bands reference it; the refusal names which. That rule
is not in the spec and is flagged in §8.

### Entity (`ENTITY`, must own the course)

| Method | Route                              | Note                                               |
| ------ | ---------------------------------- | -------------------------------------------------- |
| POST   | `/paths/:id/courses`               | body `{ courseId }` only                           |
| DELETE | `/paths/:id/courses/:pathCourseId` | **refused once placed** (decision 5)               |
| GET    | `/entity/courses/:id`              | own rows only, derived status, read-only placement |

`levelId` or `position` in an entity body returns **422** with `PLACEMENT_NOT_YOURS`. The
global pipe already rejects unknown fields with a 400; the two names are declared explicitly
so the answer is the 422 the acceptance criteria ask for, and so the message says why.

The membership cap survives as a plain number (`PATH_MEMBERSHIP_MAX_PATHS`, a system
setting). The letter-coherence half dies with RIASEC.

### Learner (`EMPLOYEE`)

| Method | Route                            | Note                                                            |
| ------ | -------------------------------- | --------------------------------------------------------------- |
| GET    | `/paths`                         | the learner's **assigned** paths, no recommendation, no ranking |
| GET    | `/paths/:id`                     | all levels, placed courses only, the learner's level marked     |
| POST   | `/paths/:id/assessment/attempts` | returns score and placement                                     |
| GET    | `/my-path`                       | becomes plural: every assigned path with its progress           |

**One shared helper, `placedCoursesForLearner()`, is the only way any learner-facing query
reaches a course through a path.** It composes the three filters that must never be
forgotten: `level_id is not null`, the effective course status, and the enrolled-learner
exemption that keeps a withdrawn course completable. A lint-visible convention plus a test
that greps for `pathCourses` in learner services keeps it from being bypassed.

---

## 4. UI

### Admin — the path editor is where the work is

`/admin/paths` grows a path detail view with levels as sections, each listing its placed
courses in position order, plus an explicit **«دورات غير مُسندة»** group carrying the entity
name and the assignment date. Placing, moving and reordering happen here. A level section
offers rename, reorder and delete; delete states what it will do before it does it.
The path's assessment and its bands get their own panel: questions, and one band row per
level with its inclusive range, validated to partition the range with no gap.

Path assignment to employees joins the account panel where instrument assignment sits today
(D-133) — the same shape, paths instead of instruments.

### Entity — smaller, not bigger

The course form keeps its path checkboxes and gains nothing. Each checked path shows its
derived state, «غير مُسندة» or «مُسندة إلى: {level}», read-only. A placed membership's
checkbox is disabled with the reason. The RIASEC letter preview and the coherence message
are deleted.

### Learner

Results and path selection are deleted as a flow. The path page becomes the assigned path
with its levels, the learner's level marked, and courses below it shown as already at their
level rather than as work. The dashboard's three states collapse into two: no path assigned,
and one or more paths assigned. The build page, its counter and the confirm dialog are gone.

---

## 5. Tests

| #   | Acceptance criterion                                              | Test                                                 |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| 1   | Entity assign creates an unassigned row, no level in the response | `entity-courses.e2e-spec.ts`                         |
| 2   | Entity sending `levelId`/`position` → 422                         | `entity-courses.e2e-spec.ts`                         |
| 3   | Entity cannot see or touch another entity's rows                  | `entity-scoping.e2e-spec.ts`                         |
| 4   | Unassigned courses appear in **no** learner response              | `journey.e2e-spec.ts`, one case per learner endpoint |
| 5   | Placing sets both fields, positions stay contiguous               | `placement.service.spec.ts`                          |
| 6   | Moving re-packs both levels                                       | `placement.service.spec.ts`                          |
| 7   | Placing into another path's level → 422                           | `admin-paths.e2e-spec.ts`                            |
| 8   | Deleting a level unassigns, deletes no course                     | `admin-paths.e2e-spec.ts`                            |
| 9   | Score → level at every band edge; default even split              | `placement-bands.spec.ts`                            |
| 10  | Learner view: placed only, in position order, level marked        | `journey.e2e-spec.ts` + page test                    |
| 11  | Move after publication reflects on next fetch                     | `admin-paths.e2e-spec.ts`                            |
| 12  | One live assessment per path                                      | `path-assessment.e2e-spec.ts`                        |
| 13  | Old columns and code paths are gone                               | `schema.spec.ts` assertion + a grep test             |

Plus: the migration's constraints proved by a rejected insert, and the axe pass extended over
the new admin editor.

---

## 6. Sequencing

One branch, `feature/d134-levels-and-placement`, five reviewed checkpoints, one PR at the
end. The model changes atomically — placement replacing approval breaks every learner query
the moment it lands — so intermediate commits are reviewable but not shippable, and slicing
them into separate PRs would put `main` in a broken state.

1. **C1** schema, migration, seed reset. Green typecheck, red app.
2. **C2** admin: levels, placement, the per-path assessment and its bands.
3. **C3** entity: assignment rules, removal only while unassigned, the numeric cap.
4. **C4** learner: assigned paths, taking the assessment, placement, the level view,
   enrolment and progress on the new shape.
5. **C5** the deletion sweep, the full test suite, `progress.md` and `decisions.md`.

---

## 7. Delete list

**Schema:** `paths.riasec_letter` · `paths.is_active` · `path_courses.status` ·
`path_courses.decided_by_id` · `path_courses.decided_at` · `path_courses.display_order` ·
`courses.is_general` · `user_path_courses` (whole table) · `user_paths.user_id` unique ·
`assessment_assignments` · the six Holland tables · enums `PathMembershipStatus`,
`AssessmentInstrument`, `UserPathStatus.BUILDING`.

**API:** `AssignmentsModule` and its gate · `AdminAssignmentsController` and service ·
`rankPathsByRecommendation` · the RIASEC scoring engine and its spec · `bank-readiness` ·
`PATH_MIN_COURSES` / `PATH_MAX_COURSES` and every consumer · `EnrollmentService.selectPath`,
`setCourses`, `addCourse`, `confirm` · `resolveCourseAction`'s `ADD_TO_PATH`, `IN_PATH` and
`UNAVAILABLE` branches · the letter-coherence half of `path-membership-rules.ts` ·
`admin-assessment` (Holland) controller and service · the path bounds setting.

**Web:** `/results` · `/paths/[pathId]` build page · `confirm-path-dialog.tsx` ·
`recommended-badge.tsx` · `holland-code-chips.tsx` · the RIASEC block of `path-card.tsx` ·
`/admin/assessment/riasec` · the instrument section of the account panel · the Holland
distribution on the admin dashboard · the career-type block of the impact tab.

**Tests asserting the old behaviour:** `path-build.test.tsx` · `results.test.tsx` ·
`course-action.spec.ts` · `path-membership-rules.spec.ts` (letters half) ·
`riasec.spec.ts` · the build and recommendation steps of `journey.e2e-spec.ts` and
`journey-happy-path.spec.ts` · `admin-assessment.e2e-spec.ts` (Holland half).

**Also dead already, removed while here:** `courses.is_general` has no writer anywhere and no
learner-side effect, so «عامة» (D-119) was never actually built.

---

## 8. Open items and assumptions

**§10's open item — a learner's progress when an admin moves a started course.** Progress is
keyed `(user, moodle_course_id)` in `completions` and survives any move, so nothing is reset.
`TODO(product-decision)` goes at the single move point in `placement.service.ts`, with a log
line when the move touches a course a learner has started, and a non-blocking warning in the
admin editor. **Three code locations**: the service, the log, the UI warning.

Assumptions I made where the spec is silent. Each is cheap to change now and expensive later:

1. **Courses below a learner's level are shown but not startable**, and do not count toward
   path completion. The alternative is to let a learner drop back voluntarily.
2. **Path completion, and therefore the path certificate, means every placed course at or
   above the learner's level is passed.** `countPassedPathCourses` is rewritten to that.
3. **A level cannot be deleted while a learner is placed at it**, mirroring the existing
   refusal to delete a path somebody holds.
4. **Re-taking a path's assessment** is not offered. The English instrument's no-retake rule
   carries over as one placement per learner per path, changeable only by an admin.
5. **The Holland instrument is retired entirely**, not kept alongside. This follows from
   decisions 1 and 2 but is the largest single consequence, so it is stated rather than
   buried.
