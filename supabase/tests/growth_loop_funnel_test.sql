-- W5 / 交付项 2：F0~F6 聚合视图/函数 + WMGH pgTAP 测试。
--
-- 场景（共享 user，6 个内测批次家庭，均含档案+同意 => F0=6）：
--   H1 完整漏斗：积分项 + 4 个有效成长日（-6/-2/-1/0）+ 奖励 + 已兑现兑换 + 兑现后行为 => F0~F6 全真
--   H2 只有积分项：无成长行为 => F1 真，F2~F6 假
--   H3 只有打卡 + 补记/修正/期初被排除：1 个有效成长日（来自 checkin），F2 真，F1/F3/F4/F6 假
--   H4 进入内测 72h 内完成 F2：F2 真且 f2_within_72h 真
--   H6 2 周前自然周内 3 个有效成长日 => F6 真，WMGH 计 1
--   H7 3 周前自然周内仅 2 个有效成长日 => F6 假，WMGH 不计

begin;
select plan(53);

-- 视图与函数存在性、客户端无访问权
select is(
  to_regclass('private.learning_growth_days')::text,
  'private.learning_growth_days',
  'private growth days view exists'
);

select ok(
  coalesce((select not has_table_privilege('authenticated', 'private.learning_growth_days', 'select,insert,update,delete')), false),
  'authenticated users cannot access the growth days view'
);

select ok(
  exists (
    select 1
    from pg_proc function
    join pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'private'
      and function.proname = 'learning_funnel_status'
      and function.pronargs = 0
  ),
  'funnel status function exists'
);

select ok(
  exists (
    select 1
    from pg_proc function
    join pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'private'
      and function.proname = 'learning_funnel_report'
  ),
  'funnel report function exists'
);

select ok(
  exists (
    select 1
    from pg_proc function
    join pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'private'
      and function.proname = 'learning_wmgh_weekly'
  ),
  'wmgh weekly function exists'
);

select ok(
  not has_function_privilege('authenticated', 'private.learning_funnel_status()', 'execute'),
  'authenticated users cannot execute the funnel status function'
);

select ok(
  not has_function_privilege('authenticated', 'private.learning_wmgh_weekly(timestamptz)', 'execute'),
  'authenticated users cannot execute the wmgh weekly function'
);

select ok(
  not has_function_privilege('authenticated', 'private.learning_funnel_report(timestamptz)', 'execute'),
  'authenticated users cannot execute the funnel report function'
);

select is(
  (select count(*)
   from pg_proc function
   join pg_namespace namespace on namespace.oid = function.pronamespace
   where namespace.nspname = 'private'
     and function.proname in (
       'learning_funnel_status',
       'learning_funnel_report',
       'learning_wmgh_weekly'
     )
     and function.prosecdef
     and function.proconfig @> array['search_path=""']::text[]),
  3::bigint,
  'all funnel security definer functions fix an empty search_path'
);

set local role postgres;

create temp table wmgh_weeks as
select
  (current_date - 14) - ((extract(dow from (current_date - 14))::int + 6) % 7) as ws,
  (current_date - 21) - ((extract(dow from (current_date - 21))::int + 6) % 7) as ws3,
  ((now() - interval '5 days') at time zone 'Asia/Shanghai')::date as checkin_day;

insert into auth.users (id, email, encrypted_password, raw_user_meta_data)
values (
  '10000000-0000-4000-8000-000000000001',
  'funnel-owner@example.test',
  '$2a$10$test-password-hash',
  '{}'::jsonb
);

insert into public.learning_households (id, name, owner_user_id) values
  ('20000000-0000-4000-8000-000000000001', 'H1', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', 'H2', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000003', 'H3', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000004', 'H4', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000006', 'H6', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000007', 'H7', '10000000-0000-4000-8000-000000000001');

insert into public.learning_profiles (id, household_id, display_name, grade_level) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'P1', 4),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'P2', 4),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'P3', 4),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', 'P4', 4),
  ('30000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000006', 'P6', 4),
  ('30000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000007', 'P7', 4);

insert into public.learning_guardian_consents (household_id, user_id, consent_type, policy_version)
select id, '10000000-0000-4000-8000-000000000001', 'learner_data_processing', 'privacy-v1'
from public.learning_households;

