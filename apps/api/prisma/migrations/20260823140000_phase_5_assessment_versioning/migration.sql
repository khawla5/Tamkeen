-- Phase 5, sub-phase 5.3 — copy-on-write assessment versioning (D-069, D-070).
--
-- Editing the assessment stops mutating the live bank. Publishing an edit
-- inserts a NEW row at version + 1 with its own copy of every question, option
-- and weight, and retires the previous one; `assessment_results` keep pointing
-- at the version they were scored against. That is what turns D-049's "frozen
-- as taken" from a statement about six numbers into a statement about the
-- instrument that produced them.
--
-- Written by hand rather than generated: `prisma migrate dev` is interactive and
-- unavailable here, and two of the steps below (the backfill and the partial
-- unique indexes) are not expressible in the schema anyway.

-- 1. The lifecycle.
CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- 2. New columns, nullable first so the backfill can decide their values.
ALTER TABLE "assessments"
  ADD COLUMN "status"         "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "effective_from" TIMESTAMP(3),
  ADD COLUMN "retired_at"     TIMESTAMP(3);

-- 3. Backfill. THIS IS THE PART THAT MATTERS.
--
-- `status` defaults to DRAFT, and taking that default would take the live
-- assessment away from every learner the moment this migration ran: `getActive`
-- serves only an ACTIVE row, so the whole product would answer
-- ASSESSMENT_NOT_FOUND. The existing row is the one in force, so it becomes
-- ACTIVE, effective from when it was created — which is the honest date, since
-- it has been in effect since it was seeded.
--
-- Phase 4 learned this the hard way with `courses.publication`: a defaulted
-- enum on a backfill is a silent withdrawal of live content.
UPDATE "assessments"
   SET "status"         = CASE WHEN "is_active" THEN 'ACTIVE'::"AssessmentStatus"
                               ELSE 'RETIRED'::"AssessmentStatus" END,
       "effective_from" = CASE WHEN "is_active" THEN "created_at" ELSE NULL END,
       "retired_at"     = CASE WHEN "is_active" THEN NULL ELSE "updated_at" END;

-- 4. `is_active` was the same fact as `status` wearing a narrower type, and
--    keeping both is how the two come to disagree (the D-059 lesson).
ALTER TABLE "assessments" DROP COLUMN "is_active";

-- 5. `key` identifies the instrument, not the row: every version shares
--    'riasec-core'. Uniqueness moves to the pair.
DROP INDEX "assessments_key_key";
CREATE UNIQUE INDEX "assessments_key_version_key" ON "assessments" ("key", "version");
CREATE INDEX "assessments_key_status_idx" ON "assessments" ("key", "status");

-- 6. At most one ACTIVE and one DRAFT per instrument.
--
-- Partial unique indexes, which Prisma's schema language cannot express — so
-- they are written here rather than left to the service layer. Two concurrent
-- publishes would otherwise both retire the old version and both insert an
-- active one, and the loser would be a second live assessment that `findFirst`
-- picks between arbitrarily. A constraint refuses; good intentions do not.
CREATE UNIQUE INDEX "assessments_one_active_per_key"
  ON "assessments" ("key") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "assessments_one_draft_per_key"
  ON "assessments" ("key") WHERE "status" = 'DRAFT';
