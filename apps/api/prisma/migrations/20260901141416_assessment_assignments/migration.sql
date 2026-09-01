-- CreateEnum
CREATE TYPE "AssessmentInstrument" AS ENUM ('RIASEC', 'ENGLISH_CEFR');

-- CreateTable
CREATE TABLE "assessment_assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "instrument" "AssessmentInstrument" NOT NULL,
    "assigned_by_id" UUID,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assessment_assignments_instrument_idx" ON "assessment_assignments"("instrument");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_assignments_user_id_instrument_key" ON "assessment_assignments"("user_id", "instrument");

-- AddForeignKey
ALTER TABLE "assessment_assignments" ADD CONSTRAINT "assessment_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_assignments" ADD CONSTRAINT "assessment_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
