-- §4.12's "email (verified; re-verify on change)", owed since Phase 1.
--
-- The pending address lives on the TOKEN, not on the user row. An abandoned
-- request then leaves nothing behind on the account, two requests in a row
-- supersede each other by the same invalidation the verification flow already
-- does, and there is no window in which `users.email` holds an address nobody
-- has proved they can read.
ALTER TYPE "AuthTokenType" ADD VALUE 'EMAIL_CHANGE';

ALTER TABLE "auth_tokens" ADD COLUMN "new_email" TEXT;