insert into private.learning_beta_batches (household_id, batch, invited_at, joined_at) values
  ('20000000-0000-4000-8000-000000000001', 'b1', now() - interval '30 days', now() - interval '29 days'),
  ('20000000-0000-4000-8000-000000000002', 'b1', now() - interval '30 days', now() - interval '29 days'),
  ('20000000-0000-4000-8000-000000000003', 'b1', now() - interval '30 days', now() - interval '29 days'),
  ('20000000-0000-4000-8000-000000000004', 'b1', now() - interval '11 days', now() - interval '10 days'),
  ('20000000-0000-4000-8000-000000000006', 'b1', now() - interval '41 days', now() - interval '40 days'),
  ('20000000-0000-4000-8000-000000000007', 'b1', now() - interval '41 days', now() - interval '40 days');

-- 积分项目：H1 / H2 / H6
insert into public.learning_point_items (id, household_id, name, default_points, is_active) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '阅读', 5, true),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '阅读', 5, true),
  ('40000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000006', '阅读', 5, true);

-- H1 有效成长日：-6（同日两条，去重）、-2、-1、今天 => 4 个有效成长日
insert into public.learning_point_ledger
  (household_id, profile_id, point_item_id, delta, entry_type, item_name_snapshot, request_id, occurred_on, created_at)
values
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 5, 'manual', '阅读', gen_random_uuid(), current_date - 6, ((current_date - 6) + time '10:00') at time zone 'Asia/Shanghai'),
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', -3, 'manual', '运动', gen_random_uuid(), current_date - 6, ((current_date - 6) + time '11:00') at time zone 'Asia/Shanghai'),
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 5, 'manual', '阅读', gen_random_uuid(), current_date - 2, ((current_date - 2) + time '10:00') at time zone 'Asia/Shanghai'),
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 5, 'manual', '阅读', gen_random_uuid(), current_date - 1, ((current_date - 1) + time '10:00') at time zone 'Asia/Shanghai'),
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 5, 'manual', '阅读', gen_random_uuid(), current_date, (current_date + time '10:00') at time zone 'Asia/Shanghai');

-- H3 被排除的记录：补记（今天记录 20 天前的行为，created_at=now）、修正、期初积分；另有 1 条打卡事件
insert into public.learning_point_ledger
  (household_id, profile_id, point_item_id, delta, entry_type, item_name_snapshot, request_id, occurred_on, created_at)
values
  ('20000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', null, 5, 'manual', '阅读', gen_random_uuid(), current_date - 20, now()),
  ('20000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', null, -5, 'adjustment', '修正', gen_random_uuid(), current_date - 4, now() - interval '4 days'),
  ('20000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', null, 10, 'initial_balance', '期初', gen_random_uuid(), current_date - 3, now() - interval '3 days');

insert into private.learning_activity_events
  (event_id, product_id, event_type, household_id, profile_id, occurred_at, timezone, payload, payload_hash, received_at)
values (
  '70000000-0000-4000-8000-000000000001',
  'shadow-mate',
  'growth_activity_recorded',
  '20000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000003',
  now() - interval '5 days',
  'Asia/Shanghai',
  '{"source":"checkin","entry_type":"manual"}'::jsonb,
  'funnel-test-hash',
  now() - interval '5 days'
);

-- H4 进入内测 72h 内完成 F2
insert into public.learning_point_ledger
  (household_id, profile_id, point_item_id, delta, entry_type, item_name_snapshot, request_id, occurred_on, created_at)
values (
  '20000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000004', null, 5, 'manual', '阅读',
  gen_random_uuid(), current_date - 9, ((current_date - 9) + time '10:00') at time zone 'Asia/Shanghai'
);

-- H6 2 周前自然周内 3 个有效成长日
insert into public.learning_point_ledger
  (household_id, profile_id, point_item_id, delta, entry_type, item_name_snapshot, request_id, occurred_on, created_at)
select
  '20000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000006',
  5, 'manual', '阅读', gen_random_uuid(), day, (day + time '10:00') at time zone 'Asia/Shanghai'
from (select (select ws from wmgh_weeks) as day
      union all
      select (select ws from wmgh_weeks) + 1
      union all
      select (select ws from wmgh_weeks) + 2) days;

-- H7 3 周前自然周内仅 2 个有效成长日
insert into public.learning_point_ledger
  (household_id, profile_id, point_item_id, delta, entry_type, item_name_snapshot, request_id, occurred_on, created_at)
select
  '20000000-0000-4000-8000-000000000007', '30000000-0000-4000-8000-000000000007', null,
  5, 'manual', '阅读', gen_random_uuid(), day, (day + time '10:00') at time zone 'Asia/Shanghai'
