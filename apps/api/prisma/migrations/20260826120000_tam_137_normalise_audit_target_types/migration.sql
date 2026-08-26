-- One spelling per concept in `audit_log.target_type` (TAM-137).
--
-- The column was written from ~50 call sites with no type behind it, and two
-- concepts ended up with two spellings each: `User` alongside `user`, and
-- `Entity` alongside the snake_case every other call site used. That is not
-- cosmetic. §4C.8 filters and groups by this column, so one concept in two
-- buckets means a filter that looks complete and returns a fraction of the
-- rows — the failure mode an audit trail must not have.
--
-- The call sites are now typed against AUDIT_TARGET_TYPES and cannot drift
-- again. This brings the rows already written into line with them; without it
-- the history stays unfindable through the very filter that was fixed.
UPDATE "audit_log" SET "target_type" = 'user' WHERE "target_type" = 'User';
UPDATE "audit_log" SET "target_type" = 'entity' WHERE "target_type" = 'Entity';
