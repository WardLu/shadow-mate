begin;
select plan(30);

select is(
  to_regclass('public.learning_point_items')::text,
  'learning_point_items',
  'point item table exists'
);

select is(
  to_regclass('public.learning_profile_point_items')::text,
  'learning_profile_point_items',
  'profile point item table exists'
);

select is(
  to_regclass('public.learning_point_ledger')::text,
  'learning_point_ledger',
  'point ledger table exists'
);

select is(
  (select count(*)
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'learning_point_items'
     and column_name in ('household_id', 'name', 'default_points', 'is_active')),
  4::bigint,
  'point items expose household, label, default points, and active state'
);

select is(
  (select count(*)
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'learning_profile_point_items'
     and column_name in ('household_id', 'profile_id', 'point_item_id', 'points_override', 'enabled')),
  5::bigint,
  'profile point item config exposes household, child, item, override, and enabled state'
);

select is(
  (select count(*)
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'learning_point_ledger'
     and column_name in ('household_id', 'profile_id', 'point_item_id', 'delta', 'request_id', 'entry_type', 'actor_user_id')),
  7::bigint,
  'ledger exposes scope, source item, signed delta, idempotency, entry type, and actor'
);

select ok(
  (select count(*) = 3
   from pg_class
   where oid in (
     to_regclass('public.learning_point_items'),
     to_regclass('public.learning_profile_point_items'),
     to_regclass('public.learning_point_ledger')
   )
   and relrowsecurity),
  'RLS is enabled on all point tables'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = to_regclass('public.learning_point_ledger')
      and contype = 'u'
      and pg_get_constraintdef(oid) like '%profile_id%request_id%'
  ),
  'ledger has a per-child request idempotency constraint'
);

select ok(
  exists (
    select 1
      from pg_proc function
      join pg_namespace namespace on namespace.oid = function.pronamespace
      where namespace.nspname = 'public'
        and function.proname = 'learning_record_points'
        and function.pronargs = 6
  ),
  'record points RPC has the stable request contract'
);

select ok(
  coalesce((
    select has_function_privilege(
      'authenticated',
      'public.learning_record_points(uuid,uuid,integer,uuid,text,text)',
      'execute'
    )
    where exists (
      select 1
      from pg_proc function
      join pg_namespace namespace on namespace.oid = function.pronamespace
      where namespace.nspname = 'public'
        and function.proname = 'learning_record_points'
    )
  ), false),
  'authenticated users can call the record points RPC'
);

select ok(
  coalesce((
    select not has_function_privilege(
      'anon',
      'public.learning_record_points(uuid,uuid,integer,uuid,text,text)',
      'execute'
    )
    where exists (
      select 1
      from pg_proc function
      join pg_namespace namespace on namespace.oid = function.pronamespace
      where namespace.nspname = 'public'
        and function.proname = 'learning_record_points'
    )
  ), false),
  'anonymous users cannot call the record points RPC'
);

select ok(
  coalesce((
    select not has_table_privilege('authenticated', 'public.learning_point_ledger', 'update,delete')
    where to_regclass('public.learning_point_ledger') is not null
  ), false),
  'authenticated users cannot mutate or delete immutable ledger rows directly'
);

set local role postgres;

insert into auth.users (id, email, encrypted_password, raw_user_meta_data)
values
  ('33333333-3333-4333-8333-333333333333', 'points-owner@example.test', '$2a$10$test-password-hash', '{}'::jsonb),
  ('44444444-4444-4444-8444-444444444444', 'points-other@example.test', '$2a$10$test-password-hash', '{}'::jsonb);

insert into public.learning_households (id, name, owner_user_id)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '积分测试家庭',
  '33333333-3333-4333-8333-333333333333'
);

insert into public.learning_household_members (household_id, user_id, role)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '33333333-3333-4333-8333-333333333333',
  'owner'
);

insert into public.learning_profiles (id, household_id, display_name, grade_level)
values (
  'bbbbbbbb-dddd-4bbb-8bbb-bbbbbbbbbbbb',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '积分孩子',
  4
);

set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';

select lives_ok(
  $$insert into public.learning_point_items (
      id, household_id, name, default_points, item_kind, category
    ) values (
      'bbbbbbbb-cccc-4bbb-8bbb-bbbbbbbbbbbb',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '整理玩具',
      3,
      'custom',
      'growth'
    )$$,
  'guardian can create a household point item'
);

select lives_ok(
  $$insert into public.learning_profile_point_items (
      household_id, profile_id, point_item_id, points_override
    ) values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'bbbbbbbb-dddd-4bbb-8bbb-bbbbbbbbbbbb',
      'bbbbbbbb-cccc-4bbb-8bbb-bbbbbbbbbbbb',
      4
    )$$,
  'guardian can assign the point item to one child with an override'
);

select is(
  (select points_override
   from public.learning_profile_point_items
   where profile_id = 'bbbbbbbb-dddd-4bbb-8bbb-bbbbbbbbbbbb'
     and point_item_id = 'bbbbbbbb-cccc-4bbb-8bbb-bbbbbbbbbbbb'),
  4,
  'child-specific point override is stored separately from household default'
);

