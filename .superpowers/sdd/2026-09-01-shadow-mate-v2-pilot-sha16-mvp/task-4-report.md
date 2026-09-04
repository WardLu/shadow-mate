# Task 4 实现、测试与独立审阅修复报告

日期：2026-09-01

## 结论

Task 4 的独立审阅 findings 已在当前 checkout 修复。anonymous、`profile:<uuid>` 和不同 learner profile 的本机状态继续使用独立 envelope；cloud save、profile switch、migration、hydration、clear/remove failure 均有 scope 或失败保护。既有 RPC、版本冲突重试、`cloudSyncBlocked` 熔断和 analytics 改动保持不变。

## 本轮修改

- `src/local-state.js`
  - 新增仅供显式 anonymous-to-profile migration 使用的 `rebindStateScope()`。
  - 按现有 rotation-v1 assignment identity 重算目标 learner scope 下的 `assignmentId`，同步重映射 canonical assignment 和 completions；普通 `mergeState()` 的跨 scope 拒绝不变。
  - `clear()`、`remove()` 的 storage 失败继续返回 `false`；legacy cleanup 失败时保留 legacy key，但已有 anonymous envelope 优先，后续调用不会重复覆盖迁移结果。
- `src/app.js`
  - `save()` 只在本机写入成功后触发 cloud schedule 并返回结果。
  - `activateScope()`、`replaceState()` 在持久化失败时保留原内存状态；`removePersistenceScope()`、`clearLocalData()` 传播失败，不再错误切换 scope 或清空可恢复状态。
- `src/cloud.js`
  - `isCurrentProfileContext()` 和 `saveCloudState()` 强制 `scope === profilePersistenceScope(profileId)`；anonymous scope 不进入 profile RPC。清除本机前先确认本机清除成功，成功后失效 generation、取消 timer/queued save 并重置 cloud context；进行中的旧请求不能继续冲突重试或触发新 profile RPC。
  - 显式 `migrateLocal: true` 且目标云端 profile 为空时，先对 anonymous rotation 做受约束 scope rebind，再合并到目标 scope；已有 remote 或非空目标不迁移 anonymous。
  - remote hydration 记录目标 scope 激活时的 snapshot；只在目标 scope 在请求期间变脏时，将目标本地状态与同 scope remote 合并，避免覆盖离线修改，也不重新合并之前 learner。
  - learner scope 删除、本机 clear 和 profile switch 的 storage 失败均停止成功路径并显示失败提示。
- `tests/unit/local-state.test.js`
  - 新增 remove/clear failure、legacy cleanup failure 不重复迁移，以及 assignment/completion rebind 和普通跨 scope merge 拒绝回归。
- `tests/e2e/cloud.spec.js`
  - 新增目标 scope hydration 期间保留离线修改、clear 期间失效 in-flight save、clear/remove 失败不报成功；migration payload 断言 rotation scope。

## Finding 收敛记录

1. 之前冲突用例得到 `undefined` 的根因是清除/切换后的本机 scope 没有被 cloud seam 约束；现在 save 开始前和每次 retry 前都核对 profile ID、scope、session、generation，clear 成功会使旧上下文失效。
2. 之前 anonymous rotation 直接 merge 到 profile 会因 `learnerScope` 不兼容而 fail-closed；现在只有显式 migration 调用 rebind，并为 assignments、canonical ID 和 completion ID 做目标 scope 重算。普通跨 scope merge 仍抛出 `incompatible learnerScope`。
3. 之前 hydration 无条件 `replaceState(remoteState)`；现在只把 hydration 开始后目标 scope 的变化与目标 remote 合并，profile A 的状态不会进入 profile B。
4. 之前 app/cloud 忽略 `clear/remove` 返回值；现在本机清除失败保留当前 context，learner 本机 scope 删除失败不更新成功 UI，legacy key 清理失败不会让下一次 legacy 数据覆盖已迁移 anonymous 数据。

## 验证证据

以下 focused 命令均在当前最终工作树运行并退出码为 0：

```text
npm test -- tests/unit/local-state.test.js --run
Test Files  1 passed (1)
Tests       9 passed (9)

npm test -- tests/unit/local-state.test.js tests/unit/learning-state.test.js tests/unit/merge.test.js tests/unit/hanzi-rotation-state.test.js tests/unit/hanzi-worksheet-rotation.test.js --run
Test Files  5 passed (5)
Tests       84 passed (84)

node scripts/run-e2e.mjs tests/e2e/cloud.spec.js -g 'retries after a version conflict|keeps learner A and learner B|hydrates an existing remote profile|preserves target-scope offline edits|migrates only anonymous|clearing local data|does not report success or reset|invalidates an in-flight profile save|deleting one learner|does not report learner deletion|ignores a delayed old-profile|binds cloud saves|returns to local mode' --reporter=line
Running 13 tests using 1 worker
13 passed (14.9s)
```

本轮曾直接调用 `npx playwright test`，因 Vite 自动读取 `.env.local` 而 Playwright helper 使用默认 Supabase URL，导致测试注入的 auth storage key 不一致并出现统一的 signed-out locator failures；改用仓库规定的 `node scripts/run-e2e.mjs` 后，相关 13 条全部通过。这是测试启动方式问题，不是产品实现结果。

## 范围自审

- 仅修改 Task 4 相关实现/测试及本报告：`src/local-state.js`、`src/app.js`、`src/cloud.js`、`tests/unit/local-state.test.js`、`tests/e2e/cloud.spec.js`、`task-4-report.md`。
- `src/app.js`、`src/cloud.js` 中预存 analytics hunks 保留在工作树中，未纳入本次 scoped commit；未修改 Task 2/Task 3 文件及其既有 rotation/state/merge 契约。
- 未触碰 Task 5 视图、stage selection、SM-2、mastery、reviewCount、UI worksheet rendering、content selection、数据库、Supabase migration、语音或 push/deploy/merge/Multica。

## 未验证项与残余风险

- 本轮只重跑相关 cloud E2E 13 条，未重新执行完整 cloud E2E 其余认证用例、完整 `npm run verify` 或 hosted CI。
- 未执行真实 Supabase migration、生产数据操作、部署或真实家庭验收；当前 cloud 证据来自本地 Vite + mock REST/RPC seam。
- 冲突 E2E 保留 remote state 和 scope 回归，rotation assignment/completion 的 rebind 与普通跨 scope 拒绝由 focused unit 覆盖；未新增带两个不同日期候选的冲突 union fixture。
