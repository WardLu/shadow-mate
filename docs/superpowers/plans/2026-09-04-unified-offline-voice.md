# Unified Offline Chinese-English Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace two Piper fallback voices with one audited Matcha Chinese-English WebAssembly package and deploy the verified result to the `preview` branch.

**Architecture:** Keep the existing package registry, validated Cache Storage downloads, cross-tab lock, and dialog lifecycle, but generalize their public contract from Piper-specific voices to one immutable offline TTS package. Run the official sherpa-onnx v1.13.2 Matcha worker off the main thread and play returned PCM through the existing audio lifecycle.

**Tech Stack:** Vite, Vanilla JavaScript, Cache Storage, Web Workers, WebAssembly, sherpa-onnx v1.13.2, Vitest, Playwright, Vercel Preview.

**Spec:** `docs/superpowers/specs/2026-09-04-unified-offline-voice-design.md`

## Global Constraints

- One package must serve both `zh-CN` and `en-US`.
- A package is completed only after every required payload passes status, content type, byte size, and SHA-256 validation.
- Cache data is browser-profile and origin scoped; UI and documentation must not promise cross-browser reuse.
- Old Piper data is removed only after the new package is completed and leases permit cleanup.
- No database, Supabase, authentication, Production deployment, or voice-timbre optimization is in scope.
- Preview deployment occurs only after the repository release checks and a desktop browser smoke pass.

---

### Task 1: Fixed runtime and package provenance

**Files:**
- Modify: `src/piper-resource-registry.js`
- Modify: `scripts/piper-resource-smoke.mjs`
- Modify: `tests/unit/piper-resource-registry.test.js`
- Modify: `tests/unit/piper-resource-smoke.test.js`
- Modify: `THIRD_PARTY_NOTICES.md`
- Create: `third_party/licenses/sherpa-onnx-Apache-2.0.txt`

**Interfaces:**
- Produces: immutable unified package metadata consumed by download, cache, runtime, and UI modules.

- [ ] Add failing registry tests proving exactly one active CDN TTS package supports both locales and includes fixed runtime fingerprints.
- [ ] Run the focused registry/smoke tests and confirm failure against the two Piper packages.
- [ ] Add the fixed sherpa-onnx v1.13.2 package metadata, content types, sizes, hashes, locale list, source URL, and license record.
- [ ] Extend the read-only smoke command to validate the new payload list without weakening fail-closed checks.
- [ ] Record the source, redistribution terms, fingerprints, audition decision, and replacement reasons in `THIRD_PARTY_NOTICES.md`.
- [ ] Run the focused tests and static resource gate.

### Task 2: Unified download and cache contract

**Files:**
- Modify: `src/piper-resource-download.js`
- Modify: `src/piper-resource-store.js`
- Modify: `src/piper-resource-lock.js`
- Modify: `src/piper-tts.js`
- Modify: `tests/unit/piper-resource-download.test.js`
- Modify: `tests/unit/piper-resource-store.test.js`
- Modify: `tests/unit/piper-tts.test.js`

**Interfaces:**
- Consumes: unified package metadata from Task 1.
- Produces: `isUnifiedVoiceCached()`, `downloadUnifiedVoice(onProgress, signal)`, and safe legacy-cache cleanup after completion.

- [ ] Add failing tests for one package across both locales, full-package completion, partial/cancelled state, and lease-protected old-cache cleanup.
- [ ] Run the focused tests and confirm the new behavior is absent.
- [ ] Generalize package lookup and completion without changing the validated download primitives.
- [ ] Update dialog copy to "离线中英文语音" and derive size from the registry.
- [ ] Implement post-completion legacy cleanup through the existing lease-aware store boundary.
- [ ] Run focused unit tests.

### Task 3: sherpa-onnx worker adapter

