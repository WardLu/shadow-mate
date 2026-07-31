begin;
select plan(23);

-- Final product identity and migration state.
select is(
  (select count(*) from public.projects where project_id = 'shadow-mate'),
  1::bigint,
  'shadow-mate is registered exactly once'
);

select ok(
  has_column_privilege('anon', 'public.projects', 'project_id', 'select'),
  'anonymous users can discover public product ids'
);

select ok(
  not has_column_privilege('anon', 'public.projects', 'features_config', 'select'),
  'anonymous users cannot read product feature configuration'
);

select ok(
  (select column_default like '%shadow-mate%'
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'learning_households'
     and column_name = 'project_id'),
  'household product default uses shadow-mate'
);

select is(
  (select count(*)
   from pg_constraint
   where conrelid = 'public.learning_households'::regclass
     and conname = 'learning_households_product_check'
     and pg_get_constraintdef(oid) like '%shadow-mate%'),
  1::bigint,
  'household product constraint uses shadow-mate'
);

select ok(
  (select bool_and(relrowsecurity)
   from pg_class
   where oid in (
     'public.learning_households'::regclass,
     'public.learning_household_members'::regclass,
     'public.learning_profiles'::regclass,
     'public.learning_profile_states'::regclass
   )),
  'RLS is enabled on every learning table'
);

select ok(
  not has_table_privilege('anon', 'public.learning_households', 'select'),
  'anonymous users cannot read households'
);

select ok(
  has_table_privilege('authenticated', 'public.learning_profile_states', 'select,insert,update,delete'),
  'authenticated users have state table privileges governed by RLS'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.learning_save_state(uuid,jsonb,bigint)',
    'execute'
  ),
  'authenticated users can call learning_save_state'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.learning_save_state(uuid,jsonb,bigint)',
    'execute'
  ),
  'anonymous users cannot call learning_save_state'
);

select ok(
  has_function_privilege(
    'authenticated',
    'private.learning_is_household_owner(uuid)',
    'execute'
  ),
  'authenticated users can call the private owner check'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.learning_is_household_owner(uuid)',
    'execute'
  ),
  'anonymous users cannot call the private owner check'
);

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'owner-a@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'owner-b@example.test');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select lives_ok(
  $$insert into public.learning_households (id, name, owner_user_id)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '家庭 A',
      '11111111-1111-4111-8111-111111111111'
    )$$,
  'owner can create their own household'
);

select lives_ok(
  $$insert into public.learning_household_members (household_id, user_id, role)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '11111111-1111-4111-8111-111111111111',
      'owner'
    )$$,
  'owner can create their own membership'
);

select lives_ok(
  $$insert into public.learning_profiles (id, household_id, display_name, grade_level)
    values (
      'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '学习者 A',
      3
    )$$,
  'owner can create a learning profile'
);

select lives_ok(
  $$insert into public.learning_profile_states (profile_id, state)
    values (
      'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa',
      '{"points": 10}'::jsonb
    )$$,
  'owner can create profile state'
);

select is(
  (select version
   from public.learning_save_state(
     'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa',
     '{"points": 11}'::jsonb,
     1
   )),
  2::bigint,
  'state save increments the optimistic version'
);

select throws_ok(
  $$select *
    from public.learning_save_state(
      'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa',
      '{"points": 12}'::jsonb,
      1
    )$$,
  '40001',
  'learning_state_conflict',
  'stale state version is rejected'
);

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select is(
  (select count(*) from public.learning_households),
  0::bigint,
  'another user cannot read the first household'
);

select is(
  (select count(*) from public.learning_profiles),
  0::bigint,
  'another user cannot read the first profile'
);

select is(
  (select count(*) from public.learning_profile_states),
  0::bigint,
  'another user cannot read the first profile state'
);

select throws_ok(
  $$insert into public.learning_profiles (household_id, display_name, grade_level)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '越权学习者',
      4
    )$$,
  '42501',
  null,
  'another user cannot insert a profile into the first household'
);

set local role anon;
set local request.jwt.claim.sub = '';

select throws_ok(
  $$select * from public.learning_households$$,
  '42501',
  null,
  'anonymous access is denied at the privilege layer'
);

select * from finish();
rollback;
