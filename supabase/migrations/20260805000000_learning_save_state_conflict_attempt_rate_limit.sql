-- Backstop runaway conflict storms.
--
-- Root cause found in production: a client calls learning_save_state with a
-- stale (or null) p_expected_version ~1300x/sec, every call raises
-- learning_state_conflict, and because `raise` rolls back the WHOLE
-- transaction, the rate-limit counter written just before it is rolled back
-- too. The result: conflicts never consume rate-limit budget, so neither the
-- previous rate-limit position (20260803130000) nor the conflict-circuit-
-- breaker + rate-limit relocation (20260804120000) could stop the storm.
--
-- Fix: on version conflict, do NOT raise. Instead consume a separate
-- per-user "save_state_attempts" budget and return an EMPTY result set. The
-- function now commits normally, so the counter persists. Once the attempt
-- budget is exhausted the function raises learning_rate_limited, throttling
-- the storm to 2 attempts/sec (120/60s) per user. Successful writes keep the
-- existing 30/60s budget.
--
-- Because conflicts now commit, we can also persist a per-call audit row that
-- captures the caller (auth user, email) and, from PostgREST's request.*
-- session vars, the client IP / user-agent / path / timestamp. This is how we
-- identify the storm source. The audit table is write-only for clients
-- (security-definer writer, no read grant) and is pruned after analysis.
--
-- Client contract change: a 200 response with zero rows means "version
-- conflict" (previously it was signalled by an error).

-- Audit table for conflict-storm source analysis.
create table if not exists private.learning_save_audit (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  user_id uuid,
  email text,
  profile_id uuid,
  expected_version bigint,
  current_version bigint,
  conflict_side text,
  ip text,
  user_agent text,
  path text
);
revoke all on table private.learning_save_audit from public;
revoke all on table private.learning_save_audit from anon;
revoke all on table private.learning_save_audit from authenticated;

-- Security-definer writer so clients can audit without direct table access.
create or replace function private.learning_audit_conflict(
  p_user_id uuid,
  p_profile_id uuid,
  p_expected_version bigint,
  p_current_version bigint,
  p_side text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers jsonb := case
    when current_setting('request.headers', true) <> '' then current_setting('request.headers', true)::jsonb
    else '{}'::jsonb
  end;
  v_claims jsonb := case
    when current_setting('request.jwt.claims', true) <> '' then current_setting('request.jwt.claims', true)::jsonb
    else '{}'::jsonb
  end;
begin
  insert into private.learning_save_audit (
    user_id, email, profile_id, expected_version, current_version, conflict_side,
    ip, user_agent, path
  ) values (
    p_user_id,
    v_claims->>'email',
    p_profile_id,
    p_expected_version,
    p_current_version,
    p_side,
    coalesce(v_headers->>'cf-connecting-ip', v_headers->>'x-forwarded-for'),
    v_headers->>'user-agent',
    current_setting('request.path', true)
  );
end;
$$;
revoke all on function private.learning_audit_conflict(uuid, uuid, bigint, bigint, text) from public;
revoke all on function private.learning_audit_conflict(uuid, uuid, bigint, bigint, text) from anon;
grant execute on function private.learning_audit_conflict(uuid, uuid, bigint, bigint, text) to authenticated;

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
      -- Conflict (profile missing). Audit + consume attempt budget, return empty.
      perform private.learning_audit_conflict(auth.uid(), p_profile_id, p_expected_version, current_version, 'not_found');
      perform private.learning_enforce_rate_limit('save_state_attempts', 120, 60);
      return;
    end if;

    -- We are about to write: enforce the write budget.
    perform private.learning_enforce_rate_limit('save_state', 30, 60);

    insert into public.learning_profile_states (profile_id, state)
    values (p_profile_id, p_state)
    returning * into saved_row;
  else
    if p_expected_version is distinct from current_version then
      -- Conflict (stale expected_version). Audit + consume attempt budget, return empty.
      perform private.learning_audit_conflict(auth.uid(), p_profile_id, p_expected_version, current_version, 'stale_version');
      perform private.learning_enforce_rate_limit('save_state_attempts', 120, 60);
      return;
    end if;

    -- We are about to write: enforce the write budget.
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
  'Saves or inserts a learning profile state with optimistic version control. On version conflict returns an empty set, records a source-audit row, and consumes a per-user save_state_attempts budget (120/60s) instead of raising, so runaway conflict storms cannot bypass throttling via transaction rollback. Successful writes consume the save_state budget (30/60s).';
