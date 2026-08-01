-- Owner-controlled family workspace deletion.
-- Auth identities are deliberately not deleted here; this removes the product
-- data owned by the household and leaves identity closure to the auth provider.

create or replace function public.learning_delete_household(
  p_household_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if not exists (
    select 1
    from public.learning_households household
    where household.id = p_household_id
      and household.project_id = 'shadow-mate'
      and household.owner_user_id = (select auth.uid())
  ) then
    raise exception 'learning_household_delete_forbidden'
      using errcode = '42501';
  end if;

  delete from public.learning_households
  where id = p_household_id
    and project_id = 'shadow-mate';
end;
$function$;

revoke all on function public.learning_delete_household(uuid) from public;
revoke all on function public.learning_delete_household(uuid) from anon;
grant execute on function public.learning_delete_household(uuid) to authenticated;
