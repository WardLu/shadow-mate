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
