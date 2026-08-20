-- ============================================================
-- Fursati · revision 0007
-- Unify provider courses into the opportunities table.
-- A training is a training: students should find them all in
-- one place. After this migration the courses + course_enrollments
-- tables go away — providers post into opportunities directly.
-- ============================================================

-- 1. Add new columns to opportunities so providers can own them
alter table public.opportunities
  add column if not exists provider_id uuid
    references public.course_providers(id) on delete cascade,
  add column if not exists price numeric(10,2) not null default 0;

-- 2. Make sure each opportunity has exactly one owner (company XOR provider).
-- Existing rows have company_id set + provider_id null → satisfied.
alter table public.opportunities
  drop constraint if exists opportunities_owner_check;
alter table public.opportunities
  add constraint opportunities_owner_check
  check (
    (company_id is not null and provider_id is null)
    or (company_id is null and provider_id is not null)
  );

-- 3. Migrate every existing course → opportunity (preserve uuid for FK continuity)
insert into public.opportunities (
  id, provider_id, type, title, title_ar,
  description, description_ar, price, is_active, created_at
)
select
  c.id, c.provider_id, 'training'::opportunity_type, c.name, c.name_ar,
  c.description, c.description_ar, c.price, c.is_active, c.created_at
from public.courses c
on conflict (id) do nothing;

-- 4. Migrate enrollments → applications (treat enrollment as 'accepted')
insert into public.applications (
  id, user_id, opportunity_id, status, applied_at, updated_at
)
select
  ce.id, ce.user_id, ce.course_id, 'accepted'::application_status,
  ce.enrolled_at, coalesce(ce.completed_at, ce.enrolled_at)
from public.course_enrollments ce
on conflict (user_id, opportunity_id) do nothing;

-- 5. Update RLS — providers can also write opportunities they own
drop policy if exists opps_read on public.opportunities;
create policy opps_read on public.opportunities for select using (
  is_active
  or company_id  in (select id from public.companies        where user_id = auth.uid())
  or provider_id in (select id from public.course_providers where user_id = auth.uid())
);

drop policy if exists opps_write on public.opportunities;
create policy opps_write on public.opportunities for all
  using      (
    company_id  in (select id from public.companies        where user_id = auth.uid())
    or provider_id in (select id from public.course_providers where user_id = auth.uid())
  )
  with check (
    company_id  in (select id from public.companies        where user_id = auth.uid())
    or provider_id in (select id from public.course_providers where user_id = auth.uid())
  );

-- 6. Update applications RLS — providers see/manage applicants on their opps too
drop policy if exists apps_company_read on public.applications;
create policy apps_company_read on public.applications for select using (
  opportunity_id in (
    select o.id from public.opportunities o
    join public.companies c on c.id = o.company_id
    where c.user_id = auth.uid()
  )
  or opportunity_id in (
    select o.id from public.opportunities o
    join public.course_providers p on p.id = o.provider_id
    where p.user_id = auth.uid()
  )
);

drop policy if exists apps_company_update on public.applications;
create policy apps_company_update on public.applications for update using (
  opportunity_id in (
    select o.id from public.opportunities o
    join public.companies c on c.id = o.company_id
    where c.user_id = auth.uid()
  )
  or opportunity_id in (
    select o.id from public.opportunities o
    join public.course_providers p on p.id = o.provider_id
    where p.user_id = auth.uid()
  )
);

-- 7. Drop the old tables (cascades clean their RLS policies)
drop table if exists public.course_enrollments cascade;
drop table if exists public.courses cascade;
