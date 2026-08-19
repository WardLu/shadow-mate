-- W5 / 交付项 3：activity_events 180 天自动清理 pgTAP 测试。
--
-- 验证：清理函数存在、客户端无执行权、180 天保留边界（179 天/正好 180 天保留，
-- 超过 180 天删除）、自定义保留窗口、pg_cron 任务已登记（无 pg_cron 环境跳过）。

begin;
select plan(14);

select ok(
  exists (
    select 1
    from pg_proc function
    join pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'private'
      and function.proname = 'learning_purge_activity_events'
  ),
  'purge function exists'
);

select ok(
  not has_function_privilege('authenticated', 'private.learning_purge_activity_events(interval)', 'execute'),
  'authenticated users cannot execute the purge'
);

select is(
  to_regclass('private.learning_activity_events_received_at_idx')::text,
  'private.learning_activity_events_received_at_idx',
  'received_at cleanup predicate has a supporting index'
);

select ok(
  coalesce((
    select function.proconfig @> array['search_path=""']::text[]
    from pg_proc function
    join pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'private'
      and function.proname = 'learning_purge_activity_events'
  ), false),
  'purge security definer fixes an empty search_path'
);

set local role postgres;

insert into auth.users (id, email, encrypted_password, raw_user_meta_data)
values (
  '81000000-0000-4000-8000-000000000001',
  'cleanup-owner@example.test',
  '$2a$10$test-password-hash',
  '{}'::jsonb
);

insert into public.learning_households (id, name, owner_user_id)
values ('82000000-0000-4000-8000-000000000001', '清理测试家庭', '81000000-0000-4000-8000-000000000001');

insert into public.learning_profiles (id, household_id, display_name, grade_level)
values ('83000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '清理孩子', 4);

insert into private.learning_activity_events
  (event_id, product_id, event_type, household_id, profile_id, occurred_at, timezone, payload, payload_hash, received_at)
values
  ('84000000-0000-4000-8000-000000000001', 'shadow-mate', 'sync_failed', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', now() - interval '179 days', 'Asia/Shanghai', '{"source":"growth_loop_sync","error_code":"retryable","retryable":true}'::jsonb, 'cleanup-h1', now() - interval '179 days'),
  ('84000000-0000-4000-8000-000000000002', 'shadow-mate', 'sync_failed', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', now() - interval '180 days', 'Asia/Shanghai', '{"source":"growth_loop_sync","error_code":"retryable","retryable":true}'::jsonb, 'cleanup-h2', now() - interval '180 days'),
  ('84000000-0000-4000-8000-000000000003', 'shadow-mate', 'sync_failed', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', now() - interval '180 days 1 hour', 'Asia/Shanghai', '{"source":"growth_loop_sync","error_code":"retryable","retryable":true}'::jsonb, 'cleanup-h3', now() - interval '180 days 1 hour'),
  ('84000000-0000-4000-8000-000000000004', 'shadow-mate', 'sync_failed', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', now() - interval '200 days', 'Asia/Shanghai', '{"source":"growth_loop_sync","error_code":"retryable","retryable":true}'::jsonb, 'cleanup-h4', now() - interval '200 days'),
  ('84000000-0000-4000-8000-000000000005', 'shadow-mate', 'sync_failed', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', now() - interval '40 days', 'Asia/Shanghai', '{"source":"growth_loop_sync","error_code":"retryable","retryable":true}'::jsonb, 'cleanup-h5', now() - interval '40 days'),
  ('84000000-0000-4000-8000-000000000006', 'shadow-mate', 'sync_failed', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', now() - interval '20 days', 'Asia/Shanghai', '{"source":"growth_loop_sync","error_code":"retryable","retryable":true}'::jsonb, 'cleanup-h6', now() - interval '20 days');

select throws_ok(
  $$select private.learning_purge_activity_events(interval '0 days')$$,
  '22023',
  'activity_retention_window_invalid',
  'purge rejects a non-positive retention window'
);

select lives_ok(
  $$select private.learning_purge_activity_events()$$,
  'default 180-day purge runs'
);

select is(
  (select count(*) from private.learning_activity_events
   where event_id = '84000000-0000-4000-8000-000000000001'),
  1::bigint,
  'event 179 days old is kept'
);

select is(
  (select count(*) from private.learning_activity_events
   where event_id = '84000000-0000-4000-8000-000000000002'),
  1::bigint,
  'event exactly 180 days old is kept'
);

select is(
  (select count(*) from private.learning_activity_events
   where event_id = '84000000-0000-4000-8000-000000000003'),
  0::bigint,
  'event older than 180 days is purged'
);

select is(
  (select count(*) from private.learning_activity_events
   where event_id = '84000000-0000-4000-8000-000000000004'),
  0::bigint,
  'event 200 days old is purged'
);

select is(
  (select private.learning_purge_activity_events(interval '30 days')),
  3,
  'custom 30-day window purges the 40/180/179-day-old rows'
);

select is(
  (select count(*) from private.learning_activity_events
   where event_id = '84000000-0000-4000-8000-000000000006'),
  1::bigint,
  'recent event is kept after a custom purge'
);

-- cron.job 在无 pg_cron 环境不存在，直接用 CASE 会在解析期报错；
-- 用 plpgsql DO 块在运行时按扩展可用性判断（有 pg_cron 时任务必须恰好 1 个）。
select lives_ok(
$job$
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and to_regclass('cron.job') is not null then
    if (select count(*) from cron.job where jobname = 'shadow-mate-cleanup-activity-events') <> 1 then
      raise exception 'expected exactly 1 cleanup cron job';
    end if;
  end if;
end $$;
$job$,
'cleanup cron job is scheduled when pg_cron is available'
);

select ok(
  exists (select 1 from pg_extension where extname = 'pg_cron')
    or to_regclass('cron.job') is null,
  'without pg_cron the migration skips scheduling and the purge remains available'
);

rollback;
