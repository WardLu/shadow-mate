-- W5 / 交付项 1：private 内测批次表（F0 分母）。
--
-- 仅存家庭 ID、批次、邀请/加入时间、状态。不存邮箱、家长/孩子姓名、学习内容。
-- 与 private.learning_activity_events 保持同一隐私边界：客户端无 schema/表/函数读取权限。
-- 家庭删除时级联清理（learning_households on delete cascade）。

create table if not exists private.learning_beta_batches (
  household_id uuid primary key
    references public.learning_households(id) on delete cascade,
  batch text not null check (char_length(batch) between 1 and 40),
  status text not null default 'active'
    check (status in ('invited', 'active', 'paused', 'exited')),
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint learning_beta_batches_join_after_invite
    check (joined_at is null or joined_at >= invited_at)
);

alter table private.learning_beta_batches enable row level security;

revoke all on table private.learning_beta_batches from public;
revoke all on table private.learning_beta_batches from anon;
revoke all on table private.learning_beta_batches from authenticated;

create index if not exists learning_beta_batches_batch_idx
  on private.learning_beta_batches (batch, joined_at);

comment on table private.learning_beta_batches is
  'Shadow Mate private 内测批次表（F0 分母）：仅存家庭 ID、批次、邀请/加入时间、状态，客户端无访问权。';

-- privacy-v2 documents the allowlisted server-side Growth Loop diagnostics
-- and their 180-day retention. Existing privacy-v1 rows remain valid consent
-- history; new clients write privacy-v2 without rewriting old timestamps.
alter table public.learning_guardian_consents
  drop constraint if exists learning_guardian_consents_policy_version_check;

alter table public.learning_guardian_consents
  add constraint learning_guardian_consents_policy_version_check
  check (policy_version in ('privacy-v1', 'privacy-v2'));

drop policy if exists "learning consents: guardians can create own"
  on public.learning_guardian_consents;
create policy "learning consents: guardians can create own"
on public.learning_guardian_consents
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and consent_type = 'learner_data_processing'
  and policy_version in ('privacy-v1', 'privacy-v2')
  and exists (
    select 1
    from public.learning_household_members member
    where member.household_id = learning_guardian_consents.household_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'guardian')
  )
);

drop policy if exists "learning profiles: guardians can create"
  on public.learning_profiles;
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
      and consent.policy_version in ('privacy-v1', 'privacy-v2')
  )
);

comment on table public.learning_guardian_consents is
  'Append-only guardian consent history. privacy-v2 covers allowlisted Growth Loop activity diagnostics; privacy-v1 remains valid for historical consent.';
