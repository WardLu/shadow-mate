-- ====================================================================
-- Shadow Mate (影伴) Growth Loop MVP 业务事实漏斗与健康度统计
-- 适用范围：Supabase Dashboard SQL Editor (项目: monetization-service)
-- 说明：
--   1. 纯只读聚合查询，不修改任何数据。
--   2. 包含家长登录邮箱，用于冷启动回访、内测沟通与问题支持。
--   3. 严格按产品事实（家庭空间、孩子档案、打卡状态）计算 F0~F6 转化。
--   4. 可直接在 Supabase 控制台的 SQL Editor 中全选或分段运行。
-- ====================================================================

-- --------------------------------------------------------------------
-- 报表 1：核心漏斗总览 (Overview Funnel: F0 技术激活 -> F2 核心激活 -> 多日留存)
-- --------------------------------------------------------------------
with 
registered_households as (
  select 
    h.id as household_id,
    h.owner_user_id,
    h.name as household_name,
    h.created_at as household_created_at,
    count(distinct p.id) as learner_count
  from public.learning_households h
  left join public.learning_profiles p on p.household_id = h.id
  where h.project_id = 'shadow-mate'
  group by h.id, h.owner_user_id, h.name, h.created_at
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
    end as checkin_days_count,
    -- 提取积分信息 (如果有)
    case
      when s.state ? 'points' and jsonb_typeof(s.state->'points') = 'object'
        then true
      when s.state->'learning' ? 'points' and jsonb_typeof(s.state->'learning'->'points') = 'object'
        then true
      else false
    end as has_points_record
  from public.learning_profiles p
  join public.learning_profile_states s on s.profile_id = p.id
)

select 
  '--- 1. 注册与技术激活 (F0) ---' as funnel_stage,
  count(distinct h.owner_user_id) as "总注册家长数 (Auth Owners)",
  count(distinct h.household_id) as "家庭空间数 (Households)",
  count(distinct h.household_id) filter (where h.learner_count > 0) as "F0 技术激活家庭数 (有孩子档案)",
  sum(h.learner_count) as "录入孩子总数 (Learners)",
  count(distinct c.household_id) as "完成隐私同意家庭数 (Consented)",

  '--- 2. 学习行为与核心激活 (F2) ---' as f2_stage,
  count(distinct ps.household_id) filter (where ps.checkin_days_count > 0) as "F2 核心激活家庭数 (至少1次打卡)",
  count(distinct ps.profile_id) filter (where ps.checkin_days_count > 0) as "有打卡活跃孩子数",
  coalesce(sum(ps.checkin_days_count), 0) as "累计打卡人天数",

  '--- 3. 留存与多日活跃 ---' as retention_stage,
  count(distinct ps.household_id) filter (where ps.checkin_days_count >= 2) as "2天以上打卡家庭数",
  count(distinct ps.household_id) filter (where ps.checkin_days_count >= 3) as "3天以上打卡家庭数 (WMGH候选)",

  '--- 4. 近7天推广转化观察 ---' as promo_stage,
  count(distinct h.household_id) filter (where h.household_created_at >= now() - interval '7 days') as "近7天新增家庭数",
  count(distinct ps.household_id) filter (where ps.last_synced_at >= now() - interval '7 days') as "近7天活跃同步家庭数"

from registered_households h
left join consents c on c.household_id = h.household_id
left join profile_states ps on ps.household_id = h.household_id;


-- --------------------------------------------------------------------
-- 报表 2：家庭明细与家长邮箱 (用于内测家庭回访、深度沟通与服务支持)
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
)

select 
  u.email as "家长邮箱 (Parent Email)",
  h.name as "家庭空间名称",
  h.created_at as "创建时间",
  u.last_sign_in_at as "家长最后登录时间",
  coalesce(ps.learner_count, 0) as "孩子档案数",
  coalesce(ps.learner_names, '未添加孩子') as "孩子昵称",
  coalesce(ps.total_checkin_days, 0) as "累计打卡天数",
  ps.latest_sync_time as "最后同步时间",
  case 
    when coalesce(ps.learner_count, 0) = 0 then '待创建孩子档案 (未达 F0)'
    when coalesce(ps.total_checkin_days, 0) = 0 then '已建档无打卡 (F0 已达，待 F2)'
    when coalesce(ps.total_checkin_days, 0) between 1 and 2 then '初次尝试打卡 (F2 激活)'
    when coalesce(ps.total_checkin_days, 0) >= 3 then '多日活跃家庭 (高价值 WMGH 候选)'
  end as "当前转化阶段",
  h.id as household_id
from public.learning_households h
join auth.users u on u.id = h.owner_user_id
left join profile_summary ps on ps.household_id = h.id
where h.project_id = 'shadow-mate'
order by h.created_at desc;


-- --------------------------------------------------------------------
-- 报表 3：已登录注册但尚未创建家庭的流失家长 (可主动发邮件提供帮助)
-- --------------------------------------------------------------------
select 
  u.email as "家长邮箱 (Parent Email)",
  u.created_at as "注册时间",
  u.last_sign_in_at as "最后登录时间",
  '已注册但未创建家庭空间 (需轻量邮件跟进与使用指引)' as "跟进建议"
from auth.users u
where (
    u.raw_user_meta_data->>'product_id' = 'shadow-mate'
    or exists (select 1 from public.learning_households h where h.owner_user_id = u.id)
  )
  and not exists (
    select 1 from public.learning_households h 
    where h.owner_user_id = u.id and h.project_id = 'shadow-mate'
  )
order by u.created_at desc;
