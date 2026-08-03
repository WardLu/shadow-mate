create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;

create or replace function private.learning_current_user_has_password()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  has_password boolean;
begin
  if current_user_id is null then
    raise exception 'learning_authentication_required' using errcode = '42501';
  end if;

  select coalesce(length(encrypted_password) > 0, false)
    into has_password
    from auth.users
   where id = current_user_id;

  return coalesce(has_password, false);
end;
$$;

revoke all on function private.learning_current_user_has_password() from public;
revoke all on function private.learning_current_user_has_password() from anon;
grant execute on function private.learning_current_user_has_password() to authenticated;

create or replace function public.learning_has_password()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.learning_current_user_has_password();
$$;

revoke all on function public.learning_has_password() from public;
revoke all on function public.learning_has_password() from anon;
grant execute on function public.learning_has_password() to authenticated;

comment on function public.learning_has_password() is
  'Returns whether the current authenticated Supabase Auth identity has an email password without exposing its hash.';
