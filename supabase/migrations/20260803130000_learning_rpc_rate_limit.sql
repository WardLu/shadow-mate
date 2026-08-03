-- Rate limiting for high-frequency RPCs.
-- Prevents runaway client retries (e.g. version-conflict loops) from
-- flooding Postgres logs and consuming connection pool capacity.

create table if not exists private.learning_rpc_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  rpc_key text not null,
  window_start timestamptz not null default now(),
  call_count int not null default 1,
  primary key (user_id, rpc_key)
);

create or replace function private.learning_enforce_rate_limit(
  p_rpc_key text,
  p_max_calls int default 30,
  p_window_seconds int default 60
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_count int;
begin
  if v_user_id is null then
    raise exception 'learning_authentication_required' using errcode = '42501';
  end if;

  select window_start, call_count
    into v_window_start, v_count
    from private.learning_rpc_rate_limits
   where user_id = v_user_id and rpc_key = p_rpc_key
   for update;

  if not found then
    insert into private.learning_rpc_rate_limits (user_id, rpc_key, window_start, call_count)
    values (v_user_id, p_rpc_key, v_now, 1);
  elsif v_now - v_window_start > make_interval(secs => p_window_seconds) then
    update private.learning_rpc_rate_limits
       set window_start = v_now, call_count = 1
     where user_id = v_user_id and rpc_key = p_rpc_key;
  elsif v_count >= p_max_calls then
    raise exception 'learning_rate_limited' using errcode = 'P0001';
  else
    update private.learning_rpc_rate_limits
       set call_count = call_count + 1
     where user_id = v_user_id and rpc_key = p_rpc_key;
  end if;
end;
$$;

revoke all on function private.learning_enforce_rate_limit(text, int, int) from public;
revoke all on function private.learning_enforce_rate_limit(text, int, int) from anon;
grant execute on function private.learning_enforce_rate_limit(text, int, int) to authenticated;

comment on function private.learning_enforce_rate_limit(text, int, int) is
  'Enforces a per-user sliding-window call limit on the named RPC. Raises learning_rate_limited (429) when exceeded.';

-- Wire rate limiting into learning_save_state (max 30 saves / 60 s per user).
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
  perform private.learning_enforce_rate_limit('save_state', 30, 60);

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

    insert into public.learning_profile_states (profile_id, state)
    values (p_profile_id, p_state)
    returning * into saved_row;
  else
    if p_expected_version is distinct from current_version then
      raise exception 'learning_state_conflict'
        using errcode = '40001';
    end if;

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