from (select (select ws3 from wmgh_weeks) as day
      union all
      select (select ws3 from wmgh_weeks) + 1) days;

-- H1 奖励 + 已兑现兑换 + 兑换后 7 天内的行为（-2/-1/0 天）
insert into public.learning_rewards (id, household_id, name, cost_points, reward_kind, category, is_active)
values ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '奖励', 10, 'custom', 'family', true);

insert into public.learning_profile_rewards (household_id, profile_id, reward_id, enabled)
values ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', true);

insert into public.learning_redemptions
  (id, household_id, profile_id, reward_id, reward_name_snapshot, cost_points_snapshot, status, request_id, fulfilled_at)
values (
  '60000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '奖励', 10, 'fulfilled', gen_random_uuid(), now() - interval '3 days'
);

-- ===== H1 完整漏斗 =====
select is(
  (select f0_activated from private.learning_funnel_status() where household_id = '20000000-0000-4000-8000-000000000001'),
  true,
  'H1 is F0 (profile + consent)'
);

select is(
  (select f1_point_item from private.learning_funnel_status() where household_id = '20000000-0000-4000-8000-000000000001'),
  true,
  'H1 has a usable point item (F1)'
);

select is(
  (select f2_at from private.learning_funnel_status() where household_id = '20000000-0000-4000-8000-000000000001'),
  current_date - 6,
  'H1 F2 date is its first valid growth day'
);

select is(
  (select f2_within_72h from private.learning_funnel_status() where household_id = '20000000-0000-4000-8000-000000000001'),
  false,
  'H1 did not activate within 72h of entering the beta'
);

select is(
  (select f3_reward_enabled from private.learning_funnel_status() where household_id = '20000000-0000-4000-8000-000000000001'),
  true,
  'H1 created and enabled a reward (F3)'
);

select is(
  (select f4_first_redemption from private.learning_funnel_status() where household_id = '20000000-0000-4000-8000-000000000001'),
  true,
  'H1 completed its first redemption (F4)'
);

select is(
  (select f5_behavior_after_redemption from private.learning_funnel_status() where household_id = '20000000-0000-4000-8000-000000000001'),
  true,
  'H1 had valid behavior within 7 days of fulfillment (F5)'
);

select is(
  (select f6_three_growth_days from private.learning_funnel_status() where household_id = '20000000-0000-4000-8000-000000000001'),
  true,
  'H1 has 3+ distinct growth days after activation (F6)'
);

select is(
  (select growth_days_total from private.learning_funnel_status() where household_id = '20000000-0000-4000-8000-000000000001'),
  4,
  'H1 same-day records dedupe into 4 distinct growth days'
);

select is(
  (select growth_days_after_activation from private.learning_funnel_status() where household_id = '20000000-0000-4000-8000-000000000001'),
  4,
  'H1 activation window contains 4 distinct growth days'
);

-- ===== H2 只有积分项 =====
select is(
  (select f0_activated || '|' || f1_point_item || '|' || f2_activated
   from private.learning_funnel_status() where household_id = '20000000-0000-4000-8000-000000000002'),
  'true|true|false',
  'H2 is F0+F1 only (no growth behavior)'
);

select is(
  (select f3_reward_enabled || '|' || f4_first_redemption || '|' || f6_three_growth_days || '|' || growth_days_total
   from private.learning_funnel_status() where household_id = '20000000-0000-4000-8000-000000000002'),
  'false|false|false|0',
  'H2 has no reward, redemption, or growth days'
);

-- ===== H3 打卡 + 排除规则 =====
select is(
  (select f2_at from private.learning_funnel_status() where household_id = '20000000-0000-4000-8000-000000000003'),
  (select checkin_day from wmgh_weeks),
  'H3 F2 date comes from its check-in, not the 20-day-old backfill'
);

select is(
  (select growth_days_total from private.learning_funnel_status() where household_id = '20000000-0000-4000-8000-000000000003'),
  1,
  'H3 backfill/adjustment/initial-balance records are excluded'
);

select is(
  (select f1_point_item from private.learning_funnel_status() where household_id = '20000000-0000-4000-8000-000000000003'),
  false,
  'H3 has no point item (F1 false)'
);

select is(
  (select f2_within_72h from private.learning_funnel_status() where household_id = '20000000-0000-4000-8000-000000000003'),
  false,
  'H3 did not activate within 72h of entering the beta'
);

