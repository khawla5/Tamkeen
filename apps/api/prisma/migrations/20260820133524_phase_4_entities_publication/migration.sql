-- Phase 4 — entities, and the publication/visibility split (D-059, D-063).

-- CreateEnum
CREATE TYPE "CoursePublication" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED');

-- CreateEnum
CREATE TYPE "CourseLanguage" AS ENUM ('AR', 'EN');

-- CreateEnum
CREATE TYPE "EntityStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "language" "CourseLanguage",
ADD COLUMN     "lms_present" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lms_visible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "owner_entity_id" UUID,
ADD COLUMN     "publication" "CoursePublication" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "published_at" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "entity_id" UUID;

-- CreateTable
CREATE TABLE "entities" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL DEFAULT '',
    "contact_email" TEXT NOT NULL DEFAULT '',
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "entities_key_key" ON "entities"("key");

-- CreateIndex
CREATE INDEX "courses_owner_entity_id_idx" ON "courses"("owner_entity_id");

-- CreateIndex
CREATE INDEX "users_entity_id_idx" ON "users"("entity_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_owner_entity_id_fkey" FOREIGN KEY ("owner_entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill (D-059). This is the part that matters, and it must not be skipped.
--
-- `publication` defaults to DRAFT, which is right for a course an entity is
-- about to create and catastrophic for the courses already in the catalogue:
-- taking the default would withdraw every existing course from every learner
-- the moment this migration ran. Existing rows predate the notion of a draft and
-- were, by definition, published — so they are marked PUBLISHED explicitly.
--
-- The LMS flags are then set to whatever reproduces each row's CURRENT status
-- under the new derivation, so the split changes no course's visibility:
--
--   AVAILABLE              → present, visible        → AVAILABLE
--   HIDDEN_BUT_COMPLETABLE → present, not visible    → HIDDEN_BUT_COMPLETABLE
--   RETIRED                → not present             → RETIRED (nobody holds it)
--
-- HIDDEN_BUT_COMPLETABLE has two possible causes under the old scheme (the LMS
-- hid it, or it vanished while a learner held it). "Present but hidden" is the
-- conservative reading: it yields HIDDEN_BUT_COMPLETABLE whether or not anyone
-- holds the course, whereas "vanished" would resolve to RETIRED for a course
-- nobody holds and so could withdraw one that is currently visible.
--
-- `language` is deliberately left NULL. It is only genuinely known for the
-- seeded catalogue, and the seed runner sets it there; guessing a language from
-- the characters in a title would be wrong often enough to matter.
UPDATE "courses" SET
    "publication"  = 'PUBLISHED',
    "lms_visible"  = ("status" <> 'HIDDEN_BUT_COMPLETABLE'),
    "lms_present"  = ("status" <> 'RETIRED'),
    "published_at" = "created_at";