**Files:**
- Create: `public/sherpa-onnx/sherpa-onnx-wasm-main-tts.js`
- Create: `public/sherpa-onnx/sherpa-onnx-tts.js`
- Create: `public/sherpa-onnx/sherpa-onnx-tts.worker.js`
- Create: `src/matcha-tts.js`
- Modify: `src/piper-tts.js`
- Create: `tests/unit/matcha-tts.test.js`
- Modify: `tests/unit/tts-security.test.js`

**Interfaces:**
- Consumes: completed package responses from Task 2.
- Produces: `prepareLocalVoice()` and `speakLocally(text)` returning a playable object URL, independent of locale.

- [ ] Add failing adapter tests for ready, generation result, timeout, reset, and worker error paths.
- [ ] Run the focused tests and confirm failure.
- [ ] Vendor the three audited JavaScript files from the exact v1.13.2 release.
- [ ] Implement a small application adapter that starts one module worker, supplies cached payload URLs, transfers PCM samples, writes a WAV Blob, and tears down failed workers.
- [ ] Replace Piper engine construction with the Matcha adapter while preserving the public application-facing functions.
- [ ] Update CSP/security allowlists narrowly for the fixed worker/runtime files.
- [ ] Run focused unit and security tests.

### Task 4: Application behavior and browser regression

**Files:**
- Modify: `src/app.js`
- Modify: `src/app.css`
- Modify: `public/sw.js`
- Modify: `tests/e2e/offline.spec.js`
- Modify: `tests/e2e/offline-tts-warmup.spec.js`
- Modify: `tests/e2e/offline-tts-error.spec.js`
- Modify: `tests/e2e/tts-system-fallback.spec.js`

**Interfaces:**
- Consumes: unified package/runtime API from Tasks 2-3.
- Produces: one user journey for Chinese and English system-first/local-fallback speech.

- [ ] Add failing E2E cases proving both locales open the same package dialog and call the same cached local provider.
- [ ] Run the targeted E2E files and confirm the previous Piper-specific expectations fail.
- [ ] Parameterize system voice selection by locale and prefer an already-completed unified package.
- [ ] Preserve immediate busy feedback, audio unlock, cancellation, timeout, and retry messages for both languages.
- [ ] Exclude large voice payloads from the app-shell precache while allowing validated runtime fetches.
- [ ] Run the targeted E2E files in desktop Chromium and inspect console errors.

### Task 5: User and release documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/user-guide.md`
- Modify: `docs/architecture.md`
- Modify: `CHANGELOG.md`
- Modify: `RELEASE_NOTES.md`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: final behavior and measured package size.
- Produces: consistent user, architecture, third-party, and release records.

- [ ] Replace English/Chinese Piper claims with one Matcha Chinese-English package and the browser-profile storage limitation.
- [ ] Explain why the models changed and record the accepted mechanical-timbre limitation.
- [ ] Align version metadata and release notes using the repository's existing release convention.
- [ ] Run documentation/static checks.

### Task 6: Verification, PR, and Preview deployment

**Files:**
- Modify: `.github/PULL_REQUEST_TEMPLATE.md` only if the current template lacks the required release-impact receipt.

**Interfaces:**
- Consumes: final branch HEAD and CDN payloads.
- Produces: reviewed PR merged into `preview` and deployment evidence for `preview-sm.shadow.wang`.

- [ ] Upload immutable payloads to `voice.shadow.wang` only after local registry fingerprints are final.
- [ ] Run the CDN smoke command against final URLs, including CORS, types, bytes, and SHA-256.
- [ ] Run `npm run verify`, the targeted voice E2E suite, and `npm run release:check` against the same final HEAD.
- [ ] Start a local production build and verify Chinese and English generation in desktop Chromium.
- [ ] Review the final diff for scope, secrets, third-party notices, and release-impact declarations.
- [ ] Commit, push, create a PR targeting `preview`, wait for required checks, and merge only if the final HEAD remains unchanged.
- [ ] Verify the Vercel deployment and `https://preview-sm.shadow.wang/` build identity, then run a hosted desktop smoke.
- [ ] Report Xiaomi/Quark/Chrome mobile generation and memory as awaiting device acceptance rather than locally verified.
