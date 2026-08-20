-- ============================================================
-- Fursati · revision 0009
-- Track first-login onboarding completion at the user level so
-- the welcome wizard only appears once per account.
--
-- Idempotent.
-- ============================================================

alter table public.users
  add column if not exists onboarded_at timestamptz;

-- ---------- reload PostgREST schema cache ----------
notify pgrst, 'reload schema';
