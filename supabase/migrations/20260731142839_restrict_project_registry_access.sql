-- Shared Supabase installations may already expose the product registry.
-- Preserve public product discovery while keeping feature and pricing
-- configuration outside the anonymous Data API surface. On standalone installs
-- this runs before the compatibility migration creates the table, so the later
-- migration applies the same column-level grants.
do $restrict_registry$
begin
  if to_regclass('public.projects') is not null then
    revoke all on table public.projects from anon, authenticated;

    grant select (project_id, project_name)
      on table public.projects to anon, authenticated;
  end if;
end
$restrict_registry$;
