-- ============================================================
-- Fursati · revision 0002
-- Extend the signup trigger to also create the role-specific
-- profile row (student_profiles, companies, etc.) so that every
-- new user is immediately "complete" enough to act in their role.
-- ============================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role         public.user_role := coalesce(
                                       (new.raw_user_meta_data->>'role')::user_role,
                                       'student'
                                     );
  v_name         text := new.raw_user_meta_data->>'name';
  v_name_ar      text := new.raw_user_meta_data->>'name_ar';
  v_display_name text := coalesce(v_name, split_part(new.email, '@', 1));
begin
  -- 1. always create the public.users row
  insert into public.users (id, email, role, name, name_ar)
  values (new.id, new.email, v_role, v_name, v_name_ar);

  -- 2. create the role-specific profile row
  case v_role
    when 'student' then
      insert into public.student_profiles (user_id)
      values (new.id);

    when 'retiree' then
      insert into public.retiree_profiles (user_id)
      values (new.id);

    when 'employee' then
      insert into public.employee_profiles (user_id)
      values (new.id);

    when 'company' then
      insert into public.companies (user_id, name, name_ar)
      values (new.id, v_display_name, v_name_ar);

    when 'university' then
      insert into public.universities (user_id, name, name_ar)
      values (new.id, v_display_name, v_name_ar);

    when 'provider' then
      insert into public.course_providers (user_id, name, name_ar)
      values (new.id, v_display_name, v_name_ar);
  end case;

  return new;
end $$;

-- The trigger itself is unchanged; it already references the function above.
-- (Re-installing it is safe and idempotent.)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
