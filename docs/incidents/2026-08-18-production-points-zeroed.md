# 事故记录：2026-08-18 未完成测试的功能进入生产，用户积分显示被清零

- **严重级别**：P1（生产环境错误版本上线 + 用户可见数据异常）
- **状态**：已解决（期初积分迁移已生产执行，v1.3.9 正式发布上线，受影响用户可确认一次恢复积分）
- **关联 issue**：SHA-12

## 概要

2026-08-18 17:59（+0800），`production` 分支在 PR #43（SHA-4 Growth Loop MVP 集成）合入 main 的同一秒被更新至 `e3a3ff0` 并进入生产部署，绕过了全部发布闸门。该版本包含两个尚未完成发布前置条件的改动：

1. **积分模块重写**：旧积分被迁移进 envelope 的 `legacy.points_readonly` 冻结只读，新账本从 0 开始；负责结转旧积分的「期初积分」功能留在未合并的 PR #44，未随本次发布上线。已打开新版的用户看到积分归零。
2. **期初积分功能缺失**：负责把旧积分结转进新账本的「期初积分」RPC 与前端流程留在未合并的 PR #44（其数据库迁移 `20260816120000_growth_loop_opening_balance.sql` 也未部署），因此已打开新版的用户积分显示为 0。

Growth Loop 核心 8 条迁移（`supabase/migrations/20260814*_growth_loop_*.sql`）已于部署前 54 分钟（17:05，Shadow Portal PR #52）经控制面登记并执行，自定义积分项/成长项目的后端表与 RPC 在生产 schema 上是就绪的；本次事故真正缺的后端只有期初积分这一条迁移。

同时，该版本的 e2e 验证未完成（growth-loop e2e 等仍在验证中），不满足 Release 闸门要求。

## 影响与数据安全

- **用户可见影响**：已打开新版的用户积分显示为 0；自定义积分项/成长项目的云同步持续失败。
- **数据未丢失**：旧积分保留在 envelope 的 `legacy.points_readonly`（本地 `shadow_mate_learning_v2:*` 存储 + 云端 `learning_profile_states` envelope 快照）。v1.3.8 的 `mergeState` 以远端为基底深度合并，回滚后即使旧版本继续同步，云端 envelope 中的 `legacy.points_readonly` 也不会被覆盖清除。
- 本地 IndexedDB Growth Loop 数据不受回滚影响。

## 时间线（+0800）

| 时间 | 事件 |
| --- | --- |
| 08-16 | SHA-7（期初积分 RPC + 学习包启停）完成并开 PR #44，CI 全绿，等待合并 |
| 08-18 17:05 | Shadow Portal PR #52 合并：Growth Loop 核心 8 条迁移经控制面登记并执行 |
| 08-18 17:59 | PR #43 合入 main；同一秒 `production` 被指向 `e3a3ff0`，未经 Release 流程 |
| 08-18 21:5x | 用户反馈积分被清零（SHA-12） |
| 08-18 22:09 | 排查定位三个根因（见 SHA-12 评论） |
| 08-18 22:35 | PR #55 合入：release-to-production 工作流 + production 分支 ruleset 保护 |
| 08-18 23:0x | `production` 回滚至 `e14f4a7`（v1.3.8），ruleset 保护恢复 |

## 根因

1. **发布闸门被绕过**：`production` 分支当时无任何保护规则，一次手动 push（或部署配置直接跟踪 main）即可将未完成验证的 commit 推上生产。最新 GitHub Release 停留在 v1.3.8，`release.yml` 的 Release verification 从未运行，CONTRIBUTING 中「涉及 Supabase 迁移必须先确认迁移已执行再发布」的要求被跳过。
2. **跨 PR 依赖没有发布检查**：PR #43 依赖 PR #44 的期初积分功能与 growth_loop 数据库迁移，但两者都不在其合并范围内；发布时无人核对「本版本前端调用的表/RPC 是否已在生产 schema 就绪」。
3. **跨 PR 依赖在控制面执行与前端发布两端都没有核对**：控制面 #52 执行了 8 条核心迁移，但没人核对「前端本次发布还依赖哪些未部署对象」——期初积分迁移（在未合并的 PR #44 中）同时被两个流程遗漏。

## 已采取的措施

- **止血**：`production` 分支回滚至 `e14f4a7`（v1.3.8 tag）。回滚前短暂暂停 ruleset、回滚后立即恢复（维护者 force-with-lease 路径，见 CONTRIBUTING）。
- **流程加固（PR #55）**：`production` 分支 ruleset 保护（PR 必须 1 审查、禁止 force push 与删除）；`release-to-production.yml` 仅在 GitHub Release 发布后严格快进 production；GITHUB_TOKEN 降为只读。
- **积分恢复第一步**：合入 PR #44（期初积分受控 RPC + 前端确认流程），代码进入 main，等待上述迁移部署后随正式 Release 发布。

## 后续行动（已基本完成）

1. ✅ 期初积分迁移 `20260816120000_growth_loop_opening_balance.sql` 于 2026-08-19 经 Shadow Portal 控制面在生产执行并登记 `applied`（`schema_migrations` statement_count=7；函数/约束/ACL 核验通过，见控制面台账）。生产 schema 就绪后，包含 Growth Loop 的 v1.3.9 已于 2026-08-19 正式发布并上线（production 指向 `54c6cb1`，`release-to-production` 工作流快进成功，线上已确认包含期初积分恢复功能）。
2. 发布 checklist 增加跨 PR 依赖核对项：确认本版本前端调用的全部表与 RPC 已在生产 schema 存在。（流程项，待随发布 checklist 修订落地）
3. 端到端验证期初积分结转并通知受影响用户通过「期初积分」恢复旧积分：待受影响用户打开 v1.3.9 后由家长确认一次完成，恢复入口已随 v1.3.9 上线。

## 经验教训

- 分支保护必须先于首次生产部署存在，而不是事故之后补。
- 「功能拆 PR」时，发布范围必须以 PR 依赖关系核对，不能只看单 PR 是否绿灯。
- proposal-only 的数据库迁移与前端发布之间需要一个强制核对点（Release 闸门已写入 CONTRIBUTING，需在流程中真正执行）。
