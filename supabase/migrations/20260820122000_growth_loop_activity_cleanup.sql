-- W5 / 交付项 3：activity_events 服务端字段约束与 180 天自动清理。
--
-- private.learning_activity_events 是私有诊断事件流。payload 只允许协议内的
-- 枚举/布尔/有界整数，不接收自由文本、邮箱、页面 URL、语音文本或错误堆栈。
-- 原始事件按 received_at 保留 180 天，到期直接删除；每日 04:00 UTC 由
-- pg_cron 执行。无 pg_cron 的环境安全跳过调度，清理函数仍可由受信运维调用。

create or replace function private.learning_activity_payload_is_valid(
  p_event_type text,
  p_payload jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select case
    when p_event_type is null
      or jsonb_typeof(p_payload) <> 'object'
      or octet_length(p_payload::text) > 1024
      or exists (
        select 1
        from jsonb_object_keys(p_payload) key_name
        where key_name not in ('source', 'entry_type', 'error_code', 'retryable', 'days', 'count')
      )
    then false
    else coalesce(case p_event_type
      when 'household_activated' then
        p_payload = '{}'::jsonb
      when 'learner_created' then
        not exists (
          select 1 from jsonb_object_keys(p_payload) key_name
          where key_name <> 'source'
        )
        and jsonb_typeof(p_payload -> 'source') = 'string'
        and p_payload ->> 'source' in ('household_setup', 'add_learner')
      when 'core_activation' then
        not exists (
          select 1 from jsonb_object_keys(p_payload) key_name
          where key_name <> 'source'
        )
        and jsonb_typeof(p_payload -> 'source') = 'string'
        and p_payload ->> 'source' = 'point_item'
      when 'growth_activity_recorded' then
        not exists (
          select 1 from jsonb_object_keys(p_payload) key_name
          where key_name not in ('source', 'entry_type')
        )
        and jsonb_typeof(p_payload -> 'source') = 'string'
        and p_payload ->> 'source' in ('checkin', 'point_item')
        and jsonb_typeof(p_payload -> 'entry_type') = 'string'
        and p_payload ->> 'entry_type' in ('manual', 'adjustment')
      when 'retention_qualified' then
        not exists (
          select 1 from jsonb_object_keys(p_payload) key_name
          where key_name not in ('days', 'count')
        )
        and case
          when not (p_payload ? 'days') then true
          when jsonb_typeof(p_payload -> 'days') = 'number'
            and p_payload ->> 'days' ~ '^[0-9]{1,3}$'
          then (p_payload ->> 'days')::integer between 1 and 365
          else false
        end
        and case
          when not (p_payload ? 'count') then true
          when jsonb_typeof(p_payload -> 'count') = 'number'
            and p_payload ->> 'count' ~ '^[0-9]{1,5}$'
          then (p_payload ->> 'count')::integer between 1 and 10000
          else false
        end
      when 'reward_redeemed' then
        not exists (
          select 1 from jsonb_object_keys(p_payload) key_name
          where key_name <> 'source'
        )
        and jsonb_typeof(p_payload -> 'source') = 'string'
        and p_payload ->> 'source' = 'reward'
      when 'sync_failed' then
        not exists (
          select 1 from jsonb_object_keys(p_payload) key_name
          where key_name not in ('source', 'error_code', 'retryable')
        )
        and jsonb_typeof(p_payload -> 'source') = 'string'
        and p_payload ->> 'source' = 'growth_loop_sync'
        and jsonb_typeof(p_payload -> 'error_code') = 'string'
        and p_payload ->> 'error_code' in ('conflict', 'rejected', 'retryable')
        and p_payload -> 'retryable' in ('true'::jsonb, 'false'::jsonb)
      when 'tts_failed' then
        not exists (
          select 1 from jsonb_object_keys(p_payload) key_name
          where key_name not in ('source', 'error_code', 'retryable')
        )
        and jsonb_typeof(p_payload -> 'source') = 'string'
        and p_payload ->> 'source' = 'offline_tts'
        and jsonb_typeof(p_payload -> 'error_code') = 'string'
        and p_payload ->> 'error_code' in ('timeout', 'download_failed', 'synthesis_failed')
        and p_payload -> 'retryable' in ('true'::jsonb, 'false'::jsonb)
      else false
    end, false)
  end;
$function$;

revoke all on function private.learning_activity_payload_is_valid(text, jsonb) from public;
revoke all on function private.learning_activity_payload_is_valid(text, jsonb) from anon;
revoke all on function private.learning_activity_payload_is_valid(text, jsonb) from authenticated;

alter table private.learning_activity_events
  drop constraint if exists learning_activity_events_payload_contract_check;
alter table private.learning_activity_events
  add constraint learning_activity_events_payload_contract_check
  check (private.learning_activity_payload_is_valid(event_type, payload));

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
  event_scope_key text;
  event_payload jsonb;
  event_payload_hash text;
  existing_row private.learning_activity_events%rowtype;
begin
  if actor_id is null then
    raise exception 'learning_auth_required' using errcode = '42501';
  end if;

  if p_event is null
     or jsonb_typeof(p_event) <> 'object'
     or not (p_event ?& array[
       'event_id', 'product_id', 'event_type', 'household_id',
       'profile_id', 'occurred_at', 'payload'
     ])
     or exists (
       select 1
       from jsonb_object_keys(p_event) key_name
       where key_name not in (
         'event_id', 'scope_key', 'product_id', 'event_type', 'household_id',
         'profile_id', 'occurred_at', 'timezone', 'client_version', 'payload'
       )
     )
     or jsonb_typeof(p_event -> 'event_id') <> 'string'
     or jsonb_typeof(p_event -> 'product_id') <> 'string'
     or jsonb_typeof(p_event -> 'event_type') <> 'string'
     or jsonb_typeof(p_event -> 'household_id') <> 'string'
     or jsonb_typeof(p_event -> 'profile_id') <> 'string'
     or jsonb_typeof(p_event -> 'occurred_at') <> 'string'
     or jsonb_typeof(p_event -> 'payload') <> 'object'
     or char_length(p_event ->> 'event_id') <> 36
     or char_length(p_event ->> 'product_id') > 32
     or char_length(p_event ->> 'event_type') > 40
     or char_length(p_event ->> 'household_id') <> 36
     or char_length(p_event ->> 'profile_id') <> 36
     or char_length(p_event ->> 'occurred_at') > 35
     or (p_event ->> 'occurred_at') !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
     or (
       p_event ? 'scope_key'
       and p_event -> 'scope_key' <> 'null'::jsonb
       and (
         jsonb_typeof(p_event -> 'scope_key') <> 'string'
         or char_length(p_event ->> 'scope_key') > 73
       )
     )
     or (
       p_event ? 'timezone'
       and p_event -> 'timezone' <> 'null'::jsonb
       and jsonb_typeof(p_event -> 'timezone') <> 'string'
     )
     or (
       p_event ? 'client_version'
       and p_event -> 'client_version' <> 'null'::jsonb
       and jsonb_typeof(p_event -> 'client_version') <> 'string'
     )
  then
    raise exception 'activity_event_invalid' using errcode = '22023';
  end if;

  begin
    event_uuid := (p_event ->> 'event_id')::uuid;
    event_household_id := (p_event ->> 'household_id')::uuid;
    event_profile_id := (p_event ->> 'profile_id')::uuid;
    event_occurred_at := (p_event ->> 'occurred_at')::timestamptz;
  exception
    when invalid_text_representation or datetime_field_overflow then
      raise exception 'activity_event_invalid' using errcode = '22023';
  end;

  event_product_id := p_event ->> 'product_id';
  event_type_value := p_event ->> 'event_type';
  event_scope_key := p_event ->> 'scope_key';
  event_timezone := p_event ->> 'timezone';
  event_client_version := p_event ->> 'client_version';
  event_payload := p_event -> 'payload';

  if event_product_id <> 'shadow-mate'
     or event_type_value not in (
       'household_activated', 'learner_created', 'core_activation',
       'growth_activity_recorded', 'retention_qualified', 'reward_redeemed',
       'sync_failed', 'tts_failed'
     )
     or not isfinite(event_occurred_at)
     or (
       event_scope_key is not null
       and event_scope_key <> (event_household_id::text || ':' || event_profile_id::text)
     )
     or (event_timezone is not null and char_length(event_timezone) > 64)
     or (
       event_timezone is not null
       and not exists (
         select 1 from pg_catalog.pg_timezone_names timezone_name
         where timezone_name.name = event_timezone
       )
     )
     or (event_client_version is not null and char_length(event_client_version) > 32)
     or (
       event_client_version is not null
       and event_client_version !~ '^[0-9A-Za-z][0-9A-Za-z._+-]{0,31}$'
     )
     or octet_length(event_payload::text) > 4096
  then
    raise exception 'activity_event_invalid' using errcode = '22023';
  end if;

  if not private.learning_activity_payload_is_valid(event_type_value, event_payload) then
    raise exception 'activity_event_payload_invalid' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.learning_household_members member
    join public.learning_households household
      on household.id = member.household_id
    join public.learning_profiles profile
      on profile.id = event_profile_id
     and profile.household_id = member.household_id
    where member.household_id = event_household_id
      and member.user_id = actor_id
      and member.role in ('owner', 'guardian')
      and household.project_id = 'shadow-mate'
  ) then
    raise exception 'learning_point_forbidden' using errcode = '42501';
  end if;

  event_payload_hash := md5(p_event::text);

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

