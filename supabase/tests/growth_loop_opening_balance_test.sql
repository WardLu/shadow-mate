begin;
select plan(20);

set local role postgres;

insert into auth.users (id, email, encrypted_password, raw_user_meta_data)
values
  ('77777777-7777-4777-8777-777777777777', 'balance-owner@example.test', '$2a$10$test-password-hash', '{}'::jsonb),
  ('88888888-8888-4888-8888-888888888888', 'balance-other@example.test', '$2a$10$test-password-hash', '{}'::jsonb);

insert into public.learning_households (id, name, owner_user_id)
values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  '期初积分测试家庭',
  '77777777-7777-4777-8777-777777777777'
);

insert into public.learning_household_members (household_id, user_id, role)
values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  '77777777-7777-4777-8777-777777777777',
  'owner'
);

insert into public.learning_profiles (id, household_id, display_name, grade_level)
values
  ('dddddddd-1111-4ddd-8ddd-dddddddddddd', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', '期初孩子一', 4),
  ('dddddddd-2222-4ddd-8ddd-dddddddddddd', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', '期初孩子二', 4);

-- The signed-delta ceiling is relaxed only for initial_balance rows.
select lives_ok(
  $$insert into public.learning_point_ledger (
      household_id, profile_id, delta, entry_type, item_name_snapshot, request_id
    ) values (
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'dddddddd-1111-4ddd-8ddd-dddddddddddd',
      5000,
      'initial_balance',
      '期初积分',
      'dddddddd-0001-4ddd-8ddd-dddddddddddd'
    )$$,
  'ledger accepts an initial_balance delta above the normal ceiling'
);

select throws_ok(
  $$insert into public.learning_point_ledger (
      household_id, profile_id, delta, entry_type, item_name_snapshot, request_id
    ) values (
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'dddddddd-1111-4ddd-8ddd-dddddddddddd',
      2000,
      'manual',
      '普通流水',
      'dddddddd-0002-4ddd-8ddd-dddddddddddd'
    )$$,
  '23514',
  null,
  'non-opening entries keep the +/-1000 ceiling'
);

-- Clean up the constraint probe so the child starts unconfirmed.
delete from public.learning_point_ledger
where profile_id = 'dddddddd-1111-4ddd-8ddd-dddddddddddd';

select ok(
  exists (
    select 1
    from pg_proc function
    join pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.proname = 'learning_confirm_opening_balance'
      and function.pronargs = 4
  ),
  'opening balance RPC has the stable request contract'
);

select ok(
  coalesce((
    select has_function_privilege(
      'authenticated',
      'public.learning_confirm_opening_balance(uuid,integer,uuid,text)',
      'execute'
    )
    where exists (
      select 1
      from pg_proc function
      join pg_namespace namespace on namespace.oid = function.pronamespace
      where namespace.nspname = 'public'
        and function.proname = 'learning_confirm_opening_balance'
    )
  ), false),
  'authenticated users can call the opening balance RPC'
);

select ok(
  coalesce((
    select not has_function_privilege(
      'anon',
      'public.learning_confirm_opening_balance(uuid,integer,uuid,text)',
      'execute'
    )
    where exists (
      select 1
      from pg_proc function
      join pg_namespace namespace on namespace.oid = function.pronamespace
      where namespace.nspname = 'public'
        and function.proname = 'learning_confirm_opening_balance'
    )
  ), false),
  'anonymous users cannot call the opening balance RPC'
);

select ok(
  coalesce((
    select function.prosecdef
    from pg_proc function
    join pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.proname = 'learning_confirm_opening_balance'
      and function.pronargs = 4
    limit 1
  ), false),
  'opening balance RPC runs as security definer'
);

set local role authenticated;
set local request.jwt.claim.sub = '77777777-7777-4777-8777-777777777777';

select is(
  (select count(*)
   from public.learning_confirm_opening_balance(
     'dddddddd-1111-4ddd-8ddd-dddddddddddd',
     1234,
     'dddddddd-aaaa-4ddd-8ddd-dddddddddddd',
     '期初积分'
   )),
  1::bigint,
  'guardian can confirm an opening balance once'
);

select is(
  (select count(*)
   from public.learning_point_ledger
   where profile_id = 'dddddddd-1111-4ddd-8ddd-dddddddddddd'
     and entry_type = 'initial_balance'),
  1::bigint,
  'exactly one initial_balance row is created for the child'
);

select is(
  (select delta
   from public.learning_point_ledger
   where profile_id = 'dddddddd-1111-4ddd-8ddd-dddddddddddd'
     and entry_type = 'initial_balance'),
  1234,
  'opening balance stores the confirmed carry-forward value'
);

select is(
  (select item_name_snapshot
   from public.learning_point_ledger
   where profile_id = 'dddddddd-1111-4ddd-8ddd-dddddddddddd'
     and entry_type = 'initial_balance'),
  '期初积分',
  'opening balance is labeled as opening balance, not history behavior'
);

select is(
  (select count(*)
   from public.learning_confirm_opening_balance(
     'dddddddd-1111-4ddd-8ddd-dddddddddddd',
     1234,
     'dddddddd-aaaa-4ddd-8ddd-dddddddddddd',
     '期初积分'
   )),
  1::bigint,
  'repeating the same request returns the original opening balance'
);

select is(
  (select count(*)
   from public.learning_point_ledger
   where profile_id = 'dddddddd-1111-4ddd-8ddd-dddddddddddd'
     and entry_type = 'initial_balance'),
  1::bigint,
  'repeating the same request does not duplicate the row'
);

select throws_ok(
  $$select * from public.learning_confirm_opening_balance(
    'dddddddd-1111-4ddd-8ddd-dddddddddddd',
    100,
    'dddddddd-bbbb-4ddd-8ddd-dddddddddddd',
    '再次确认'
  )$$,
  'P0001',
  'learning_opening_balance_already_confirmed',
  'a second confirmation for the same child is rejected'
);

select throws_ok(
  $$select * from public.learning_confirm_opening_balance(
    'dddddddd-1111-4ddd-8ddd-dddddddddddd',
    0,
    'dddddddd-cccc-4ddd-8ddd-dddddddddddd',
    '零分'
  )$$,
  '22023',
  'learning_opening_balance_invalid',
  'a zero opening balance is rejected'
);

select throws_ok(
  $$select * from public.learning_confirm_opening_balance(
    'dddddddd-1111-4ddd-8ddd-dddddddddddd',
    2000000,
    'dddddddd-cccc-4ddd-8ddd-dddddddddddd',
    '超限'
  )$$,
  '22023',
  'learning_opening_balance_invalid',
  'an overflowing opening balance is rejected'
);

select is(
  (select count(*)
   from public.learning_confirm_opening_balance(
     'dddddddd-2222-4ddd-8ddd-dddddddddddd',
     50,
     'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
     '期初积分'
   )),
  1::bigint,
  'another child in the same household can confirm its own opening balance'
);

select is(
  (select count(*)
   from public.learning_point_ledger
   where profile_id = 'dddddddd-1111-4ddd-8ddd-dddddddddddd'
     and entry_type = 'initial_balance'),
  1::bigint,
  'the first child is unaffected by the second child confirmation'
);

select throws_ok(
  $$insert into public.learning_point_ledger (
      household_id, profile_id, delta, entry_type, item_name_snapshot, request_id
    ) values (
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'dddddddd-1111-4ddd-8ddd-dddddddddddd',
      5,
      'initial_balance',
      '绕过 RPC',
      'dddddddd-eeee-4ddd-8ddd-dddddddddddd'
    )$$,
  '42501',
  null,
  'authenticated users cannot insert ledger rows directly'
);

set local request.jwt.claim.sub = '88888888-8888-4888-8888-888888888888';

select throws_ok(
  $$select * from public.learning_confirm_opening_balance(
    'dddddddd-1111-4ddd-8ddd-dddddddddddd',
    10,
    'dddddddd-ffff-4ddd-8ddd-dddddddddddd',
    '越权'
  )$$,
  '42501',
  'learning_point_forbidden',
  'a non-member user cannot confirm an opening balance'
);

select is(
  (select count(*) from public.learning_point_ledger
   where profile_id = 'dddddddd-1111-4ddd-8ddd-dddddddddddd'),
  0::bigint,
  'a non-member user cannot read the first household ledger'
);

select * from finish();
rollback;
