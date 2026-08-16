-- W5 / 交付项 2：F0~F6 聚合定义 + private 只读视图/函数（严格遵循计划 8.1 + 附件 06）。
--
-- 固定定义：
--   * 有效成长行为 = 正常积分记录（learning_point_ledger.entry_type='manual'，加分扣分都算，
--     排除人工修正/反向纠错/期初积分/兑换/退款）∪ 学习模块有效打卡（活动事件
--     growth_activity_recorded，payload.source='checkin'）。
--   * 及时记录（非补记）= 服务端接收时间与行为日期相差 <= 7 天：接受离线延迟同步，
--     排除超过 7 天的事后补记（补记不能倒推激活/留存/连续使用）。
--   * 有效成长日 = 按家庭时区一天内至少一条有效记录，同一天只计一次。
--   * F0 = 内测批次家庭（分母）+ 家庭空间 + >=1 孩子档案 + 家长同意。
--   * F1 = 有 >=1 可用积分项目（is_active）。
--   * F2 = 首次有效成长日；F2 日期 = 首个有效成长日；72h 快速激活单独报告。
--   * F3 = 创建并启用 >=1 奖励（learning_rewards.is_active 且 learning_profile_rewards.enabled）。
--   * F4 = 首次成功兑换 = 第一条 status='fulfilled' 的 learning_redemptions（F4 日期 = fulfilled_at）。
--   * F5 = 首次兑现后 7 天内再次产生有效行为（(f4_at, f4_at + 7 天]）。
--   * F6 = 核心激活后 7 天内 >=3 个不同有效成长日（[f2_at, f2_at + 6]）。
--   * WMGH = 自然周内 >=3 个不同有效成长日的家庭；每周每家庭最多计 1 次；自然周按家庭本地
--     周一 00:00 开始；自然周结束 7 天后冻结该周报告。
--
-- 隐私边界：与 private.learning_activity_events 一致，客户端无 schema/表/函数读取权限；
-- 不含儿童姓名/学习内容/邮箱/原始错误文本。

-- 有效成长日：每家庭每天一行（去重）。
create or replace view private.learning_growth_days
with (security_invoker = true) as
select
  behaviors.household_id,
  behaviors.growth_date,
  min(behaviors.behavior_at) as first_behavior_at
from (
  -- 正常积分记录（业务事实，唯一权威）：entry_type='manual'，且为及时记录（非补记）
  select
    ledger.household_id,
    ledger.occurred_on as growth_date,
    ledger.created_at as behavior_at
  from public.learning_point_ledger ledger
  where ledger.entry_type = 'manual'
    and (ledger.created_at::date - ledger.occurred_on) between 0 and 7
  union all
  -- 学习模块有效打卡：仅活动事件来源（打卡不产生积分流水）
  select
    event.household_id,
    ((event.occurred_at at time zone coalesce(nullif(household.timezone, ''), 'Asia/Shanghai'))::date) as growth_date,
    event.occurred_at as behavior_at
  from private.learning_activity_events event
  join public.learning_households household on household.id = event.household_id
  where event.event_type = 'growth_activity_recorded'
    and event.payload ->> 'source' = 'checkin'
) behaviors
group by behaviors.household_id, behaviors.growth_date;

revoke all on private.learning_growth_days from public;
revoke all on private.learning_growth_days from anon;
revoke all on private.learning_growth_days from authenticated;

-- 供聚合查询使用的索引（避免全表扫描）
create index if not exists learning_point_ledger_household_entry_idx
  on public.learning_point_ledger (household_id, entry_type, occurred_on);

