begin;
select plan(60);

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
     'public.learning_profile_states'::regclass,
     'public.learning_guardian_consents'::regclass
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
  has_table_privilege('authenticated', 'public.learning_guardian_consents', 'select'),
  'authenticated users can read consent rows through RLS'
);

select ok(
  has_column_privilege('authenticated', 'public.learning_guardian_consents', 'household_id', 'insert'),
  'authenticated users can insert the consent identity columns'
);

select ok(
  not has_column_privilege('authenticated', 'public.learning_guardian_consents', 'consented_at', 'insert'),
  'authenticated users cannot set the consent timestamp'
);

select ok(
  not has_table_privilege('anon', 'public.learning_guardian_consents', 'select'),
  'anonymous users cannot read guardian consents'
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
    'public.learning_delete_household(uuid)',
    'execute'
  ),
  'authenticated owners can call learning_delete_household'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.learning_delete_household(uuid)',
    'execute'
  ),
  'anonymous users cannot call learning_delete_household'
);

select ok(
  has_function_privilege('authenticated', 'public.learning_has_password()', 'execute'),
  'authenticated users can query their own password status'
);

select ok(
  has_function_privilege('anon', 'public.learning_has_password()', 'execute'),
  'anonymous callers reach the password status guard without exposing status'
);

select ok(
  (select prosecdef from pg_proc where oid = 'public.learning_has_password()'::regprocedure),
  'the public password status RPC is security definer with an auth guard'
);

select ok(
  not has_function_privilege('anon', 'private.learning_current_user_has_password()', 'execute'),
  'anonymous users cannot call the private password lookup'
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

insert into auth.users (id, email, encrypted_password, raw_user_meta_data)
values
  -- GoTrue auto-generates a bcrypt hash for OTP-created users;
  -- encrypted_password is non-empty even though no password was set.
  ('11111111-1111-4111-8111-111111111111', 'owner-a@example.test', '$2a$10$gotrue-auto-generated-hash', '{}'::jsonb),
  ('22222222-2222-4222-8222-222222222222', 'owner-b@example.test', '$2a$10$test-password-hash', '{"shared_password_set": true}'::jsonb);

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select is(
  public.learning_has_password(),
  false,
  'a passwordless OTP user (GoTrue auto-hash, no shared_password_set) sees false'
);

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select is(
  public.learning_has_password(),
  true,
  'a user with shared_password_set metadata sees true password status'
);

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

select throws_ok(
  $$insert into public.learning_profiles (household_id, display_name, grade_level)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '未同意学习者',
      3
    )$$,
  '42501',
  null,
  'owner cannot create a learner profile before guardian consent'
);

select lives_ok(
  $$insert into public.learning_guardian_consents (
      household_id,
      user_id,
      consent_type,
      policy_version
    ) values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '11111111-1111-4111-8111-111111111111',
      'learner_data_processing',
      'privacy-v2'
    )$$,
  'owner can create a privacy-v2 guardian consent record'
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

select lives_ok(
$legacy_household$
do $block$
begin
  insert into public.learning_households (id, name, owner_user_id)
  values (
    'bbbbbbbb-aaaa-4bbb-8bbb-bbbbbbbbbbbb',
    '历史同意家庭',
    '11111111-1111-4111-8111-111111111111'
  );

  insert into public.learning_household_members (household_id, user_id, role)
  values (
    'bbbbbbbb-aaaa-4bbb-8bbb-bbbbbbbbbbbb',
    '11111111-1111-4111-8111-111111111111',
    'owner'
  );
end;
$block$;
$legacy_household$,
  'owner can create a second household for legacy-consent compatibility'
);

set local role postgres;