-- ===== H4 72h 快速激活 =====
select is(
  (select f2_within_72h from private.learning_funnel_status() where household_id = '20000000-0000-4000-8000-000000000004'),
  true,
  'H4 activated within 72h of entering the beta'
);

select is(
  (select f2_at from private.learning_funnel_status() where household_id = '20000000-0000-4000-8000-000000000004'),
  current_date - 9,
  'H4 F2 date is its timely growth day'
);

-- ===== H6 / H7 周内成长日阈值 =====
select is(
  (select f6_three_growth_days from private.learning_funnel_status() where household_id = '20000000-0000-4000-8000-000000000006'),
  true,
  'H6 has 3 growth days in one week (F6 true)'
);

select is(
  (select growth_days_total from private.learning_funnel_status() where household_id = '20000000-0000-4000-8000-000000000006'),
  3,
  'H6 has exactly 3 distinct growth days'
);

select is(
  (select f6_three_growth_days from private.learning_funnel_status() where household_id = '20000000-0000-4000-8000-000000000007'),
  false,
  'H7 has only 2 growth days in its week (F6 false)'
);

select is(
  (select growth_days_total from private.learning_funnel_status() where household_id = '20000000-0000-4000-8000-000000000007'),
  2,
  'H7 has exactly 2 distinct growth days'
);

-- ===== 汇总报告（as_of = now + 10 天，使 H1 的 F5 观察满 7 天）=====
select is(
  (select numerator || '|' || denominator from private.learning_funnel_report(p_as_of => now() + interval '10 days')
   where stage = 'cohort'),
  '6|6',
  'cohort counts all beta families'
);

select is(
  (select numerator from private.learning_funnel_report(p_as_of => now() + interval '10 days')
   where stage = 'f0_technical_activation'),
  6::bigint,
  'F0 counts all families with profile + consent'
);

select is(
  (select numerator from private.learning_funnel_report(p_as_of => now() + interval '10 days')
   where stage = 'f1_usable_point_item'),
  3::bigint,
  'F1 counts families with an active point item'
);

select is(
  (select numerator from private.learning_funnel_report(p_as_of => now() + interval '10 days')
   where stage = 'f2_core_activation'),
  5::bigint,
  'F2 counts activated families'
);

select is(
  (select numerator from private.learning_funnel_report(p_as_of => now() + interval '10 days')
   where stage = 'f2_core_activation_within_72h'),
  1::bigint,
  '72h fast activation counts only H4'
);

select is(
  (select numerator from private.learning_funnel_report(p_as_of => now() + interval '10 days')
   where stage = 'f3_reward_enabled'),
  1::bigint,
  'F3 counts families with an enabled reward'
);

select is(
  (select numerator from private.learning_funnel_report(p_as_of => now() + interval '10 days')
   where stage = 'f4_first_redemption'),
  1::bigint,
  'F4 counts families with a first fulfilled redemption'
);

select is(
  (select numerator || '|' || denominator from private.learning_funnel_report(p_as_of => now() + interval '10 days')
   where stage = 'f5_behavior_after_redemption'),
  '1|1',
  'F5 counts observed families with behavior after first fulfillment'
);

select is(
  (select numerator || '|' || denominator from private.learning_funnel_report(p_as_of => now() + interval '10 days')
   where stage = 'f6_three_growth_days'),
  '2|5',
  'F6 counts activated families with 3+ growth days in the activation week'
);

-- ===== WMGH（自然周冻结 + >=3 阈值）=====
select is(
  (select wmgh_household_count from private.learning_wmgh_weekly()
   where week_start = (select ws from wmgh_weeks)),
  1::bigint,
  'WMGH counts H6 once for its frozen 3-growth-day week'
);

select is(
  (select count(*) from private.learning_wmgh_weekly()
   where week_start = (select ws3 from wmgh_weeks)),
  0::bigint,
  'WMGH excludes H7 with only 2 growth days in a week'
);

select is(
  (select count(*) from private.learning_wmgh_weekly(
     p_as_of => (((select ws from wmgh_weeks) + 14)::timestamp at time zone 'Asia/Shanghai') - interval '1 second')
   where week_start = (select ws from wmgh_weeks)),
  0::bigint,
  'WMGH week is not reported one second before the 7-day freeze boundary'
);

select is(
  (select wmgh_household_count from private.learning_wmgh_weekly(
     p_as_of => ((select ws from wmgh_weeks) + 14)::timestamp at time zone 'Asia/Shanghai')
   where week_start = (select ws from wmgh_weeks)),
  1::bigint,
  'WMGH week freezes exactly seven days after the local week ends'
);

