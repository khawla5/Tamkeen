-- §4C.5's availability window (TAM-134, ministry direction 2026-08-25).
--
-- Two nullable bounds rather than one "expires_at": the ministry asked for an
-- availability *period*, and a course that opens on a date is as ordinary a
-- request as one that closes on it. NULL means "no bound", so every course that
-- existed before this migration keeps behaving exactly as it did.
--
-- Deliberately NOT a new status. `courses.status` stays derived by
-- `effectiveCourseStatus` (D-059) and the window is one more input to it, which
-- is what keeps the guarantee that no combination of inputs takes a course away
-- from a learner who already holds it (§2/D-015).
ALTER TABLE "courses" ADD COLUMN "available_from" TIMESTAMP(3);
ALTER TABLE "courses" ADD COLUMN "available_until" TIMESTAMP(3);

-- The refresh that hides an expired course scans for a bound that has passed;
-- without this it reads the whole catalogue every sync cycle.
CREATE INDEX "courses_available_until_idx" ON "courses"("available_until");