-- 每内测批次家庭的 F0~F6 阶段与关键日期
create or replace function private.learning_funnel_status()
returns table (
  household_id uuid,
  batch text,
  cohort_start timestamptz,
  cohort_status text,
  f0_activated boolean,
  f1_point_item boolean,
  f2_activated boolean,
  f2_at date,
  f2_within_72h boolean,
  f3_reward_enabled boolean,
  f4_first_redemption boolean,
  f4_at timestamptz,
  f5_behavior_after_redemption boolean,
  f6_three_growth_days boolean,
  growth_days_total integer,
  growth_days_after_activation integer
)
language sql stable security definer
set search_path = public, private
as $$
with cohort as (
  select
    batch.household_id,
    batch.batch,
    coalesce(batch.joined_at, batch.invited_at) as cohort_start,
    batch.status as cohort_status,
    exists (
      select 1 from public.learning_profiles profile
      where profile.household_id = batch.household_id
    ) as has_profile,
    exists (
      select 1 from public.learning_guardian_consents consent
      where consent.household_id = batch.household_id
    ) as has_consent
  from private.learning_beta_batches batch
),
funnel as (
  select
    cohort.household_id,
    cohort.batch,
    cohort.cohort_start,
    cohort.cohort_status,
    cohort.has_profile,
    cohort.has_consent,
    first_growth.f2_at,
    redemption.f4_at
  from cohort
  left join lateral (
    select min(growth.growth_date) as f2_at
    from private.learning_growth_days growth
    where growth.household_id = cohort.household_id
  ) first_growth on true
  left join lateral (
    select min(redemption.fulfilled_at) as f4_at
    from public.learning_redemptions redemption
    where redemption.household_id = cohort.household_id
      and redemption.status = 'fulfilled'
  ) redemption on true
)
select
  funnel.household_id,
  funnel.batch,
  funnel.cohort_start,
  funnel.cohort_status,
  (funnel.has_profile and funnel.has_consent) as f0_activated,
  exists (
    select 1 from public.learning_point_items item
    where item.household_id = funnel.household_id
      and item.is_active
  ) as f1_point_item,
  funnel.f2_at is not null as f2_activated,
  funnel.f2_at,
  exists (
    select 1 from private.learning_growth_days growth
    where growth.household_id = funnel.household_id
      and growth.first_behavior_at <= funnel.cohort_start + interval '72 hours'
  ) as f2_within_72h,
  exists (
    select 1
    from public.learning_rewards reward
    join public.learning_profile_rewards profile_reward
      on profile_reward.reward_id = reward.id
     and profile_reward.household_id = reward.household_id
    where reward.household_id = funnel.household_id
      and reward.is_active
      and profile_reward.enabled
  ) as f3_reward_enabled,
  funnel.f4_at is not null as f4_first_redemption,
  funnel.f4_at,
  exists (
    select 1 from private.learning_growth_days growth
    where growth.household_id = funnel.household_id
      and funnel.f4_at is not null
      and growth.first_behavior_at > funnel.f4_at
      and growth.first_behavior_at <= funnel.f4_at + interval '7 days'
  ) as f5_behavior_after_redemption,
  (funnel.f2_at is not null and (
    select count(distinct growth.growth_date) >= 3
    from private.learning_growth_days growth
    where growth.household_id = funnel.household_id
      and growth.growth_date between funnel.f2_at and funnel.f2_at + 6
  )) as f6_three_growth_days,
  (
    select count(distinct growth.growth_date)::integer
    from private.learning_growth_days growth
    where growth.household_id = funnel.household_id
  ) as growth_days_total,
  (
    select count(distinct growth.growth_date)::integer
    from private.learning_growth_days growth
    where growth.household_id = funnel.household_id
      and funnel.f2_at is not null
      and growth.growth_date between funnel.f2_at and funnel.f2_at + 6
  ) as growth_days_after_activation
from funnel;
$$;

revoke all on function private.learning_funnel_status() from public;
revoke all on function private.learning_funnel_status() from anon;
revoke all on function private.learning_funnel_status() from authenticated;

-- F0~F6 各阶段家庭数与比率（F0 为漏斗统一分母；
-- F5 分母=首次兑现且观察满 7 天，F6 分母=已激活且观察满 7 天）
create or replace function private.learning_funnel_report(p_as_of timestamptz default now())
returns table (stage text, numerator bigint, denominator bigint, rate numeric)
language sql stable security definer
set search_path = public, private
as $$
with status as (
  select s.*, household.timezone
  from private.learning_funnel_status() s
  join public.learning_households household on household.id = s.household_id
),
counts as (
  select
    count(*) as cohort_n,
    count(*) filter (where s.f0_activated) as f0_n
  from status s
)
select stage, numerator, denominator,
       case when denominator > 0 then round(numerator::numeric * 100 / denominator, 2) else null end as rate
