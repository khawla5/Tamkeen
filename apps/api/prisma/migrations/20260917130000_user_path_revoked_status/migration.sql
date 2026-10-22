-- An administrator may now unassign a path even after the learner has been
-- placed on it. The row (and everything under it — placement, enrolments,
-- completions, certificates) is kept as history: it moves to REVOKED rather
-- than being deleted, and a REVOKED row is excluded everywhere a learner's
-- own state is read while still surfacing on the admin account panel.
ALTER TYPE "UserPathStatus" ADD VALUE 'REVOKED';
