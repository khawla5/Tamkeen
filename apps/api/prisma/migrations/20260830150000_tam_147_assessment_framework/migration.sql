-- TAM-147: generalise assessment into typed instruments (RIASEC | CEFR).
--
-- Hand-written, like 20260830120000_english_assessment before it — this
-- environment has no shadow database for `prisma migrate dev` to diff
-- against. Data-preserving throughout: every existing RIASEC result and
-- every existing CEFR result (from TAM-148, if that migration has run) is
-- carried across, not dropped and reseeded.
--
-- What this does, in order: (1) add the `kind` discriminator; (2) fold the
-- CEFR instrument registry (`english_assessments`) into `assessments`,
-- reusing row ids so `english_assessment_questions`/`bands` need only a
-- repointed foreign key, not a new one; (3) widen `assessment_results` with
-- a nullable CEFR payload beside the (now nullable) RIASEC one, and fold
-- `english_assessment_results` into it the same way; (4) the assignment
-- tables (§4C.3 part 2).

-- 1. The discriminator.
CREATE TYPE "AssessmentKind" AS ENUM ('RIASEC', 'CEFR');

ALTER TABLE "assessments" ADD COLUMN "kind" "AssessmentKind" NOT NULL DEFAULT 'RIASEC';

-- 2. Fold english_assessments into assessments — same ids, so every
-- existing english_assessment_questions/bands row still points at a real
-- row once its foreign key is repointed below.
INSERT INTO "assessments"
  ("id", "key", "version", "title", "description", "status", "effective_from", "retired_at", "created_at", "updated_at", "kind")
SELECT
  "id", "key", "version", "title", "description", "status", "effective_from", "retired_at", "created_at", "updated_at", 'CEFR'
FROM "english_assessments";

ALTER TABLE "english_assessment_questions" DROP CONSTRAINT "english_assessment_questions_assessment_id_fkey";
ALTER TABLE "english_assessment_questions" ADD CONSTRAINT "english_assessment_questions_assessment_id_fkey"
  FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "english_assessment_bands" DROP CONSTRAINT "english_assessment_bands_assessment_id_fkey";
ALTER TABLE "english_assessment_bands" ADD CONSTRAINT "english_assessment_bands_assessment_id_fkey"
  FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- english_assessment_results still points at english_assessments too, but
-- that table (and this constraint with it) is dropped a few statements down
-- once its data has been copied into assessment_results — no need to
-- repoint it, only to stop it blocking the DROP TABLE below.
ALTER TABLE "english_assessment_results" DROP CONSTRAINT "english_assessment_results_assessment_id_fkey";

DROP TABLE "english_assessments";

-- 3. Widen assessment_results: the RIASEC payload becomes optional (a CEFR
-- row has none of it), a CEFR payload is added beside it, and `kind` says
-- which is populated.
ALTER TABLE "assessment_results" ALTER COLUMN "score_r" DROP NOT NULL;
ALTER TABLE "assessment_results" ALTER COLUMN "score_i" DROP NOT NULL;
ALTER TABLE "assessment_results" ALTER COLUMN "score_a" DROP NOT NULL;
ALTER TABLE "assessment_results" ALTER COLUMN "score_s" DROP NOT NULL;
ALTER TABLE "assessment_results" ALTER COLUMN "score_e" DROP NOT NULL;
ALTER TABLE "assessment_results" ALTER COLUMN "score_c" DROP NOT NULL;
ALTER TABLE "assessment_results" ALTER COLUMN "max_score" DROP NOT NULL;
ALTER TABLE "assessment_results" ALTER COLUMN "code" DROP NOT NULL;

ALTER TABLE "assessment_results" ADD COLUMN "kind" "AssessmentKind" NOT NULL DEFAULT 'RIASEC';
ALTER TABLE "assessment_results" ADD COLUMN "cefr_level" "CefrLevel";
ALTER TABLE "assessment_results" ADD COLUMN "cefr_score" INTEGER;
ALTER TABLE "assessment_results" ADD COLUMN "cefr_max" INTEGER;

-- Fold english_assessment_results into assessment_results, same ids again —
-- so english_assessment_responses.result_id needs only a repointed FK.
INSERT INTO "assessment_results"
  ("id", "user_id", "assessment_id", "assessment_version", "kind", "cefr_level", "cefr_score", "cefr_max", "completed_at")
SELECT
  "id", "user_id", "assessment_id", "assessment_version", 'CEFR', "level", "total_score", "max_score", "completed_at"
FROM "english_assessment_results";

ALTER TABLE "english_assessment_responses" DROP CONSTRAINT "english_assessment_responses_result_id_fkey";
ALTER TABLE "english_assessment_responses" ADD CONSTRAINT "english_assessment_responses_result_id_fkey"
  FOREIGN KEY ("result_id") REFERENCES "assessment_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE "english_assessment_results";

-- Every row that exists at this point is genuinely RIASEC or was just
-- backfilled as CEFR above — from here on, a caller must say which, the
-- same discipline `AssessmentStatus` already gets no default for either.
ALTER TABLE "assessments" ALTER COLUMN "kind" DROP DEFAULT;
ALTER TABLE "assessment_results" ALTER COLUMN "kind" DROP DEFAULT;

-- Exactly one CEFR result per user (D-123's `english_assessment_results
-- .user_id @unique`, carried over) — a partial index because RIASEC still
-- appends on every retake (D-033) and `@@unique` cannot express the WHERE,
-- the same limitation the DRAFT/ACTIVE partial indexes below work around.
CREATE UNIQUE INDEX "assessment_results_one_cefr_per_user"
  ON "assessment_results" ("user_id") WHERE "kind" = 'CEFR';

CREATE INDEX "assessments_kind_status_idx" ON "assessments" ("kind", "status");
CREATE INDEX "assessment_results_user_id_kind_completed_at_idx"
  ON "assessment_results" ("user_id", "kind", "completed_at");

-- 4. Assignment (§4C.3 part 2).
CREATE TYPE "AssignmentScope" AS ENUM ('ALL', 'DEPARTMENT', 'USER');

CREATE TABLE "assessment_groups" (
    "id"          UUID         NOT NULL,
    "key"         TEXT         NOT NULL,
    "name"        TEXT         NOT NULL,
    "member_keys" TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assessment_groups_key_key" ON "assessment_groups" ("key");

CREATE TABLE "assessment_assignments" (
    "id"             UUID              NOT NULL,
    "assessment_key" TEXT              NOT NULL,
    "scope"          "AssignmentScope" NOT NULL,
    "target"         TEXT,
    "required"       BOOLEAN           NOT NULL DEFAULT true,
    "display_order"  INTEGER           NOT NULL,
    "created_at"     TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3)      NOT NULL,

    CONSTRAINT "assessment_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "assessment_assignments_assessment_key_scope_target_idx"
  ON "assessment_assignments" ("assessment_key", "scope", "target");
CREATE INDEX "assessment_assignments_scope_target_idx"
  ON "assessment_assignments" ("scope", "target");

-- 5. The seed assigns riasec-core to ALL, required — existing users see no
-- change (part 2's own acceptance line). One row, so it belongs in the
-- migration that makes the table meaningful rather than waiting on the next
-- seed run to backfill it.
INSERT INTO "assessment_assignments" ("id", "assessment_key", "scope", "target", "required", "display_order", "updated_at")
SELECT gen_random_uuid(), 'riasec-core', 'ALL', NULL, true, 1, CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "assessments" WHERE "key" = 'riasec-core');
