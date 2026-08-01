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

## Privacy review

Any new learner field must document why it is necessary, where it is stored, its retention period, its deletion path, and whether explicit parent/guardian consent is required. Keep the field inventory in [docs/learner-data-lifecycle.md](docs/learner-data-lifecycle.md) and update it in the same change.
