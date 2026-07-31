# Security and privacy baseline

Last reviewed: 2026-07-31

## Repository controls

- Public Git history uses GitHub noreply author and committer addresses.
- Pull requests are required for `main`; force pushes and branch deletion are disabled.
- Secret scanning and push protection are enabled.
- CI runs source checks, a production build, artifact checks, and `npm audit`.
- Dependabot alerts, security updates, and weekly version updates are enabled.
- Internal agent directories and local environment files are rejected by the repository security check.

## Application controls

- Supabase dependencies are bundled from the pinned lockfile, not loaded from a runtime CDN.
- Browser sessions use session storage; local learning data has a visible deletion action.
- Security headers include CSP, HSTS, framing protection, a restrictive permissions policy, and no-referrer behavior.
- The public product registry exposes only product ID and display name columns.
- Learning tables deny anonymous access and enforce family membership through RLS.
- Privileged database helper functions live outside the exposed schema and have explicit execution grants.

## Release gate

Before production deployment:

1. `npm run verify` passes.
2. Supabase pgTAP tests and database lint pass locally.
3. A Vercel Preview is tested for login, household isolation, offline behavior, and security headers.
4. Supabase Security Advisor findings are reviewed.
5. GitHub required checks pass and all review conversations are resolved.
6. Production migration and deployment are performed only after the preview is accepted.

## Incident record

On 2026-07-31 the repository history was sanitized to remove personal commit metadata and obsolete personalized identifiers. An unrelated generated tooling branch was removed. No secret credentials were found, so credential rotation was not required.
