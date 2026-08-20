-- ============================================================
-- Fursati - revision 0011
-- Persist role-specific fields collected during signup.
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
  v_fields       jsonb := coalesce(new.raw_user_meta_data->'role_fields', '{}'::jsonb);
begin
  insert into public.users (id, email, role, name, name_ar)
  values (new.id, new.email, v_role, v_name, v_name_ar);

  case v_role
    when 'student' then
      insert into public.student_profiles (
        user_id, university, major, graduation_year, gpa
      )
      values (
        new.id,
        nullif(v_fields->>'university', ''),
        nullif(v_fields->>'major', ''),
        nullif(v_fields->>'graduationYear', '')::int,
        nullif(v_fields->>'gpa', '')::numeric
      );

    when 'retiree' then
      insert into public.retiree_profiles (
        user_id, industry, years_experience, expertise, availability
      )
      values (
        new.id,
        nullif(v_fields->>'industry', ''),
        nullif(v_fields->>'yearsExperience', '')::int,
        case
          when nullif(v_fields->>'expertise', '') is null then '{}'
          else string_to_array(v_fields->>'expertise', ',')
        end,
        nullif(v_fields->>'availability', '')
      );

    when 'employee' then
      insert into public.employee_profiles (
        user_id, job_title, company_name, years_in_role
      )
      values (
        new.id,
        nullif(v_fields->>'jobTitle', ''),
        nullif(v_fields->>'companyName', ''),
        nullif(v_fields->>'yearsExperience', '')::int
      );

    when 'company' then
      insert into public.companies (user_id, name, name_ar, industry, size, location)
      values (
        new.id,
        coalesce(nullif(v_fields->>'companyName', ''), v_display_name),
        v_name_ar,
        nullif(v_fields->>'companyIndustry', ''),
        nullif(v_fields->>'companySize', ''),
        nullif(v_fields->>'companyLocation', '')
      );

    when 'university' then
      insert into public.universities (user_id, name, name_ar, location, total_students)
      values (
        new.id,
        coalesce(nullif(v_fields->>'universityName', ''), v_display_name),
        v_name_ar,
        nullif(v_fields->>'universityLocation', ''),
        coalesce(nullif(v_fields->>'totalStudents', '')::int, 0)
      );

    when 'provider' then
      insert into public.course_providers (user_id, name, name_ar)
      values (
        new.id,
        coalesce(nullif(v_fields->>'academyName', ''), v_display_name),
        v_name_ar
      );
  end case;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
