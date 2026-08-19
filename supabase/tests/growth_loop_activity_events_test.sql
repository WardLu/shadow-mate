begin;
select plan(27);

select is(
  to_regclass('private.learning_activity_events')::text,
  'private.learning_activity_events',
  'private activity event table exists'
);

select is(
  (select count(*)
   from information_schema.columns
   where table_schema = 'private'
     and table_name = 'learning_activity_events'
     and column_name in (
       'event_id', 'product_id', 'event_type', 'household_id', 'profile_id',
       'occurred_at', 'timezone', 'client_version', 'payload', 'payload_hash',
       'actor_user_id', 'received_at'
     )),
  12::bigint,
  'activity events store only the bounded diagnostic contract'
);

select ok(
  (select relrowsecurity from pg_class where oid = to_regclass('private.learning_activity_events')),
  'activity event table has RLS enabled'
);

select ok(
  coalesce((select not has_table_privilege('authenticated', 'private.learning_activity_events', 'select,insert,update,delete')), false),
  'authenticated users cannot read or write the private event table directly'
);

select ok(
  exists (
    select 1
    from pg_proc function
    join pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.proname = 'learning_record_activity_event'
      and function.pronargs = 1
  ),
  'activity event RPC exists'
);

select ok(
  has_function_privilege('authenticated', 'public.learning_record_activity_event(jsonb)', 'execute'),
  'authenticated users can call the activity event RPC'
);

select ok(
  not has_function_privilege('anon', 'public.learning_record_activity_event(jsonb)', 'execute'),
  'anonymous users cannot call the activity event RPC'
);

set local role postgres;

insert into auth.users (id, email, encrypted_password, raw_user_meta_data)
values
  ('77777777-7777-4777-8777-777777777777', 'activity-owner@example.test', '$2a$10$test-password-hash', '{}'::jsonb),
  ('88888888-8888-4888-8888-888888888888', 'activity-other@example.test', '$2a$10$test-password-hash', '{}'::jsonb);

insert into public.learning_households (id, name, owner_user_id)
values (
  '77777777-aaaa-4777-8777-777777777777',
  '统计测试家庭',
  '77777777-7777-4777-8777-777777777777'
);

insert into public.learning_household_members (household_id, user_id, role)
values (
  '77777777-aaaa-4777-8777-777777777777',
  '77777777-7777-4777-8777-777777777777',
  'owner'
);

insert into public.learning_profiles (id, household_id, display_name, grade_level)
values (
  '77777777-bbbb-4777-8777-777777777777',
  '77777777-aaaa-4777-8777-777777777777',
  '统计孩子',
  4
);

set local role authenticated;
set local request.jwt.claim.sub = '77777777-7777-4777-8777-777777777777';

select lives_ok(
  $$select * from public.learning_record_activity_event(jsonb_build_object(
    'event_id', '77777777-cccc-4777-8777-777777777777',
    'product_id', 'shadow-mate',
    'event_type', 'core_activation',
    'household_id', '77777777-aaaa-4777-8777-777777777777',
    'profile_id', '77777777-bbbb-4777-8777-777777777777',
    'scope_key', '77777777-aaaa-4777-8777-777777777777:77777777-bbbb-4777-8777-777777777777',
    'occurred_at', '2026-08-14T10:00:00Z',
    'timezone', 'Asia/Singapore',
    'client_version', '1.3.7',
    'payload', jsonb_build_object('source', 'point_item')
  ))$$,
  'guardian can record an allowlisted activity event'
);

set local role postgres;

select is(
  (select count(*) from private.learning_activity_events
   where event_id = '77777777-cccc-4777-8777-777777777777'),
  1::bigint,
  'valid activity event is stored once in the private table'
);

set local role authenticated;
set local request.jwt.claim.sub = '77777777-7777-4777-8777-777777777777';

select is(
  (select status from public.learning_record_activity_event(jsonb_build_object(
    'event_id', '77777777-cccc-4777-8777-777777777777',
    'product_id', 'shadow-mate',
    'event_type', 'core_activation',
    'household_id', '77777777-aaaa-4777-8777-777777777777',
    'profile_id', '77777777-bbbb-4777-8777-777777777777',
    'scope_key', '77777777-aaaa-4777-8777-777777777777:77777777-bbbb-4777-8777-777777777777',
    'occurred_at', '2026-08-14T10:00:00Z',
    'timezone', 'Asia/Singapore',
    'client_version', '1.3.7',
    'payload', jsonb_build_object('source', 'point_item')
  ))),
  'duplicate',
  'same activity event is idempotent'
);

select throws_ok(
  $$select * from public.learning_record_activity_event(jsonb_build_object(
    'event_id', '77777777-cccc-4777-8777-777777777777',
    'product_id', 'shadow-mate',
    'event_type', 'reward_redeemed',
    'household_id', '77777777-aaaa-4777-8777-777777777777',
    'profile_id', '77777777-bbbb-4777-8777-777777777777',
    'scope_key', '77777777-aaaa-4777-8777-777777777777:77777777-bbbb-4777-8777-777777777777',
    'occurred_at', '2026-08-14T10:00:00Z',
    'payload', jsonb_build_object('source', 'reward')
  ))$$,
  'P0001',
  'activity_event_idempotency_conflict',
  'same event id with a different payload is rejected'
);

