-- Phase 5, sub-phase 5.6 — the product knobs an administrator may change (D-072).
--
-- Key-value, which is the one place in this schema that shape is right: the set
-- of settings changes with the product rather than with the data, and a column
-- per knob would need a migration every time the ministry wanted a new one —
-- exactly the deployment §4C.6 exists to avoid. `SettingsService` supplies the
-- typing a column would have given, by parsing every value against the same Zod
-- schema the environment is validated with.
--
-- No rows are inserted. An absent row means "use the environment", so a fresh
-- deployment behaves exactly as it did before this table existed, and an
-- administrator's first save is what starts overriding.
CREATE TABLE "settings" (
  "key"                TEXT         NOT NULL,
  "value"              TEXT         NOT NULL,
  "updated_by_user_id" UUID,
  "updated_at"         TIMESTAMP(3) NOT NULL,

  CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- SetNull, not Cascade: a setting outlives the administrator who last changed
-- it, and the audit log carries the full history either way.
ALTER TABLE "settings"
  ADD CONSTRAINT "settings_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
