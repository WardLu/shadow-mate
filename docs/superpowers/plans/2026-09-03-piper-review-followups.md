# Piper Review Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two remaining Important findings from the Piper resource package final review without weakening cache ownership or public-resource release gates.

**Architecture:** Make superseded-cache deletion conservative: automatic status/download paths may inspect but must not delete when no reliable active-use snapshot is supplied; only an explicit, caller-owned `inUseCacheNames` snapshot may authorize cleanup. Make the bundled runtime registry and public notices carry fixed upstream versions/commits and concrete redistribution terms, and make validation reject incomplete audit records.

**Tech Stack:** Vite + Vanilla JavaScript, Cache Storage, Vitest, Node.js release/static checks, Git worktree.

**Spec:** `docs/superpowers/specs/2026-09-02-piper-resource-package-design.md`

## Global Constraints

- Preserve local-first behavior and never delete a resource cache while its active use is unknown.
- Do not activate the gated Chinese package, modify CDN/Preview/Production configuration, push, merge, deploy, or perform device acceptance.
- Keep the existing English model URL, bytes, SHA-256, and CORS/content-type gates unchanged.
- Public notices must record source, fixed version/commit, license, and redistribution terms for every vendored runtime component.
- Do not add byte-range resume or unrelated refactors.
- Verify changed unit/static/build boundaries, then run `npm test` and `npm run verify`; report external/manual gates separately.

### Task 1: Make superseded cache cleanup safe when active use is unknown

**Files:**
- Modify: `src/piper-resource-store.js` (`cleanupSupersededPiperResourceCaches` and its automatic callers)
- Test: `tests/unit/piper-resource-store.test.js`

**Interfaces:**
- Existing callers may continue to invoke `cleanupSupersededPiperResourceCaches(packageId, { skipCurrentValidation: true })`, but such calls must return a non-destructive skipped result because they do not supply an active-use snapshot.
- An explicit maintenance caller may pass `inUseCacheNames: []` or a non-empty array. Only this explicit array authorizes deletion of verified superseded caches; names in the array remain protected.
- Return a stable result object such as `{ status: "skipped", reason: "active-use-unknown", deleted: [] }` for an omitted/non-array snapshot and `{ status: "cleaned", deleted: [...] }` for an authorized cleanup. Preserve existing no-op behavior for invalid/gated packages.

- [ ] **Step 1: Add a failing regression for automatic cleanup safety**

  Seed a valid current package and a valid older package, call `getPiperResourceStatus(current.id)` and `isPiperResourceCached(current.id)`, and assert the older cache remains. Also assert an explicit call with `inUseCacheNames: [oldCacheName]` preserves it while an explicit empty snapshot can remove a verified superseded cache.

- [ ] **Step 2: Run the focused store test and confirm the new safety assertion fails**

  Run `npm test -- tests/unit/piper-resource-store.test.js`. The pre-fix automatic status path is expected to delete the older cache, proving the regression is real.

- [ ] **Step 3: Implement the conservative cleanup boundary**

  Stop defaulting `inUseCacheNames` to an empty array. Distinguish an omitted/non-array snapshot from an explicit array and return without enumerating/deleting caches when use is unknown. Keep the existing verified-marker checks and active-cache exclusion for authorized calls.

- [ ] **Step 4: Run focused tests and the static boundary**

  Run `npm test -- tests/unit/piper-resource-store.test.js tests/unit/piper-resource-download.test.js` and `npm run check`. Expect all tests and static checks to pass, including automatic status/download paths retaining older caches.

- [ ] **Step 5: Commit**

  ```bash
  git add src/piper-resource-store.js tests/unit/piper-resource-store.test.js
  git commit -m "fix: protect active superseded Piper caches"
  ```

### Task 2: Make bundled runtime provenance and redistribution auditable

**Files:**
- Modify: `src/piper-resource-registry.js`
- Modify: `THIRD_PARTY_NOTICES.md`
- Create: `tests/unit/piper-resource-registry.test.js`

**Interfaces:**
- Keep the bundled runtime package id `piper-browser-runtime` and all four existing runtime file URLs, bytes, and SHA-256 values unchanged.
- Record `piper-tts-web` as version `1.1.2` at commit `950f1f5c8278296a6698cc11e8b976594dad6687`, with a commit-pinned source URL and commit-pinned LICENSE URL.
- Record ONNX Runtime Web as version `1.20.1` at commit `5c1b7ccbff7e5141c1da7a9d963d660e5741c319`, and keep its MIT license record tied to the vendored runtime header/source.
- Record the phonemize WASM/data artifacts as originating from `piper-tts-web` v1.0.0 commit `7cec5cb4861f9322cd094b1b8b41a5b173e314db`, with the applicable piper-phonemize/eSpeak NG notices and license obligations retained.
- Bundled package validation must require approved audit metadata: fixed component version/commit, commit-pinned source/reference, and non-empty concrete redistribution terms. Active CDN validation remains unchanged and Chinese remains gated.

- [ ] **Step 1: Add failing metadata validation tests**

  Clone the bundled runtime registry fixture and assert validation rejects a bundled package with a missing source commit, a missing commit-pinned reference, or missing redistribution terms. Assert the real registry passes and still exposes the same four runtime files/fingerprints in `tests/unit/piper-resource-registry.test.js`.

- [ ] **Step 2: Run the focused registry/store tests and confirm they fail before the validator change**

  Run `npm test -- tests/unit/piper-resource-registry.test.js`. The current validator accepts the incomplete bundled metadata, so the new rejection assertions must fail before implementation.

- [ ] **Step 3: Add fixed provenance and redistribution metadata**

  Extend the bundled registry metadata with the exact versions/commits above, commit-pinned source/license references, approved status, and concise terms covering permission to use/copy/modify/publish/distribute/sublicense/sell subject to retaining copyright/license notices and the no-warranty condition. Make the validator enforce these fields only for bundled app-shell runtime packages; do not loosen CDN gates.

- [ ] **Step 4: Synchronize public notices and run focused checks**

  Update `THIRD_PARTY_NOTICES.md` with the pinned upstream records, component relationships, license names, source/license links, and concrete redistribution obligations. Run `npm test -- tests/unit/piper-resource-store.test.js tests/unit/piper-resource-smoke.test.js` and `npm run check`.

- [ ] **Step 5: Run build fingerprint verification**

  Run `npm run build && node scripts/check-build.mjs` and verify that all four bundled runtime files retain their registered bytes and SHA-256 values.

- [ ] **Step 6: Commit**

  ```bash
  git add src/piper-resource-registry.js THIRD_PARTY_NOTICES.md tests/unit/piper-resource-registry.test.js
  git commit -m "docs: make Piper runtime provenance auditable"
  ```

### Final validation

- [ ] Run `npm test`.
- [ ] Run `npm run verify`.
- [ ] Run the read-only English CDN smoke only for evidence; do not alter CDN configuration. Keep Chinese gating, Preview, production, and Xiaomi acceptance separate.
- [ ] Review the final diff for public-repository safety and document any remaining external/manual gates.
