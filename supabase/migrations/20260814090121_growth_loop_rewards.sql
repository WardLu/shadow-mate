-- Shadow Mate Growth Loop reward and redemption foundation.
-- Redemption changes are paired with point ledger rows; cancellation never
-- edits the original redemption debit and instead appends a refund row.

create table if not exists public.learning_rewards (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null
    references public.learning_households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  description text,
  cost_points integer not null check (cost_points between 1 and 100000),
  reward_kind text not null default 'custom'
    check (reward_kind in ('custom', 'recommended')),
  category text not null default 'family'
    check (category in ('family', 'activity', 'treat', 'other')),
  icon_key text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id)
);

create table if not exists public.learning_profile_rewards (
  household_id uuid not null,
  profile_id uuid not null,
  reward_id uuid not null,
  cost_override integer
    check (cost_override is null or cost_override between 1 and 100000),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, reward_id),
  constraint learning_profile_rewards_profile_fk
    foreign key (profile_id, household_id)
    references public.learning_profiles(id, household_id)
    on delete cascade,
  constraint learning_profile_rewards_reward_fk
    foreign key (reward_id, household_id)
    references public.learning_rewards(id, household_id)
    on delete cascade
);

create table if not exists public.learning_redemptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  profile_id uuid not null,
  reward_id uuid not null,
  reward_name_snapshot text not null check (char_length(reward_name_snapshot) between 1 and 60),
  cost_points_snapshot integer not null check (cost_points_snapshot between 1 and 100000),
  status text not null default 'pending'
    check (status in ('pending', 'fulfilled', 'cancelled')),
  request_id uuid not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  fulfilled_at timestamptz,
  fulfilled_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_redemptions_profile_fk
    foreign key (profile_id, household_id)
    references public.learning_profiles(id, household_id)
    on delete cascade,
  constraint learning_redemptions_reward_fk
    foreign key (reward_id, household_id)
    references public.learning_rewards(id, household_id)
    on delete restrict,
  constraint learning_redemptions_request_key unique (profile_id, request_id)
);

alter table public.learning_point_ledger
  add column if not exists redemption_id uuid;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.learning_point_ledger'::regclass
      and conname = 'learning_point_ledger_redemption_fk'
  ) then
    alter table public.learning_point_ledger
      add constraint learning_point_ledger_redemption_fk
      foreign key (redemption_id)
      references public.learning_redemptions(id)
      on delete set null;
  end if;
end;
$migration$;

create index if not exists learning_rewards_household_idx
  on public.learning_rewards (household_id, is_active, created_at);

create index if not exists learning_profile_rewards_profile_scope_idx
  on public.learning_profile_rewards (profile_id, household_id);

create index if not exists learning_profile_rewards_reward_scope_idx
  on public.learning_profile_rewards (reward_id, household_id);

create index if not exists learning_redemptions_profile_created_idx
  on public.learning_redemptions (profile_id, created_at desc);

create index if not exists learning_redemptions_reward_scope_idx
  on public.learning_redemptions (reward_id, household_id);

create index if not exists learning_point_ledger_redemption_idx
  on public.learning_point_ledger (redemption_id);

alter table public.learning_rewards enable row level security;
alter table public.learning_profile_rewards enable row level security;
alter table public.learning_redemptions enable row level security;

revoke all on table public.learning_rewards from anon;
revoke all on table public.learning_profile_rewards from anon;
revoke all on table public.learning_redemptions from anon;
revoke all on table public.learning_rewards from authenticated;
revoke all on table public.learning_profile_rewards from authenticated;
revoke all on table public.learning_redemptions from authenticated;

grant select, insert, update on table public.learning_rewards to authenticated;
grant select, insert, update, delete on table public.learning_profile_rewards to authenticated;
grant select on table public.learning_redemptions to authenticated;

drop policy if exists "learning rewards: household members can read" on public.learning_rewards;
create policy "learning rewards: household members can read"
on public.learning_rewards
for select
to authenticated
using (
  exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_rewards.household_id
      and member.user_id = (select auth.uid())
  )
);

drop policy if exists "learning rewards: guardians can create" on public.learning_rewards;
create policy "learning rewards: guardians can create"
on public.learning_rewards
for insert
to authenticated
with check (
  exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_rewards.household_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'guardian')
  )
);

drop policy if exists "learning rewards: guardians can update" on public.learning_rewards;
create policy "learning rewards: guardians can update"
on public.learning_rewards
for update
to authenticated
using (
  exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_rewards.household_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'guardian')
  )
)
with check (
  exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_rewards.household_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'guardian')
  )
);

drop policy if exists "learning profile rewards: household members can read" on public.learning_profile_rewards;
create policy "learning profile rewards: household members can read"
on public.learning_profile_rewards
for select
to authenticated
using (
  exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_profile_rewards.household_id
      and member.user_id = (select auth.uid())
  )
);

