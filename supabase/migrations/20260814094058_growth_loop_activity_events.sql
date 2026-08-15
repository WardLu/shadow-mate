-- Growth Loop diagnostics are an allowlisted, private activity stream.
-- Product facts remain in the point/reward tables; this table is not exposed
-- through the Data API and can only be written through the guarded RPC.

create table if not exists private.learning_activity_events (
  event_id uuid primary key,
  product_id text not null check (product_id = 'shadow-mate'),
  event_type text not null check (
    event_type in (
      'household_activated',
      'learner_created',
      'core_activation',
      'growth_activity_recorded',
      'retention_qualified',
      'reward_redeemed',
      'sync_failed',
      'tts_failed'
    )
  ),
  household_id uuid not null
    references public.learning_households(id) on delete cascade,
  profile_id uuid not null,
  occurred_at timestamptz not null,
  timezone text check (timezone is null or char_length(timezone) <= 64),
  client_version text check (client_version is null or char_length(client_version) <= 32),
  payload jsonb not null default '{}'::jsonb
    check (octet_length(payload::text) <= 4096),
  payload_hash text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  received_at timestamptz not null default now(),
  constraint learning_activity_events_profile_scope_fk
    foreign key (profile_id, household_id)
    references public.learning_profiles(id, household_id)
    on delete cascade
);

create index if not exists learning_activity_events_household_time_idx
  on private.learning_activity_events (household_id, occurred_at desc);

create index if not exists learning_activity_events_type_time_idx
  on private.learning_activity_events (event_type, occurred_at desc);

alter table private.learning_activity_events enable row level security;
revoke all on table private.learning_activity_events from public;
revoke all on table private.learning_activity_events from anon;
revoke all on table private.learning_activity_events from authenticated;

create or replace function public.learning_record_activity_event(p_event jsonb)
returns table(event_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  event_uuid uuid;
  event_product_id text;
  event_type_value text;
  event_household_id uuid;
  event_profile_id uuid;
  event_occurred_at timestamptz;
  event_timezone text;
  event_client_version text;
  event_payload jsonb;
  event_payload_hash text;
  existing_row private.learning_activity_events%rowtype;
begin
  if actor_id is null then
    raise exception 'learning_auth_required' using errcode = '42501';
  end if;

  if p_event is null or jsonb_typeof(p_event) <> 'object' then
    raise exception 'activity_event_invalid' using errcode = '22023';
  end if;

  event_uuid := (p_event ->> 'event_id')::uuid;
  event_product_id := p_event ->> 'product_id';
  event_type_value := p_event ->> 'event_type';
  event_household_id := (p_event ->> 'household_id')::uuid;
  event_profile_id := (p_event ->> 'profile_id')::uuid;
  event_occurred_at := (p_event ->> 'occurred_at')::timestamptz;
  event_timezone := nullif(left(p_event ->> 'timezone', 64), '');
  event_client_version := nullif(left(p_event ->> 'client_version', 32), '');
  event_payload := coalesce(p_event -> 'payload', '{}'::jsonb);
  event_payload_hash := md5(p_event::text);

  if event_uuid is null
     or event_product_id <> 'shadow-mate'
     or event_type_value not in (
       'household_activated', 'learner_created', 'core_activation',
       'growth_activity_recorded', 'retention_qualified', 'reward_redeemed',
       'sync_failed', 'tts_failed'
     )
     or event_household_id is null
     or event_profile_id is null
     or event_occurred_at is null
     or jsonb_typeof(event_payload) <> 'object'
     or octet_length(event_payload::text) > 4096 then
    raise exception 'activity_event_invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(event_payload) key_name
    where key_name not in ('source', 'entry_type', 'error_code', 'retryable', 'client', 'days', 'count')
  ) then
    raise exception 'activity_event_payload_invalid' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.learning_household_members member
    where member.household_id = event_household_id
      and member.user_id = actor_id
      and member.role in ('owner', 'guardian')
  ) then
    raise exception 'learning_point_forbidden' using errcode = '42501';
  end if;

  select *
  into existing_row
  from private.learning_activity_events existing
  where existing.event_id = event_uuid;

  if found then
    if existing_row.payload_hash <> event_payload_hash
       or existing_row.event_type <> event_type_value
       or existing_row.profile_id <> event_profile_id then
      raise exception 'activity_event_idempotency_conflict' using errcode = 'P0001';
    end if;
    return query select existing_row.event_id, 'duplicate'::text;
    return;
  end if;

  insert into private.learning_activity_events (
    event_id,
    product_id,
    event_type,
    household_id,
    profile_id,
    occurred_at,
    timezone,
    client_version,
    payload,
    payload_hash,
    actor_user_id
  ) values (
    event_uuid,
    event_product_id,
    event_type_value,
    event_household_id,
    event_profile_id,
    event_occurred_at,
    event_timezone,
    event_client_version,
    event_payload,
    event_payload_hash,
    actor_id
  );

  return query select event_uuid, 'confirmed'::text;
end;
$function$;

revoke all on function public.learning_record_activity_event(jsonb) from public;
revoke all on function public.learning_record_activity_event(jsonb) from anon;
grant execute on function public.learning_record_activity_event(jsonb) to authenticated;

comment on table private.learning_activity_events is
  'Allowlisted Growth Loop activity diagnostics; raw events are retained separately from product facts.';
comment on function public.learning_record_activity_event(jsonb) is
  'Records one allowlisted, guardian-scoped, idempotent activity event.';
