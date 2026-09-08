-- ====================================================================
-- Shadow Mate (影伴) Growth Loop MVP 业务事实漏斗与健康度统计
-- 适用范围：Supabase Dashboard SQL Editor (项目: monetization-service)
-- 说明：
--   1. 纯只读聚合查询，不修改任何数据。
--   2. 支持自动识别【真实家庭】与【内部测试/开发账号】，避免测试数据污染漏斗。
--   3. 包含家长登录邮箱，用于冷启动回访、内测沟通与问题支持。
--   4. 严格按产品事实（家庭空间、孩子档案、打卡状态）计算 F0~F6 转化。
--   5. 可直接在 Supabase 控制台的 SQL Editor 中全选或分段运行。
-- ====================================================================

-- --------------------------------------------------------------------
-- 报表 1：核心漏斗总览 (真实家庭 VS 测试账号 对比视图)
-- --------------------------------------------------------------------
with 
registered_households as (
  select 
    h.id as household_id,
    h.owner_user_id,
    u.email as owner_email,
    h.name as household_name,
    h.created_at as household_created_at,
    count(distinct p.id) as learner_count,
    -- 测试账号规则判定：匹配常见内部域名、测试邮箱或测试命名
    case 
      when u.email ilike '%test%'
        or u.email ilike '%demo%'
        or u.email ilike '%example%'
        or u.email ilike '%shadow.wang%'
        or u.email ilike '%wardlu%'
        or u.email ilike '%e2e%'
        or u.email ilike '%ceshi%'
        or u.email ilike '%admin%'
        or h.name ilike '%测试%'
        or h.name ilike '%test%'
        or h.name ilike '%dogfood%'
        or h.name ilike '%demo%'
        or h.name ilike '%演练%'
      then true
      else false
    end as is_test
  from public.learning_households h
  join auth.users u on u.id = h.owner_user_id
  left join public.learning_profiles p on p.household_id = h.id
  where h.project_id = 'shadow-mate'
  group by h.id, h.owner_user_id, u.email, h.name, h.created_at
),

consents as (
  select distinct household_id
  from public.learning_guardian_consents
  where consent_type = 'learner_data_processing'
),

profile_states as (
  select 
    p.household_id,
    p.id as profile_id,
    p.display_name as learner_name,
    s.updated_at as last_synced_at,
    -- 兼容提取打卡天数 (支持 v1 state 与 v2 envelope 结构)
    case 
      when s.state ? 'checkins' and jsonb_typeof(s.state->'checkins') = 'object' 
        then (select count(*) from jsonb_object_keys(s.state->'checkins'))
      when s.state->'learning' ? 'checkins' and jsonb_typeof(s.state->'learning'->'checkins') = 'object'
        then (select count(*) from jsonb_object_keys(s.state->'learning'->'checkins'))
      else 0
    end as checkin_days_count
  from public.learning_profiles p
  join public.learning_profile_states s on s.profile_id = p.id
)

select 
  -- 维度：全部 vs 排除测试账号
  count(distinct h.owner_user_id) as "总注册家长数 (全部)",
  count(distinct h.owner_user_id) filter (where not h.is_test) as "🌟 真实家长数 (排除测试)",
  count(distinct h.owner_user_id) filter (where h.is_test) as "⚠️ 内部/测试账号数",

  -- F0 技术激活转化 (有家庭 + 有孩子)
  count(distinct h.household_id) filter (where not h.is_test) as "真实家庭空间数",
  count(distinct h.household_id) filter (where not h.is_test and h.learner_count > 0) as "🌟 F0 真实技术激活家庭数",
  sum(h.learner_count) filter (where not h.is_test) as "真实录入孩子数",

  -- F2 核心激活转化 (有实际打卡记录)
  count(distinct ps.household_id) filter (where not h.is_test and ps.checkin_days_count > 0) as "🌟 F2 真实核心激活家庭数",
  count(distinct ps.profile_id) filter (where not h.is_test and ps.checkin_days_count > 0) as "真实打卡孩子数",
  coalesce(sum(ps.checkin_days_count) filter (where not h.is_test), 0) as "真实累计打卡天数",

  -- 留存与持续活跃潜力
  count(distinct ps.household_id) filter (where not h.is_test and ps.checkin_days_count >= 2) as "真实打卡2天以上家庭",
  count(distinct ps.household_id) filter (where not h.is_test and ps.checkin_days_count >= 3) as "🌟 真实 WMGH 候选家庭 (3天+)",

  -- 近 7 天推广转化 (排除测试)
  count(distinct h.household_id) filter (where not h.is_test and h.household_created_at >= now() - interval '7 days') as "近7天真实新增家庭",
  count(distinct ps.household_id) filter (where not h.is_test and ps.last_synced_at >= now() - interval '7 days') as "近7天真实活跃家庭"