drop policy if exists "learning profile rewards: guardians can create" on public.learning_profile_rewards;
create policy "learning profile rewards: guardians can create"
on public.learning_profile_rewards
for insert
to authenticated
with check (
  exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_profile_rewards.household_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'guardian')
  )
);

drop policy if exists "learning profile rewards: guardians can update" on public.learning_profile_rewards;
create policy "learning profile rewards: guardians can update"
on public.learning_profile_rewards
for update
to authenticated
using (
  exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_profile_rewards.household_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'guardian')
  )
)
with check (
  exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_profile_rewards.household_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'guardian')
  )
);

drop policy if exists "learning profile rewards: guardians can delete" on public.learning_profile_rewards;
create policy "learning profile rewards: guardians can delete"
on public.learning_profile_rewards
for delete
to authenticated
using (
  exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_profile_rewards.household_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'guardian')
  )
);

drop policy if exists "learning redemptions: household members can read" on public.learning_redemptions;
create policy "learning redemptions: household members can read"
on public.learning_redemptions
for select
to authenticated
using (
  exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_redemptions.household_id
      and member.user_id = (select auth.uid())
  )
);

create or replace function private.learning_validate_point_ledger_entry()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  redemption_profile_id uuid;
  redemption_household_id uuid;
begin
  if new.entry_type in ('redemption', 'refund') and new.redemption_id is null then
    raise exception 'learning_redemption_link_required' using errcode = '22023';
  end if;

  if new.entry_type not in ('redemption', 'refund') and new.redemption_id is not null then
    raise exception 'learning_redemption_link_invalid' using errcode = '22023';
  end if;

  if new.redemption_id is not null then
    select redemption.profile_id, redemption.household_id
    into redemption_profile_id, redemption_household_id
    from public.learning_redemptions redemption
    where redemption.id = new.redemption_id;

    if not found
       or redemption_profile_id is distinct from new.profile_id
       or redemption_household_id is distinct from new.household_id then
      raise exception 'learning_redemption_scope_invalid' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists learning_point_ledger_entry_guard on public.learning_point_ledger;
create trigger learning_point_ledger_entry_guard
before insert or update on public.learning_point_ledger
for each row execute function private.learning_validate_point_ledger_entry();

create or replace function public.learning_redeem_reward(
  p_profile_id uuid,
  p_reward_id uuid,
  p_request_id uuid
)
returns setof public.learning_redemptions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  profile_household_id uuid;
  reward_name text;
  reward_cost integer;
  current_balance bigint;
  existing_row public.learning_redemptions%rowtype;
  saved_row public.learning_redemptions%rowtype;
begin
  if actor_id is null then
    raise exception 'learning_auth_required' using errcode = '42501';
  end if;

  if p_request_id is null then
    raise exception 'learning_request_id_required' using errcode = '22023';
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
  from public.learning_redemptions redemption
  where redemption.profile_id = p_profile_id
    and redemption.request_id = p_request_id;

  if found then
    if existing_row.reward_id = p_reward_id then
      return next existing_row;
      return;
    end if;
    raise exception 'learning_request_reuse_conflict' using errcode = 'P0001';
  end if;

  perform 1
  from public.learning_profiles profile
  where profile.id = p_profile_id
  for update;

  select reward.name, coalesce(assignment.cost_override, reward.cost_points)
  into reward_name, reward_cost
  from public.learning_rewards reward
  join public.learning_profile_rewards assignment
    on assignment.reward_id = reward.id
   and assignment.household_id = reward.household_id
  where reward.id = p_reward_id
    and reward.household_id = profile_household_id
    and reward.is_active
    and assignment.profile_id = p_profile_id
    and assignment.enabled;

  if not found then
    raise exception 'learning_reward_unavailable' using errcode = '42501';
  end if;

  select coalesce(sum(ledger.delta), 0)
  into current_balance
  from public.learning_point_ledger ledger
  where ledger.profile_id = p_profile_id;

  if current_balance < reward_cost then
    raise exception 'learning_reward_insufficient_points' using errcode = 'P0001';
  end if;

  insert into public.learning_redemptions (
    household_id,
    profile_id,
    reward_id,
    reward_name_snapshot,
    cost_points_snapshot,
    request_id,
    actor_user_id
  )
  values (
    profile_household_id,
    p_profile_id,
    p_reward_id,
    reward_name,
    reward_cost,
    p_request_id,
    actor_id
  )
  returning * into saved_row;

  insert into public.learning_point_ledger (
    household_id,
    profile_id,
    delta,
    entry_type,
    item_name_snapshot,
    request_id,
    actor_user_id,
    redemption_id
  )
  values (
    profile_household_id,
    p_profile_id,
    -reward_cost,
    'redemption',
    reward_name,
    p_request_id,
    actor_id,
    saved_row.id
  );

  return next saved_row;
end;
$function$;

