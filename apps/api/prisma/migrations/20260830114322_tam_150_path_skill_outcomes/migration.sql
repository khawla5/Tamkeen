-- AlterTable
ALTER TABLE "paths" ADD COLUMN     "skill_outcomes" TEXT[] DEFAULT ARRAY[]::TEXT[];
