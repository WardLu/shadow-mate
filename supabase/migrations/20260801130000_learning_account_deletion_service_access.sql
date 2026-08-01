-- The account-deletion Edge Function uses a server-only service key only to
-- verify project isolation. Product data is removed through the existing
-- authenticated, RLS-protected deletion RPC. Keep this grant narrow; browser
-- roles retain no access through this change.
do $grant_account_deletion_access$
begin
  if to_regclass('public.projects') is not null then
    grant select (project_id) on table public.projects to service_role;
  end if;

  if to_regclass('public.learning_households') is not null then
    alter table public.learning_households enable row level security;
  end if;
end
$grant_account_deletion_access$;
