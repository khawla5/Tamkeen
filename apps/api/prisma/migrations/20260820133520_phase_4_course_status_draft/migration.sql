-- Adds DRAFT to CourseStatus, alone, in its own migration.
--
-- This is deliberately separated from the rest of Phase 4 rather than being
-- untidy. PostgreSQL 12+ permits ALTER TYPE ... ADD VALUE inside a transaction
-- but refuses to let the new value be *used* until that transaction commits,
-- and Prisma runs each migration in one transaction. The next migration sets
-- `courses.status`'s default to 'DRAFT', so the two cannot share one.
ALTER TYPE "CourseStatus" ADD VALUE 'DRAFT';
