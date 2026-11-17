-- §4.13 / §4C.9 — the English (CEFR) placement test (D-123, D-124, D-125).
--
-- Six new tables and two new enums. NOTHING EXISTING IS ALTERED except the
-- addition of a foreign key from `english_assessment_results` to `users`, which
-- is a new table pointing at an old one. The Holland assessment's tables, its
-- indexes and its constraints are untouched by design, and that is the whole
-- reason this is a sibling schema rather than a discriminator on `assessments`:
-- `AssessmentService.getActive` and `AdminAssessmentService.createDraft` both
-- select `findFirst({ status: 'ACTIVE' })` with no filter on `key`, so a second
-- instrument in that table would have made the learner's Holland assessment
-- whichever row Postgres returned first.
--
-- Written by hand rather than generated, as every migration since Phase 5 has
-- been: `prisma migrate dev` is interactive and unavailable in this
-- environment, and the partial unique indexes below are not expressible in the
-- schema language anyway.

-- 1. The vocabulary.
--
-- CEFR levels are declared ASCENDING. Postgres orders an enum by declaration
-- order, so `ORDER BY level` sorts A1 to C2 for free, and a report grouped by
-- level comes out in the order a reader expects rather than alphabetically
-- (which agrees by accident today and would stop agreeing the moment a level
-- were renamed).
CREATE TYPE "CefrLevel"    AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');
CREATE TYPE "EnglishSkill" AS ENUM ('GRAMMAR', 'VOCABULARY', 'READING', 'PRACTICAL');

-- 2. The instrument. `AssessmentStatus` is reused: DRAFT/ACTIVE/RETIRED is a
--    lifecycle, not a RIASEC fact, and a second identical enum would be two
--    things to keep in step for no gain.
CREATE TABLE "english_assessments" (
    "id"             UUID               NOT NULL,
    "key"            TEXT               NOT NULL,
    "version"        INTEGER            NOT NULL DEFAULT 1,
    "title"          TEXT               NOT NULL,
    "description"    TEXT               NOT NULL,
    "status"         "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "effective_from" TIMESTAMP(3),
    "retired_at"     TIMESTAMP(3),
    "created_at"     TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3)       NOT NULL,

    CONSTRAINT "english_assessments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "english_assessments_key_version_key" ON "english_assessments" ("key", "version");
CREATE INDEX "english_assessments_key_status_idx" ON "english_assessments" ("key", "status");

-- At most one ACTIVE and one DRAFT per instrument, for the D-072 reason: two
-- concurrent publishes would otherwise both retire the old version and both
-- insert a live one, leaving a second active bank that `findFirst` picks
-- between arbitrarily. A constraint refuses; good intentions do not.
CREATE UNIQUE INDEX "english_assessments_one_active_per_key"
  ON "english_assessments" ("key") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "english_assessments_one_draft_per_key"
  ON "english_assessments" ("key") WHERE "status" = 'DRAFT';

