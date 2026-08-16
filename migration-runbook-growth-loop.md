# 生产迁移 Runbook：Growth Loop MVP（草案）

> 适用范围：Shadow Mate Growth Loop MVP 的 13 条新增迁移提案。
> 本仓库对共享数据库是 `proposal-only`：**不从这里执行生产迁移**。canonical 迁移文件、审批、发布与台账由 `shadow-portal/supabase/control-plane` 管理。本 runbook 供控制面审批与执行时使用，属内部运维材料，不进公开仓库。

## 0. 变更范围

新增迁移（相对已部署生产基线，均为 `shadow-mate` 项目下的 `learning_*` schema）：

| # | 迁移文件 | 主要动作 | 依赖 |
|---|---|---|---|
| 1 | `20260814084607_growth_loop_foundation.sql` | `learning_point_items` / `learning_profile_point_items` / `learning_point_ledger` 表 + 基础索引 + RLS | 已有 `learning_profiles` |
| 2 | `20260814085701_growth_loop_points_indexes.sql` | 积分表 scope 索引 | 1 |
| 3 | `20260814090121_growth_loop_rewards.sql` | `learning_rewards` / `learning_profile_rewards` / `learning_redemptions` + 对 ledger 加外键 | 1 |
| 4 | `20260814090652_growth_loop_rewards_indexes.sql` | 兑换表 scope 索引 | 3 |
| 5 | `20260814094058_growth_loop_activity_events.sql` | `private.learning_activity_events` + `learning_record_activity_event` RPC + RLS | 独立 |
| 6 | `20260814101037_growth_loop_point_dates.sql` | ledger 增加 `occurred_on` + `learning_record_points` RPC | 1 |
| 7 | `20260814101235_growth_loop_activity_event_indexes.sql` | 事件表 actor/scope 索引 | 5 |
| 8 | `20260814101420_growth_loop_point_rpc_compatibility.sql` | 重建 `learning_record_points`（先 drop 再 create） | 6 |
| 9 | `20260816115000_growth_loop_opening_balance.sql` | 重建 ledger `delta` check 约束（仅 `initial_balance` 放宽到 ±1000000）+ `learning_confirm_opening_balance` | 1 |
| 10 | `20260816120000_growth_loop_beta_batches.sql` | `private.learning_beta_batches` + RLS | 独立 |
| 11 | `20260816121000_growth_loop_funnel_aggregation.sql` | `private.learning_growth_days` 视图 + `learning_funnel_status` / `learning_funnel_report` / `learning_wmgh_weekly` | 1, 10 |
| 12 | `20260816122000_growth_loop_activity_cleanup.sql` | `private.learning_purge_activity_events`（默认 180 天） | 5 |

> 说明：#8 依赖 #6（先存在旧签名函数才能 drop）；#11 的漏斗视图依赖 #10 的 beta_batches 与 #1 的 ledger。#9 的约束重建是**就地改 check 约束**，属 DDL，需在低峰执行并观察锁。

## 1. 执行前（Pre-flight）

- [ ] 确认控制面台账中 Shadow Mate 已登记迁移与该列表一致，无缺失、无额外文件。
- [ ] 逐文件计算 SHA-256，与控制面登记指纹核对，确认与本仓库 `supabase/migrations/` 一致。
- [ ] 在 staging / 隔离副本上 `supabase db query` 逐个 dry-run 全部 12 个文件，确认无报错、无依赖缺失（本仓库本地已全量跑通：pgTAP 241/241）。
- [ ] 检查生产迁移台账中是否已有同时间戳（`20260816xxxx` 段）的其他项目迁移；共享库按串行执行，避免时间戳冲突。
- [ ] 确认生产 `learning_point_ledger` 上现有 `delta` check 约束名（#9 会按名字匹配并 drop 后重建；若名字不在预期集合，暂停并人工确认）。
- [ ] 确认维护窗口与回滚负责人；记录执行前 `supabase_migrations.schema_migrations` 快照。

## 2. 逐项执行清单

按编号顺序**串行**执行，每项执行前 `begin` 语义记录，执行后立即验证：

1. `growth_loop_foundation` → 验证 3 张表存在、RLS 开启。
2. `growth_loop_points_indexes` → 验证索引存在。
3. `growth_loop_rewards` → 验证 3 张表 + ledger 外键。
4. `growth_loop_rewards_indexes` → 验证索引。
5. `growth_loop_activity_events` → 验证 `private` 表 + RLS + RPC 存在。
6. `growth_loop_point_dates` → 验证 `occurred_on` 列 + RPC 存在。
7. `growth_loop_activity_event_indexes` → 验证索引。
8. `growth_loop_point_rpc_compatibility` → 验证 RPC 签名（drop+create 后无残留旧定义）。
9. `growth_loop_opening_balance` → **低峰执行**；验证新约束存在、`learning_confirm_opening_balance` 存在。
10. `growth_loop_beta_batches` → 验证表 + RLS。
11. `growth_loop_funnel_aggregation` → 验证视图 + 3 个函数；抽查 `learning_funnel_status()` 返回结构。
12. `growth_loop_activity_cleanup` → 验证 purge 函数存在。

每项之间核对：该文件对应的 pgTAP 测试（`supabase/tests/growth_loop_*`）在等价 staging 库通过。

## 3. 前向修复（Forward-fix）

- 失败原则：**失败即停**，先回看日志定位，不做猜测性重试。
- 幂等性：所有 `create table if not exists` / `create or replace` / `create index if not exists` 可安全重跑；#8 的 `drop function if exists` + `create function` 重跑安全；#9 的约束重建按“先 drop 再 add”设计，重跑时 `add constraint` 若已存在会失败 —— 重跑前先确认约束已 drop 成功。
- 若 #9 因约束名不匹配未执行任何改动，直接修正匹配条件后重试，不需要回滚。
- 修复迁移优先以新的后续迁移文件提交，经控制面审批后追加执行，不改历史文件。

## 4. 暂停与回滚

- **暂停条件**：任一步验证失败、错误率/响应时间异常、锁等待超阈值、确认数据不一致。
- **暂停动作**：立即停止后续迁移执行；保留已执行部分（每项原子完成，半执行状态不允许继续）。
- **回滚条件**：已执行迁移导致生产行为异常且前向修复不可行。
- **回滚动作**：
  - 数据型迁移（建表、建索引、RPC 定义）回滚 = 保留表 + 撤销引用（前端已上线前的窗口内，业务未写新表则无害）；可 `drop function` / `drop index`，`drop table` 前必须备份并确认无业务写入。
  - #9 若需回滚：恢复旧的 `delta` 约束定义（±1000），并确保无 `initial_balance` 行残留（回滚前查询确认）。
  - 从迁移台账删除未执行的排队项，不 repair 已登记项；如需更正历史，走控制面人工审批。
- **回滚验证**：核对 `schema_migrations` 与 staging 一致，恢复 RLS/权限基线，业务回归。

## 5. 验证与收尾

- [ ] 12 条迁移全部在 `schema_migrations` 登记且生产结构检查通过。
- [ ] 前端部署后验证：积分项/期初积分/奖励兑换/音效在真实账号可用。
- [ ] 观测 `learning_activity_events` 写入、漏斗视图查询与错误率 15-30 分钟。
- [ ] 更新控制面台账与发布记录。
