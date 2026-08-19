begin;
select plan(20);

set local role postgres;

insert into auth.users (id, email, encrypted_password, raw_user_meta_data)
values
  ('99999999-9999-4999-8999-999999999999', 'import-owner@example.test', '$2a$10$test-password-hash', '{}'::jsonb),
  ('88888888-8888-4888-8888-888888888888', 'import-other@example.test', '$2a$10$test-password-hash', '{}'::jsonb);

insert into public.learning_households (id, name, owner_user_id)
values (
  '99999999-0000-4000-8000-999999999999',
  '旧积分导入测试家庭',
  '99999999-9999-4999-8999-999999999999'
);

insert into public.learning_household_members (household_id, user_id, role)
values (
  '99999999-0000-4000-8000-999999999999',
  '99999999-9999-4999-8999-999999999999',
  'owner'
);

insert into public.learning_profiles (id, household_id, display_name, grade_level)
values
  ('99999999-1111-4000-8000-999999999999', '99999999-0000-4000-8000-999999999999', '导入孩子一', 4),
  ('99999999-2222-4000-8000-999999999999', '99999999-0000-4000-8000-999999999999', '导入孩子二', 4);

-- legacy_import is now an accepted entry type, still bound by +/-1000.
select lives_ok(
  $$insert into public.learning_point_ledger (
      household_id, profile_id, delta, entry_type, item_name_snapshot, request_id, occurred_on
    ) values (
      '99999999-0000-4000-8000-999999999999',
      '99999999-1111-4000-8000-999999999999',
      1000,
      'legacy_import',
      '一起做家务',
      '99999999-0001-4000-8000-999999999999',
      '2026-08-01'
    )$$,
  'ledger accepts legacy_import entries'
);

select throws_ok(
  $$insert into public.learning_point_ledger (
      household_id, profile_id, delta, entry_type, item_name_snapshot, request_id, occurred_on
    ) values (
      '99999999-0000-4000-8000-999999999999',
      '99999999-1111-4000-8000-999999999999',
      1001,
      'legacy_import',
      '一起做家务',
      '99999999-0002-4000-8000-999999999999',
      '2026-08-01'
    )$$,
  '23514',
  null,
  'legacy_import entries keep the +/-1000 ceiling'
);

-- Clean up the constraint probe so the child starts unimported.
delete from public.learning_point_ledger
where profile_id in ('99999999-1111-4000-8000-999999999999', '99999999-2222-4000-8000-999999999999');

select ok(
  exists (
    select 1
    from pg_proc function
    join pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.proname = 'learning_import_legacy_points'
      and function.pronargs = 3
  ),
  'legacy import RPC has the stable request contract'
);

select ok(
  coalesce((
    select has_function_privilege(
      'authenticated',
      'public.learning_import_legacy_points(uuid,uuid,jsonb)',
      'execute'
    )
    where exists (
      select 1
      from pg_proc function
      join pg_namespace namespace on namespace.oid = function.pronamespace
      where namespace.nspname = 'public'
        and function.proname = 'learning_import_legacy_points'
    )
  ), false),
  'authenticated users can call the legacy import RPC'
);

select ok(
  coalesce((
    select not has_function_privilege(
      'anon',
      'public.learning_import_legacy_points(uuid,uuid,jsonb)',
      'execute'
    )
    where exists (
      select 1
      from pg_proc function
      join pg_namespace namespace on namespace.oid = function.pronamespace
      where namespace.nspname = 'public'
        and function.proname = 'learning_import_legacy_points'
    )
  ), false),
  'anonymous users cannot call the legacy import RPC'
);

select ok(
  coalesce((
    select function.prosecdef
    from pg_proc function
    join pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.proname = 'learning_import_legacy_points'
      and function.pronargs = 3
    limit 1
  ), false),
  'legacy import RPC runs as security definer'
);

-- Guardian imports a full batch of daily detail.
set local role authenticated;
set local request.jwt.claim.sub = '99999999-9999-4999-8999-999999999999';

select is(
  (select count(*)
   from public.learning_import_legacy_points(
     '99999999-1111-4000-8000-999999999999',
     '99999999-aaaa-4000-8000-999999999999',
     '[{"request_id":"99999999-b001-4000-8000-999999999999","occurred_on":"2026-08-01","delta":2,"item_name_snapshot":"一起做家务","note":"旧积分记录"},
       {"request_id":"99999999-b002-4000-8000-999999999999","occurred_on":"2026-08-02","delta":3,"item_name_snapshot":"认真完成学习","note":"旧积分记录"},
       {"request_id":"99999999-b003-4000-8000-999999999999","occurred_on":"2026-08-03","delta":-10,"item_name_snapshot":"撒谎","note":"旧积分记录"}]'::jsonb
   )),
  3::bigint,
  'guardian imports the whole daily batch at once'
);

select is(
  (select count(*)
   from public.learning_point_ledger
   where profile_id = '99999999-1111-4000-8000-999999999999'
     and entry_type = 'legacy_import'),
  3::bigint,
  'one legacy_import ledger row per daily entry'
);

select is(
  (select sum(delta)
   from public.learning_point_ledger
   where profile_id = '99999999-1111-4000-8000-999999999999'
     and entry_type = 'legacy_import'),
  -5::bigint,
  'restored balance equals the sum of the imported daily detail'
);

select is(
  (select string_agg(occurred_on::text, ',' order by occurred_on)
   from public.learning_point_ledger
   where profile_id = '99999999-1111-4000-8000-999999999999'
     and entry_type = 'legacy_import'),
  '2026-08-01,2026-08-02,2026-08-03',
  'daily dates are preserved in order'
);