select is(
  (select count(*) from private.learning_wmgh_weekly()
   where week_start = current_date - ((extract(dow from current_date)::int + 6) % 7)),
  0::bigint,
  'WMGH does not report the unfrozen current week'
);

-- ===== 延迟上报、cohort_start 与家庭时区边界 =====
insert into public.learning_households (id, name, owner_user_id, timezone) values
  ('20000000-0000-4000-8000-000000000008', 'H8 delayed over 7d', '10000000-0000-4000-8000-000000000001', 'Asia/Shanghai'),
  ('20000000-0000-4000-8000-000000000009', 'H9 delayed activation', '10000000-0000-4000-8000-000000000001', 'Asia/Shanghai'),
  ('20000000-0000-4000-8000-000000000010', 'H10 ledger cohort timezone', '10000000-0000-4000-8000-000000000001', 'Pacific/Kiritimati'),
  ('20000000-0000-4000-8000-000000000011', 'H11 event cohort timezone', '10000000-0000-4000-8000-000000000001', 'Pacific/Kiritimati'),
  ('20000000-0000-4000-8000-000000000012', 'H12 pre-cohort F5', '10000000-0000-4000-8000-000000000001', 'Asia/Shanghai');

insert into public.learning_profiles (id, household_id, display_name, grade_level) values
  ('30000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000008', 'P8', 4),
  ('30000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000009', 'P9', 4),
  ('30000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000010', 'P10', 4),
  ('30000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000011', 'P11', 4),
  ('30000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000012', 'P12', 4);

insert into public.learning_guardian_consents (household_id, user_id, consent_type, policy_version)
select id, '10000000-0000-4000-8000-000000000001', 'learner_data_processing', 'privacy-v1'
from public.learning_households
where id between '20000000-0000-4000-8000-000000000008' and '20000000-0000-4000-8000-000000000012';

insert into private.learning_beta_batches (household_id, batch, invited_at, joined_at) values
  ('20000000-0000-4000-8000-000000000008', 'b2', now() - interval '11 days', now() - interval '10 days'),
  ('20000000-0000-4000-8000-000000000009', 'b2', now() - interval '5 days', now() - interval '4 days'),
  ('20000000-0000-4000-8000-000000000010', 'b2', '2026-08-01T09:00:00Z', '2026-08-01T10:00:00Z'),
  ('20000000-0000-4000-8000-000000000011', 'b2', '2026-08-01T08:30:00Z', '2026-08-01T09:30:00Z'),
  ('20000000-0000-4000-8000-000000000012', 'b2', now() - interval '4 days', now() - interval '3 days');

-- H8: received_at - occurred_at > 7 days; diagnostics may remain stored but cannot form a growth day.
insert into private.learning_activity_events
  (event_id, product_id, event_type, household_id, profile_id, occurred_at, timezone, payload, payload_hash, received_at)
values (
  '70000000-0000-4000-8000-000000000008', 'shadow-mate', 'growth_activity_recorded',
  '20000000-0000-4000-8000-000000000008', '30000000-0000-4000-8000-000000000008',
  now() - interval '8 days 1 second', 'Asia/Shanghai',
  '{"source":"checkin","entry_type":"manual"}'::jsonb, 'funnel-test-late-over-7d', now()
);

select is(
  (select growth_days_total from private.learning_funnel_status()
   where household_id = '20000000-0000-4000-8000-000000000008'),
  0,
  'activity received more than 7 days late is excluded from effective growth days'
);

-- H9: an event occurred within 72h but arrived after 72h. It counts as a timely growth day,
-- while F2 is observed on receipt and cannot be backdated to the occurrence date.
insert into private.learning_activity_events
  (event_id, product_id, event_type, household_id, profile_id, occurred_at, timezone, payload, payload_hash, received_at)
values (
  '70000000-0000-4000-8000-000000000009', 'shadow-mate', 'growth_activity_recorded',
  '20000000-0000-4000-8000-000000000009', '30000000-0000-4000-8000-000000000009',
  now() - interval '3 days', 'Asia/Shanghai',
  '{"source":"checkin","entry_type":"manual"}'::jsonb, 'funnel-test-delayed-activation', now()
);

select is(
  (select f2_at from private.learning_funnel_status()
   where household_id = '20000000-0000-4000-8000-000000000009'),
  (now() at time zone 'Asia/Shanghai')::date,
  'delayed activity activates on the server receipt day instead of backdating F2'
);

