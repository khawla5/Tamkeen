-- ============================================================
-- Fursati · revision 0006
-- Add AI rating columns to cv_data so we can persist the result
-- of /functions/v1/cv-analysis and detect when the rating is
-- stale relative to a freshly-edited CV.
-- ============================================================

alter table public.cv_data
  add column if not exists ai_rating jsonb,
  add column if not exists ai_rating_at timestamptz;
