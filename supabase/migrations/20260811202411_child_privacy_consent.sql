-- Server-side guardian consent for learner profile creation.
-- The consent record is intentionally append-only for the client: household
-- deletion cascades it, while authenticated users cannot rewrite timestamps or
-- policy history. This is an engineering control, not a substitute for legal
-- verification of the consent method in each target jurisdiction.

create table if not exists public.learning_guardian_consents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null
    references public.learning_households(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  consent_type text not null
    check (consent_type = 'learner_data_processing'),
  policy_version text not null
    check (policy_version = 'privacy-v1'),
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (household_id, user_id, consent_type, policy_version)
);

create index if not exists learning_guardian_consents_lookup_idx
  on public.learning_guardian_consents (household_id, user_id, consent_type, policy_version);

alter table public.learning_guardian_consents enable row level security;

revoke all on table public.learning_guardian_consents from anon;
revoke all on table public.learning_guardian_consents from authenticated;
grant select on table public.learning_guardian_consents to authenticated;
grant insert (
  household_id,
  user_id,
  consent_type,
  policy_version
) on table public.learning_guardian_consents to authenticated;

drop policy if exists "learning consents: guardians can read own" on public.learning_guardian_consents;
create policy "learning consents: guardians can read own"
on public.learning_guardian_consents
for select
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_guardian_consents.household_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'guardian')
  )
);

drop policy if exists "learning consents: guardians can create own" on public.learning_guardian_consents;
create policy "learning consents: guardians can create own"
on public.learning_guardian_consents
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and consent_type = 'learner_data_processing'
  and policy_version = 'privacy-v1'
  and exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_guardian_consents.household_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'guardian')
  )
);

-- A guardian consent is required before a new learner profile can be created.
-- Existing profile update/delete policies remain household-role based so that a
-- guardian can still honor a deletion request after a consent workflow change.
drop policy if exists "learning profiles: guardians can create" on public.learning_profiles;
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
  and exists (
    select 1
    from public.learning_guardian_consents consent
    where consent.household_id = learning_profiles.household_id
      and consent.user_id = (select auth.uid())
      and consent.consent_type = 'learner_data_processing'
      and consent.policy_version = 'privacy-v1'
  )
);
