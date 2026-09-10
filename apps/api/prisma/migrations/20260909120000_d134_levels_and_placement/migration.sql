-- D-134 — paths gain ordered levels, courses are placed onto them, and the
-- assessment that decides where a learner starts moves onto the path itself.
-- Rationale and the full delete list: docs/plan-levels-and-placement.md
--
-- Data this migration deliberately discards, per that plan's decision 8: every
-- Holland result and the responses behind it. Nothing else is dropped that held
-- learner-visible facts — path memberships survive and land *unassigned*, which
-- is the honest state for a row whose level nobody has chosen yet.
DELETE FROM "assessment_responses";
DELETE FROM "assessment_results";

-- CreateEnum
CREATE TYPE "PathStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- AlterEnum
BEGIN;
CREATE TYPE "UserPathStatus_new" AS ENUM ('ACTIVE', 'COMPLETED');
ALTER TABLE "public"."user_paths" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "user_paths" ALTER COLUMN "status" TYPE "UserPathStatus_new" USING ("status"::text::"UserPathStatus_new");
ALTER TYPE "UserPathStatus" RENAME TO "UserPathStatus_old";
ALTER TYPE "UserPathStatus_new" RENAME TO "UserPathStatus";
DROP TYPE "public"."UserPathStatus_old";
ALTER TABLE "user_paths" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;

-- DropForeignKey
ALTER TABLE "assessment_assignments" DROP CONSTRAINT "assessment_assignments_assigned_by_id_fkey";

-- DropForeignKey
ALTER TABLE "assessment_assignments" DROP CONSTRAINT "assessment_assignments_user_id_fkey";

-- DropForeignKey
ALTER TABLE "assessment_option_weights" DROP CONSTRAINT "assessment_option_weights_option_id_fkey";

-- DropForeignKey
ALTER TABLE "assessment_questions" DROP CONSTRAINT "assessment_questions_assessment_id_fkey";

-- DropForeignKey
ALTER TABLE "assessment_results" DROP CONSTRAINT "assessment_results_assessment_id_fkey";

-- DropForeignKey
ALTER TABLE "english_assessment_bands" DROP CONSTRAINT "english_assessment_bands_assessment_id_fkey";

-- DropForeignKey
ALTER TABLE "english_assessment_options" DROP CONSTRAINT "english_assessment_options_question_id_fkey";

-- DropForeignKey
ALTER TABLE "english_assessment_questions" DROP CONSTRAINT "english_assessment_questions_assessment_id_fkey";

-- DropForeignKey
ALTER TABLE "english_assessment_responses" DROP CONSTRAINT "english_assessment_responses_option_id_fkey";

-- DropForeignKey
ALTER TABLE "english_assessment_responses" DROP CONSTRAINT "english_assessment_responses_question_id_fkey";

-- DropForeignKey
ALTER TABLE "english_assessment_responses" DROP CONSTRAINT "english_assessment_responses_result_id_fkey";

-- DropForeignKey
ALTER TABLE "english_assessment_results" DROP CONSTRAINT "english_assessment_results_assessment_id_fkey";

-- DropForeignKey
ALTER TABLE "english_assessment_results" DROP CONSTRAINT "english_assessment_results_user_id_fkey";

-- DropForeignKey
ALTER TABLE "user_path_courses" DROP CONSTRAINT "user_path_courses_course_id_fkey";

-- DropForeignKey
ALTER TABLE "user_path_courses" DROP CONSTRAINT "user_path_courses_user_path_id_fkey";

-- DropIndex
DROP INDEX "path_courses_path_id_display_order_idx";

-- DropIndex
DROP INDEX "paths_riasec_letter_idx";

-- DropIndex
DROP INDEX "user_paths_user_id_key";

-- AlterTable
ALTER TABLE "assessment_options" ADD COLUMN     "is_correct" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "assessment_questions" ADD COLUMN     "level_id" UUID,
ADD COLUMN     "marks" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "topic" TEXT;

-- AlterTable
ALTER TABLE "assessment_results" DROP COLUMN "code",
DROP COLUMN "score_a",
DROP COLUMN "score_c",
DROP COLUMN "score_e",
DROP COLUMN "score_i",
DROP COLUMN "score_r",
DROP COLUMN "score_s",
ADD COLUMN     "total_score" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "courses" DROP COLUMN "is_general";

-- AlterTable
ALTER TABLE "path_courses" DROP COLUMN "decided_at",
DROP COLUMN "decided_by_id",
DROP COLUMN "display_order",
DROP COLUMN "status",
ADD COLUMN     "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "assigned_by_entity_id" UUID,
ADD COLUMN     "level_id" UUID,
ADD COLUMN     "placed_at" TIMESTAMP(3),
ADD COLUMN     "placed_by_admin_id" UUID,
ADD COLUMN     "position" INTEGER;

-- AlterTable
ALTER TABLE "paths" DROP COLUMN "is_active",
DROP COLUMN "riasec_letter",
ADD COLUMN     "status" "PathStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "user_paths" DROP COLUMN "confirmed_at",
ADD COLUMN     "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "assigned_by_id" UUID,
ADD COLUMN     "completed_at" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- DropTable
DROP TABLE "assessment_assignments";

-- DropTable
DROP TABLE "assessment_option_weights";

-- DropTable
DROP TABLE "assessments";

-- DropTable
DROP TABLE "english_assessment_bands";

-- DropTable
DROP TABLE "english_assessment_options";

-- DropTable
DROP TABLE "english_assessment_questions";

-- DropTable
DROP TABLE "english_assessment_responses";

-- DropTable
DROP TABLE "english_assessment_results";

-- DropTable
DROP TABLE "english_assessments";

