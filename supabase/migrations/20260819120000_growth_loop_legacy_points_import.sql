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
  existing_count integer := 0;
  entry_request_ids uuid[] := '{}';
  entry_row jsonb;
  entry_index integer;
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
  for entry_row, entry_index in
    select value, ordinality from jsonb_array_elements(p_entries) with ordinality
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

  -- Once per child: if an opening balance or an earlier import exists, only an
  -- exact retry of this same request (its rows already present) is allowed.
  select count(*)
  into existing_count
  from public.learning_point_ledger ledger
  where ledger.profile_id = p_profile_id
    and ledger.entry_type in ('initial_balance', 'legacy_import');

  if existing_count > 0 then
    if not exists (
      select 1
      from public.learning_point_ledger ledger
      where ledger.profile_id = p_profile_id
        and ledger.entry_type = 'legacy_import'
        and ledger.request_id = any(entry_request_ids)
      limit 1
    ) then
      raise exception 'learning_legacy_points_already_imported' using errcode = 'P0001';
    end if;
  end if;

  -- Pass 2: insert. on conflict makes a retry of an already-imported batch a
  -- no-op for the rows that are already there.
  for entry_row, entry_index in
    select value, ordinality from jsonb_array_elements(p_entries) with ordinality
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
      entry_date,
      actor_id
    )
    on conflict (profile_id, request_id) do nothing;
  end loop;

  return query
    select ledger.*
    from public.learning_point_ledger ledger
    where ledger.profile_id = p_profile_id
      and ledger.entry_type = 'legacy_import'
      and ledger.request_id = any(entry_request_ids)
    order by ledger.occurred_on, ledger.created_at;
end;
$function$;

revoke all on function public.learning_import_legacy_points(uuid, uuid, jsonb) from public;
revoke all on function public.learning_import_legacy_points(uuid, uuid, jsonb) from anon;
grant execute on function public.learning_import_legacy_points(uuid, uuid, jsonb)
  to authenticated;

comment on function public.learning_import_legacy_points(uuid, uuid, jsonb) is
  'Imports the legacy daily point records once per child as legacy_import ledger rows.';
