-- ============================================================
-- Tamkeen · revision 0013
-- University dashboard metrics. One JSONB row per university holds the
-- presidential-scale headline numbers and drill-down lists so the IMSIU
-- dashboard reads real Supabase data at believable scale without creating
-- thousands of auth users.
-- Additive only — no existing table/policy is modified.
-- ============================================================

create table if not exists public.university_metrics (
  id            uuid primary key default uuid_generate_v4(),
  university_id uuid not null unique references public.universities(id) on delete cascade,
  metrics       jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);

create index if not exists idx_university_metrics_university
  on public.university_metrics (university_id);

-- updated_at trigger (reuses the shared set_updated_at function from 0001)
drop trigger if exists trg_university_metrics_updated on public.university_metrics;
create trigger trg_university_metrics_updated
  before update on public.university_metrics
  for each row execute function public.set_updated_at();

-- ---------- RLS ----------
alter table public.university_metrics enable row level security;

-- A university may read only its own metrics row. Writes are service-role only
-- (service role bypasses RLS), so no insert/update policy is granted to users.
drop policy if exists university_metrics_owner_select on public.university_metrics;
create policy university_metrics_owner_select on public.university_metrics
  for select using (
    university_id in (select id from public.universities where user_id = auth.uid())
  );

-- ---------- reload PostgREST schema cache ----------
notify pgrst, 'reload schema';
