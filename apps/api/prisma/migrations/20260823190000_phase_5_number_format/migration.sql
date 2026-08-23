-- Phase 5, sub-phase 5.9 — a per-person digits preference (§4.12, D-018).
--
-- Nullable, and null means "follow the system default". So this migration
-- changes nothing for anybody: every existing account keeps seeing whatever
-- §4C.6 sets, and only an explicit choice overrides it.
--
-- Text rather than an enum: the two values live in `NUMBER_FORMATS` in
-- @tamkeen/types and are validated there and in the DTO, and an enum here would
-- be a third place to keep in step for a column with two possible values.
ALTER TABLE "users" ADD COLUMN "number_format" TEXT;
