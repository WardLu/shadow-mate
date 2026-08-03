-- Fix: learning_has_password must not rely on auth.users.encrypted_password.
-- GoTrue auto-generates a bcrypt hash for OTP-created users, so
-- length(encrypted_password) > 0 returns true even for passwordless users.
-- Instead, check raw_user_meta_data->>'shared_password_set' which the
-- frontend sets via updateUser({ data: { shared_password_set: true } })
-- when the user actively sets a shared password.

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

  select coalesce(
    raw_user_meta_data->>'shared_password_set' = 'true',
    false
  )
    into has_password
    from auth.users
   where id = current_user_id;

  return coalesce(has_password, false);
end;
$$;

revoke all on function private.learning_current_user_has_password() from public;
revoke all on function private.learning_current_user_has_password() from anon;
grant execute on function private.learning_current_user_has_password() to authenticated;

comment on function private.learning_current_user_has_password() is
  'Returns whether the current user has actively set a shared password, based on user metadata rather than the GoTrue-managed encrypted_password column which is auto-populated for OTP users.';
