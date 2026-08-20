-- ============================================================
-- Fursati · revision 0010
-- Point the application_status_changed notification at the new
-- "My Applications" page instead of the marketplace.
--
-- The trigger function definition in 0008 is replaced wholesale
-- (CREATE OR REPLACE), so this is fully idempotent.
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
    '/applications'
  );

  return NEW;
end;
$$;

notify pgrst, 'reload schema';
