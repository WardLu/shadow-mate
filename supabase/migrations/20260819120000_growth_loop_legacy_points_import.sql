-- Shadow Mate Growth Loop: one-shot import of legacy daily point records.
--
-- The pre-Growth-Loop app stored points only on the client as
-- {ym: {itemIdx: {day:1}}}. This migration adds a legacy_import entry type and
-- a controlled RPC that turns the reconstructed daily entries into real ledger
-- rows, so both the balance (sum of entries) and the daily detail are restored.
-- Each child can import once; retrying the same request id is idempotent.

do $migration$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.learning_point_ledger'::regclass
      and conname = 'learning_point_ledger_entry_type_check'
  ) then
    alter table public.learning_point_ledger drop constraint learning_point_ledger_entry_type_check;
  end if;
end;
$migration$;

alter table public.learning_point_ledger
  add constraint learning_point_ledger_entry_type_check check (
    entry_type in ('manual', 'adjustment', 'initial_balance', 'redemption', 'refund', 'legacy_import')
  );

alter table public.learning_point_ledger
  add column if not exists legacy_import_batch_id uuid;

alter table public.learning_point_ledger
  drop constraint if exists learning_point_ledger_legacy_import_batch_check;

alter table public.learning_point_ledger
  add constraint learning_point_ledger_legacy_import_batch_check check (
    (entry_type = 'legacy_import' and legacy_import_batch_id is not null)
    or (entry_type <> 'legacy_import' and legacy_import_batch_id is null)
  );

create index if not exists learning_point_ledger_profile_legacy_batch_idx
  on public.learning_point_ledger (profile_id, legacy_import_batch_id)
  where legacy_import_batch_id is not null;

create index if not exists learning_point_ledger_profile_id_idx
  on public.learning_point_ledger (profile_id, id);

create or replace function public.learning_import_legacy_points(
  p_profile_id uuid,
  p_request_id uuid,
  p_entries jsonb
)
returns setof public.learning_point_ledger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  profile_household_id uuid;
  entry_count integer;
  existing_legacy_count integer := 0;
  same_batch_count integer := 0;
  matching_batch_count integer := 0;
  entry_request_ids uuid[] := array[]::uuid[];
  entry_row jsonb;
  entry_request_id uuid;
  entry_date date;
  entry_delta integer;
  entry_note text;
