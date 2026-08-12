-- Keep anonymous password-status calls denied without relying on a revoked
-- EXECUTE privilege. On the local Supabase PostgreSQL image, invoking a
-- security-invoker SQL function with EXECUTE revoked for anon can terminate
-- the backend instead of returning a normal 42501 error.
--
-- The underlying security-definer function still requires auth.uid(), so
-- granting EXECUTE here does not expose password state to anonymous callers.

create or replace function public.learning_has_password()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.learning_current_user_has_password();
$function$;

revoke all on function public.learning_has_password() from public;
grant execute on function public.learning_has_password() to anon;
grant execute on function public.learning_has_password() to authenticated;

comment on function public.learning_has_password() is
  'Returns whether the current authenticated Supabase Auth identity has an email password without exposing its hash. Anonymous calls are executable but fail with learning_authentication_required.';
