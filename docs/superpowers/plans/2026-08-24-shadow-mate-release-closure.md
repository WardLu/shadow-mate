# Shadow Mate Release Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every merged Shadow Mate PR produce a deterministic, non-production release handoff that Shadow Portal can later consume without relying on Multica Release Autopilot.

**Architecture:** Keep Shadow Mate proposal-only. A pure release-admission library classifies the GitHub event before any handoff, creates a stable release id from repository, PR number, and merge commit, and emits an allowlisted manifest. A post-merge GitHub Actions workflow runs the existing local verification/release checks and uploads the manifest as a non-production artifact; production migration and deployment remain disabled in the Shadow Portal control plane until a later, separately verified handoff is implemented.

**Tech Stack:** Node.js ESM, Vitest, GitHub Actions, existing Vite/Vitest/Supabase policy checks.

**Spec:** Approved in-chat design on 2026-08-24; project release and shared-database contracts in `docs/security-baseline.md`, `README.md`, and `shadow-portal/supabase/control-plane/release-process.md`.

## Global Constraints

- Do not modify `supabase/migrations/` or execute production SQL from Shadow Mate.
- Do not add production credentials, service-role keys, webhook URLs, signatures, cookies, Authorization headers, or raw event payloads to the manifest, logs, fixtures, or workflow outputs.
- Do not invoke Multica APIs, Release Autopilot, real webhook delivery, production deployment, or production migration.
- Preserve the existing dirty worktree and unrelated email, privacy, analytics, and Piper changes.
- The manifest is a handoff/evidence artifact only; it is not proof of production deployment or migration application.

### Task 1: Define release admission and manifest behavior

**Files:**
- Create: `scripts/release-manifest-lib.mjs`
- Test: `tests/unit/release-manifest.test.js`

**Interfaces:**
- `classifyReleaseEvent({ eventName, payload })` returns `{ status, reason, createdResources }` and, only for a merged PR close event, immutable admission fields.
- `createReleaseManifest({ eventName, payload, repository, packageVersion })` returns an allowlisted manifest with a deterministic `releaseId`.
- `validateReleaseManifest(manifest)` returns an array of findings and rejects forbidden sensitive/raw-payload fields.

- [x] **Step 1: Write the failing tests** for `github.ping` skip, non-merged PR skip, qualifying merged PR acceptance, duplicate merge idempotency, and sensitive-field rejection.
- [x] **Step 2: Run the focused test file** and confirm the new tests fail because the library does not exist.
- [x] **Step 3: Implement the smallest pure library** with strict event checks, SHA/PR validation, stable SHA-256 release id, migration `proposal-only` handoff state, and allowlisted output.
- [x] **Step 4: Re-run the focused tests** and confirm all admission, idempotency, and redaction cases pass.

### Task 2: Add the local CLI and package entrypoint

**Files:**
- Create: `scripts/release-manifest.mjs`
- Modify: `package.json`

**Interfaces:**
- `npm run release:manifest` reads `GITHUB_EVENT_NAME`, `GITHUB_EVENT_PATH`, `GITHUB_REPOSITORY`, `GITHUB_SHA`, and package version; it writes `release-manifest.json` or the path in `RELEASE_MANIFEST_OUTPUT`.
- Unsupported/non-merged events exit successfully with a safe `skipped` summary and no manifest dispatch resources.
- A merged PR writes only the validated allowlisted manifest and exits non-zero on malformed input.

- [x] **Step 1: Implement the CLI** using the pure library; never serialize the full GitHub event.
- [x] **Step 2: Add the `release:manifest` package script** without adding dependencies.
- [x] **Step 3: Add CLI-level tests or fixture invocations** for accepted and skipped events, including output-file cleanup.
- [x] **Step 4: Run the CLI checks** and inspect the generated manifest for stable ids and absence of forbidden fields.

### Task 3: Wire post-merge non-production GitHub verification

**Files:**
- Create: `.github/workflows/release-closure.yml`
- Create: `docs/release-closure.md`

**Interfaces:**
- The workflow listens only to `pull_request` `closed` events on `main`, with an explicit merged guard, and uses a non-cancelling concurrency group keyed by merge commit.
- It runs the existing `npm run test:fast` and `npm run release:check` checks, then generates and uploads `release-manifest.json`.
- It never calls direct linked production-migration commands, Shadow Portal production jobs, Multica, or any production endpoint.

- [x] **Step 1: Add the workflow** with pinned existing action revisions, least-privilege read permissions, locked dependency install, deterministic artifact naming, and no secrets.
- [x] **Step 2: Document the handoff contract**: what the manifest proves, what it does not prove, how Shadow Portal will later consume it, and the remaining manual/protected production gates.
- [x] **Step 3: Run YAML/static checks** available locally and inspect the workflow diff for forbidden commands or credentials.

### Task 4: Verify and close out the first phase

**Files:**
- Modify: none beyond the files above unless verification finds a directly related defect.

- [x] **Step 1: Run `npm test -- tests/unit/release-manifest.test.js` or the repository-equivalent focused Vitest command.**
- [x] **Step 2: Run `npm run check` and `npm run release:check` with the current repository contract.**
- [x] **Step 3: Run the smallest broader verification required by the workflow boundary, documenting Docker/production checks that are intentionally not run.**
- [x] **Step 4: Review `git diff`, `git status`, generated files, and secret/path scans; confirm unrelated user changes remain untouched.**
- [x] **Step 5: Report four local release-closure regression summaries and the explicit next-phase blocker: Shadow Portal consumer/dispatch is not yet enabled.**

## Phase 2 boundary and remaining work

- [x] Add a Shadow Portal-side manifest validator and reusable non-production `workflow_call` entry.
- [x] Connect the product workflow to that validator using only `releaseId` and the allowlisted manifest; no product repository receives production credentials.
- [x] Document Multica as the staged work-orchestration layer, not the production execution authority.
- [ ] Add a protected, manually approved production queue entry after the cross-repository workflow is observed on the hosted `main` branches.
- [ ] Decide later whether Multica should receive a passive status sync or a separately authorized trigger integration; Release Autopilot remains outside the critical path for now.

## Phase 2 verification record (2026-08-24)

- Shadow Portal `test:release-handoff`: 3/3 passed; YAML parse, Node syntax, diff check and forbidden-command scan passed.
- Shadow Portal `supabase:control-plane:check`: valid, 34 ledger rows and local runtime contract valid; `release:check` passed.
- Shadow Portal `security:audit`: failed on 4 existing dependency vulnerabilities; this change did not modify dependencies or the lockfile, and no automatic audit fix was run.
- The real Shadow Portal worktree already had unrelated product/download changes committed concurrently as `a44a255`; those files were not changed by this work.
- Hosted GitHub cross-repository execution and production migration/deployment remain unverified and intentionally disabled.

## Verification record (2026-08-24)

- Targeted release admission and CLI tests: 2 files, 7/7 passed, including `github.ping` skip, non-merged PR skip, merged PR acceptance, stable duplicate result, sensitive-field rejection, accepted CLI output, and stale-output cleanup.
- `npm run check`, `npm run public:check`, `npm run security:check`, `npm run release:check`, Node syntax checks, YAML parse, `git diff --check`, forbidden-command scan, and temporary-file cleanup passed.
- `npm run verify` and `npm run test:fast` reached the existing unit suite but remain blocked by the pre-existing `tests/unit/email-templates.test.js` assertion (`expected 3`, observed 6; 87/88 unit tests passed). This first-phase change did not modify that test or its email-template files.
- Database tests, Edge Function tests, full E2E, Shadow Portal consumer execution, production migration/deployment, and Multica were intentionally not run.
