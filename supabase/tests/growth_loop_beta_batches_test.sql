-- W5 / 交付项 1：private 内测批次表（F0 分母）pgTAP 测试。
--
-- 验证：表存在、字段仅限边界合同（无邮箱/姓名/学习内容）、RLS、客户端无访问权、
-- 家庭删除级联清理、状态与时间约束、postgres 内部可读写。

begin;
select plan(9);

select is(
  to_regclass('private.learning_beta_batches')::text,
  'private.learning_beta_batches',
  'private beta batch table exists'
);

select is(
  (select count(*)
   from information_schema.columns
   where table_schema = 'private'
     and table_name = 'learning_beta_batches'
     and column_name in (
       'household_id', 'batch', 'status', 'invited_at', 'joined_at', 'updated_at'
     )),
  6::bigint,
  'beta batch stores only bounded cohort fields (no emails/names/content)'
);

select ok(
  (select relrowsecurity from pg_class where oid = to_regclass('private.learning_beta_batches')),
  'beta batch table has RLS enabled'
);

select ok(
  coalesce((select not has_table_privilege('authenticated', 'private.learning_beta_batches', 'select,insert,update,delete')), false),
  'authenticated users cannot read or write the private batch table'
);

select ok(
  coalesce((select not has_table_privilege('anon', 'private.learning_beta_batches', 'select,insert,update,delete')), false),
  'anonymous users cannot read or write the private batch table'
);

set local role postgres;

insert into auth.users (id, email, encrypted_password, raw_user_meta_data)
values (
  '00000000-0000-4000-8000-00000000000a',
  'beta-batch-owner@example.test',
  '$2a$10$test-password-hash',
  '{}'::jsonb
);

insert into public.learning_households (id, name, owner_user_id)
values (
  '00000000-aaaa-4000-8000-00000000000a',
  '批次测试家庭',
  '00000000-0000-4000-8000-00000000000a'
);

insert into private.learning_beta_batches (household_id, batch, status, invited_at, joined_at)
values (
  '00000000-aaaa-4000-8000-00000000000a',
  'b1',
  'active',
  now() - interval '10 days',
  now() - interval '9 days'
);

select lives_ok(
  $$delete from public.learning_households
    where id = '00000000-aaaa-4000-8000-00000000000a'$$,
  'household can be removed'
);

select is(
  (select count(*) from private.learning_beta_batches
   where household_id = '00000000-aaaa-4000-8000-00000000000a'),
  0::bigint,
  'batch row cascades away with its household'
);

insert into public.learning_households (id, name, owner_user_id)
values (
  '00000000-bbbb-4000-8000-00000000000a',
  '批次约束测试家庭',
  '00000000-0000-4000-8000-00000000000a'
);

select throws_ok(
  $$insert into private.learning_beta_batches (household_id, batch, status)
    values ('00000000-bbbb-4000-8000-00000000000a', 'b1', 'bogus')$$,
  '23514',
  null,
  'invalid batch status is rejected'
);

select throws_ok(
  $$insert into private.learning_beta_batches (household_id, batch, invited_at, joined_at)
    values ('00000000-bbbb-4000-8000-00000000000a', 'b1', now(), now() - interval '1 day')$$,
  '23514',
  null,
  'join before invite is rejected'
);

rollback;
