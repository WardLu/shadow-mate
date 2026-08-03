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
- Commit `package-lock.json` and pin dependency versions.
- Add explicit PostgreSQL grants and RLS policies in the same migration.
- Run the local Supabase pgTAP tests and database lint for schema changes.
- Never commit credentials, personal data, production exports, `.env`, `.vercel`, local Supabase state, or internal agent/tool configuration.

## 提交前文档一致性闸门

提交代码前必须先核对实现与相关文档，文档不一致时不得提交：

- 检查本次 `git diff` 涉及的用户行为、数据模型、迁移、配置、测试命令、覆盖率、版本号和发布状态。
- 按影响范围同步 `README.md`、`docs/`、`TODO.md`、`ROADMAP.md`、`CHANGELOG.md`、`RELEASE_NOTES.md`、隐私/安全文档和 PR 说明；没有受影响的文档时，在 PR 中说明原因。
- 代码、测试、迁移、配置和对应文档必须作为同一项工作提交并推送，禁止明知文档过期而先提交代码、之后再补文档。
- 提交前至少运行 `git diff --check` 和 `npm.cmd run verify`，并复查暂存区，确认没有遗漏相关文档或把敏感文件一起加入提交。

## GitHub 协作流程

- 本地先运行 `npm.cmd run verify`；涉及端到端流程时，再运行 `npm.cmd run test:e2e`。
- 使用分支提交并推送，保持现有 SSH 远程仓库配置；不需要为每次 PR 重复配置 GitHub CLI。
- 分支推送后，优先使用已连接的 GitHub 插件创建、查看、Review 和合并 PR，避免通过浏览器重复填写表单。
- PR 作者不能批准自己的 PR；需要独立 Review 时邀请其他协作者，管理员按分支保护规则完成合并。
- 若 GitHub 插件返回仓库权限错误，先检查插件是否已授权目标仓库，再重试；不要创建重复 PR，也不要把令牌粘贴到终端或文档中。
- CI 日志不得输出完整 `supabase status`、JWT、数据库密码或其他密钥字段；只保留必要的健康状态和测试结果。

## Privacy review

Any new learner field must document why it is necessary, where it is stored, its retention period, its deletion path, and whether explicit parent/guardian consent is required. Keep the field inventory in [docs/learner-data-lifecycle.md](docs/learner-data-lifecycle.md) and update it in the same change.