select throws_ok(
  $$select * from public.learning_record_activity_event(jsonb_build_object(
    'event_id', '77777777-dddd-4777-8777-777777777777',
    'product_id', 'shadow-mate',
    'event_type', 'page_view',
    'household_id', '77777777-aaaa-4777-8777-777777777777',
    'profile_id', '77777777-bbbb-4777-8777-777777777777',
    'occurred_at', '2026-08-14T10:00:00Z',
    'payload', jsonb_build_object('source', 'point_item')
  ))$$,
  '22023',
  'activity_event_invalid',
  'non-allowlisted event types are rejected'
);

select throws_ok(
  $$select * from public.learning_record_activity_event(jsonb_build_object(
    'event_id', '77777777-eeee-4777-8777-777777777777',
    'product_id', 'shadow-mate',
    'event_type', 'sync_failed',
    'household_id', '77777777-aaaa-4777-8777-777777777777',
    'profile_id', '77777777-bbbb-4777-8777-777777777777',
    'occurred_at', '2026-08-14T10:00:00Z',
    'payload', jsonb_build_object('child_name', '不应上传')
  ))$$,
  '22023',
  'activity_event_payload_invalid',
  'payload keys outside the diagnostic allowlist are rejected'
);

select throws_ok(
  $$select * from public.learning_record_activity_event(jsonb_build_object(
    'event_id', '77777777-ffff-4777-8777-777777777777',
    'product_id', 'shadow-mate',
    'event_type', 'sync_failed',
    'household_id', '77777777-aaaa-4777-8777-777777777777',
    'profile_id', '77777777-bbbb-4777-8777-777777777777',
    'occurred_at', '2026-08-14T10:00:00Z',
    'payload', jsonb_build_object('error_code', repeat('x', 5000))
  ))$$,
  '22023',
  'activity_event_invalid',
  'oversized diagnostic payloads are rejected'
);

select throws_ok(
  $$select * from public.learning_record_activity_event(jsonb_build_object(
    'event_id', '77777777-0001-4777-8777-777777777777',
    'product_id', 'shadow-mate',
    'event_type', 'core_activation',
    'household_id', '77777777-aaaa-4777-8777-777777777777',
    'profile_id', '77777777-bbbb-4777-8777-777777777777',
    'occurred_at', '2026-08-14T10:00:00Z',
    'timezone', repeat('A', 65),
    'payload', jsonb_build_object('source', 'point_item')
  ))$$,
  '22023',
  'activity_event_invalid',
  'server rejects an overlong timezone instead of truncating it'
);

select throws_ok(
  $$select * from public.learning_record_activity_event(jsonb_build_object(
    'event_id', '77777777-0002-4777-8777-777777777777',
    'product_id', 'shadow-mate',
    'event_type', 'core_activation',
    'household_id', '77777777-aaaa-4777-8777-777777777777',
    'profile_id', '77777777-bbbb-4777-8777-777777777777',
    'occurred_at', '2026-08-14T10:00:00Z',
    'timezone', 'Mars/Olympus',
    'payload', jsonb_build_object('source', 'point_item')
  ))$$,
  '22023',
  'activity_event_invalid',
  'server accepts only an IANA timezone known to PostgreSQL'
);

select throws_ok(
  $$select * from public.learning_record_activity_event(jsonb_build_object(
    'event_id', '77777777-0003-4777-8777-777777777777',
    'product_id', 'shadow-mate',
    'event_type', 'core_activation',
    'household_id', '77777777-aaaa-4777-8777-777777777777',
    'profile_id', '77777777-bbbb-4777-8777-777777777777',
    'occurred_at', '2026-08-14T10:00:00Z',
    'client_version', repeat('1', 33),
    'payload', jsonb_build_object('source', 'point_item')
  ))$$,
  '22023',
  'activity_event_invalid',
  'server rejects an overlong client version instead of truncating it'
);

select throws_ok(
  $$select * from public.learning_record_activity_event(jsonb_build_object(
    'event_id', '77777777-0009-4777-8777-777777777777',
    'product_id', 'shadow-mate',
    'event_type', 'core_activation',
    'household_id', '77777777-aaaa-4777-8777-777777777777',
    'profile_id', '77777777-bbbb-4777-8777-777777777777',
    'occurred_at', repeat('2', 36),
    'payload', jsonb_build_object('source', 'point_item')
  ))$$,
  '22023',
  'activity_event_invalid',
  'server rejects an overlong occurred_at before parsing it'
);

