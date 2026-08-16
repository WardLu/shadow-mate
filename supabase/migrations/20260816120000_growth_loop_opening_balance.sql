-- Shadow Mate Growth Loop: once-per-child opening balance confirmation.
-- Old points stay read-only in legacy state; a guardian confirms a single
-- initial balance per child that becomes one auditable initial_balance row.
-- It is not history behavior and is excluded from effective-action metrics.

-- Carry-forward balances can exceed the normal +/-1000 single-event guard, so
-- the signed-delta ceiling is raised only for initial_balance rows. Every
-- other entry type keeps the existing ceiling.
do $migration$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = to_regclass('public.learning_point_ledger')
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%delta%'
  order by conname
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.learning_point_ledger drop constraint %I', constraint_name);
  end if;
end;
$migration$;

alter table public.learning_point_ledger
  add constraint learning_point_ledger_delta_check check (
    delta <> 0
    and (
      (entry_type = 'initial_balance' and delta between -1000000 and 1000000)
      or (entry_type <> 'initial_balance' and delta between -1000 and 1000)
    )
  );

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
  existing_balance public.learning_point_ledger%rowtype;
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
  join public.learning_household_members member
    on member.household_id = profile.household_id
  where profile.id = p_profile_id
    and member.user_id = actor_id
    and member.role in ('owner', 'guardian');

  if not found then
    raise exception 'learning_point_forbidden' using errcode = '42501';
  end if;

  -- A retry of the same request returns the original opening balance row.
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

  -- Child-level lock serializes concurrent confirmations for one child.
  perform 1
  from public.learning_profiles profile
  where profile.id = p_profile_id
  for update;

  -- At most one confirmed opening balance per child.
  select *
  into existing_balance
  from public.learning_point_ledger ledger
  where ledger.profile_id = p_profile_id
    and ledger.entry_type = 'initial_balance'
  limit 1;

  if found then
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
  'Confirms a once-per-child opening balance as a single initial_balance ledger row.';
