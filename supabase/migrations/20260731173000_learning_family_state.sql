-- Lucas Learning Desk
-- Product registration + family-scoped cloud state.
-- The existing database is shared by several products; all new objects use the
-- learning_ prefix and the product registry key `lucas-learning`.

insert into public.projects (
  project_id,
  project_name,
  features_config,
  pricing_config
)
values (
  'lucas-learning',
  'Lucas Learning Desk',
  '{
    "modules": ["chinese", "math", "english", "books", "points", "growth"],
    "cloud_sync": true,
    "multi_learner": true,
    "content_source": "versioned-in-repository"
  }'::jsonb,
  '{"currency": "CNY", "free": true}'::jsonb
)
on conflict (project_id) do update
set
  project_name = excluded.project_name,
  features_config = excluded.features_config,
  updated_at = now();

create table if not exists public.learning_households (
  id uuid primary key default gen_random_uuid(),
  project_id text not null default 'lucas-learning'
    references public.projects(project_id),
  name text not null check (char_length(name) between 1 and 40),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  timezone text not null default 'Asia/Shanghai',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_households_product_check
    check (project_id = 'lucas-learning')
);

create table if not exists public.learning_household_members (
  household_id uuid not null
    references public.learning_households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'guardian'
    check (role in ('owner', 'guardian', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index if not exists learning_members_user_household_idx
  on public.learning_household_members (user_id, household_id);

create table if not exists public.learning_profiles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null
    references public.learning_households(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 30),
  grade_level smallint not null default 1
    check (grade_level between 1 and 12),
  avatar_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists learning_profiles_household_idx
  on public.learning_profiles (household_id, created_at);

create table if not exists public.learning_profile_states (
  profile_id uuid primary key
    references public.learning_profiles(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  constraint learning_profile_state_object_check
    check (jsonb_typeof(state) = 'object'),
  constraint learning_profile_state_size_check
    check (pg_column_size(state) <= 1048576)
);

alter table public.learning_households enable row level security;
alter table public.learning_household_members enable row level security;
alter table public.learning_profiles enable row level security;
alter table public.learning_profile_states enable row level security;

revoke all on table public.learning_households from anon;
revoke all on table public.learning_household_members from anon;
revoke all on table public.learning_profiles from anon;
revoke all on table public.learning_profile_states from anon;

grant select, insert, update on table public.learning_households to authenticated;
grant select, insert, update, delete on table public.learning_household_members to authenticated;
grant select, insert, update, delete on table public.learning_profiles to authenticated;
grant select, insert, update, delete on table public.learning_profile_states to authenticated;

create policy "learning households: members can read"
on public.learning_households
for select
to authenticated
using (
  owner_user_id = (select auth.uid())
  or exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_households.id
      and member.user_id = (select auth.uid())
  )
);

create policy "learning households: users create their own"
on public.learning_households
for insert
to authenticated
with check (
  owner_user_id = (select auth.uid())
  and project_id = 'lucas-learning'
);

create policy "learning households: owners can update"
on public.learning_households
for update
to authenticated
using (owner_user_id = (select auth.uid()))
with check (
  owner_user_id = (select auth.uid())
  and project_id = 'lucas-learning'
);

create policy "learning members: users can read self"
on public.learning_household_members
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "learning members: owner creates self membership"
on public.learning_household_members
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and role = 'owner'
  and exists (
    select 1
    from public.learning_households household
    where household.id = learning_household_members.household_id
      and household.owner_user_id = (select auth.uid())
  )
);

create policy "learning profiles: household members can read"
on public.learning_profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_profiles.household_id
      and member.user_id = (select auth.uid())
  )
);

create policy "learning profiles: guardians can create"
on public.learning_profiles
for insert
to authenticated
with check (
  exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_profiles.household_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'guardian')
  )
);

create policy "learning profiles: guardians can update"
on public.learning_profiles
for update
to authenticated
using (
  exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_profiles.household_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'guardian')
  )
)
with check (
  exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_profiles.household_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'guardian')
  )
);

create policy "learning profiles: guardians can delete"
on public.learning_profiles
for delete
to authenticated
using (
  exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_profiles.household_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'guardian')
  )
);

create policy "learning state: household members can read"
on public.learning_profile_states
for select
to authenticated
using (
  exists (
    select 1
    from public.learning_profiles profile
    join public.learning_household_members member
      on member.household_id = profile.household_id
    where profile.id = learning_profile_states.profile_id
      and member.user_id = (select auth.uid())
  )
);

create policy "learning state: guardians can create"
on public.learning_profile_states
for insert
to authenticated
with check (
  exists (
    select 1
    from public.learning_profiles profile
    join public.learning_household_members member
      on member.household_id = profile.household_id
    where profile.id = learning_profile_states.profile_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'guardian')
  )
);

create policy "learning state: guardians can update"
on public.learning_profile_states
for update
to authenticated
using (
  exists (
    select 1
    from public.learning_profiles profile
    join public.learning_household_members member
      on member.household_id = profile.household_id
    where profile.id = learning_profile_states.profile_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'guardian')
  )
)
with check (
  exists (
    select 1
    from public.learning_profiles profile
    join public.learning_household_members member
      on member.household_id = profile.household_id
    where profile.id = learning_profile_states.profile_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'guardian')
  )
);

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