select throws_ok(
  $$select * from public.learning_record_activity_event(jsonb_build_object(
    'event_id', '77777777-0010-4777-8777-777777777777',
    'product_id', 'shadow-mate',
    'event_type', 'core_activation',
    'household_id', '77777777-aaaa-4777-8777-777777777777',
    'profile_id', '77777777-bbbb-4777-8777-777777777777',
    'occurred_at', 'tomorrow',
    'payload', jsonb_build_object('source', 'point_item')
  ))$$,
  '22023',
  'activity_event_invalid',
  'server accepts only an explicit ISO-8601 occurred_at value'
);

select throws_ok(
  $$select * from public.learning_record_activity_event(jsonb_build_object(
    'event_id', '77777777-0004-4777-8777-777777777777',
    'product_id', 'shadow-mate',
    'event_type', 'sync_failed',
    'household_id', '77777777-aaaa-4777-8777-777777777777',
    'profile_id', '77777777-bbbb-4777-8777-777777777777',
    'occurred_at', '2026-08-14T10:00:00Z',
    'payload', jsonb_build_object('source', 'growth_loop_sync', 'error_code', 'retryable', 'retryable', 'yes')
  ))$$,
  '22023',
  'activity_event_payload_invalid',
  'server rejects the wrong JSON type for a payload field'
);

select throws_ok(
  $$select * from public.learning_record_activity_event(jsonb_build_object(
    'event_id', '77777777-0005-4777-8777-777777777777',
    'product_id', 'shadow-mate',
    'event_type', 'sync_failed',
    'household_id', '77777777-aaaa-4777-8777-777777777777',
    'profile_id', '77777777-bbbb-4777-8777-777777777777',
    'occurred_at', '2026-08-14T10:00:00Z',
    'payload', jsonb_build_object(
      'source', 'growth_loop_sync',
      'error_code', 'TypeError: parent@example.com at https://example.test/private stack line 1',
      'retryable', true
    )
  ))$$,
  '22023',
  'activity_event_payload_invalid',
  'free text, email, URL, and stack-like content cannot hide in error_code'
);

select throws_ok(
  $$select * from public.learning_record_activity_event(jsonb_build_object(
    'event_id', '77777777-0006-4777-8777-777777777777',
    'product_id', 'shadow-mate',
    'event_type', 'core_activation',
    'household_id', '77777777-aaaa-4777-8777-777777777777',
    'profile_id', '77777777-bbbb-4777-8777-777777777777',
    'occurred_at', '2026-08-14T10:00:00Z',
    'page_url', 'https://example.test/private',
    'payload', jsonb_build_object('source', 'point_item')
  ))$$,
  '22023',
  'activity_event_invalid',
  'top-level fields outside the event protocol are rejected'
);

select throws_ok(
  $$select * from public.learning_record_activity_event(jsonb_build_object(
    'event_id', '77777777-0007-4777-8777-777777777777',
    'product_id', 'shadow-mate',
    'event_type', 'retention_qualified',
    'household_id', '77777777-aaaa-4777-8777-777777777777',
    'profile_id', '77777777-bbbb-4777-8777-777777777777',
    'occurred_at', '2026-08-14T10:00:00Z',
    'payload', jsonb_build_object('days', 7, 'count', 1000000)
  ))$$,
  '22023',
  'activity_event_payload_invalid',
  'bounded numeric payload fields reject values outside the protocol range'
);

set local role postgres;

select throws_ok(
  $$insert into private.learning_activity_events
      (event_id, product_id, event_type, household_id, profile_id, occurred_at, payload, payload_hash)
    values (
      '77777777-0008-4777-8777-777777777777', 'shadow-mate', 'sync_failed',
      '77777777-aaaa-4777-8777-777777777777', '77777777-bbbb-4777-8777-777777777777',
      now(), '{"source":"growth_loop_sync","error_code":"raw stack text","retryable":true}'::jsonb,
      'direct-invalid-payload'
    )$$,
  '23514',
  null,
  'database constraint rejects an invalid payload even when the RPC is bypassed'
);

set local request.jwt.claim.sub = '88888888-8888-4888-8888-888888888888';
set local role authenticated;

select throws_ok(
  $$select * from public.learning_record_activity_event(jsonb_build_object(
    'event_id', '88888888-cccc-4888-8888-888888888888',
    'product_id', 'shadow-mate',
    'event_type', 'core_activation',
    'household_id', '77777777-aaaa-4777-8777-777777777777',
    'profile_id', '77777777-bbbb-4777-8777-777777777777',
    'occurred_at', '2026-08-14T10:00:00Z',
    'payload', jsonb_build_object('source', 'point_item')
  ))$$,
  '42501',
  'learning_point_forbidden',
  'a user outside the household cannot record its events'
);

set local role postgres;

select is(
  (select count(*) from private.learning_activity_events),
  1::bigint,
  'rejected and duplicate requests do not create extra activity rows'
);

delete from public.learning_households
where id = '77777777-aaaa-4777-8777-777777777777';

select is(
  (select count(*) from private.learning_activity_events),
  0::bigint,
  'activity events cascade away when their household is deleted'
);

select * from finish();
rollback;
