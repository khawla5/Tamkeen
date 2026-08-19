-- CreateTable
CREATE TABLE "completions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "moodle_course_id" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "grade_percent" INTEGER,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "pass_threshold_used" INTEGER,
    "synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "completions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "completions_user_id_idx" ON "completions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "completions_user_id_moodle_course_id_key" ON "completions"("user_id", "moodle_course_id");

-- AddForeignKey
ALTER TABLE "completions" ADD CONSTRAINT "completions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
