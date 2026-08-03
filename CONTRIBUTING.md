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

## GitHub 协作流程

- 本地先运行 `npm.cmd run verify`；涉及端到端流程时，再运行 `npm.cmd run test:e2e`。
- 使用分支提交并推送，保持现有 SSH 远程仓库配置；不需要为每次 PR 重复配置 GitHub CLI。
- 分支推送后，优先使用已连接的 GitHub 插件创建、查看、Review 和合并 PR，避免通过浏览器重复填写表单。
- PR 作者不能批准自己的 PR；需要独立 Review 时邀请其他协作者，管理员按分支保护规则完成合并。
- 若 GitHub 插件返回仓库权限错误，先检查插件是否已授权目标仓库，再重试；不要创建重复 PR，也不要把令牌粘贴到终端或文档中。
- CI 日志不得输出完整 `supabase status`、JWT、数据库密码或其他密钥字段；只保留必要的健康状态和测试结果。

## Privacy review

Any new learner field must document why it is necessary, where it is stored, its retention period, its deletion path, and whether explicit parent/guardian consent is required. Keep the field inventory in [docs/learner-data-lifecycle.md](docs/learner-data-lifecycle.md) and update it in the same change.
