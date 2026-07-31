-- Standalone installs do not have the shared multi-product registry used by
-- WardLu's hosted Supabase project. Create the smallest compatible registry
-- only when it is absent; existing shared databases are left untouched.

do $bootstrap$
begin
  if to_regclass('public.projects') is null then
    create table public.projects (
      id uuid primary key default gen_random_uuid(),
      project_id text not null unique,
      project_name text not null,
      features_config jsonb not null default '{}'::jsonb,
      pricing_config jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    alter table public.projects enable row level security;

    revoke all on table public.projects from anon, authenticated;
    grant select (project_id, project_name)
      on table public.projects to anon, authenticated;

    create policy "projects: public read"
      on public.projects
      for select
      to anon, authenticated
      using (true);
  end if;
end
$bootstrap$;
