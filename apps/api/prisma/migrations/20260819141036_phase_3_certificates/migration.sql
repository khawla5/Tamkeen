-- CreateEnum
CREATE TYPE "CertificateType" AS ENUM ('COURSE', 'PATH');

-- CreateTable
CREATE TABLE "certificates" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "CertificateType" NOT NULL,
    "course_id" UUID,
    "path_id" UUID,
    "verification_id" TEXT NOT NULL,
    "pdf_path" TEXT NOT NULL,
    "pdf_sha256" TEXT NOT NULL,
    "pdf_bytes" INTEGER NOT NULL,
    "holder_name" TEXT NOT NULL,
    "subject_title" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certificates_verification_id_key" ON "certificates"("verification_id");

-- CreateIndex
CREATE INDEX "certificates_user_id_issued_at_idx" ON "certificates"("user_id", "issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_user_id_type_course_id_key" ON "certificates"("user_id", "type", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_user_id_type_path_id_key" ON "certificates"("user_id", "type", "path_id");

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_path_id_fkey" FOREIGN KEY ("path_id") REFERENCES "paths"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A certificate points at exactly one thing, and it is the thing its type says.
-- Prisma cannot express this, so it is added by hand: "certificate for both a
-- course and a path" and "certificate for neither" are not states worth writing
-- code to survive, and a credential store is the wrong place to discover that a
-- bug made one.
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_target_matches_type" CHECK (
    ("type" = 'COURSE' AND "course_id" IS NOT NULL AND "path_id" IS NULL)
    OR
    ("type" = 'PATH' AND "path_id" IS NOT NULL AND "course_id" IS NULL)
);
