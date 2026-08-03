# Security and privacy baseline

Last reviewed: 2026-08-02

## Repository controls

- Public Git history uses GitHub noreply author and committer addresses.
- Pull requests are required for `main`; force pushes and branch deletion are disabled.
- Secret scanning and push protection are enabled.
- CI runs source checks, a production build, artifact checks, and `npm audit`.
- CI starts Supabase with output redirected to a runner-local file and extracts only the URL and publishable key; it never prints the full `supabase status` output.
- Dependabot alerts, security updates, and weekly version updates are enabled.
- Internal agent directories and local environment files are rejected by the repository security check.

## Application controls

- Supabase dependencies are bundled from the pinned lockfile, not loaded from a runtime CDN.
- Browser sessions use session storage; local learning data has a visible deletion action.
- Security headers include CSP (script-src and style-src 'self', no unsafe-inline), HSTS, framing protection, a restrictive permissions policy, and no-referrer behavior.
- Confirm signup, Magic Link, and Recovery templates are localized and branded from the allow-listed redirect domain; unknown recovery origins fall back to Shadow Nexus.
- Password reset uses Supabase recovery sessions and never stores custom reset tokens, password hashes, secret keys, or passwords in browser/business data.
- Network mutations use a single-flight control lock, with a global rapid-click guard for synchronous state changes.
- The public product registry exposes only product ID and display name columns.
- Learning tables deny anonymous access and enforce family membership through RLS.
- Privileged database helper functions live outside the exposed schema and have explicit execution grants.

## Release gate

Use this order for every production release. Do not skip ahead after a failed gate:

1. Run `npm run verify`, the Supabase pgTAP suite, and database lint locally.
2. Link the working directory to the intended existing Vercel project and verify its project and organization IDs. Keep `.vercel/` and `.env.local` ignored.
3. Run a Vercel dry-run and reject the deployment if the upload manifest contains `.env*`, `.vercel/`, `.security-local-denylist`, `supabase/`, local database files, or generated secrets. Then create a Preview from the reviewed PR commit with the CLI.
4. Accept the Preview only after checking page rendering, console and network errors, login, household isolation, offline behavior, service worker behavior, and security headers.
5. Dry-run and then apply only the reviewed pending migrations to the linked production Supabase project. Never use remote reset or production seed data.
6. Recheck migration history, RLS, grants, representative anonymous and authenticated access, and Supabase Security Advisor findings.
7. Confirm GitHub required checks pass and review conversations are resolved, then merge the PR.
8. Deploy Production from the merged `main` commit. Prefer promoting the accepted artifact when it represents the same commit; otherwise build and deploy the merged commit explicitly.
9. Verify the production URL, security headers, browser console, Supabase connectivity, and recent error logs. Record the Preview URL, Production URL, commit, migration versions, checks, and rollback target.

## Incident record

On 2026-07-31 the repository history was sanitized to remove personal commit metadata and obsolete personalized identifiers. An unrelated generated tooling branch was removed. No secret credentials were found, so credential rotation was not required.
