# Contributing

## Local setup

```powershell
npm.cmd ci
git config core.hooksPath .githooks
git config user.email "YOUR_GITHUB_NOREPLY_ADDRESS"
npm.cmd run test:fast
```

Get the noreply address from GitHub **Settings → Emails**. Do not use a personal or work mailbox in public commit metadata.

Maintainers may create an ignored `.security-local-denylist` file with one private term per line. The security check scans tracked and untracked candidate files without publishing the denylist itself.

本地和 Preview 环境禁止静默连接生产 Supabase。开发前应在未提交的 `.env.local` 中配置 loopback
`VITE_SUPABASE_URL` 与本地 publishable key；缺少 key 时应用必须保持本机模式。只有明确授权的临时
生产验收才允许设置 `VITE_SHADOW_ALLOW_PRODUCTION_SUPABASE=1`，并且该变量不能提交到仓库或写入
自动化默认环境。

## 测试范围与分层

先写清本次改动的范围、明确不做什么、验收条件和受影响边界，再按风险选择最小充分的验证层级。开发循环不要求每次小改动都运行全量测试；合并、发布和高风险边界仍必须经过完整门禁。

| 层级 | 适用场景 | 命令 |
| --- | --- | --- |
| 静态 | 文档、文案、低风险 CSS 或静态检查 | `npm run check` |
| 快速 | 纯逻辑、数据模型、控制器 | `npm run test:fast` |
| 页面 | 导航、设置、PWA、离线和可见交互 | `npm run test:ui`，或运行指定 E2E 文件 |
| 集成 | Supabase schema/RLS、Functions、认证、同步、导出/删除 | `npm run test:db`、`npm run test:functions`，以及受影响的 E2E |
| 完整 | 合并前、发布前、依赖/公开资源或高风险边界 | `npm run test:full` |

`test:fast` 当前包含全部 unit test 和 `check`，它是比浏览器/数据库测试更快的项目级入口，但不是 changed-only 测试。`verify` 负责公开范围、安全检查、静态检查、构建和覆盖率，不包含数据库、Functions 或 E2E；`test:full` 只在合并、发布或高风险边界运行。PR 必须记录实际选择的层级、命令、结果，以及未运行或被环境阻塞的检查。

## Required checks

- Use a branch and pull request; do not push directly to `main`.
- Before pushing, run the smallest sufficient layer for the changed surface; source/build/public-resource changes require `npm run verify`, with database, Functions and E2E layers added when affected. Run `npm run test:full` before merge or release.
- For a release tag, run `npm run build` followed by `npm run release:check`; the tag workflow repeats this against the final archive.
- Commit `package-lock.json` and pin dependency versions.
- Add explicit PostgreSQL grants and RLS policies in the same migration.
- Run the local Supabase pgTAP tests and database lint for schema changes.
- Never commit credentials, personal data, production exports, `.env`, `.vercel`, local Supabase state, or internal agent/tool configuration.

## Public repository boundary

- This repository contains the public application, its tests, public documentation and the notices required for included third-party assets.
- Do not add prompts, private model weights, premium content, API secrets, production exports, private service implementation, internal legal reviews, commercial plans or private agent/tool configuration.
- Record the source, version/commit, license and redistribution terms for every vendored asset in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- Keep local plans, legal notes, customer information and deployment records outside the repository. Use the local ignored planning files only for local work.

## 提交前公开性与文档一致性闸门

提交代码前必须先核对实现与相关文档，文档不一致时不得提交：

- 检查本次 `git diff` 涉及的用户行为、数据模型、迁移、配置、测试命令、覆盖率、版本号和发布状态。
- 按影响范围同步 `README.md`、公开 `docs/`、`CHANGELOG.md`、`RELEASE_NOTES.md`、隐私/安全文档和 PR 说明；内部计划、法律记录和发布闸门不得放入公开目录。
- 代码、测试、迁移、配置和对应文档必须作为同一项工作提交并推送，禁止明知文档过期而先提交代码、之后再补文档。
- 提交前运行 `npm run public:check`、`git diff --cached --check` 和与改动范围匹配的测试层，并逐项复查 `git diff --cached --name-status` 与 `git diff --cached`，确认没有把内部、敏感或不必要文件加入提交；合并前或发布前补齐 `npm run test:full`。
- 推送前重新核对远端仓库可见性、目标分支、PR base/head 和 PR 描述；任何不确定的文件先移出暂存区，不要“先提交再解释”。

## Release 闸门

Release 必须在 Tag 上执行，不把普通 PR 当作发布验收：

1. 先同步 `package.json`、`package-lock.json`、`README.md`、`CHANGELOG.md` 和 `RELEASE_NOTES.md` 的版本号。
2. 在目标 commit 创建匹配的 `vX.Y.Z` Tag；Tag 推送后等待 `Release verification` 全绿。
3. 自动检查版本和 Tag 一致性、发布说明部署清单、最终 `dist`/压缩包的敏感内容、构建产物、第三方资源 SHA-256 和许可证清单。
4. 创建 GitHub Release 前人工核对：Release 页面 Tag 与已验收 Tag 相同；附件来自已扫描的最终压缩包；附件 SHA-256 与本地/CI 记录一致；没有额外未扫描附件。
5. GitHub Release 发布后自动部署：`Deploy release to production` 将 `production` 分支指针快进到该 Tag 的 commit（只快进、不 force、不并入 `main` 开发内容），Vercel 的 Branch Tracking 随之触发生产构建与部署。
6. 部署完成后手动运行 `Release production verification`，填写同一个 Tag 和生产 HTTPS 地址，验收首页、Manifest、CSP、HSTS、X-Frame-Options 等响应头。
7. 涉及 Supabase 迁移时，发布人必须在生产 Supabase 确认目标迁移已执行，再在发布说明记录结果；自动化测试不等于生产迁移已完成。

