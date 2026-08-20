-- Extend the student profile into a career-profile center.
-- These fields support matching, CV generation, interview prep, alumni
-- networking, and employer-facing applications without collecting sensitive
-- personal data.

alter table public.users
  add column if not exists phone text,
  add column if not exists city text,
  add column if not exists region text;

alter table public.student_profiles
  add column if not exists college text,
  add column if not exists college_ar text,
  add column if not exists student_number text,
  add column if not exists current_status text,
  add column if not exists career_interests text[] not null default '{}',
  add column if not exists preferred_opportunity_types text[] not null default '{}',
  add column if not exists work_preference text,
  add column if not exists available_from date,
  add column if not exists linkedin_url text,
  add column if not exists portfolio_url text,
  add column if not exists github_url text,
  add column if not exists behance_url text,
  add column if not exists additional_links text[] not null default '{}',
  add column if not exists languages jsonb not null default '[]'::jsonb,
  add column if not exists professional_summary text;
