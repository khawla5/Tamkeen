-- TAM-132: path membership rules.
--
-- An entity's path membership becomes a proposal the admin approves; only
-- APPROVED rows count for learners. Existing rows are APPROVED — they predate
-- the rule and learners may already hold the courses (D-002/D-040). A course
-- the admin marks general («عامة») reaches every path without rows.
CREATE TYPE "PathMembershipStatus" AS ENUM ('PENDING', 'APPROVED');

ALTER TABLE "path_courses"
  ADD COLUMN "status" "PathMembershipStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "decided_by_id" UUID,
  ADD COLUMN "decided_at" TIMESTAMP(3);

ALTER TABLE "courses" ADD COLUMN "is_general" BOOLEAN NOT NULL DEFAULT false;