create index if not exists learning_activity_events_received_at_idx
  on private.learning_activity_events (received_at);

create or replace function private.learning_purge_activity_events(
  p_older_than interval default interval '180 days'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  purged integer;
begin
  if p_older_than is null or p_older_than <= interval '0 seconds' then
    raise exception 'activity_retention_window_invalid' using errcode = '22023';
  end if;

  delete from private.learning_activity_events
  where received_at < now() - p_older_than;
  get diagnostics purged = row_count;
  return purged;
end;
$function$;

revoke all on function private.learning_purge_activity_events(interval) from public;
revoke all on function private.learning_purge_activity_events(interval) from anon;
revoke all on function private.learning_purge_activity_events(interval) from authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute 'delete from cron.job where jobname = ''shadow-mate-cleanup-activity-events''';
    execute format(
      'select cron.schedule(%L, %L, %L)',
      'shadow-mate-cleanup-activity-events',
      '0 4 * * *',
      'select private.learning_purge_activity_events()'
    );
  end if;
end;
$$;

comment on function private.learning_activity_payload_is_valid(text, jsonb) is
  'Validates the per-event typed diagnostic payload contract; rejects free text, emails, URLs, and stack traces.';
comment on function private.learning_purge_activity_events(interval) is
  'Deletes private Shadow Mate activity events whose server received_at is outside the bounded retention window.';
