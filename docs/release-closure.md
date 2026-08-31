# Release closure handoff

Shadow Mate uses a two-stage release boundary:

1. The product repository verifies the merged commit and emits an allowlisted
   `release-manifest.json` artifact.
2. The Shadow Portal control plane validates the same manifest through a
   reusable, non-production workflow. A later protected queue may consume the
   validated release id for migration and deployment.

The current workflows are intentionally non-production. They do not execute
Supabase migrations, write `schema_migrations`, deploy the application, call
Multica, or use production credentials.

## Admission rules

`.github/workflows/release-closure.yml` listens only to `pull_request` events
with `action=closed` and runs its job only when
`pull_request.merged=true`. A non-merged pull request is skipped. Other event
types, including `github.ping`, are rejected by the same pure admission library
used by the local regression tests.

An accepted manifest contains only the project, repository, merge commit,
package version, pull request number, safe labels, a deterministic `releaseId`,
zero created issues/tasks, and the explicit `shadow-portal` proposal-only
handoff state. It never serializes the GitHub event, callback URLs, tokens,
signatures, cookies, Authorization headers, or raw payloads.

The `releaseId` is the SHA-256 of
`repository:pullRequestNumber:mergeCommitSha`. Re-running the same merged
event therefore produces the same id and manifest. This is a stable idempotency
key for the future control-plane consumer; it is not yet a remote database
deduplication record.

## What this proves

- The merged commit passed the workflow's `test:fast` and `release:check` steps.
- A safe, deterministic handoff artifact exists for the exact merge commit.
- No product workflow has production migration credentials or direct migration
  authority.

## What this does not prove

- It does not prove that a production migration was applied.
- It does not prove that the production deployment succeeded.
- It does not replace Shadow Portal's ledger, dry-run, reviewer approval,
  serialized production queue, schema/RLS acceptance, or business smoke test.
- It does not repair or reactivate Multica Release Autopilot.

The reusable validator must land on the Shadow Portal `main` branch before a
merged Shadow Mate release can pass this cross-repository handoff. Only after
that isolated handoff is verified should a protected production queue entry be
added.

## Multica's role

Multica remains useful as the work-orchestration layer, but it is not the
production execution authority:

1. One accepted `releaseId` maps to one Multica parent task.
2. The parent is split into staged work: verification, control-plane review,
   production approval, and post-release acceptance.
3. Independent agents can handle documentation, evidence collection, test
   triage, and follow-up in parallel; production migration remains behind the
   Shadow Portal protected gate.
4. Handoff/status bookkeeping should use `--no-start` where supported, so a
   progress update does not create a duplicate run. A blocked stage keeps the
   parent blocked and must not be reported as a successful release.

The release manifest and Shadow Portal result are the source of truth for
release state. Multica should track and advance the work around those facts,
not replace them with an unverified webhook-triggered claim.