select is(
  (select count(*)
   from public.learning_record_points(
     'bbbbbbbb-dddd-4bbb-8bbb-bbbbbbbbbbbb',
     'bbbbbbbb-cccc-4bbb-8bbb-bbbbbbbbbbbb',
     4,
     'bbbbbbbb-eeee-4bbb-8bbb-bbbbbbbbbbbb',
     'manual',
     '完成整理玩具'
   )),
  1::bigint,
  'guardian can record one point event through the RPC'
);

select is(
  (select item_name_snapshot
   from public.learning_point_ledger
   where request_id = 'bbbbbbbb-eeee-4bbb-8bbb-bbbbbbbbbbbb'),
  '整理玩具',
  'ledger stores the item label snapshot'
);

select is(
  (select count(*)
   from public.learning_record_points(
     'bbbbbbbb-dddd-4bbb-8bbb-bbbbbbbbbbbb',
     'bbbbbbbb-cccc-4bbb-8bbb-bbbbbbbbbbbb',
     4,
     'bbbbbbbb-eeee-4bbb-8bbb-bbbbbbbbbbbb',
     'manual',
     '完成整理玩具'
   )),
  1::bigint,
  'repeating the same request returns the original row'
);

select is(
  (select count(*)
   from public.learning_point_ledger
   where profile_id = 'bbbbbbbb-dddd-4bbb-8bbb-bbbbbbbbbbbb'),
  1::bigint,
  'repeating a request does not duplicate the ledger'
);

select throws_ok(
  $$select * from public.learning_record_points(
    'bbbbbbbb-dddd-4bbb-8bbb-bbbbbbbbbbbb',
    'bbbbbbbb-cccc-4bbb-8bbb-bbbbbbbbbbbb',
    5,
    'bbbbbbbb-eeee-4bbb-8bbb-bbbbbbbbbbbb',
    'manual',
    '复用请求号'
  )$$,
  'P0001',
  'learning_request_reuse_conflict',
  'reusing a request id with different values is rejected'
);

select lives_ok(
  $$select * from public.learning_record_points(
    'bbbbbbbb-dddd-4bbb-8bbb-bbbbbbbbbbbb',
    null,
    -2,
    'bbbbbbbb-ffff-4bbb-8bbb-bbbbbbbbbbbb',
    'adjustment',
    '家长修正'
  )$$,
  'guardian can record a separate signed adjustment without an item'
);

select throws_ok(
  $$select * from public.learning_record_points(
    'bbbbbbbb-dddd-4bbb-8bbb-bbbbbbbbbbbb',
    null,
    2,
    'bbbbbbbb-1111-4bbb-8bbb-bbbbbbbbbbbb',
    'manual',
    '缺少积分项'
  )$$,
  '22023',
  'learning_point_item_required',
  'manual events require a configured point item'
);

select throws_ok(
  $$insert into public.learning_point_ledger (
      household_id, profile_id, delta, entry_type, item_name_snapshot, request_id
    ) values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'bbbbbbbb-dddd-4bbb-8bbb-bbbbbbbbbbbb',
      1,
      'manual',
      '越过 RPC',
      'bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb'
    )$$,
  '42501',
  null,
  'authenticated users cannot insert ledger rows directly'
);

select throws_ok(
  $$update public.learning_point_ledger
    set delta = 99
    where request_id = 'bbbbbbbb-eeee-4bbb-8bbb-bbbbbbbbbbbb'$$,
  '42501',
  null,
  'authenticated users cannot update ledger rows directly'
);

select throws_ok(
  $$delete from public.learning_point_ledger
    where request_id = 'bbbbbbbb-eeee-4bbb-8bbb-bbbbbbbbbbbb'$$,
  '42501',
  null,
  'authenticated users cannot delete ledger rows directly'
);

set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';

select is(
  (select count(*) from public.learning_point_items),
  0::bigint,
  'another user cannot read point items from the first household'
);

select is(
  (select count(*) from public.learning_profile_point_items),
  0::bigint,
  'another user cannot read child point assignments from the first household'
);

select is(
  (select count(*) from public.learning_point_ledger),
  0::bigint,
  'another user cannot read the first household ledger'
);

select throws_ok(
  $$select * from public.learning_record_points(
    'bbbbbbbb-dddd-4bbb-8bbb-bbbbbbbbbbbb',
    'bbbbbbbb-cccc-4bbb-8bbb-bbbbbbbbbbbb',
    4,
    'bbbbbbbb-3333-4bbb-8bbb-bbbbbbbbbbbb',
    'manual',
    '越权记分'
  )$$,
  '42501',
  'learning_point_forbidden',
  'another user cannot record points for the first household'
);

select throws_ok(
  $$insert into public.learning_point_items (
      household_id, name, default_points
    ) values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '越权项目',
      1
    )$$,
  '42501',
  null,
  'another user cannot create a point item in the first household'
);

select * from finish();
rollback;
