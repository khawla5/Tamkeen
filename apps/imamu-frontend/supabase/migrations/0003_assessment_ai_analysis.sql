-- ============================================================
-- Fursati · revision 0003
-- Add an `ai_analysis` JSONB column to assessment_responses to
-- store the structured Gemini output (top_match, why, strengths,
-- growth_areas, first_steps).
-- ============================================================

alter table public.assessment_responses
  add column if not exists ai_analysis jsonb;

-- assessment_responses had a unique(user_id) constraint so users can re-take.
-- Nothing else to change.
