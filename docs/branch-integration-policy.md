# Shadow Mate 分支集成与生产回灌策略

## 目标

Shadow Mate 允许功能开发、生产 hotfix、线上排障和文档维护并行进行，但必须保证长期开发分支不会在不知情的情况下脱离当前产品基线。

## 分支职责

- `main` 是唯一开发集成主线，也是普通 Pull Request 的默认目标。
- `preview` 是长期预发布与真实设备验收线，对应 Vercel 的 Preview 环境和 `preview-sm.shadow.wang`；它不是生产分支，也不承载正式 Release tag。
- `production` 只表示已部署或待发布的生产版本线，不作为日常开发主线。
- `codex/*`、`feature/*` 和 hotfix 分支承载独立工作，创建时应以最新 `main` 为基线。

Preview 验收流程：

1. 功能分支完成开发与针对性验证后，合并或同步到 `preview`。
2. 推送 `preview` 会触发 Vercel Preview 部署，并由 CI 执行构建、测试、安全与共享数据库策略检查。
3. 使用 `preview-sm.shadow.wang` 完成桌面、移动端和真实设备验收。
4. 验收通过后，再按普通 PR 与 Release 流程进入 `main`；tag、`production` 分支和正式部署仍使用独立门禁。

`preview` 只允许作为预发布验收边界使用。它不会自动创建 GitHub Release、版本 tag 或生产部署。

生产 hotfix 完成后，必须同时完成两件事：

1. 按生产发布流程完成必要的部署、回滚或观察；
2. 将同一修复回灌 `main`，并保留对应回归测试。

如果生产 hotfix 尚未回灌 `main`，任何受影响的开发分支都标记为 `integration-required`，不能假设未来 PR 会自动保留该修复。

## 什么时候同步 `main`

不要求每个提交都同步，但以下节点必须检查并在需要时集成最新 `main`：

- 创建长期功能分支时；
- 生产 hotfix 或主线变更触及当前功能的文件、接口、认证、同步、数据结构、导航架构或公开文档时；
- 开始本地验收前；
- 创建或更新 PR 前。

同步前先读取分支新鲜度和文件重叠报告。工作树有未提交改动时，不在原目录直接 merge/rebase，使用隔离 worktree 做集成。

## 新鲜度检查

本地使用：

```bash
npm run check:integration
```

该命令只读本地 Git refs，不自动 fetch、不切换分支、不修改文件。默认比较当前 `HEAD` 与 `origin/main`，报告：

- 当前分支与比较基线；
- 共同祖先；
- 当前分支独有和基线独有的提交数；
- 两边从共同祖先开始修改的重叠文件；
- 是否需要集成。

PR 门禁使用严格模式：

```bash
node scripts/check-integration.mjs --base <pull-request-base-sha> --strict
```

严格模式要求 PR head 已包含目标基线；它不替代代码审查，也不替代冲突解决和功能测试。

## 变更分类

- `code_only`：只影响当前功能且无共享契约变化；可在 PR 前集中集成。
- `integration_required`：影响认证、同步、数据契约、导航架构、公共配置、安全或同一文件；应在本地验收前集成。
- `release_only`：只涉及发布编排或产物；不应反向覆盖功能分支。
- `migration_only`：数据库提案和生产迁移继续遵循 Shadow Portal 的独立门禁，不通过本仓库的分支合并推断已执行。

## PR 检查清单

每个 PR 必须明确：

- 使用的目标基线和 SHA；
- 是否检查了生产 hotfix 回灌 `main`；
- 是否存在重叠文件以及如何解决；
- 运行了哪些与变更边界匹配的验证；
- 未验证的项目和残余风险。

## 防止架构契约漂移

跨模块架构决策必须同时更新实现、E2E 契约测试和相关文档。例如统一学习模块需要锁定“首页、学习、积分、成长、指南”的一级导航，以及四科位于“学习”模块内部。该契约测试应随统一学习模块的集成 PR 一并补齐，不能继续让旧的四科一级导航测试作为正确标准。