### production 分支与生产部署

`production` 是纯指针分支：内容 = 最近一次发布的 commit，只被 `.github/workflows/release-to-production.yml` 更新，不在其上直接提交或合并 `main` 开发内容。

- **触发**：GitHub Release 发布（`release: published`）后自动快进；需要补发/重跑时可手动 `workflow_dispatch` 指定同一个 Tag（同样只允许 fast-forward）。
- **安全**：只允许 strict fast-forward——目标 commit 必须是当前 `production` 指针的后代，否则工作流失败并明确报错，绝不 force。发布前仍需先通过 `Release verification`（见上第 2、3 条），创建 GitHub Release 即代表该 Tag 已验收。
- **回滚**：生产异常时把 `production` 指针退回上一个已验收 Tag。回滚无法快进，需维护者手动执行 `git push --force-with-lease origin <上一个vX.Y.Z>^{commit}:production`，随后可运行 `Release production verification` 复核恢复后的站点。
- **分支保护**：`production` 已启用仓库 ruleset 保护，不允许无门禁直接推送。工作流通过专用 deploy key（Actions secret `PRODUCTION_DEPLOY_KEY`，SSH，仅本仓库写权限）更新指针，deploy key 在 `require_pull_request`（1 个审查）规则下作为 bypass actor；同时 `non_fast_forward`（禁止 force push，仅 admin 可 force 以支持回滚）与 `deletion`（禁止删除）规则独立生效。`GITHUB_TOKEN` 在本工作流中为只读，无法触碰 `production`；新增任何写入 `production` 的通道前，先确认其已加入对应 ruleset 的允许 bypass 集合。

普通项目复用这套流程时，只复制通用闸门；在 `release-gate.config.json` 中按项目调整产物目录、第三方资源、发布说明标记和生产响应头，不要照搬影伴的 Piper、Vercel 或 Supabase 假设。

### 已误推送时的兜底

立即停止继续推送；保留本地备份引用；检查是否包含密钥、个人数据或内部材料；关闭或暂停 PR；从干净的公开 base 重建分支，移除不适合公开的文件和提交，再强制更新远端分支。密钥或个人数据一旦出现，应立即轮换/删除并按安全事件流程处理；历史对象和缓存可能仍需向托管平台申请清理。

## GitHub 协作流程

- 本地先运行 `npm.cmd run test:fast`；涉及页面交互时，再运行 `npm.cmd run test:ui`；涉及数据库、认证或同步时，补充对应集成测试。合并前按风险矩阵运行 `npm.cmd run test:full`。
- 使用分支提交并推送，保持现有 SSH 远程仓库配置；不需要为每次 PR 重复配置 GitHub CLI。
- 分支推送后，优先使用已连接的 GitHub 插件创建、查看、Review 和合并 PR，避免通过浏览器重复填写表单。
- PR 作者不能批准自己的 PR；需要独立 Review 时邀请其他协作者，管理员按分支保护规则完成合并。
- 若 GitHub 插件返回仓库权限错误，先检查插件是否已授权目标仓库，再重试；不要创建重复 PR，也不要把令牌粘贴到终端或文档中。
- CI 日志不得输出完整 `supabase status`、JWT、数据库密码或其他密钥字段；只保留必要的健康状态和测试结果。

## PR 合并顺序与发布流程

Growth Loop MVP 期间，多条 PR 相互依赖并存在合并顺序约束。本节随代码版本化，是合并顺序的权威说明（第 1 层）；实时状态以协调任务 SHA-4 为准（第 2 层）；执行按本顺序人工合并（第 3 层）。只记录已实现、已上线的状态，不提前宣称未完成的能力。

### 当前合并顺序

按以下顺序合并，前序完成后进行后序：

1. **#47 `feat/email-templates`** 与 **#48 `feat/shared-supabase-routing`**——由已关闭的 #40 拆分而来，各自基于 `main`，可先行合并。
2. **#43 `feat/growth-loop-integration`**——在 #47/#48 合入 `main` 之后合并。
3. **#44/#45/#46**——基于 #43 分支的 growth-loop 叠加 PR 栈，最后按序合并。

### 叠加 PR 栈去重说明

#43 重放了与 #48 同源的共享 Supabase 测试路由提交（`feat(supabase): route local tests through shared host`、`chore(ci): 共享 Supabase 本地测试路由与测试层级约定`）。这是正常的叠加 PR 栈：先合并 #48 再合并 #43 时，git 会识别这些提交已应用，不会重复应用或产生冲突，无需手工去重。

### 合并门槛

- **#43 保持 Draft**，直至其新增的 8 个 `growth_loop_*` 迁移经 Shadow Portal 控制面登记并执行到生产，之后才允许合并；不做前端先行（frontend-first）。
- **执行层**：MVP 阶段不启用 GitHub Merge Queue，按上述顺序人工合并；合并前仍须通过对应的完整门禁（见「Required checks」与「Release 闸门」）。

## Privacy review

Any new learner field must document why it is necessary, where it is stored, its retention period, its deletion path, and whether explicit parent/guardian consent is required. Update `PRIVACY.md` and the relevant migration/tests in the same change.