create or replace function public.learning_fulfill_redemption(
  p_redemption_id uuid
)
returns setof public.learning_redemptions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  current_row public.learning_redemptions%rowtype;
  saved_row public.learning_redemptions%rowtype;
begin
  if actor_id is null then
    raise exception 'learning_auth_required' using errcode = '42501';
  end if;

  select redemption.*
  into current_row
  from public.learning_redemptions redemption
  join public.learning_household_members member
    on member.household_id = redemption.household_id
  where redemption.id = p_redemption_id
    and member.user_id = actor_id
    and member.role in ('owner', 'guardian')
  for update of redemption;

  if not found then
    raise exception 'learning_redemption_forbidden' using errcode = '42501';
  end if;

  if current_row.status = 'fulfilled' then
    return next current_row;
    return;
  end if;

  if current_row.status <> 'pending' then
    raise exception 'learning_redemption_not_fulfillable' using errcode = 'P0001';
  end if;

  update public.learning_redemptions redemption
  set
    status = 'fulfilled',
    fulfilled_at = now(),
    fulfilled_by = actor_id,
    updated_at = now()
  where redemption.id = p_redemption_id
  returning * into saved_row;

  return next saved_row;
end;
$function$;

create or replace function public.learning_cancel_redemption(
  p_redemption_id uuid,
  p_request_id uuid,
  p_note text default null
)
returns setof public.learning_redemptions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  current_row public.learning_redemptions%rowtype;
  saved_row public.learning_redemptions%rowtype;
  existing_refund public.learning_point_ledger%rowtype;
begin
  if actor_id is null then
    raise exception 'learning_auth_required' using errcode = '42501';
  end if;

  if p_request_id is null then
    raise exception 'learning_request_id_required' using errcode = '22023';
  end if;

  if p_note is not null and char_length(p_note) > 200 then
    raise exception 'learning_redemption_note_too_long' using errcode = '22001';
  end if;

  select redemption.*
  into current_row
  from public.learning_redemptions redemption
  join public.learning_household_members member
    on member.household_id = redemption.household_id
  where redemption.id = p_redemption_id
    and member.user_id = actor_id
    and member.role in ('owner', 'guardian')
  for update of redemption;

  if not found then
    raise exception 'learning_redemption_forbidden' using errcode = '42501';
  end if;

  if current_row.status = 'cancelled' then
    select ledger.*
    into existing_refund
    from public.learning_point_ledger ledger
    where ledger.redemption_id = p_redemption_id
      and ledger.request_id = p_request_id
      and ledger.entry_type = 'refund';
    if found then
      return next current_row;
      return;
    end if;
    raise exception 'learning_redemption_already_cancelled' using errcode = 'P0001';
  end if;

  if current_row.status <> 'pending' then
    raise exception 'learning_redemption_not_cancellable' using errcode = 'P0001';
  end if;

  update public.learning_redemptions redemption
  set
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = actor_id,
    updated_at = now()
  where redemption.id = p_redemption_id
  returning * into saved_row;

  insert into public.learning_point_ledger (
    household_id,
    profile_id,
    delta,
    entry_type,
    item_name_snapshot,
    note,
    request_id,
    actor_user_id,
    redemption_id
  )
  values (
    saved_row.household_id,
    saved_row.profile_id,
    saved_row.cost_points_snapshot,
    'refund',
    saved_row.reward_name_snapshot,
    p_note,
    p_request_id,
    actor_id,
    saved_row.id
  );

  return next saved_row;
end;
$function$;

revoke all on function public.learning_redeem_reward(uuid, uuid, uuid) from public;
revoke all on function public.learning_redeem_reward(uuid, uuid, uuid) from anon;
grant execute on function public.learning_redeem_reward(uuid, uuid, uuid) to authenticated;

revoke all on function public.learning_fulfill_redemption(uuid) from public;
revoke all on function public.learning_fulfill_redemption(uuid) from anon;
grant execute on function public.learning_fulfill_redemption(uuid) to authenticated;

revoke all on function public.learning_cancel_redemption(uuid, uuid, text) from public;
revoke all on function public.learning_cancel_redemption(uuid, uuid, text) from anon;
grant execute on function public.learning_cancel_redemption(uuid, uuid, text) to authenticated;

comment on table public.learning_rewards is
  'Household-owned rewards that can be enabled per child and redeemed for points.';
comment on table public.learning_profile_rewards is
  'Many-to-many child configuration for household rewards, including a child-specific cost override.';
comment on table public.learning_redemptions is
  'Reward redemption state with stable snapshots; point debit and refund live in the immutable ledger.';
comment on function public.learning_redeem_reward(uuid, uuid, uuid) is
  'Atomically checks balance, creates a pending redemption, and appends the redemption debit.';
comment on function public.learning_fulfill_redemption(uuid) is
  'Marks a pending redemption fulfilled without rewriting point history.';
comment on function public.learning_cancel_redemption(uuid, uuid, text) is
  'Cancels a pending redemption and appends a compensating refund ledger row.';
