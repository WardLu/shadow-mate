-- Keep the original six-argument points RPC unambiguous for existing clients.
-- The date-aware overload is intentionally seven arguments with no defaults;
-- old calls must continue resolving to the original function.

drop function if exists public.learning_record_points(uuid, uuid, integer, uuid, text, text, date);

create function public.learning_record_points(
  p_profile_id uuid,
  p_point_item_id uuid,
  p_delta integer,
  p_request_id uuid,
  p_entry_type text,
  p_note text,
  p_occurred_on date
)
returns setof public.learning_point_ledger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  profile_household_id uuid;
  item_name text;
  existing_row public.learning_point_ledger%rowtype;
  saved_row public.learning_point_ledger%rowtype;
begin
  if actor_id is null then
    raise exception 'learning_auth_required' using errcode = '42501';
  end if;

  if p_request_id is null then
    raise exception 'learning_request_id_required' using errcode = '22023';
  end if;

  if p_occurred_on is null then
    raise exception 'learning_point_date_required' using errcode = '22023';
  end if;

  if p_delta is null or p_delta = 0 or p_delta not between -1000 and 1000 then
    raise exception 'learning_point_delta_invalid' using errcode = '22023';
  end if;

  if p_entry_type is null
     or p_entry_type not in ('manual', 'adjustment', 'initial_balance', 'redemption', 'refund') then
    raise exception 'learning_point_entry_type_invalid' using errcode = '22023';
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

  select *
  into existing_row
  from public.learning_point_ledger ledger
  where ledger.profile_id = p_profile_id
    and ledger.request_id = p_request_id;

  if found then
    if existing_row.point_item_id is not distinct from p_point_item_id
       and existing_row.delta = p_delta
       and existing_row.entry_type = p_entry_type
       and existing_row.note is not distinct from p_note
       and existing_row.occurred_on = p_occurred_on then
      return next existing_row;
      return;
    end if;
    raise exception 'learning_request_reuse_conflict' using errcode = 'P0001';
  end if;

  if p_point_item_id is not null then
    select item.name
    into item_name
    from public.learning_point_items item
    join public.learning_profile_point_items assignment
      on assignment.point_item_id = item.id
     and assignment.household_id = item.household_id
    where item.id = p_point_item_id
      and item.household_id = profile_household_id
      and item.is_active
      and assignment.profile_id = p_profile_id
      and assignment.enabled;

    if not found then
      raise exception 'learning_point_item_unavailable' using errcode = '42501';
    end if;
  else
    if p_entry_type not in ('adjustment', 'initial_balance', 'redemption', 'refund') then
      raise exception 'learning_point_item_required' using errcode = '22023';
    end if;
    item_name := p_entry_type;
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
    occurred_on,
    actor_user_id
  )
  values (
    profile_household_id,
    p_profile_id,
    p_point_item_id,
    p_delta,
    p_entry_type,
    item_name,
    p_note,
    p_request_id,
    p_occurred_on,
    actor_id
  )
  returning * into saved_row;

  return next saved_row;
end;
$function$;

revoke all on function public.learning_record_points(uuid, uuid, integer, uuid, text, text, date) from public;
revoke all on function public.learning_record_points(uuid, uuid, integer, uuid, text, text, date) from anon;
grant execute on function public.learning_record_points(uuid, uuid, integer, uuid, text, text, date)
  to authenticated;