select is(
  (select f2_within_72h from private.learning_funnel_status()
   where household_id = '20000000-0000-4000-8000-000000000009'),
  false,
  'delayed receipt after 72h does not retroactively qualify fast activation'
);

-- H10: ledger dates are household-local dates. Three days in the Jul 27 week are
-- before the Aug 2 cohort date in UTC+14 and must not qualify F2/F6/WMGH.
insert into public.learning_point_ledger
  (household_id, profile_id, point_item_id, delta, entry_type, item_name_snapshot, request_id, occurred_on, created_at)
values
  ('20000000-0000-4000-8000-000000000010', '30000000-0000-4000-8000-000000000010', null, 5, 'manual', '阅读', gen_random_uuid(), '2026-07-27', '2026-07-27T12:00:00Z'),
  ('20000000-0000-4000-8000-000000000010', '30000000-0000-4000-8000-000000000010', null, 5, 'manual', '阅读', gen_random_uuid(), '2026-07-28', '2026-07-28T12:00:00Z'),
  ('20000000-0000-4000-8000-000000000010', '30000000-0000-4000-8000-000000000010', null, 5, 'manual', '阅读', gen_random_uuid(), '2026-07-29', '2026-07-29T12:00:00Z');

select is(
  (select growth_days_total from private.learning_funnel_status()
   where household_id = '20000000-0000-4000-8000-000000000010'),
  0,
  'ledger behavior before the household-local cohort date is excluded'
);

select is(
  (select count(*) from private.learning_wmgh_weekly()
   where week_start = '2026-07-27'::date),
  0::bigint,
  'three pre-cohort ledger days cannot qualify a frozen WMGH week'
);

-- H11: one event is before the exact cohort instant and one crosses local midnight after it.
insert into private.learning_activity_events
  (event_id, product_id, event_type, household_id, profile_id, occurred_at, timezone, payload, payload_hash, received_at)
values
  ('70000000-0000-4000-8000-000000000011', 'shadow-mate', 'growth_activity_recorded',
   '20000000-0000-4000-8000-000000000011', '30000000-0000-4000-8000-000000000011',
   '2026-08-01T09:00:00Z', 'Pacific/Kiritimati', '{"source":"checkin","entry_type":"manual"}'::jsonb,
   'funnel-test-before-cohort', '2026-08-01T09:00:00Z'),
  ('70000000-0000-4000-8000-000000000012', 'shadow-mate', 'growth_activity_recorded',
   '20000000-0000-4000-8000-000000000011', '30000000-0000-4000-8000-000000000011',
   '2026-08-01T10:30:00Z', 'Pacific/Kiritimati', '{"source":"checkin","entry_type":"manual"}'::jsonb,
   'funnel-test-after-midnight', '2026-08-01T10:30:00Z');

select is(
  (select f2_at from private.learning_funnel_status()
   where household_id = '20000000-0000-4000-8000-000000000011'),
  '2026-08-02'::date,
  'event cohort filtering and F2 day use the household timezone at local midnight'
);

select is(
  (select growth_days_total from private.learning_funnel_status()
   where household_id = '20000000-0000-4000-8000-000000000011'),
  1,
  'event before cohort_start is excluded while the post-midnight event remains'
);

-- H12: behavior after fulfillment but before beta join cannot qualify F5.
insert into public.learning_rewards (id, household_id, name, cost_points, reward_kind, category, is_active)
values ('50000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000012', '奖励', 10, 'custom', 'family', true);

insert into public.learning_redemptions
  (id, household_id, profile_id, reward_id, reward_name_snapshot, cost_points_snapshot, status, request_id, fulfilled_at)
values (
  '60000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000012',
  '30000000-0000-4000-8000-000000000012', '50000000-0000-4000-8000-000000000012',
  '奖励', 10, 'fulfilled', gen_random_uuid(), now() - interval '10 days'
);

insert into public.learning_point_ledger
  (household_id, profile_id, point_item_id, delta, entry_type, item_name_snapshot, request_id, occurred_on, created_at)
values (
  '20000000-0000-4000-8000-000000000012', '30000000-0000-4000-8000-000000000012',
  null, 5, 'manual', '阅读', gen_random_uuid(), current_date - 9, now() - interval '9 days'
);

select is(
  (select f5_behavior_after_redemption from private.learning_funnel_status()
   where household_id = '20000000-0000-4000-8000-000000000012'),
  false,
  'pre-cohort ledger behavior cannot qualify F5 even when it follows fulfillment'
);

rollback;
