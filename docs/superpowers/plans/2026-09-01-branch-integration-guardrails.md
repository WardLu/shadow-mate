# Branch Integration Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only branch-freshness report, a PR freshness check, and durable hotfix back-merge guidance so long-running Shadow Mate feature branches do not silently miss mainline changes.

**Architecture:** A small Node ESM CLI owns Git command execution and delegates report construction to a pure library. Local mode is advisory and never fetches or mutates the worktree; CI invokes strict mode against the pull request base SHA. The policy document and PR template carry the human workflow, while the existing UI remains unchanged.

**Tech Stack:** Node.js ESM, Git CLI, Vitest, GitHub Actions, Markdown.

**Spec:** `docs/branch-integration-policy.md`

## Global Constraints

- `main` is the only normal development integration line and PR target.
- `production` is a deployment/release line; production hotfixes must be back-merged to `main`.
- Local checks must not fetch, switch branches, merge, rebase, write files, or touch production resources.
- Default local comparison is `HEAD` versus `origin/main`; strict CI comparison accepts an explicit base ref or SHA.
- Strict mode fails when the target base is missing or is not an ancestor of the inspected head; advisory mode reports the same condition without failing.
- The implementation must not change the current navigation, learning content, rotation algorithm, authentication behavior, database migrations, or deployment configuration.
- Existing dirty and untracked user files must be preserved; only listed files may be changed.

---

### Task 1: Read-only integration report CLI

**Files:**
- Create: `scripts/integration-check-lib.mjs`
- Create: `scripts/check-integration.mjs`
- Test: `tests/unit/integration-check.test.js`

**Interfaces:**
- `buildIntegrationReport(input)` returns a serializable report containing `head`, `base`, `mergeBase`, `ahead`, `behind`, `featurePaths`, `basePaths`, `overlapPaths`, `needsIntegration`, and `reasonCodes`.
- `parseAheadBehind(value)` parses Git's two-number `rev-list --left-right --count` output and rejects malformed input.
- `scripts/check-integration.mjs --base <ref> [--strict] [--json]` executes only read-only Git commands and exits `0` in advisory mode; strict mode exits non-zero for a missing base or stale head.

- [ ] **Step 1: Write the failing unit tests**

  Cover a current head that contains the base, a stale head with overlapping paths, a stale head with no overlapping paths, malformed ahead/behind output, and strict/advisory classification. Assert exact path arrays and reason codes rather than only checking that the function does not throw.

- [ ] **Step 2: Run the focused tests and confirm failure**

  Run:

  ```bash
  npm test -- tests/unit/integration-check.test.js
  ```

  Expected: the new module imports are missing and the focused suite fails.

- [ ] **Step 3: Implement the pure report builder**

  Normalize refs and paths, calculate `needsIntegration` when `behind > 0` or the base cannot be resolved, and use sorted unique path lists. Keep strict-mode exit policy out of the pure library so tests can exercise advisory and strict decisions independently.

- [ ] **Step 4: Implement the CLI**

  Execute `git rev-parse --verify`, `git merge-base`, `git rev-list --left-right --count`, `git diff --name-only <merge-base>..<head>`, and `git diff --name-only <merge-base>..<base>`. Do not invoke `git fetch`, `git checkout`, `git merge`, `git rebase`, or any file-writing command. Print a human-readable report by default and stable JSON with `--json`.

- [ ] **Step 5: Run the focused tests and CLI smoke checks**

  Run:

  ```bash
  npm test -- tests/unit/integration-check.test.js
  node scripts/check-integration.mjs --base HEAD --json
  node scripts/check-integration.mjs --base origin/main --json
  ```

  Expected: the unit suite passes; `--base HEAD` reports no integration debt; the current stale branch report identifies `origin/main` drift and overlapping shell files without modifying the worktree.

- [ ] **Step 6: Commit**

  ```bash
  git add scripts/integration-check-lib.mjs scripts/check-integration.mjs tests/unit/integration-check.test.mjs
  git commit -m "feat: add branch integration freshness report"
  ```

### Task 2: Local command and PR freshness gate

**Files:**
- Modify: `package.json:scripts`
- Create: `.github/workflows/integration-freshness.yml`
- Modify: `.github/PULL_REQUEST_TEMPLATE.md:检查清单`

**Interfaces:**
- `npm run check:integration` invokes the advisory CLI with its default `origin/main` base.
- The workflow checks the pull request head SHA against the pull request base SHA, not a synthetic merge commit, and runs without installing application dependencies.

- [ ] **Step 1: Write the workflow contract checks**

  Add unit assertions or a deterministic text check covering the `check:integration` package script, the workflow's `pull_request` trigger targeting `main`, checkout of `github.event.pull_request.head.sha`, and strict invocation with `github.event.pull_request.base.sha`.

- [ ] **Step 2: Run the contract checks and confirm failure**

  Run:

  ```bash
  npm test -- tests/unit/integration-check.test.mjs
  ```

  Expected: the new package/workflow markers are absent until the implementation is added.

- [ ] **Step 3: Add the local command**

  Add only:

  ```json
  "check:integration": "node scripts/check-integration.mjs"
  ```

  Preserve all existing user changes in `package.json`.

- [ ] **Step 4: Add the PR workflow and template items**

  The workflow must use a read-only `pull_request` event, full Git history, the PR head SHA, and strict base-SHA comparison. The template must ask for base SHA, production-hotfix back-merge status, overlap resolution, and scoped verification evidence.

- [ ] **Step 5: Run configuration checks**

  Run:

  ```bash
  npm run check:integration -- --base HEAD --json
  git diff --check
  ```

  Expected: the command reports JSON and exits `0`; whitespace validation passes; no production or remote write occurs.

- [ ] **Step 6: Commit**

  ```bash
  git add package.json .github/workflows/integration-freshness.yml .github/PULL_REQUEST_TEMPLATE.md
  git commit -m "ci: gate pull requests on integration freshness"
  ```

### Task 3: Policy and architecture-contract handoff

**Files:**
- Modify: `docs/branch-integration-policy.md`
- Modify: `docs/architecture.md` only if the policy cross-reference is missing
- Test: `tests/unit/integration-check.test.js` only if documentation markers need a stable check

**Interfaces:**
- The policy document is the durable source for branch roles, hotfix back-merge, sync triggers, dirty-worktree handling, command behavior, and the deferred unified-learning architecture contract.

- [ ] **Step 1: Review the policy against the approved process**

  Confirm the document states `main` as the canonical integration line, `production` as the release line, immediate hotfix back-merge, pre-acceptance/PR freshness checks, isolated worktree handling, and the unified-learning navigation contract.

- [ ] **Step 2: Apply only wording or cross-reference corrections**

  Do not add UI implementation, content changes, migration commands, automatic fetches, or release actions to this task.

- [ ] **Step 3: Run documentation checks**

  Run:

  ```bash
  git diff --check
  npm run check:integration -- --base HEAD --json
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add docs/branch-integration-policy.md docs/architecture.md tests/unit/integration-check.test.mjs
  git commit -m "docs: define branch integration and hotfix back-merge policy"
  ```
