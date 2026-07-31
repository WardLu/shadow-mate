# Security Policy

## Reporting a vulnerability

Please do not disclose vulnerabilities in a public issue, discussion, pull request, or commit.

Use the repository's **Security → Report a vulnerability** flow to open a private GitHub Security Advisory. Include the affected version, reproduction steps, expected impact, and any suggested mitigation. Maintainers will acknowledge a complete report within seven days and coordinate disclosure after a fix is available.

## Supported version

Only the latest commit on `main` is supported. Preview deployments and development branches are not production releases.

## Security boundaries

- Browser code may contain a Supabase publishable key; it must never contain a secret or service-role credential.
- All family and learner authorization is enforced by PostgreSQL grants and RLS, not by UI visibility.
- Do not commit `.env`, `.vercel`, local Supabase state, personal data, internal agent configuration, or production exports.
- Run `npm run verify` before every push. The repository hooks and GitHub checks enforce the same baseline.
