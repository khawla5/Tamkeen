-- ============================================================
-- Fursati · revision 0005
-- Add public.applications to the supabase_realtime publication so
-- the company dashboard can listen for new applicants in real time.
-- Idempotent.
-- ============================================================

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename  = 'applications'
  ) then
    alter publication supabase_realtime add table public.applications;
  end if;
end $$;
