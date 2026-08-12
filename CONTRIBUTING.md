# Contributing

## Local setup

```powershell
npm.cmd ci
git config core.hooksPath .githooks
git config user.email "YOUR_GITHUB_NOREPLY_ADDRESS"
npm.cmd run verify
```

Get the noreply address from GitHub **Settings → Emails**. Do not use a personal or work mailbox in public commit metadata.

Maintainers may create an ignored `.security-local-denylist` file with one private term per line. The security check scans tracked and untracked candidate files without publishing the denylist itself.

## Required checks

- Use a branch and pull request; do not push directly to `main`.
- Run `npm run verify` before pushing.
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
- 提交前运行 `npm run public:check`、`git diff --cached --check` 和 `npm run verify`，并逐项复查 `git diff --cached --name-status` 与 `git diff --cached`，确认没有把内部、敏感或不必要文件加入提交。
- 推送前重新核对远端仓库可见性、目标分支、PR base/head 和 PR 描述；任何不确定的文件先移出暂存区，不要“先提交再解释”。

## Release 闸门

Release 必须在 Tag 上执行，不把普通 PR 当作发布验收：

1. 先同步 `package.json`、`package-lock.json`、`README.md`、`CHANGELOG.md` 和 `RELEASE_NOTES.md` 的版本号。
2. 在目标 commit 创建匹配的 `vX.Y.Z` Tag；Tag 推送后等待 `Release verification` 全绿。
3. 自动检查版本和 Tag 一致性、发布说明部署清单、最终 `dist`/压缩包的敏感内容、构建产物、第三方资源 SHA-256 和许可证清单。
4. 部署完成后手动运行 `Release production verification`，填写同一个 Tag 和生产 HTTPS 地址，验收首页、Manifest、CSP、HSTS、X-Frame-Options 等响应头。
5. 创建 GitHub Release 前人工核对：Release 页面 Tag 与已验收 Tag 相同；附件来自已扫描的最终压缩包；附件 SHA-256 与本地/CI 记录一致；没有额外未扫描附件。
6. 涉及 Supabase 迁移时，发布人必须在生产 Supabase 确认目标迁移已执行，再在发布说明记录结果；自动化测试不等于生产迁移已完成。

普通项目复用这套流程时，只复制通用闸门；在 `release-gate.config.json` 中按项目调整产物目录、第三方资源、发布说明标记和生产响应头，不要照搬影伴的 Piper、Vercel 或 Supabase 假设。

### 已误推送时的兜底

立即停止继续推送；保留本地备份引用；检查是否包含密钥、个人数据或内部材料；关闭或暂停 PR；从干净的公开 base 重建分支，移除不适合公开的文件和提交，再强制更新远端分支。密钥或个人数据一旦出现，应立即轮换/删除并按安全事件流程处理；历史对象和缓存可能仍需向托管平台申请清理。

## GitHub 协作流程

- 本地先运行 `npm.cmd run verify`；涉及端到端流程时，再运行 `npm.cmd run test:e2e`。
- 使用分支提交并推送，保持现有 SSH 远程仓库配置；不需要为每次 PR 重复配置 GitHub CLI。
- 分支推送后，优先使用已连接的 GitHub 插件创建、查看、Review 和合并 PR，避免通过浏览器重复填写表单。
- PR 作者不能批准自己的 PR；需要独立 Review 时邀请其他协作者，管理员按分支保护规则完成合并。
- 若 GitHub 插件返回仓库权限错误，先检查插件是否已授权目标仓库，再重试；不要创建重复 PR，也不要把令牌粘贴到终端或文档中。
- CI 日志不得输出完整 `supabase status`、JWT、数据库密码或其他密钥字段；只保留必要的健康状态和测试结果。

## Privacy review

Any new learner field must document why it is necessary, where it is stored, its retention period, its deletion path, and whether explicit parent/guardian consent is required. Update `PRIVACY.md` and the relevant migration/tests in the same change.
