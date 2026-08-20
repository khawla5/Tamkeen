-- ============================================================
-- Fursati · initial schema
-- Revision: 0001
-- ============================================================

-- ---------- extensions ----------
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ---------- enums ----------
do $$ begin
  create type user_role as enum (
    'student','retiree','employee','company','university','provider'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type opportunity_type as enum (
    'job','training','coop','certification','career_path','consulting'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type application_status as enum (
    'submitted','reviewed','shortlisted','accepted','rejected','cv_update_required'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type interview_type as enum ('technical','behavioral','hr','panel');
exception when duplicate_object then null; end $$;

do $$ begin
  create type company_plan as enum ('basic','premium');
exception when duplicate_object then null; end $$;

-- ============================================================
-- IDENTITY
-- ============================================================
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        user_role not null,
  email       text unique not null,
  name        text,
  name_ar     text,
  avatar_url  text,
  subtitle    text,
  subtitle_ar text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- ROLE PROFILES
-- ============================================================
create table if not exists public.student_profiles (
  user_id                       uuid primary key references public.users(id) on delete cascade,
  university                    text,
  university_ar                 text,
  major                         text,
  major_ar                      text,
  graduation_year               int,
  gpa                           numeric(3,2),
  profile_completion            int default 0 check (profile_completion between 0 and 100),
  cv_score                      int default 0 check (cv_score between 0 and 100),
  recommended_career_path_id    uuid,
  assessment_completed          boolean default false,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

create table if not exists public.retiree_profiles (
  user_id            uuid primary key references public.users(id) on delete cascade,
  industry           text,
  industry_ar        text,
  years_experience   int,
  expertise          text[] default '{}',
  expertise_ar       text[] default '{}',
  availability       text,
  preferred_work     text[] default '{}',
  profile_completion int default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Note: avoid the reserved keyword `current_role` (it's a built-in PG function).
create table if not exists public.employee_profiles (
  user_id           uuid primary key references public.users(id) on delete cascade,
  job_title         text,
  job_title_ar      text,
  company_name      text,
  years_in_role     int,
  upskilling_goals  text[] default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.companies (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid unique references public.users(id) on delete cascade,
  name        text not null,
  name_ar     text,
  logo_url    text,
  industry    text,
  size        text,
  location    text,
  plan        company_plan default 'basic',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.universities (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid unique references public.users(id) on delete cascade,
  name            text not null,
  name_ar         text,
  logo_url        text,
  location        text,
  total_students  int default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.course_providers (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid unique references public.users(id) on delete cascade,
  name        text not null,
  name_ar     text,
  logo_url    text,
  rating      numeric(2,1) default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- CONTENT / CATALOG
-- ============================================================
create table if not exists public.career_paths (
  id              uuid primary key default uuid_generate_v4(),
  title           text not null,
  title_ar        text,
  icon            text,
  description     text,
  description_ar  text,
  stages          text[] default '{}',
  stages_ar       text[] default '{}',
  required_skills text[] default '{}',
  avg_salary      text,
  created_at      timestamptz not null default now()
);

alter table public.student_profiles
  drop constraint if exists fk_recommended_career_path,
  add  constraint fk_recommended_career_path
       foreign key (recommended_career_path_id)
       references public.career_paths(id);

create table if not exists public.assessment_questions (
  id            uuid primary key default uuid_generate_v4(),
  section       text not null,
  question      text not null,
  question_ar   text,
  options       jsonb not null,
  display_order int default 0
);

create table if not exists public.cv_templates (
  id      uuid primary key default uuid_generate_v4(),
  name    text not null,
  name_ar text,
  color   text,
  popular boolean default false
);

-- ============================================================
-- ENGAGEMENTS / USER DATA
-- ============================================================
create table if not exists public.assessment_responses (
  id                     uuid primary key default uuid_generate_v4(),
  user_id                uuid not null references public.users(id) on delete cascade,
  answers                jsonb not null,
  result_career_path_id  uuid references public.career_paths(id),
  match_score            int,
  completed_at           timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.cv_data (
  user_id      uuid primary key references public.users(id) on delete cascade,
  template_id  uuid references public.cv_templates(id),
  personal     jsonb default '{}'::jsonb,
  education    jsonb default '[]'::jsonb,
  experience   jsonb default '[]'::jsonb,
  skills       jsonb default '[]'::jsonb,
  languages    jsonb default '[]'::jsonb,
  cv_file_url  text,
  updated_at   timestamptz not null default now()
);

create table if not exists public.student_skills (
  id          uuid primary key default uuid_generate_v4(),
  student_id  uuid not null references public.student_profiles(user_id) on delete cascade,
  name        text not null,
  level       int check (level between 0 and 100),
  created_at  timestamptz not null default now(),
  unique (student_id, name)
);

create table if not exists public.retiree_engagements (
  id          uuid primary key default uuid_generate_v4(),
  retiree_id  uuid not null references public.retiree_profiles(user_id) on delete cascade,
  company     text,
  role        text,
  duration    text,
  rating      numeric(2,1) check (rating between 0 and 5),
  created_at  timestamptz not null default now()
);

-- ============================================================
-- OPPORTUNITIES / MARKETPLACE
-- ============================================================
create table if not exists public.opportunities (
  id              uuid primary key default uuid_generate_v4(),
  company_id      uuid references public.companies(id) on delete cascade,
  title           text not null,
  title_ar        text,
  type            opportunity_type not null,
  location        text,
  location_ar     text,
  duration        text,
  duration_ar     text,
  salary          text,
  salary_ar       text,
  description     text,
  description_ar  text,
  skills          text[] default '{}',
  deadline        date,
  for_retirees    boolean default false,
  is_active       boolean default true,
  applicant_limit int,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.applications (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.users(id) on delete cascade,
  opportunity_id  uuid not null references public.opportunities(id) on delete cascade,
  status          application_status not null default 'submitted',
  cover_letter    text,
  applied_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, opportunity_id)
);

create table if not exists public.interviews (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.users(id) on delete cascade,
  application_id  uuid references public.applications(id) on delete cascade,
  company         text,
  scheduled_at    timestamptz not null,
  type            interview_type default 'technical',
  notes           text,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- LEARNING
-- ============================================================
create table if not exists public.courses (
  id              uuid primary key default uuid_generate_v4(),
  provider_id     uuid references public.course_providers(id) on delete cascade,
  name            text not null,
  name_ar         text,
  description     text,
  description_ar  text,
  price           numeric(10,2) default 0,
  is_active       boolean default true,
  created_at      timestamptz not null default now()
);

create table if not exists public.course_enrollments (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.users(id) on delete cascade,
  course_id     uuid not null references public.courses(id) on delete cascade,
  progress      int default 0 check (progress between 0 and 100),
  enrolled_at   timestamptz not null default now(),
  completed_at  timestamptz,
  unique (user_id, course_id)
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_opportunities_type      on public.opportunities (type) where is_active;
create index if not exists idx_opportunities_deadline  on public.opportunities (deadline) where is_active;
create index if not exists idx_opportunities_skills    on public.opportunities using gin (skills);
create index if not exists idx_opportunities_search
  on public.opportunities using gin (title gin_trgm_ops, description gin_trgm_ops);
create index if not exists idx_applications_user       on public.applications (user_id, status);
create index if not exists idx_applications_opp        on public.applications (opportunity_id, status);
create index if not exists idx_users_role              on public.users (role);

-- ============================================================
-- TRIGGERS
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  for t in
    select table_name
    from information_schema.columns
    where table_schema = 'public' and column_name = 'updated_at'
  loop
    execute format(
      'drop trigger if exists trg_%I_updated on public.%I;
       create trigger trg_%I_updated
         before update on public.%I
         for each row execute function public.set_updated_at();',
      t, t, t, t
    );
  end loop;
end $$;

-- Auto-create public.users row when a new auth user signs up.
-- Pass `role` (and optionally `name`, `name_ar`) via the auth metadata
-- on signUp({ options: { data: { role, name, name_ar } } }).
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, role, name, name_ar)
  values (
    new.id,
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'student'),
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'name_ar'
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================
alter table public.users                 enable row level security;
alter table public.student_profiles      enable row level security;
alter table public.retiree_profiles      enable row level security;
alter table public.employee_profiles     enable row level security;
alter table public.companies             enable row level security;
alter table public.universities          enable row level security;
alter table public.course_providers      enable row level security;
alter table public.opportunities         enable row level security;
alter table public.applications          enable row level security;
alter table public.student_skills        enable row level security;
alter table public.retiree_engagements   enable row level security;
alter table public.career_paths          enable row level security;
alter table public.assessment_questions  enable row level security;
alter table public.assessment_responses  enable row level security;
alter table public.cv_data               enable row level security;
alter table public.cv_templates          enable row level security;
alter table public.courses               enable row level security;
alter table public.course_enrollments    enable row level security;
alter table public.interviews            enable row level security;

-- USERS
drop policy if exists users_read on public.users;
create policy users_read on public.users
  for select using (auth.role() = 'authenticated');

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update using (id = auth.uid());

-- ROLE PROFILES (owner full access; public read for browse pages)
drop policy if exists student_profile_self on public.student_profiles;
create policy student_profile_self on public.student_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists student_profile_read on public.student_profiles;
create policy student_profile_read on public.student_profiles for select using (true);

drop policy if exists retiree_profile_self on public.retiree_profiles;
create policy retiree_profile_self on public.retiree_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists retiree_profile_read on public.retiree_profiles;
create policy retiree_profile_read on public.retiree_profiles for select using (true);

drop policy if exists employee_profile_self on public.employee_profiles;
create policy employee_profile_self on public.employee_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists companies_self on public.companies;
create policy companies_self on public.companies
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists companies_read on public.companies;
create policy companies_read on public.companies for select using (true);

drop policy if exists universities_self on public.universities;
create policy universities_self on public.universities
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists universities_read on public.universities;
create policy universities_read on public.universities for select using (true);

drop policy if exists providers_self on public.course_providers;
create policy providers_self on public.course_providers
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists providers_read on public.course_providers;
create policy providers_read on public.course_providers for select using (true);

-- OPPORTUNITIES
drop policy if exists opps_read on public.opportunities;
create policy opps_read on public.opportunities for select using (
  is_active
  or company_id in (select id from public.companies where user_id = auth.uid())
);

drop policy if exists opps_write on public.opportunities;
create policy opps_write on public.opportunities
  for all
  using      (company_id in (select id from public.companies where user_id = auth.uid()))
  with check (company_id in (select id from public.companies where user_id = auth.uid()));

-- APPLICATIONS
drop policy if exists apps_applicant on public.applications;
create policy apps_applicant on public.applications
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists apps_company_read on public.applications;
create policy apps_company_read on public.applications for select using (
  opportunity_id in (
    select o.id from public.opportunities o
    join public.companies c on c.id = o.company_id
    where c.user_id = auth.uid()
  )
);

drop policy if exists apps_company_update on public.applications;
create policy apps_company_update on public.applications for update using (
  opportunity_id in (
    select o.id from public.opportunities o
    join public.companies c on c.id = o.company_id
    where c.user_id = auth.uid()
  )
);

-- SKILLS / ENGAGEMENTS
drop policy if exists skills_self on public.student_skills;
create policy skills_self on public.student_skills
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());
drop policy if exists skills_read on public.student_skills;
create policy skills_read on public.student_skills for select using (true);

drop policy if exists eng_self on public.retiree_engagements;
create policy eng_self on public.retiree_engagements
  for all using (retiree_id = auth.uid()) with check (retiree_id = auth.uid());

-- CATALOG (public read)
drop policy if exists career_paths_read on public.career_paths;
create policy career_paths_read on public.career_paths for select using (true);

drop policy if exists cv_templates_read on public.cv_templates;
create policy cv_templates_read on public.cv_templates for select using (true);

drop policy if exists assessment_q_read on public.assessment_questions;
create policy assessment_q_read on public.assessment_questions for select using (true);

-- USER-SCOPED CONTENT
drop policy if exists assessment_self on public.assessment_responses;
create policy assessment_self on public.assessment_responses
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists cv_self on public.cv_data;
create policy cv_self on public.cv_data
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- COURSES
drop policy if exists courses_read on public.courses;
create policy courses_read on public.courses for select using (is_active);

drop policy if exists courses_write on public.courses;
create policy courses_write on public.courses
  for all
  using      (provider_id in (select id from public.course_providers where user_id = auth.uid()))
  with check (provider_id in (select id from public.course_providers where user_id = auth.uid()));

drop policy if exists enrollments_self on public.course_enrollments;
create policy enrollments_self on public.course_enrollments
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists interviews_self on public.interviews;
create policy interviews_self on public.interviews
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
insert into storage.buckets (id, name, public)
values
  ('avatars',       'avatars',       true),
  ('company_logos', 'company_logos', true),
  ('cvs',           'cvs',           false)
on conflict (id) do nothing;

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists avatars_write on storage.objects;
create policy avatars_write on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists logos_read on storage.objects;
create policy logos_read on storage.objects for select
  using (bucket_id = 'company_logos');

drop policy if exists logos_write on storage.objects;
create policy logos_write on storage.objects for insert
  with check (
    bucket_id = 'company_logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists cvs_self on storage.objects;
create policy cvs_self on storage.objects for all
  using      (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);