from registered_households h
left join consents c on c.household_id = h.household_id
left join profile_states ps on ps.household_id = h.household_id;


-- --------------------------------------------------------------------
-- 报表 2：家庭明细、家长邮箱与账号类型标签 (置顶真实家庭)
-- --------------------------------------------------------------------
with profile_summary as (
  select 
    p.household_id,
    count(distinct p.id) as learner_count,
    string_agg(p.display_name, '、') as learner_names,
    max(s.updated_at) as latest_sync_time,
    sum(
      case 
        when s.state ? 'checkins' and jsonb_typeof(s.state->'checkins') = 'object' 
          then (select count(*) from jsonb_object_keys(s.state->'checkins'))
        when s.state->'learning' ? 'checkins' and jsonb_typeof(s.state->'learning'->'checkins') = 'object'
          then (select count(*) from jsonb_object_keys(s.state->'learning'->'checkins'))
        else 0
      end
    ) as total_checkin_days
  from public.learning_profiles p
  left join public.learning_profile_states s on s.profile_id = p.id
  group by p.household_id
),

family_drilldown as (
  select 
    h.id as household_id,
    u.email as owner_email,
    h.name as household_name,
    h.created_at as created_at,
    u.last_sign_in_at as last_sign_in_at,
    coalesce(ps.learner_count, 0) as learner_count,
    coalesce(ps.learner_names, '未添加孩子') as learner_names,
    coalesce(ps.total_checkin_days, 0) as total_checkin_days,
    ps.latest_sync_time,
    case 
      when u.email ilike '%test%'
        or u.email ilike '%demo%'
        or u.email ilike '%example%'
        or u.email ilike '%shadow.wang%'
        or u.email ilike '%wardlu%'
        or u.email ilike '%e2e%'
        or u.email ilike '%ceshi%'
        or u.email ilike '%admin%'
        or h.name ilike '%测试%'
        or h.name ilike '%test%'
        or h.name ilike '%dogfood%'
        or h.name ilike '%demo%'
        or coalesce(ps.learner_names, '') ilike '%测试%'
        or coalesce(ps.learner_names, '') ilike '%test%'
      then true
      else false
    end as is_test
  from public.learning_households h
  join auth.users u on u.id = h.owner_user_id
  left join profile_summary ps on ps.household_id = h.id
  where h.project_id = 'shadow-mate'
)

select 
  case when is_test then '⚠️ 测试/内部' else '✅ 真实家庭' end as "账号类别",
  owner_email as "家长邮箱 (Parent Email)",
  household_name as "家庭空间名称",
  created_at as "创建时间",
  last_sign_in_at as "最后登录时间",
  learner_count as "孩子档案数",
  learner_names as "孩子昵称",
  total_checkin_days as "累计打卡天数",
  latest_sync_time as "最后同步时间",
  case 
    when learner_count = 0 then '待创建孩子档案 (未达 F0)'
    when total_checkin_days = 0 then '已建档无打卡 (F0 已达，待 F2)'
    when total_checkin_days between 1 and 2 then '初次尝试打卡 (F2 激活)'
    when total_checkin_days >= 3 then '多日活跃家庭 (高价值 WMGH 候选)'
  end as "当前转化阶段",
  household_id
from family_drilldown
order by is_test asc, created_at desc;


-- --------------------------------------------------------------------
-- 报表 3：已注册但未建档的家长列表 (含测试账号识别)
-- --------------------------------------------------------------------
select 
  case 
    when u.email ilike '%test%'
      or u.email ilike '%demo%'
      or u.email ilike '%example%'
      or u.email ilike '%shadow.wang%'
      or u.email ilike '%wardlu%'
      or u.email ilike '%e2e%'
      or u.email ilike '%ceshi%'
      or u.email ilike '%admin%'
    then '⚠️ 测试账号'
    else '✅ 真实潜在用户'
  end as "账号类别",
  u.email as "家长邮箱 (Parent Email)",
  u.created_at as "注册时间",
  u.last_sign_in_at as "最后登录时间",
  '已完成邮箱登录验证，尚未创建家庭空间 (需轻量邮件关怀与指引)' as "跟进建议"
from auth.users u
where (
    u.raw_user_meta_data->>'product_id' = 'shadow-mate'
    or exists (select 1 from public.learning_households h where h.owner_user_id = u.id)
  )
  and not exists (
    select 1 from public.learning_households h 
    where h.owner_user_id = u.id and h.project_id = 'shadow-mate'
  )
order by 
  case 
    when u.email ilike '%test%' or u.email ilike '%shadow.wang%' or u.email ilike '%example%' then 1 
    else 0 
  end asc,
  u.created_at desc;