from (
  select 'cohort'::text as stage,
         c.cohort_n as numerator,
         c.cohort_n as denominator
  from counts c
  union all
  select 'f0_technical_activation',
         c.f0_n,
         c.cohort_n
  from counts c
  union all
  select 'f1_usable_point_item',
         (select count(*) from status s where s.f0_activated and s.f1_point_item),
         c.f0_n
  from counts c
  union all
  select 'f2_core_activation',
         (select count(*) from status s where s.f0_activated and s.f2_activated),
         c.f0_n
  from counts c
  union all
  select 'f2_core_activation_within_72h',
         (select count(*) from status s where s.f0_activated and s.f2_within_72h),
         c.f0_n
  from counts c
  union all
  select 'f3_reward_enabled',
         (select count(*) from status s where s.f0_activated and s.f3_reward_enabled),
         c.f0_n
  from counts c
  union all
  select 'f4_first_redemption',
         (select count(*) from status s where s.f0_activated and s.f4_first_redemption),
         c.f0_n
  from counts c
  union all
  select 'f5_behavior_after_redemption',
         (select count(*) from status s
          where s.f0_activated and s.f4_first_redemption
            and s.f4_at + interval '7 days' <= p_as_of
            and s.f5_behavior_after_redemption),
         (select count(*) from status s
          where s.f0_activated and s.f4_first_redemption
            and s.f4_at + interval '7 days' <= p_as_of)
  from counts c
  union all
  select 'f6_three_growth_days',
         (select count(*) from status s
          where s.f0_activated and s.f2_activated and s.f6_three_growth_days
            and (p_as_of at time zone coalesce(nullif(s.timezone, ''), 'Asia/Shanghai'))::date >= s.f2_at + 6),
         (select count(*) from status s
          where s.f0_activated and s.f2_activated
            and (p_as_of at time zone coalesce(nullif(s.timezone, ''), 'Asia/Shanghai'))::date >= s.f2_at + 6)
  from counts c
) stages;
$$;

revoke all on function private.learning_funnel_report(timestamptz) from public;
revoke all on function private.learning_funnel_report(timestamptz) from anon;
revoke all on function private.learning_funnel_report(timestamptz) from authenticated;

-- WMGH（北极星）：自然周内 >=3 个不同有效成长日的家庭，每周每家庭最多计 1 次。
-- 自然周以家庭本地周一 00:00 开始；自然周结束 7 天后冻结该周报告。
create or replace function private.learning_wmgh_weekly(p_as_of timestamptz default now())
returns table (
  week_start date,
  week_end date,
  wmgh_household_count bigint,
  cohort_household_count bigint
)
language sql stable security definer
set search_path = public, private
as $$
with weekly as (
  select
    growth.household_id,
    growth.growth_date,
    household.timezone,
    (growth.growth_date - ((extract(dow from growth.growth_date)::int + 6) % 7)) as week_start
  from private.learning_growth_days growth
  join public.learning_households household on household.id = growth.household_id
),
frozen as (
  select household_id, growth_date, week_start
  from weekly
  where week_start + 13 <= (p_as_of at time zone coalesce(nullif(timezone, ''), 'Asia/Shanghai'))::date
),
qualified as (
  select growth.household_id, growth.week_start
  from frozen growth
  join private.learning_beta_batches batch on batch.household_id = growth.household_id
  group by growth.household_id, growth.week_start
  having count(distinct growth.growth_date) >= 3
),
cohort_weeks as (
  select
    batch.household_id,
    household.timezone,
    ((coalesce(batch.joined_at, batch.invited_at) at time zone coalesce(nullif(household.timezone, ''), 'Asia/Shanghai'))::date
      - ((extract(dow from (coalesce(batch.joined_at, batch.invited_at) at time zone coalesce(nullif(household.timezone, ''), 'Asia/Shanghai'))::date)::int + 6) % 7)) as cohort_week_start
  from private.learning_beta_batches batch
  join public.learning_households household on household.id = batch.household_id
)
select
  qualified.week_start,
  qualified.week_start + 6 as week_end,
  count(*)::bigint as wmgh_household_count,
  (
    select count(*)::bigint
    from cohort_weeks cw
    where cw.cohort_week_start <= qualified.week_start
  ) as cohort_household_count
from qualified
group by qualified.week_start
order by qualified.week_start;
$$;

revoke all on function private.learning_wmgh_weekly(timestamptz) from public;
revoke all on function private.learning_wmgh_weekly(timestamptz) from anon;
revoke all on function private.learning_wmgh_weekly(timestamptz) from authenticated;