-- 3. Questions. `marks` is the concept Holland has no analogue for.
CREATE TABLE "english_assessment_questions" (
    "id"            UUID           NOT NULL,
    "assessment_id" UUID           NOT NULL,
    "key"           TEXT           NOT NULL,
    "display_order" INTEGER        NOT NULL,
    "text"          TEXT           NOT NULL,
    "marks"         INTEGER        NOT NULL DEFAULT 1,
    "level"         "CefrLevel"    NOT NULL,
    "skill"         "EnglishSkill" NOT NULL,

    CONSTRAINT "english_assessment_questions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "english_assessment_questions_assessment_id_key_key"
  ON "english_assessment_questions" ("assessment_id", "key");
CREATE INDEX "english_assessment_questions_assessment_id_display_order_idx"
  ON "english_assessment_questions" ("assessment_id", "display_order");

-- 4. Options. `is_correct` is the other concept Holland lacks.
--
-- "Exactly one correct option per question" is NOT a database constraint. It is
-- checked at publish (`assessEnglishBank`), because a draft must be free to sit
-- in an invalid state while somebody edits it — the same reasoning that keeps
-- the Holland balance guard at publish rather than on save (D-073).
CREATE TABLE "english_assessment_options" (
    "id"            UUID    NOT NULL,
    "question_id"   UUID    NOT NULL,
    "key"           TEXT    NOT NULL,
    "display_order" INTEGER NOT NULL,
    "label"         TEXT    NOT NULL,
    "is_correct"    BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "english_assessment_options_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "english_assessment_options_question_id_key_key"
  ON "english_assessment_options" ("question_id", "key");
CREATE INDEX "english_assessment_options_question_id_display_order_idx"
  ON "english_assessment_options" ("question_id", "display_order");

-- 5. The bands — the configurable scoring rule, held ON THE VERSION.
--
-- In `settings` they would be a global mutable, and moving the B2 boundary would
-- silently re-interpret every result ever issued. Here they are copied with the
-- version and frozen with it, so "38 out of 60 meant B2" stays true afterwards.
CREATE TABLE "english_assessment_bands" (
    "id"            UUID        NOT NULL,
    "assessment_id" UUID        NOT NULL,
    "level"         "CefrLevel" NOT NULL,
    "min_score"     INTEGER     NOT NULL,
    "max_score"     INTEGER     NOT NULL,

    CONSTRAINT "english_assessment_bands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "english_assessment_bands_assessment_id_level_key"
  ON "english_assessment_bands" ("assessment_id", "level");
CREATE INDEX "english_assessment_bands_assessment_id_min_score_idx"
  ON "english_assessment_bands" ("assessment_id", "min_score");

-- 6. Results. ONE PER USER, EVER — the no-retake rule as a constraint.
--
-- §4.13 says the placement test is taken once. A service-layer check loses the
-- race between two concurrent submissions; a unique index does not. Same shape
-- as `user_paths.user_id`, and for the same reason (D-035).
CREATE TABLE "english_assessment_results" (
    "id"                 UUID         NOT NULL,
    "user_id"            UUID         NOT NULL,
    "assessment_id"      UUID         NOT NULL,
    "assessment_version" INTEGER      NOT NULL,
    "total_score"        INTEGER      NOT NULL,
    "max_score"          INTEGER      NOT NULL,
    "level"              "CefrLevel"  NOT NULL,
    "completed_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "english_assessment_results_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "english_assessment_results_user_id_key"
  ON "english_assessment_results" ("user_id");

-- 7. Responses. Restrict on the bank, Cascade from the result — editing the
--    instrument must not delete answers people already gave, while removing an
--    attempt as a whole is coherent (D-035).
CREATE TABLE "english_assessment_responses" (
    "id"          UUID NOT NULL,
    "result_id"   UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "option_id"   UUID NOT NULL,

    CONSTRAINT "english_assessment_responses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "english_assessment_responses_result_id_question_id_key"
  ON "english_assessment_responses" ("result_id", "question_id");

-- 8. Foreign keys.
ALTER TABLE "english_assessment_questions"
  ADD CONSTRAINT "english_assessment_questions_assessment_id_fkey"
  FOREIGN KEY ("assessment_id") REFERENCES "english_assessments" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "english_assessment_options"
  ADD CONSTRAINT "english_assessment_options_question_id_fkey"
  FOREIGN KEY ("question_id") REFERENCES "english_assessment_questions" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "english_assessment_bands"
  ADD CONSTRAINT "english_assessment_bands_assessment_id_fkey"
  FOREIGN KEY ("assessment_id") REFERENCES "english_assessments" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "english_assessment_results"
  ADD CONSTRAINT "english_assessment_results_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "english_assessment_results"
  ADD CONSTRAINT "english_assessment_results_assessment_id_fkey"
  FOREIGN KEY ("assessment_id") REFERENCES "english_assessments" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "english_assessment_responses"
  ADD CONSTRAINT "english_assessment_responses_result_id_fkey"
  FOREIGN KEY ("result_id") REFERENCES "english_assessment_results" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "english_assessment_responses"
  ADD CONSTRAINT "english_assessment_responses_question_id_fkey"
  FOREIGN KEY ("question_id") REFERENCES "english_assessment_questions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "english_assessment_responses"
  ADD CONSTRAINT "english_assessment_responses_option_id_fkey"
  FOREIGN KEY ("option_id") REFERENCES "english_assessment_options" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