begin
  if actor_id is null then
    raise exception 'learning_auth_required' using errcode = '42501';
  end if;

  if p_request_id is null then
    raise exception 'learning_request_id_required' using errcode = '22023';
  end if;

  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'learning_legacy_entries_required' using errcode = '22023';
  end if;

  entry_count := jsonb_array_length(p_entries);
  if entry_count > 10000 then
    raise exception 'learning_legacy_entries_too_many' using errcode = '22023';
  end if;

  select profile.household_id
  into profile_household_id
  from public.learning_profiles profile
  join public.learning_households household
    on household.id = profile.household_id
   and household.project_id = 'shadow-mate'
  join public.learning_household_members member
    on member.household_id = profile.household_id
  where profile.id = p_profile_id
    and member.user_id = actor_id
    and member.role in ('owner', 'guardian');

  if not found then
    raise exception 'learning_point_forbidden' using errcode = '42501';
  end if;

  -- Pass 1: validate every entry and collect the per-entry request ids before
  -- writing anything, so a bad entry aborts the whole batch.
  for entry_row in
    select value from jsonb_array_elements(p_entries)
  loop
    if (entry_row->>'occurred_on') is null
       or (entry_row->>'occurred_on') !~ '^([0-9]{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then
      raise exception 'learning_legacy_entry_date_invalid' using errcode = '22023';
    end if;
    begin
      entry_date := make_date(
        split_part(entry_row->>'occurred_on', '-', 1)::integer,
        split_part(entry_row->>'occurred_on', '-', 2)::integer,
        split_part(entry_row->>'occurred_on', '-', 3)::integer
      );
    exception
      when others then
        raise exception 'learning_legacy_entry_date_invalid' using errcode = '22023';
    end;

    if (entry_row->>'delta') is null or (entry_row->>'delta') !~ '^-?[0-9]+$' then
      raise exception 'learning_legacy_entry_delta_invalid' using errcode = '22023';
    end if;
    entry_delta := (entry_row->>'delta')::integer;
    if entry_delta = 0 or entry_delta not between -1000 and 1000 then
      raise exception 'learning_legacy_entry_delta_invalid' using errcode = '22023';
    end if;

    if (entry_row->>'item_name_snapshot') is null
       or char_length(entry_row->>'item_name_snapshot') < 1
       or char_length(entry_row->>'item_name_snapshot') > 60 then
      raise exception 'learning_legacy_entry_name_invalid' using errcode = '22023';
    end if;

    if (entry_row->>'note') is not null and char_length(entry_row->>'note') > 200 then
      raise exception 'learning_legacy_entry_note_too_long' using errcode = '22001';
    end if;

    if (entry_row->>'request_id') is null
       or (entry_row->>'request_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (entry_row->>'request_id')::uuid is null then
      raise exception 'learning_legacy_entry_request_id_invalid' using errcode = '22023';
    end if;
    entry_request_id := (entry_row->>'request_id')::uuid;
    if entry_request_id = any(entry_request_ids) then
      raise exception 'learning_legacy_entry_request_id_duplicate' using errcode = '22023';
    end if;
    entry_request_ids := entry_request_ids || entry_request_id;
  end loop;

  -- Both recovery RPCs lock the learner profile before reading recovery state.
  -- This serializes first-use imports and opening-balance confirmations for one
  -- child without blocking recovery work for other children.
  perform 1
  from public.learning_profiles profile
  where profile.id = p_profile_id
  for update;

  select count(*)
  into existing_legacy_count
  from public.learning_point_ledger ledger
  where ledger.profile_id = p_profile_id
    and ledger.entry_type = 'legacy_import';

  if existing_legacy_count > 0 then
    select count(*)
    into same_batch_count
    from public.learning_point_ledger ledger
    where ledger.profile_id = p_profile_id
      and ledger.entry_type = 'legacy_import'
      and ledger.legacy_import_batch_id = p_request_id;

    if same_batch_count > 0 then
      select count(*)
      into matching_batch_count
      from jsonb_array_elements(p_entries) requested(entry)
      join public.learning_point_ledger ledger
        on ledger.profile_id = p_profile_id
       and ledger.entry_type = 'legacy_import'
       and ledger.legacy_import_batch_id = p_request_id
       and ledger.request_id = (requested.entry->>'request_id')::uuid
       and ledger.occurred_on = (requested.entry->>'occurred_on')::date
       and ledger.delta = (requested.entry->>'delta')::integer
       and ledger.item_name_snapshot = requested.entry->>'item_name_snapshot'
       and ledger.note is not distinct from nullif(requested.entry->>'note', '');

      if same_batch_count <> entry_count or matching_batch_count <> entry_count then
        raise exception 'learning_request_reuse_conflict' using errcode = 'P0001';
      end if;

      return query
        select ledger.*
        from public.learning_point_ledger ledger
        where ledger.profile_id = p_profile_id
          and ledger.entry_type = 'legacy_import'
          and ledger.legacy_import_batch_id = p_request_id
        order by ledger.occurred_on, ledger.created_at, ledger.id;
      return;
    end if;

    if exists (
      select 1
      from public.learning_point_ledger ledger
      where ledger.profile_id = p_profile_id
        and ledger.request_id = any(entry_request_ids)
    ) then
      raise exception 'learning_request_reuse_conflict' using errcode = 'P0001';
    end if;

    raise exception 'learning_legacy_points_already_imported' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.learning_point_ledger ledger
    where ledger.profile_id = p_profile_id
      and ledger.request_id = any(entry_request_ids)
  ) then
    raise exception 'learning_request_reuse_conflict' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.learning_point_ledger ledger
    where ledger.profile_id = p_profile_id
      and ledger.entry_type = 'initial_balance'
  ) then
    raise exception 'learning_legacy_points_already_imported' using errcode = 'P0001';
  end if;

  -- Pass 2: the validated batch is inserted only after the child-level lock and
  -- recovery/idempotency checks have succeeded.
  for entry_row in
    select value from jsonb_array_elements(p_entries)
  loop
    entry_request_id := (entry_row->>'request_id')::uuid;
    entry_date := (entry_row->>'occurred_on')::date;
    entry_delta := (entry_row->>'delta')::integer;
    entry_note := nullif(entry_row->>'note', '');
    insert into public.learning_point_ledger (
      household_id,
      profile_id,
      point_item_id,
      delta,
      entry_type,
      item_name_snapshot,
      note,
      request_id,
      legacy_import_batch_id,
      occurred_on,
      actor_user_id
    )
    values (
      profile_household_id,
      p_profile_id,
      null,
      entry_delta,
      'legacy_import',
      entry_row->>'item_name_snapshot',
      entry_note,
      entry_request_id,
      p_request_id,
      entry_date,
      actor_id
    );
  end loop;

  return query
    select ledger.*
    from public.learning_point_ledger ledger
    where ledger.profile_id = p_profile_id
      and ledger.entry_type = 'legacy_import'
      and ledger.legacy_import_batch_id = p_request_id
    order by ledger.occurred_on, ledger.created_at, ledger.id;