select is(
  (select count(*)
   from public.learning_import_legacy_points(
     '99999999-1111-4000-8000-999999999999',
     '99999999-aaaa-4000-8000-999999999999',
     '[{"request_id":"99999999-b001-4000-8000-999999999999","occurred_on":"2026-08-01","delta":2,"item_name_snapshot":"一起做家务"},
       {"request_id":"99999999-b002-4000-8000-999999999999","occurred_on":"2026-08-02","delta":3,"item_name_snapshot":"认真完成学习"},
       {"request_id":"99999999-b003-4000-8000-999999999999","occurred_on":"2026-08-03","delta":-10,"item_name_snapshot":"撒谎"}]'::jsonb
   )),
  3::bigint,
  'retrying the same request returns the original rows'
);

select is(
  (select count(*)
   from public.learning_point_ledger
   where profile_id = '99999999-1111-4000-8000-999999999999'
     and entry_type = 'legacy_import'),
  3::bigint,
  'retrying the same request does not duplicate rows'
);

select throws_ok(
  $$select * from public.learning_import_legacy_points(
    '99999999-1111-4000-8000-999999999999',
    '99999999-bbbb-4000-8000-999999999999',
    '[{"request_id":"99999999-b004-4000-8000-999999999999","occurred_on":"2026-08-05","delta":3,"item_name_snapshot":"古诗词跟读"}]'::jsonb
  )$$,
  'P0001',
  'learning_legacy_points_already_imported',
  'a second import for the same child is rejected'
);

-- A child that already confirmed a manual opening balance cannot also import.
set local role postgres;
insert into public.learning_point_ledger (
  household_id, profile_id, delta, entry_type, item_name_snapshot, request_id
) values (
  '99999999-0000-4000-8000-999999999999',
  '99999999-2222-4000-8000-999999999999',
  1234,
  'initial_balance',
  '期初积分',
  '99999999-cccc-4000-8000-999999999999'
);
set local role authenticated;
set local request.jwt.claim.sub = '99999999-9999-4999-8999-999999999999';

select throws_ok(
  $$select * from public.learning_import_legacy_points(
    '99999999-2222-4000-8000-999999999999',
    '99999999-dddd-4000-8000-999999999999',
    '[{"request_id":"99999999-b005-4000-8000-999999999999","occurred_on":"2026-08-06","delta":2,"item_name_snapshot":"一起做家务"}]'::jsonb
  )$$,
  'P0001',
  'learning_legacy_points_already_imported',
  'import is blocked when a manual opening balance is already confirmed'
);

select throws_ok(
  $$select * from public.learning_import_legacy_points(
    '99999999-1111-4000-8000-999999999999',
    '99999999-dddd-4000-8000-999999999999',
    '[{"request_id":"99999999-b006-4000-8000-999999999999","occurred_on":"2026-02-31","delta":2,"item_name_snapshot":"一起做家务"}]'::jsonb
  )$$,
  '22023',
  'learning_legacy_entry_date_invalid',
  'a non-existent calendar date is rejected'
);

select throws_ok(
  $$select * from public.learning_import_legacy_points(
    '99999999-1111-4000-8000-999999999999',
    '99999999-dddd-4000-8000-999999999999',
    '[{"request_id":"99999999-b007-4000-8000-999999999999","occurred_on":"2026-08-01","delta":2000,"item_name_snapshot":"一起做家务"}]'::jsonb
  )$$,
  '22023',
  'learning_legacy_entry_delta_invalid',
  'a delta above the +/-1000 ceiling is rejected'
);

select throws_ok(
  $$select * from public.learning_import_legacy_points(
    '99999999-1111-4000-8000-999999999999',
    '99999999-dddd-4000-8000-999999999999',
    '[{"request_id":"99999999-b008-4000-8000-999999999999","occurred_on":"2026-08-01","delta":0,"item_name_snapshot":"一起做家务"}]'::jsonb
  )$$,
  '22023',
  'learning_legacy_entry_delta_invalid',
  'a zero delta is rejected'
);

select throws_ok(
  $$select * from public.learning_import_legacy_points(
    '99999999-1111-4000-8000-999999999999',
    '99999999-dddd-4000-8000-999999999999',
    '[{"request_id":"99999999-b009-4000-8000-999999999999","occurred_on":"2026-08-01","delta":2,"item_name_snapshot":""}]'::jsonb
  )$$,
  '22023',
  'learning_legacy_entry_name_invalid',
  'an empty item name is rejected'
);

select throws_ok(
  $$select * from public.learning_import_legacy_points(
    '99999999-1111-4000-8000-999999999999',
    '99999999-dddd-4000-8000-999999999999',
    '[]'::jsonb
  )$$,
  '22023',
  'learning_legacy_entries_required',
  'an empty entries array is rejected'
);

-- A user who is not a household member cannot import for the child.
set local role postgres;
insert into auth.users (id, email, encrypted_password, raw_user_meta_data)
values ('77777777-7777-4777-8777-777777777777', 'import-outsider@example.test', '$2a$10$test-password-hash', '{}'::jsonb);
set local role authenticated;
set local request.jwt.claim.sub = '77777777-7777-4777-8777-777777777777';

select throws_ok(
  $$select * from public.learning_import_legacy_points(
    '99999999-1111-4000-8000-999999999999',
    '99999999-dddd-4000-8000-999999999999',
    '[{"request_id":"99999999-b010-4000-8000-999999999999","occurred_on":"2026-08-01","delta":2,"item_name_snapshot":"一起做家务"}]'::jsonb
  )$$,
  '42501',
  'learning_point_forbidden',
  'a non-member cannot import legacy points for the child'
);
