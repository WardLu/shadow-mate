-- Shadow Mate Growth Loop foundation: household point items, child-specific
-- configuration, and an immutable, idempotent point ledger.
-- Rewards, redemptions, analytics events, and the IndexedDB outbox are
-- intentionally separate follow-up slices.

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.learning_profiles'::regclass
      and conname = 'learning_profiles_id_household_key'
  ) then
    alter table public.learning_profiles
      add constraint learning_profiles_id_household_key unique (id, household_id);
  end if;
end;
$migration$;

create table if not exists public.learning_point_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null
    references public.learning_households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  description text,
  default_points integer not null
    check (default_points between -1000 and 1000 and default_points <> 0),
  item_kind text not null default 'custom'
    check (item_kind in ('custom', 'recommended')),
  category text not null default 'growth'
    check (category in ('growth', 'learning', 'family', 'other')),
  icon_key text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id)
);

create table if not exists public.learning_profile_point_items (
  household_id uuid not null,
  profile_id uuid not null,
  point_item_id uuid not null,
  points_override integer
    check (points_override is null or (points_override between -1000 and 1000 and points_override <> 0)),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, point_item_id),
  constraint learning_profile_point_items_profile_fk
    foreign key (profile_id, household_id)
    references public.learning_profiles(id, household_id)
    on delete cascade,
  constraint learning_profile_point_items_item_fk
    foreign key (point_item_id, household_id)
    references public.learning_point_items(id, household_id)
    on delete cascade
);

create table if not exists public.learning_point_ledger (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  profile_id uuid not null,
  point_item_id uuid,
  delta integer not null
    check (delta between -1000 and 1000 and delta <> 0),
  entry_type text not null
    check (entry_type in ('manual', 'adjustment', 'initial_balance', 'redemption', 'refund')),
  item_name_snapshot text not null check (char_length(item_name_snapshot) between 1 and 60),
  note text check (note is null or char_length(note) <= 200),
  request_id uuid not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint learning_point_ledger_profile_fk
    foreign key (profile_id, household_id)
    references public.learning_profiles(id, household_id)
    on delete cascade,
  constraint learning_point_ledger_item_fk
    foreign key (point_item_id, household_id)
    references public.learning_point_items(id, household_id)
    on delete set null,
  constraint learning_point_ledger_request_key unique (profile_id, request_id)
);

create index if not exists learning_point_items_household_idx
  on public.learning_point_items (household_id, is_active, created_at);

create index if not exists learning_profile_point_items_lookup_idx
  on public.learning_profile_point_items (household_id, profile_id, enabled);

create index if not exists learning_point_ledger_profile_created_idx
  on public.learning_point_ledger (profile_id, created_at desc);

alter table public.learning_point_items enable row level security;
alter table public.learning_profile_point_items enable row level security;
alter table public.learning_point_ledger enable row level security;

revoke all on table public.learning_point_items from anon;
revoke all on table public.learning_profile_point_items from anon;
revoke all on table public.learning_point_ledger from anon;
revoke all on table public.learning_point_items from authenticated;
revoke all on table public.learning_profile_point_items from authenticated;
revoke all on table public.learning_point_ledger from authenticated;

grant select, insert, update on table public.learning_point_items to authenticated;
grant select, insert, update, delete on table public.learning_profile_point_items to authenticated;
grant select on table public.learning_point_ledger to authenticated;

drop policy if exists "learning point items: household members can read" on public.learning_point_items;
create policy "learning point items: household members can read"
on public.learning_point_items
for select
to authenticated
using (
  exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_point_items.household_id
      and member.user_id = (select auth.uid())
  )
);

drop policy if exists "learning point items: guardians can create" on public.learning_point_items;
create policy "learning point items: guardians can create"
on public.learning_point_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_point_items.household_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'guardian')
  )
);

drop policy if exists "learning point items: guardians can update" on public.learning_point_items;
create policy "learning point items: guardians can update"
on public.learning_point_items
for update
to authenticated
using (
  exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_point_items.household_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'guardian')
  )
)
with check (
  exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_point_items.household_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'guardian')
  )
);

drop policy if exists "learning profile point items: household members can read" on public.learning_profile_point_items;
create policy "learning profile point items: household members can read"
on public.learning_profile_point_items
for select
to authenticated
using (
  exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_profile_point_items.household_id
      and member.user_id = (select auth.uid())
  )
);

drop policy if exists "learning profile point items: guardians can create" on public.learning_profile_point_items;
create policy "learning profile point items: guardians can create"
on public.learning_profile_point_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_profile_point_items.household_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'guardian')
  )
);

drop policy if exists "learning profile point items: guardians can update" on public.learning_profile_point_items;
create policy "learning profile point items: guardians can update"
on public.learning_profile_point_items
for update
to authenticated
using (
  exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_profile_point_items.household_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'guardian')
  )
)
with check (
  exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_profile_point_items.household_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'guardian')
  )
);

drop policy if exists "learning profile point items: guardians can delete" on public.learning_profile_point_items;
create policy "learning profile point items: guardians can delete"
on public.learning_profile_point_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_profile_point_items.household_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'guardian')
  )
);

drop policy if exists "learning point ledger: household members can read" on public.learning_point_ledger;
create policy "learning point ledger: household members can read"
on public.learning_point_ledger
for select
to authenticated
using (
  exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_point_ledger.household_id
      and member.user_id = (select auth.uid())
  )
);

create or replace function public.learning_record_points(
  p_profile_id uuid,
  p_point_item_id uuid,
  p_delta integer,
  p_request_id uuid,
  p_entry_type text default 'manual',
  p_note text default null
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

  -- A retry returns the original row. A reused request id with different
  -- business values is rejected instead of silently changing history.
  select *
  into existing_row
  from public.learning_point_ledger ledger
  where ledger.profile_id = p_profile_id
    and ledger.request_id = p_request_id;

  if found then
    if existing_row.point_item_id is not distinct from p_point_item_id
       and existing_row.delta = p_delta
       and existing_row.entry_type = p_entry_type
       and existing_row.note is not distinct from p_note then
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
    actor_id
  )
  returning * into saved_row;

  return next saved_row;
end;
$function$;

revoke all on function public.learning_record_points(uuid, uuid, integer, uuid, text, text) from public;
revoke all on function public.learning_record_points(uuid, uuid, integer, uuid, text, text) from anon;
grant execute on function public.learning_record_points(uuid, uuid, integer, uuid, text, text)
  to authenticated;

comment on table public.learning_point_items is
  'Household-owned reusable positive or corrective point items; child assignment is stored separately.';
comment on table public.learning_profile_point_items is
  'Many-to-many child configuration for household point items, including a child-specific value override.';
comment on table public.learning_point_ledger is
  'Append-only child point history. New rows are created through learning_record_points.';
comment on function public.learning_record_points(uuid, uuid, integer, uuid, text, text) is
  'Idempotently records one signed point event for a guardian-managed child scope.';
