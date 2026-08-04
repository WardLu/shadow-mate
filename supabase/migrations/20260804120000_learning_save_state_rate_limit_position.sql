-- Move rate-limit enforcement to AFTER conflict checks, so that
-- conflict exceptions (which abort the entire transaction) no longer
-- roll back the rate-limit counter.
--
-- Before: perform rate_limit -> check version -> raise conflict (rolls back rate limit)
-- After:  check version -> raise conflict (no rate limit consumed) OR rate_limit -> write
--
-- This means conflicts do not consume rate-limit budget. Conflict storms are
-- handled by the client-side circuit breaker (cloudSyncBlocked). The rate
-- limiter now only caps successful-write attempts, which is its actual purpose.

create or replace function public.learning_save_state(
  p_profile_id uuid,
  p_state jsonb,
  p_expected_version bigint default null
)
returns setof public.learning_profile_states
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  current_version bigint;
  saved_row public.learning_profile_states%rowtype;
begin
  if jsonb_typeof(p_state) is distinct from 'object' then
    raise exception 'learning_state_must_be_an_object'
      using errcode = '22023';
  end if;

  if pg_column_size(p_state) > 1048576 then
    raise exception 'learning_state_too_large'
      using errcode = '22001';
  end if;

  select profile_state.version
  into current_version
  from public.learning_profile_states profile_state
  where profile_state.profile_id = p_profile_id;

  if not found then
    if p_expected_version is not null then
      raise exception 'learning_state_conflict'
        using errcode = '40001';
    end if;

    -- Rate-limit only when we are about to write, not on conflict.
    perform private.learning_enforce_rate_limit('save_state', 30, 60);

    insert into public.learning_profile_states (profile_id, state)
    values (p_profile_id, p_state)
    returning * into saved_row;
  else
    if p_expected_version is distinct from current_version then
      raise exception 'learning_state_conflict'
        using errcode = '40001';
    end if;

    -- Rate-limit only when we are about to write, not on conflict.
    perform private.learning_enforce_rate_limit('save_state', 30, 60);

    update public.learning_profile_states profile_state
    set
      state = p_state,
      version = profile_state.version + 1,
      updated_at = now()
    where profile_state.profile_id = p_profile_id
    returning * into saved_row;
  end if;

  return next saved_row;
end;
$function$;

revoke all on function public.learning_save_state(uuid, jsonb, bigint) from public;
revoke all on function public.learning_save_state(uuid, jsonb, bigint) from anon;
grant execute on function public.learning_save_state(uuid, jsonb, bigint)
  to authenticated;

comment on function public.learning_save_state(uuid, jsonb, bigint) is
  'Saves or inserts a learning profile state with optimistic version control. Rate limiting is enforced only when a write will actually proceed (after conflict checks pass), so conflict exceptions do not consume rate-limit budget.';
