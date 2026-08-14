begin;
select plan(8);

select is(
  (select count(*)
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'learning_point_ledger'
     and column_name = 'occurred_on'),
  1::bigint,
  'point ledger preserves the local calendar date'
);

select ok(
  exists (
    select 1
    from pg_proc function
    join pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.proname = 'learning_record_points'
      and function.pronargs = 7
  ),
  'record points RPC exposes the date-aware overload'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.learning_record_points(uuid,uuid,integer,uuid,text,text,date)',
    'execute'
  ),
  'authenticated users can call the date-aware RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.learning_record_points(uuid,uuid,integer,uuid,text,text,date)',
    'execute'
  ),
  'anonymous users cannot call the date-aware RPC'
);

set local role postgres;

insert into auth.users (id, email, encrypted_password, raw_user_meta_data)
values ('55555555-5555-4555-8555-555555555555', 'point-date-owner@example.test', '$2a$10$test-password-hash', '{}'::jsonb);

insert into public.learning_households (id, name, owner_user_id)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '日期测试家庭', '55555555-5555-4555-8555-555555555555');

insert into public.learning_household_members (household_id, user_id, role)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '55555555-5555-4555-8555-555555555555', 'owner');

insert into public.learning_profiles (id, household_id, display_name, grade_level)
values ('cccccccc-dddd-4ccc-8ccc-cccccccccccc', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '日期孩子', 4);

insert into public.learning_point_items (id, household_id, name, default_points, item_kind, category)
values ('cccccccc-eeee-4ccc-8ccc-cccccccccccc', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '日期积分', 2, 'custom', 'growth');

insert into public.learning_profile_point_items (household_id, profile_id, point_item_id)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'cccccccc-dddd-4ccc-8ccc-cccccccccccc', 'cccccccc-eeee-4ccc-8ccc-cccccccccccc');

set local role authenticated;
set local request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';

select lives_ok(
  $$select * from public.learning_record_points(
    'cccccccc-dddd-4ccc-8ccc-cccccccccccc',
    'cccccccc-eeee-4ccc-8ccc-cccccccccccc',
    2,
    'cccccccc-ffff-4ccc-8ccc-cccccccccccc',
    'manual',
    '补记日期',
    '2026-08-03'
  )$$,
  'date-aware RPC records a point event'
);

select is(
  (select occurred_on from public.learning_point_ledger where request_id = 'cccccccc-ffff-4ccc-8ccc-cccccccccccc'),
  date '2026-08-03',
  'point event keeps the selected date'
);

select lives_ok(
  $$select * from public.learning_record_points(
    'cccccccc-dddd-4ccc-8ccc-cccccccccccc',
    'cccccccc-eeee-4ccc-8ccc-cccccccccccc',
    2,
    'cccccccc-ffff-4ccc-8ccc-cccccccccccc',
    'manual',
    '补记日期',
    '2026-08-03'
  )$$,
  'date-aware RPC remains idempotent'
);

select is(
  (select count(*) from public.learning_point_ledger where profile_id = 'cccccccc-dddd-4ccc-8ccc-cccccccccccc'),
  1::bigint,
  'repeating the dated request does not duplicate history'
);

select * from finish();
rollback;
