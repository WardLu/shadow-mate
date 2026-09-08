-- ==============================================================================
-- Shadow Mate 数据库运维脚本：安全排查并清理由于早期并发提交产生的重复冗余家庭
-- ==============================================================================
-- 
-- 【背景与根因分析】
-- 在 2026-08-02 14:59:15 ~ 14:59:21 UTC 期间，前端表单尚未集成按钮防抖与锁定保护。
-- 当时家长在网络加载过程中几秒内连续点击提交，导致客户端并发发起了 8 次
-- 独立的 UUID 生成与 learning_households 插入请求：
-- 
-- 1. 主活跃家庭 (必须保留)：
--    - household_id: '90daa0ca-bc5d-49d0-97df-592c6356ff91' (名称: LU)
--    - 孩子: 'lucas lu' (累计打卡 26 天，最后同步 2026-09-03)
-- 
-- 2. 早期关联家庭 (0天打卡，仅建档当天同步过一次)：
--    - household_id: 'f824ce1b-486c-44f3-9feb-1b8048a2dc47' (名称: LU)
--    - 孩子: 'robin lu' (累计打卡 0 天，最后同步 2026-08-02 15:14)
-- 
-- 3. 6 个并发未完成的“幽灵空家庭” (无孩子、无打卡、无同步)：
--    - '07863981-99ba-438f-960a-9467be128a13'
--    - 'e0051577-9ea7-4aaa-9ce2-870c59533b0f'
--    - 'e659ef81-91f3-492c-b2a1-c4ca007a3e78'
--    - '08b5dbc2-0300-40dd-ac20-69923129bfc2'
--    - 'f6bc5d81-52d1-4e0b-b7be-7df8f5302e07'
--    - '3c004e5d-4344-4b96-8a35-c210ae6796ea'
-- 
-- 【使用说明】
-- 请在 Supabase 控制台的 SQL Editor 中打开此脚本，将下面的 TARGET_PARENT_EMAIL 变量
-- 替换为您要排查的家长邮箱（例如老婆账号对应的邮箱），然后分步执行。
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 第一步：执行前核对（只读 SELECT，确认指定家长名下的所有家庭数据分布）
-- ------------------------------------------------------------------------------
-- 提示：请将下方的 'parent@example.com' 替换为真实家长邮箱后执行：
select 
  h.id as household_id,
  h.name as household_name,
  h.created_at as household_created_at,
  count(p.id) as profile_count,
  string_agg(p.display_name, '、') as learner_names
from public.learning_households h
left join public.learning_profiles p on p.household_id = h.id
where h.owner_user_id = (select id from auth.users where email = 'parent@example.com')
  and h.project_id = 'shadow-mate'
group by h.id, h.name, h.created_at
order by h.created_at desc;


-- ------------------------------------------------------------------------------
-- 第二步【方案 A - 推荐】：将 robin lu 档案合并到主家庭中，删除其余 7 个冗余家庭
-- （适用于：robin 与 lucas 为同一个家庭的两个孩子，希望在同一个家庭空间下一起管理）
-- ------------------------------------------------------------------------------
-- 提示：请将下方的 'parent@example.com' 替换为真实家长邮箱后执行：
begin;

-- 1. 将 robin lu 的档案归属安全更新为主家庭 90daa0ca
update public.learning_profiles
set household_id = '90daa0ca-bc5d-49d0-97df-592c6356ff91'
where display_name = 'robin lu'
  and household_id = 'f824ce1b-486c-44f3-9feb-1b8048a2dc47'
  and exists (
    select 1 from public.learning_households
    where id = '90daa0ca-bc5d-49d0-97df-592c6356ff91'
      and owner_user_id = (select id from auth.users where email = 'parent@example.com')
  );

-- 2. 删除其余 7 个冗余家庭（外键约束 on delete cascade 会自动级联删除对应的空成员与授权记录）
delete from public.learning_households
where id in (
  'f824ce1b-486c-44f3-9feb-1b8048a2dc47',
  '07863981-99ba-438f-960a-9467be128a13',
  'e0051577-9ea7-4aaa-9ce2-870c59533b0f',
  'e659ef81-91f3-492c-b2a1-c4ca007a3e78',
  '08b5dbc2-0300-40dd-ac20-69923129bfc2',
  'f6bc5d81-52d1-4e0b-b7be-7df8f5302e07',
  '3c004e5d-4344-4b96-8a35-c210ae6796ea'
)
and owner_user_id = (select id from auth.users where email = 'parent@example.com')
and project_id = 'shadow-mate';

commit;


-- ------------------------------------------------------------------------------
-- 第二步【方案 B - 备选】：如果 robin lu 仅是早期的测试名称，直接删除其余 7 个家庭
-- （注意：方案 A 与 方案 B 二选一执行即可，若已执行方案 A 则跳过方案 B）
-- ------------------------------------------------------------------------------
/*
begin;

-- 提示：请将下方的 'parent@example.com' 替换为真实家长邮箱后执行：
delete from public.learning_households
where id != '90daa0ca-bc5d-49d0-97df-592c6356ff91'
  and owner_user_id = (select id from auth.users where email = 'parent@example.com')
  and project_id = 'shadow-mate';

commit;
*/


-- ------------------------------------------------------------------------------
-- 第三步：清理后校验（只读 SELECT，确认只剩 1 个家庭，且 lucas lu 数据完整）
-- ------------------------------------------------------------------------------
-- 提示：请将下方的 'parent@example.com' 替换为真实家长邮箱后执行：
select 
  h.id as household_id,
  h.name as household_name,
  u.email as parent_email,
  count(p.id) as profile_count,
  string_agg(p.display_name, '、') as learner_names,
  max(s.updated_at) as last_sync_at
from public.learning_households h
join auth.users u on u.id = h.owner_user_id
left join public.learning_profiles p on p.household_id = h.id
left join public.learning_profile_states s on s.profile_id = p.id
where u.email = 'parent@example.com'
  and h.project_id = 'shadow-mate'
group by h.id, h.name, u.email;
