-- ============================================================
-- Fursati · revision 0008
-- Notifications table + auto-notification triggers.
--
-- Design:
--   * One row per notification, owned by the recipient (user_id).
--   * `type` is a string code; the frontend renders title/body from
--     `metadata` for full bilingual control (no text in the DB).
--   * Triggers populate notifications for the two primary events:
--       1. Application created  -> notify the opportunity owner.
--       2. Application status changed -> notify the applicant.
--   * Realtime publication is enabled so the bell badge updates live.
-- Idempotent.
-- ============================================================

-- ---------- table ----------
create table if not exists public.notifications (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  type        text not null,
  metadata    jsonb not null default '{}'::jsonb,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);

create index if not exists idx_notifications_user_unread
  on public.notifications (user_id)
  where read_at is null;

-- ---------- RLS ----------
alter table public.notifications enable row level security;

drop policy if exists notifications_owner_select on public.notifications;
create policy notifications_owner_select on public.notifications
  for select using (user_id = auth.uid());

drop policy if exists notifications_owner_update on public.notifications;
create policy notifications_owner_update on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notifications_owner_delete on public.notifications;
create policy notifications_owner_delete on public.notifications
  for delete using (user_id = auth.uid());

-- No INSERT policy: notifications are only created by SECURITY DEFINER
-- triggers, never by users directly.

-- ---------- realtime ----------
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename  = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ============================================================
-- Trigger 1: new application -> notify opportunity owner
-- ============================================================
create or replace function public.fn_notify_on_application_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id    uuid;
  v_title       text;
  v_title_ar    text;
  v_applicant   text;
  v_applicant_ar text;
  v_link        text;
begin
  -- Resolve the opportunity owner (company OR provider).
  select
    coalesce(c.user_id, p.user_id),
    o.title,
    o.title_ar,
    case
      when c.user_id is not null then '/dashboard/company'
      when p.user_id is not null then '/dashboard/provider'
      else '/'
    end
  into v_owner_id, v_title, v_title_ar, v_link
  from public.opportunities o
  left join public.companies        c on c.id = o.company_id
  left join public.course_providers p on p.id = o.provider_id
  where o.id = NEW.opportunity_id;

  if v_owner_id is null then
    return NEW; -- orphan opportunity, nothing to notify
  end if;

  -- Don't notify if the owner is somehow the applicant (shouldn't happen).
  if v_owner_id = NEW.user_id then
    return NEW;
  end if;

  -- Resolve applicant display name.
  select u.name, u.name_ar
  into v_applicant, v_applicant_ar
  from public.users u
  where u.id = NEW.user_id;

  insert into public.notifications (user_id, type, metadata, link)
  values (
    v_owner_id,
    'application_received',
    jsonb_build_object(
      'application_id',       NEW.id,
      'opportunity_id',       NEW.opportunity_id,
      'opportunity_title',    v_title,
      'opportunity_title_ar', v_title_ar,
      'applicant_name',       v_applicant,
      'applicant_name_ar',    v_applicant_ar
    ),
    v_link
  );

  return NEW;
end;
$$;

drop trigger if exists trg_notify_on_application_insert on public.applications;
create trigger trg_notify_on_application_insert
  after insert on public.applications
  for each row execute function public.fn_notify_on_application_insert();

-- ============================================================
-- Trigger 2: application status changed -> notify applicant
-- ============================================================
create or replace function public.fn_notify_on_application_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title       text;
  v_title_ar    text;
  v_company     text;
  v_company_ar  text;
begin
  -- Only fire on real status changes.
  if NEW.status is not distinct from OLD.status then
    return NEW;
  end if;

  select
    o.title,
    o.title_ar,
    coalesce(c.name, p.name),
    coalesce(c.name_ar, p.name_ar)
  into v_title, v_title_ar, v_company, v_company_ar
  from public.opportunities o
  left join public.companies        c on c.id = o.company_id
  left join public.course_providers p on p.id = o.provider_id
  where o.id = NEW.opportunity_id;

  insert into public.notifications (user_id, type, metadata, link)
  values (
    NEW.user_id,
    'application_status_changed',
    jsonb_build_object(
      'application_id',       NEW.id,
      'opportunity_id',       NEW.opportunity_id,
      'opportunity_title',    v_title,
      'opportunity_title_ar', v_title_ar,
      'company_name',         v_company,
      'company_name_ar',      v_company_ar,
      'old_status',           OLD.status,
      'new_status',           NEW.status
    ),
    '/opportunities'
  );

  return NEW;
end;
$$;

drop trigger if exists trg_notify_on_application_status_change on public.applications;
create trigger trg_notify_on_application_status_change
  after update of status on public.applications
  for each row execute function public.fn_notify_on_application_status_change();

-- ---------- reload PostgREST schema cache ----------
notify pgrst, 'reload schema';