insert into public.learning_guardian_consents (
  household_id,
  user_id,
  consent_type,
  policy_version
) values (
  'bbbbbbbb-aaaa-4bbb-8bbb-bbbbbbbbbbbb',
  '11111111-1111-4111-8111-111111111111',
  'learner_data_processing',
  'privacy-v1'
);

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select lives_ok(
  $$insert into public.learning_profiles (household_id, display_name, grade_level)
    values (
      'bbbbbbbb-aaaa-4bbb-8bbb-bbbbbbbbbbbb',
      '历史同意学习者',
      3
    )$$,
  'historical privacy-v1 consent remains valid for learner creation'
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

select is(
  (select count(*)
   from public.learning_save_state(
     'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa',
     '{"points": 12}'::jsonb,
     1
   )),
  0::bigint,
  'stale state version returns empty set (conflict)'
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

select is(
  (select count(*) from public.learning_guardian_consents),
  0::bigint,
  'another user cannot read the first guardian consent'
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

select throws_ok(
  $$insert into public.learning_guardian_consents (
      household_id,
      user_id,
      consent_type,
      policy_version
    ) values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '22222222-2222-4222-8222-222222222222',
      'learner_data_processing',
      'privacy-v1'
    )$$,
  '42501',
  null,
  'another user cannot create a guardian consent for the first household'
);

select throws_ok(
  $$select public.learning_delete_household('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,
  '42501',
  'learning_household_delete_forbidden',
  'another user cannot delete the first household'
);

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select lives_ok(
  $$select public.learning_delete_household('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,
  'the household owner can delete the complete family workspace'
);

select public.learning_delete_household('bbbbbbbb-aaaa-4bbb-8bbb-bbbbbbbbbbbb');

select is(
  (select count(*) from public.learning_households),
  0::bigint,
  'whole-family deletion removes the household'
);

select is(
  (select count(*) from public.learning_profiles),
  0::bigint,
  'whole-family deletion removes learner profiles'
);

select is(
  (select count(*) from public.learning_profile_states),
  0::bigint,
  'whole-family deletion removes learning state'
);

select is(
  (select count(*) from public.learning_guardian_consents),
  0::bigint,
  'whole-family deletion removes guardian consent records'
);

set local role anon;
set local request.jwt.claim.sub = '';

select throws_ok(
  $$select * from public.learning_households$$,
  '42501',
  null,
  'anonymous access is denied at the privilege layer'
);

select throws_ok(
  $$select * from public.learning_guardian_consents$$,
  '42501',
  null,
  'anonymous guardian consent access is denied at the privilege layer'
);

select throws_ok(
  $$select public.learning_has_password()$$,
  '42501',
  null,
  'anonymous password status access is denied without exposing password state'
);

-- Rate limiting
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select lives_ok(
  $sql$select private.learning_enforce_rate_limit('test_rpc', 3, 60)$sql$,
  'rate limit allows calls within threshold'
);

select lives_ok(
  $sql$select private.learning_enforce_rate_limit('test_rpc', 3, 60)$sql$,
  'second call within limit is allowed'
);

select lives_ok(
  $sql$select private.learning_enforce_rate_limit('test_rpc', 3, 60)$sql$,
  'third call at limit boundary is allowed'
);

select throws_ok(
  $sql$select private.learning_enforce_rate_limit('test_rpc', 3, 60)$sql$,
  'P0001',
  'learning_rate_limited',
  'fourth call exceeds limit and raises learning_rate_limited'
);

select lives_ok(
  $sql$select private.learning_enforce_rate_limit('other_rpc', 3, 60)$sql$,
  'different rpc key has independent limit'
);

-- Rate limiter position: conflicts should NOT consume rate-limit budget.
-- This verifies the fix for the issue where conflict exceptions rolled back
-- the rate-limit counter because they were in the same transaction.
-- Uses postgres role for private table cleanup/verification, authenticated for
-- function calls. Fresh state row is created to have a known starting version.

-- The earlier deletion test (learning_delete_household) cascade-deleted the
-- household, profile, and state. Recreate them as postgres (bypassing RLS).
set local role postgres;
insert into public.learning_households (id, project_id, name, owner_user_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'shadow-mate', 'Rate Limit Test', '11111111-1111-4111-8111-111111111111')
on conflict (id) do nothing;
insert into public.learning_household_members (household_id, user_id, role)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner')
on conflict do nothing;
insert into public.learning_profiles (id, household_id, display_name, grade_level)
values ('aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Rate Limit Learner', 3)
on conflict (id) do nothing;
delete from private.learning_rpc_rate_limits
 where user_id = '11111111-1111-4111-8111-111111111111'
   and rpc_key in ('save_state', 'save_state_attempts');

-- As authenticated: create fresh state (version defaults to 1)
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select lives_ok(
  $$select * from public.learning_save_state(
    'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa',
    '{"fresh_state": 1}'::jsonb,
    null
  )$$,
  'fresh state created with null expected_version'
);

-- As postgres: reset rate limit counter to isolate conflict test
set local role postgres;
delete from private.learning_rpc_rate_limits
 where user_id = '11111111-1111-4111-8111-111111111111'
   and rpc_key in ('save_state', 'save_state_attempts');

-- As authenticated: conflict call (expected_version=999, actual=1) returns empty set
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select is(
  (select count(*) from public.learning_save_state(
    'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa',
    '{"conflict_test": 1}'::jsonb,
    999
  )),
  0::bigint,
  'stale version conflict returns empty set (no raise)'
);

-- As postgres: conflict must NOT consume write budget, but MUST consume attempt budget
set local role postgres;
select is(
  (select call_count from private.learning_rpc_rate_limits
    where user_id = '11111111-1111-4111-8111-111111111111' and rpc_key = 'save_state'),
  null,
  'conflict does not consume write budget (no save_state row)'
);
select isnt(
  (select call_count from private.learning_rpc_rate_limits
    where user_id = '11111111-1111-4111-8111-111111111111' and rpc_key = 'save_state_attempts'),
  null,
  'conflict consumes attempt budget (save_state_attempts row created)'
);

-- As authenticated: successful update (expected_version=1, actual=1)
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select lives_ok(
  $$select * from public.learning_save_state(
    'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa',
    '{"rate_limit_test": 1}'::jsonb,
    1
  )$$,
  'save with correct expected_version succeeds (updates state)'
);

-- As postgres: verify successful write DID create a rate-limit row
set local role postgres;
select is(
  (select call_count from private.learning_rpc_rate_limits
    where user_id = '11111111-1111-4111-8111-111111111111' and rpc_key = 'save_state'),
  1,
  'successful write consumes rate-limit budget'
);

-- Clean up rate-limit row (state row cleanup is handled by rollback)
delete from private.learning_rpc_rate_limits
 where user_id = '11111111-1111-4111-8111-111111111111'
   and rpc_key in ('save_state', 'save_state_attempts');

select * from finish();
rollback;