-- DropTable
DROP TABLE "user_path_courses";

-- DropEnum
DROP TYPE "AssessmentInstrument";

-- DropEnum
DROP TYPE "CefrLevel";

-- DropEnum
DROP TYPE "EnglishSkill";

-- DropEnum
DROP TYPE "PathMembershipStatus";

-- DropEnum
DROP TYPE "RiasecDimension";

-- DropEnum
DROP TYPE "UserPathCourseStatus";

-- CreateTable
CREATE TABLE "path_assessments" (
    "id" UUID NOT NULL,
    "path_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "effective_from" TIMESTAMP(3),
    "retired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "path_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_bands" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "min_score" INTEGER NOT NULL,
    "max_score" INTEGER NOT NULL,

    CONSTRAINT "assessment_bands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "levels" (
    "id" UUID NOT NULL,
    "path_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "enrolled_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learner_placements" (
    "id" UUID NOT NULL,
    "learner_id" UUID NOT NULL,
    "path_id" UUID NOT NULL,
    "result_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "placed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learner_placements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "path_assessments_path_id_status_idx" ON "path_assessments"("path_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "path_assessments_path_id_version_key" ON "path_assessments"("path_id", "version");

-- CreateIndex
CREATE INDEX "assessment_bands_assessment_id_min_score_idx" ON "assessment_bands"("assessment_id", "min_score");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_bands_assessment_id_level_id_key" ON "assessment_bands"("assessment_id", "level_id");

-- CreateIndex
CREATE UNIQUE INDEX "levels_path_id_position_key" ON "levels"("path_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "levels_id_path_id_key" ON "levels"("id", "path_id");

-- CreateIndex
CREATE INDEX "enrollments_enrolled_at_idx" ON "enrollments"("enrolled_at");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_user_id_course_id_key" ON "enrollments"("user_id", "course_id");

-- CreateIndex
CREATE INDEX "learner_placements_path_id_idx" ON "learner_placements"("path_id");

-- CreateIndex
CREATE UNIQUE INDEX "learner_placements_learner_id_path_id_key" ON "learner_placements"("learner_id", "path_id");

-- CreateIndex
CREATE INDEX "path_courses_path_id_idx" ON "path_courses"("path_id");

-- CreateIndex
CREATE UNIQUE INDEX "path_courses_level_id_position_key" ON "path_courses"("level_id", "position");

-- CreateIndex
CREATE INDEX "paths_status_idx" ON "paths"("status");

-- CreateIndex
CREATE INDEX "user_paths_user_id_idx" ON "user_paths"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_paths_user_id_path_id_key" ON "user_paths"("user_id", "path_id");

-- AddForeignKey
ALTER TABLE "path_assessments" ADD CONSTRAINT "path_assessments_path_id_fkey" FOREIGN KEY ("path_id") REFERENCES "paths"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "path_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_bands" ADD CONSTRAINT "assessment_bands_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "path_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_bands" ADD CONSTRAINT "assessment_bands_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "path_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "levels" ADD CONSTRAINT "levels_path_id_fkey" FOREIGN KEY ("path_id") REFERENCES "paths"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "path_courses" ADD CONSTRAINT "path_courses_level_id_path_id_fkey" FOREIGN KEY ("level_id", "path_id") REFERENCES "levels"("id", "path_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "path_courses" ADD CONSTRAINT "path_courses_assigned_by_entity_id_fkey" FOREIGN KEY ("assigned_by_entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "path_courses" ADD CONSTRAINT "path_courses_placed_by_admin_id_fkey" FOREIGN KEY ("placed_by_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_paths" ADD CONSTRAINT "user_paths_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_placements" ADD CONSTRAINT "learner_placements_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_placements" ADD CONSTRAINT "learner_placements_path_id_fkey" FOREIGN KEY ("path_id") REFERENCES "paths"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_placements" ADD CONSTRAINT "learner_placements_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "assessment_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_placements" ADD CONSTRAINT "learner_placements_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Constraints Prisma's schema language cannot express.
--
-- Each of these is one bug away from a learner seeing the wrong path, so it is
-- the database's rule and not a service's good intentions (the D-035
-- discipline).
-- ─────────────────────────────────────────────────────────────────────────────

-- A membership is placed or it is not. Half-placed is not a state.
ALTER TABLE "path_courses"
  ADD CONSTRAINT "path_courses_placement_complete"
  CHECK (("level_id" IS NULL) = ("position" IS NULL));

-- Positions and levels are 1-based and contiguous. Contiguity is the service's
-- to maintain by re-packing; the floor is cheap to state here.
ALTER TABLE "path_courses"
  ADD CONSTRAINT "path_courses_position_positive"
  CHECK ("position" IS NULL OR "position" >= 1);

ALTER TABLE "levels"
  ADD CONSTRAINT "levels_position_positive"
  CHECK ("position" >= 1);

-- A band is an inclusive range that runs forwards and starts at zero or above.
ALTER TABLE "assessment_bands"
  ADD CONSTRAINT "assessment_bands_range_ordered"
  CHECK ("min_score" >= 0 AND "min_score" <= "max_score");

-- At most one ACTIVE and one DRAFT version per path — which is how "one
-- assessment per path" is true without making `path_id` unique, since that
-- would forbid the versioning D-049 requires. Two concurrent publishes would
-- otherwise both retire the old version and both insert an active one, leaving
-- a second live assessment that `findFirst` picks between arbitrarily.
CREATE UNIQUE INDEX "path_assessments_one_active_per_path"
  ON "path_assessments" ("path_id") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "path_assessments_one_draft_per_path"
  ON "path_assessments" ("path_id") WHERE "status" = 'DRAFT';
