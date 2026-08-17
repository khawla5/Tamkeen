-- CreateEnum
CREATE TYPE "RiasecDimension" AS ENUM ('R', 'I', 'A', 'S', 'E', 'C');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('AVAILABLE', 'HIDDEN_BUT_COMPLETABLE', 'RETIRED');

-- CreateEnum
CREATE TYPE "UserPathStatus" AS ENUM ('BUILDING', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "UserPathCourseStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "assessments" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_questions" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "assessment_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_options" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "assessment_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_option_weights" (
    "id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "dimension" "RiasecDimension" NOT NULL,
    "points" INTEGER NOT NULL,

    CONSTRAINT "assessment_option_weights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_results" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "assessment_version" INTEGER NOT NULL,
    "score_r" INTEGER NOT NULL,
    "score_i" INTEGER NOT NULL,
    "score_a" INTEGER NOT NULL,
    "score_s" INTEGER NOT NULL,
    "score_e" INTEGER NOT NULL,
    "score_c" INTEGER NOT NULL,
    "max_score" INTEGER NOT NULL,
    "code" VARCHAR(3) NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_responses" (
    "id" UUID NOT NULL,
    "result_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,

    CONSTRAINT "assessment_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paths" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "riasec_letter" "RiasecDimension" NOT NULL,
    "typical_duration_minutes" INTEGER,
    "display_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paths_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "moodle_course_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "duration_minutes" INTEGER,
    "status" "CourseStatus" NOT NULL DEFAULT 'AVAILABLE',
    "objectives" TEXT[],
    "prerequisites" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "path_courses" (
    "id" UUID NOT NULL,
    "path_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "display_order" INTEGER NOT NULL,

    CONSTRAINT "path_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_paths" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "path_id" UUID NOT NULL,
    "status" "UserPathStatus" NOT NULL DEFAULT 'BUILDING',
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_paths_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_path_courses" (
    "id" UUID NOT NULL,
    "user_path_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "display_order" INTEGER NOT NULL,
    "status" "UserPathCourseStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "grade_percent" INTEGER,
    "enrolled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_path_courses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assessments_key_key" ON "assessments"("key");

-- CreateIndex
CREATE INDEX "assessment_questions_assessment_id_display_order_idx" ON "assessment_questions"("assessment_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_questions_assessment_id_key_key" ON "assessment_questions"("assessment_id", "key");

-- CreateIndex
CREATE INDEX "assessment_options_question_id_display_order_idx" ON "assessment_options"("question_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_options_question_id_key_key" ON "assessment_options"("question_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_option_weights_option_id_dimension_key" ON "assessment_option_weights"("option_id", "dimension");

-- CreateIndex
CREATE INDEX "assessment_results_user_id_completed_at_idx" ON "assessment_results"("user_id", "completed_at");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_responses_result_id_question_id_key" ON "assessment_responses"("result_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "paths_key_key" ON "paths"("key");

-- CreateIndex
CREATE INDEX "paths_riasec_letter_idx" ON "paths"("riasec_letter");

-- CreateIndex
CREATE UNIQUE INDEX "courses_moodle_course_id_key" ON "courses"("moodle_course_id");

-- CreateIndex
CREATE INDEX "courses_status_idx" ON "courses"("status");

-- CreateIndex
CREATE INDEX "path_courses_path_id_display_order_idx" ON "path_courses"("path_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "path_courses_path_id_course_id_key" ON "path_courses"("path_id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_paths_user_id_key" ON "user_paths"("user_id");

-- CreateIndex
CREATE INDEX "user_path_courses_user_path_id_display_order_idx" ON "user_path_courses"("user_path_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "user_path_courses_user_path_id_course_id_key" ON "user_path_courses"("user_path_id", "course_id");

-- AddForeignKey
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_options" ADD CONSTRAINT "assessment_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "assessment_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_option_weights" ADD CONSTRAINT "assessment_option_weights_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "assessment_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_responses" ADD CONSTRAINT "assessment_responses_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "assessment_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_responses" ADD CONSTRAINT "assessment_responses_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "assessment_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_responses" ADD CONSTRAINT "assessment_responses_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "assessment_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "path_courses" ADD CONSTRAINT "path_courses_path_id_fkey" FOREIGN KEY ("path_id") REFERENCES "paths"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "path_courses" ADD CONSTRAINT "path_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_paths" ADD CONSTRAINT "user_paths_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_paths" ADD CONSTRAINT "user_paths_path_id_fkey" FOREIGN KEY ("path_id") REFERENCES "paths"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_path_courses" ADD CONSTRAINT "user_path_courses_user_path_id_fkey" FOREIGN KEY ("user_path_id") REFERENCES "user_paths"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_path_courses" ADD CONSTRAINT "user_path_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