end;
$function$;

revoke all on function public.learning_import_legacy_points(uuid, uuid, jsonb) from public;
revoke all on function public.learning_import_legacy_points(uuid, uuid, jsonb) from anon;
grant execute on function public.learning_import_legacy_points(uuid, uuid, jsonb)
  to authenticated;

comment on function public.learning_import_legacy_points(uuid, uuid, jsonb) is
  'Imports the legacy daily point records once per child as legacy_import ledger rows.';

-- Replace the already-deployed opening-balance RPC so both recovery methods use
-- the same child-level lock and are mutually exclusive in either order.
create or replace function public.learning_confirm_opening_balance(
  p_profile_id uuid,
  p_balance integer,
  p_request_id uuid,
  p_note text default '期初积分'
)
returns setof public.learning_point_ledger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  profile_household_id uuid;
  existing_row public.learning_point_ledger%rowtype;
  saved_row public.learning_point_ledger%rowtype;
begin
  if actor_id is null then
    raise exception 'learning_auth_required' using errcode = '42501';
  end if;

  if p_request_id is null then
    raise exception 'learning_request_id_required' using errcode = '22023';
  end if;

  if p_balance is null or p_balance <= 0 or p_balance > 1000000 then
    raise exception 'learning_opening_balance_invalid' using errcode = '22023';
  end if;

  if p_note is not null and char_length(p_note) > 200 then
    raise exception 'learning_point_note_too_long' using errcode = '22001';
  end if;

  select profile.household_id
  into profile_household_id
  from public.learning_profiles profile
  join public.learning_households household
    on household.id = profile.household_id
   and household.project_id = 'shadow-mate'
  join public.learning_household_members member
    on member.household_id = profile.household_id
  where profile.id = p_profile_id
    and member.user_id = actor_id
    and member.role in ('owner', 'guardian');

  if not found then
    raise exception 'learning_point_forbidden' using errcode = '42501';
  end if;

  perform 1
  from public.learning_profiles profile
  where profile.id = p_profile_id
  for update;

  select *
  into existing_row
  from public.learning_point_ledger ledger
  where ledger.profile_id = p_profile_id
    and ledger.request_id = p_request_id;

  if found then
    if existing_row.entry_type = 'initial_balance'
       and existing_row.delta = p_balance
       and existing_row.note is not distinct from p_note then
      return next existing_row;
      return;
    end if;
    raise exception 'learning_request_reuse_conflict' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.learning_point_ledger ledger
    where ledger.profile_id = p_profile_id
      and ledger.entry_type in ('initial_balance', 'legacy_import')
  ) then
    raise exception 'learning_opening_balance_already_confirmed' using errcode = 'P0001';
  end if;

  insert into public.learning_point_ledger (
    household_id,
    profile_id,
    point_item_id,
    delta,
    entry_type,
    item_name_snapshot,
    note,
    request_id,
    actor_user_id
  )
  values (
    profile_household_id,
    p_profile_id,
    null,
    p_balance,
    'initial_balance',
    '期初积分',
    p_note,
    p_request_id,
    actor_id
  )
  returning * into saved_row;

  return next saved_row;
end;
$function$;

revoke all on function public.learning_confirm_opening_balance(uuid, integer, uuid, text) from public;
revoke all on function public.learning_confirm_opening_balance(uuid, integer, uuid, text) from anon;
grant execute on function public.learning_confirm_opening_balance(uuid, integer, uuid, text)
  to authenticated;

comment on function public.learning_confirm_opening_balance(uuid, integer, uuid, text) is
  'Confirms one opening balance per child, mutually exclusive with legacy point import.';
