# Shadow Mate 统一 Piper 资源包 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Shadow Mate 建立统一的 Piper 资源包下载、校验、缓存、回退和管理能力，使英语与已通过门禁的中文 voice 使用同一套机制，并解决应用升级误删语音缓存的问题。

**Architecture:** 将资源描述、Cache Storage 完整性状态、流式下载和 Piper 引擎封装拆成独立模块；`src/app.js` 只负责选择系统语音或指定 Piper 包。应用壳 Cache 与用户下载的 voice Cache 使用不同命名空间，Service Worker 和版本守卫只清理应用壳。中文候选包在模型兼容性、设备和公开分发许可完成前保持 gated，不把未经批准的模型暴露给用户。

**Tech Stack:** Vite 8、Vanilla JavaScript、Cache Storage、ReadableStream/TransformStream、Web Locks（可选）、`@noble/hashes@1.8.0`、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-09-02-piper-resource-package-design.md`

## Global Constraints

- 中文模型必须先通过实际浏览器合成、移动端内存/耗时、来源和许可证门禁；未经明确公开分发许可不得上传公开 CDN 或进入 Preview。
- `shadow-mate-app-v{n}` 和已知旧应用壳 `shadow-mate-v{n}` 只用于应用壳；`shadow-mate-voice` 与 `shadow-mate-piper-*` 必须由 Service Worker、版本守卫和应用升级保留。
- 资源包缓存只有在全部声明文件、`package:<id>@<version>` 完成标记、URL、bytes、SHA-256 和文件列表完全一致时才算完成。
- 第一阶段只承诺完整文件缓存不重复下载；单个 ONNX 文件中断后从文件头重下，字节级 Range 续传不属于本计划的 MVP。
- 大文件下载必须使用增量 SHA-256 + 单向 `TransformStream`，不得使用 `chunks` 数组、完整 `Blob` 或 `Response.arrayBuffer()` 保存整个 ONNX 文件。
- 增量 hash 必须作为直接生产依赖锁定版本，并同步更新 `THIRD_PARTY_NOTICES.md`；不能导入 lockfile 中的间接依赖。
- 系统 TTS 回退到 Piper 前必须取消系统语音；Piper 合成失败后必须销毁并重建引擎，不能永久停留在 busy。
- Cache Storage、ReadableStream、TransformStream、AbortController、WebAssembly 或用户手势下音频播放能力缺失时，状态为 `unsupported`，不发起下载、不循环弹窗。
- 不修改 Supabase schema、RLS、Auth 或学习状态协议；不把模型二进制提交到 Git，不在本仓库执行 CDN 上传或生产部署。
- 本仓库的变更在 `codex/fix-android-mandarin-tts` 隔离 worktree 中完成；不切换或覆盖共享主工作区，不自动 push、merge、Preview 或 Production。

---

## 文件责任与任务顺序

| 文件/目录 | 责任 | 任务 |
| --- | --- | --- |
| `src/cache-policy.js` | 应用壳缓存识别与清理白名单 | 1 |
| `public/sw.js`、`src/version-guard.js` | 应用升级时保留 Piper 缓存 | 1 |
| `src/piper-resource-registry.js` | voice/runtime manifest 和 gated 状态 | 2 |
| `src/piper-resource-store.js`、`src/piper-resource-hash.js`、`src/piper-resource-capabilities.js` | 包缓存、完成标记、旧缓存迁移、版本清理、hash 和能力探测 | 2 |
| `src/piper-resource-download.js` | HEAD/GET 超时、流式 hash/cache、取消和 single-flight | 3 |
| `package.json`、`package-lock.json`、`THIRD_PARTY_NOTICES.md` | 增量 hash 生产依赖与许可记录 | 2 |
| `src/piper-tts.js` | 通用 voice provider、引擎恢复、下载对话框 | 4 |
| `src/app.js` | 系统 TTS → Piper 选择和中文/英语 packageId 接线 | 4 |
| `src/piper-resource-ui.js`、`src/piper-resource-lock.js`、`src/app.css` | 离线语音包状态/空间/删除界面和跨标签页锁 | 5 |
| `tests/unit/*`、`tests/e2e/*`、`scripts/check.mjs` | 单元、浏览器、静态契约和发布前门禁 | 1–6 |

### Task 1: Preserve Piper caches across app upgrades

**Files:**

- Create: `src/cache-policy.js`
- Modify: `public/sw.js`
- Modify: `src/version-guard.js`
- Modify: `scripts/check.mjs`
- Test: `tests/unit/cache-policy.test.js`
- Test: `tests/unit/version-guard.test.js`

**Interfaces:**

- Produces `APP_SHELL_CACHE_NAME = "shadow-mate-app-v4"`.
- Produces `isAppShellCacheName(name: string): boolean`.
- Produces `staleAppShellCacheNames(keys: string[], currentName = APP_SHELL_CACHE_NAME): string[]`.

- [ ] **Step 1: Add failing cache ownership tests**

  Add tests covering these exact cases:

  ```js
  expect(isAppShellCacheName("shadow-mate-app-v4")).toBe(true);
  expect(isAppShellCacheName("shadow-mate-v3")).toBe(true);
  expect(isAppShellCacheName("shadow-mate-voice")).toBe(false);
  expect(isAppShellCacheName("shadow-mate-piper-zh_CN-chaowen-medium-v1")).toBe(false);
  expect(staleAppShellCacheNames([
    "shadow-mate-app-v3",
    "shadow-mate-app-v4",
    "shadow-mate-v3",
    "shadow-mate-voice",
    "shadow-mate-piper-en_US-ljspeech-medium-v1",
  ])).toEqual(["shadow-mate-app-v3", "shadow-mate-v3"]);
  ```

  Extend `version-guard.test.js` to assert that its cleanup selection preserves both legacy and versioned Piper cache names.

- [ ] **Step 2: Run the focused tests and verify they fail**

  Run:

  ```bash
  npm test -- tests/unit/cache-policy.test.js tests/unit/version-guard.test.js
  ```

  Expected: FAIL because the cache policy module and exported cleanup selector do not exist yet.

- [ ] **Step 3: Implement the cache policy and both cleanup paths**

  In `src/cache-policy.js`, use the exact rules:

  ```js
  export const APP_SHELL_CACHE_NAME = "shadow-mate-app-v4";
  export function isAppShellCacheName(name) {
    return /^shadow-mate-app-v\d+$/.test(name) || /^shadow-mate-v\d+$/.test(name);
  }
  export function staleAppShellCacheNames(keys, currentName = APP_SHELL_CACHE_NAME) {
    return keys.filter((key) => isAppShellCacheName(key) && key !== currentName);
  }
  ```

  Update `public/sw.js` to use `shadow-mate-app-v4` and the same exact predicate. Its `activate` handler may delete only `staleAppShellCacheNames`-equivalent names; it must never call `caches.keys().map(caches.delete)` over all names. Update `src/version-guard.js` to use the source helper and delete only stale application-shell names. Preserve `shadow-mate-voice` and every `shadow-mate-piper-*` cache.

  Update `scripts/check.mjs` to require `shadow-mate-app-v4`, the preservation predicate, and the absence of an unconditional all-cache delete. Keep old `shadow-mate-v3` recognition for the first upgrade.

- [ ] **Step 4: Run the focused tests and static checks**

  Run:

  ```bash
  npm test -- tests/unit/cache-policy.test.js tests/unit/version-guard.test.js
  npm run check
  ```

  Expected: PASS; `scripts/check.mjs` must reject a Service Worker or version guard that deletes voice caches.

- [ ] **Step 5: Commit**

  ```bash
  git add src/cache-policy.js public/sw.js src/version-guard.js scripts/check.mjs tests/unit/cache-policy.test.js tests/unit/version-guard.test.js
  git commit -m "fix: preserve Piper caches across app updates"
  ```

### Task 2: Add versioned resource registry and cache store

**Files:**

- Create: `src/piper-resource-registry.js`
- Create: `src/piper-resource-store.js`
- Create: `src/piper-resource-hash.js`
- Create: `src/piper-resource-capabilities.js`
- Create: `tests/unit/piper-resource-store.test.js`
- Modify: `scripts/check.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `THIRD_PARTY_NOTICES.md`

**Interfaces:**

- `getPiperResourcePackage(packageId: string): PiperResourcePackage | null`
- `listPiperResourcePackages(): PiperResourcePackage[]`
- `getPiperResourceStatus(packageId: string): Promise<ResourceStatus>`
- `isPiperResourceCached(packageId: string): Promise<boolean>`
- `deletePiperResource(packageId: string): Promise<void>`
- `migrateLegacyEnglishVoice(): Promise<MigrationResult>`
- `getPiperCapabilities(): PiperCapabilities`

- [ ] **Step 1: Create registry validation tests**

  Define the manifest shape with `id`, `locale`, `label`, `kind`, `version`, `baseUrl`, `source`, `cachePolicy`, `totalBytes` and `files`. Each file has `key`, `suffix`, `contentType`, `bytes` and a non-empty SHA-256 string for an active package.

  Add tests that an active English package has the exact identifiers `en_US-ljspeech-medium`, `en-US`, `cdn` and `user-download`, and that the gated Chinese candidate has identifier `zh_CN-chaowen-medium` but is not downloadable until its release manifest is approved. Invalid active manifests must throw during module validation.

- [ ] **Step 2: Resolve the active English manifest values**

  Before writing the active English entry, query both final CDN files and record their actual values:

  ```bash
  curl --fail --silent --show-error --location --head https://voice.shadow.wang/piper/en_US-ljspeech-medium.onnx
  curl --fail --silent --show-error --location --head https://voice.shadow.wang/piper/en_US-ljspeech-medium.onnx.json
  curl --fail --silent --show-error --location https://voice.shadow.wang/piper/en_US-ljspeech-medium.onnx | shasum -a 256
  curl --fail --silent --show-error --location https://voice.shadow.wang/piper/en_US-ljspeech-medium.onnx.json | shasum -a 256
  ```

  Put the observed bytes and SHA-256 values in the committed resource manifest. Do not add a placeholder hash. Do not add an active Chinese CDN entry until Phase 0 has a license-approved final artifact; keep the Chinese candidate gated in the registry so the generic code path can be tested without public distribution.

- [ ] **Step 3: Run registry tests to verify the initial failure**

  Run:

  ```bash
  npm test -- tests/unit/piper-resource-store.test.js
  ```

  Expected: FAIL because the registry/store APIs are not implemented.

- [ ] **Step 4: Add the direct hash dependency and capability probe**

  Add the exact production dependency `@noble/hashes` at version `1.8.0` to `package.json`, regenerate `package-lock.json`, and record its MIT attribution and upstream link in `THIRD_PARTY_NOTICES.md`. Implement `src/piper-resource-hash.js` with an incremental `sha256.create()` adapter and a bytes-to-lowercase-hex helper; this is the only hash implementation that Tasks 2–3 may import.

  Implement `getPiperCapabilities()` in `src/piper-resource-capabilities.js`. It must report Cache Storage read/write, `ReadableStream`, `TransformStream`, `AbortController`, WebAssembly and user-gesture audio support separately. Storage estimation is optional and must not make the core download capability false.

- [ ] **Step 5: Implement versioned Cache Storage and completion markers**

  Use the exact cache name and marker rules:

  ```text
  shadow-mate-piper-{packageId}-{version}
  package:<id>@<version>
  ```

  `isPiperResourceCached()` returns true only when all declared files exist and the marker exactly matches normalized URL, expected bytes, actual bytes, expected SHA-256, actual SHA-256, file list and manifest version. Any mismatch deletes the untrusted Response and marker before returning false. `getPiperResourceStatus()` returns `gated`, `unsupported`, `not-downloaded`, `partial`, `completed` or `invalid` as appropriate.

  Implement legacy English migration by checking both `.onnx` and `.onnx.json`, validating bytes and SHA-256 against the new manifest, copying only valid complete Responses to the new versioned cache, and never deleting learning data or app-shell caches. The migration must tolerate the old cache having been removed by an old client and report `not-downloaded` without treating it as corruption.

  Implement deletion so it removes only the selected package cache and marker. Implement superseded-version cleanup so the current package is retained, in-progress/currently-used packages are not deleted, and older completed versions are removed after the new version is usable.

- [ ] **Step 6: Add store tests and run them**

  Cover complete/partial markers, URL/version/hash mismatch, legacy migration, package deletion isolation, old-version cleanup, Cache Storage unavailable, and browser-evicted cache. Run:

  ```bash
  npm test -- tests/unit/piper-resource-store.test.js
  npm run check
  ```

  Expected: PASS.

- [ ] **Step 7: Commit**

  ```bash
  git add src/piper-resource-registry.js src/piper-resource-store.js src/piper-resource-hash.js src/piper-resource-capabilities.js scripts/check.mjs tests/unit/piper-resource-store.test.js package.json package-lock.json THIRD_PARTY_NOTICES.md
  git commit -m "feat: add versioned Piper resource registry"
  ```

### Task 3: Implement streaming download, integrity and cancellation

**Files:**

- Create: `src/piper-resource-download.js`
- Create: `tests/unit/piper-resource-download.test.js`

**Interfaces:**

- `downloadPiperResource(packageId: string, onProgress?: (received: number, total: number, details: object) => void, signal?: AbortSignal, options?: { canCommit?: () => boolean }): Promise<DownloadResult>`
- `getPiperDownloadError(error): { code: string, message: string }`
- Consumes `getPiperResourcePackage`, `isPiperResourceCached`, and the package store from Task 2.

- [ ] **Step 1: Write failing downloader tests**

  Create streamed fake `Response` bodies and assert:

  - HEAD timeout produces `timeout` and aborts the request.
  - GET response timeout and stalled `reader.read()` produce distinct timeout messages.
  - `Content-Length` and actual bytes are checked.
  - `Cache.put` receives a `Response` whose body is a stream, not a Blob assembled from chunks.
  - Correct SHA-256 writes the file and package marker; wrong SHA-256 deletes the file and writes no marker.
  - Aborting while reading cancels the reader and leaves no completed package.
  - Two same-tab calls for the same package share one GET sequence.

- [ ] **Step 2: Run downloader tests to verify the initial failure**

  ```bash
  npm test -- tests/unit/piper-resource-download.test.js
  ```

  Expected: FAIL because the generic downloader does not exist.

- [ ] **Step 3: Implement HEAD/GET and streaming hash/cache**

  Use the existing timeouts as defaults: HEAD `10_000ms`, response `20_000ms`, and each stream read `30_000ms`. Require 2xx, CORS-readable headers and `Content-Length` for active resources. Compose one `TransformStream` around the network body:

  ```js
  const hasher = createIncrementalSha256();
  let actualBytes = 0;
  const hashingStream = new TransformStream({
    transform(chunk, controller) {
      hasher.update(chunk);
      actualBytes += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });
  await cache.put(request, new Response(response.body.pipeThrough(hashingStream), responseInit));
  const actualSha256 = hasher.hexDigest();
  ```

  Keep hash and `Cache.put` on the same stream so JS never accumulates the complete ONNX body. After `Cache.put` resolves, compare actual bytes and hash, then write the file completion data and only after every file passes write the package completion marker. On any error, cancel the stream, delete the failed file key and package marker, and map errors to `timeout`, `network`, `http`, `integrity`, `storage` or `unsupported`.

  Use a module-level same-tab single-flight map keyed by `packageId@version`; a second call returns the existing promise and does not issue another HEAD/GET. If `options.canCommit` is supplied, check it immediately before each file completion and before the package completion marker; a false result aborts/cleans up and must never leave a completed package. Do not add HTTP Range in this task.

- [ ] **Step 4: Run focused tests and the dependency/security checks**

  ```bash
  npm test -- tests/unit/piper-resource-download.test.js tests/unit/piper-resource-store.test.js
  npm run public:check
  npm run security:check
  ```

  Expected: PASS, with the new dependency present in the lockfile and notices.

- [ ] **Step 5: Commit**

  ```bash
  git add src/piper-resource-download.js tests/unit/piper-resource-download.test.js
  git commit -m "feat: add integrity-checked Piper downloads"
  ```

### Task 4: Integrate generic Piper playback and recover failed engines

**Files:**

- Modify: `src/piper-tts.js`
- Modify: `src/app.js`
- Modify: `tests/unit/piper-tts.test.js`
- Modify: `tests/e2e/hanzi-writing.spec.js`
- Modify: `tests/e2e/offline.spec.js`
- Modify: `tests/e2e/offline-tts-error.spec.js`
- Modify: `tests/e2e/offline-tts-warmup.spec.js`
- Modify: `tests/e2e/tts-system-fallback.spec.js`

**Interfaces:**

- `speakLocally(text: string, packageId: string): Promise<{ url: string, duration: number }>`
- `prepareLocalVoice(): Promise<void>`
- `askDownloadVoice(packageId: string, onProgress?, options?): Promise<"ok" | "cancel" | "gated" | "unsupported" | "timeout" | "network" | "http" | "integrity" | "storage" | "error">`
- `resetLocalVoiceEngine(): Promise<void>`
- `getPiperResourceStatus` and `downloadPiperResource` from Tasks 2–3.

- [ ] **Step 1: Add failing engine-recovery and fallback tests**

  Add tests for these exact behaviors:

  - Chinese with an empty/late/unavailable system voice list uses the gated/active Chinese package path instead of returning the old “未检测到中文普通话语音” failure when an active package is available.
  - System TTS `onstart` timeout calls `speechSynthesis.cancel()` before Piper and produces one local playback.
  - A rejected local `generate()` destroys the engine and clears the singleton; the next user click loads a fresh engine and can succeed.
  - A rapid second click does not create a second download or a second audio playback.
  - English and Chinese pass different package IDs and never use the English URL for Chinese.

- [ ] **Step 2: Run focused speech tests to verify the initial failure**

  ```bash
  npm test -- tests/unit/piper-tts.test.js
  node scripts/run-e2e.mjs tests/e2e/tts-system-fallback.spec.js
  ```

  Expected: the new package-aware and engine-recovery assertions fail against the English-only implementation.

- [ ] **Step 3: Refactor `src/piper-tts.js` around package IDs**

  Replace English-only `VOICE`, `VOICE_FILES` and `shadow-mate-voice` runtime paths with registry/store/download calls. Preserve backward-compatible exports only where existing tests or callers require them, and make them delegate to the English package rather than duplicate logic.

  The voice provider must read `.onnx.json` and `.onnx` from the package cache using the normalized package URLs. Track every model object URL created during provider reads in a Set. `resetLocalVoiceEngine()` must call `destroy()` when available, revoke tracked object URLs, clear `enginePromise`, and leave the next call able to instantiate a fresh `PiperWebEngine`.

  `speakLocally(text, packageId)` must catch provider/phonemizer/ONNX/audio creation errors, call the reset path, and rethrow a typed error. Do not modify the vendored `public/piper-tts-web.js`; recover around its `generate()` behavior.

- [ ] **Step 4: Wire `src/app.js` system-first fallback**

  Use package IDs `en_US-ljspeech-medium` and `zh_CN-chaowen-medium`. Keep the immediate `播放中…` state and current single-flight token. For Chinese, try a usable Mandarin system voice first; if the API/voice is missing, `onstart` times out, or playback errors, cancel system TTS and enter the Chinese Piper package flow. For English, retain system English first and use the English package as fallback.

  Route gated/unsupported/resource errors to explicit messages. A user cancellation restores the button without logging a failed learning action; stale playback tokens cannot restore another button’s state.

- [ ] **Step 5: Run the focused unit and E2E tests**

  ```bash
  npm test -- tests/unit/piper-tts.test.js
  node scripts/run-e2e.mjs tests/e2e/tts-system-fallback.spec.js tests/e2e/hanzi-writing.spec.js
  ```

  Expected: PASS, including no duplicate playback and retry-after-engine-failure.

- [ ] **Step 6: Commit**

  ```bash
  git add src/piper-tts.js src/app.js tests/unit/piper-tts.test.js tests/e2e/hanzi-writing.spec.js tests/e2e/offline.spec.js tests/e2e/offline-tts-error.spec.js tests/e2e/offline-tts-warmup.spec.js tests/e2e/tts-system-fallback.spec.js
  git commit -m "feat: route Chinese speech through Piper fallback"
  ```

### Task 5: Add resource manager UI and cross-tab coordination

**Files:**

- Create: `src/piper-resource-ui.js`
- Create: `src/piper-resource-lock.js`
- Modify: `src/piper-resource-download.js`
- Modify: `src/app.js`
- Modify: `src/app.css`
- Modify: `tests/unit/piper-resource-ui.test.js`
- Modify: `tests/e2e/offline.spec.js`

**Interfaces:**

- `mountPiperResourceManager(container: HTMLElement): () => void`
- `renderPiperResourceStatus(container, status): void`
- `acquirePiperDownloadLock(key: string, task: (context: { signal: AbortSignal, canCommit: () => boolean }) => Promise<unknown>): Promise<unknown>`

- [ ] **Step 1: Write failing manager tests**

  Assert the guide renders one row per registered CDN voice package with language, voice, version, current Origin, current browser scope, status, manifest size, actual cached size when available, and download/continue/delete actions. Assert gated or unsupported packages do not start a download or repeatedly open a dialog. Assert deleting English does not remove Chinese state.

- [ ] **Step 2: Run the focused UI test to verify the initial failure**

  ```bash
  npm test -- tests/unit/piper-resource-ui.test.js
  ```

  Expected: FAIL because the manager module and mount point do not exist.

- [ ] **Step 3: Implement the manager and status controls**

  Mount the manager in the existing `data-guide-section="speech"` section. Keep all size/version text sourced from the registry and completion marker; do not add fixed `90MB` or `115MB` values. Display `unsupported`, `gated`, `not-downloaded`, `partial`, `downloading`, `completed` and `invalid` distinctly. Show `navigator.storage.estimate()` as site-wide usage/quota, never as a package’s exact size.

  Show this scope explanation in the manager: “下载记录只保存在当前浏览器、当前浏览器配置文件和当前域名；切换环境不会共享缓存。” A user cancellation closes the dialog without an error toast. Delete only the selected package cache.

  The generic speech download dialog is owned by Task 4; this task only exposes manager controls and status rendering.

- [ ] **Step 4: Add safe cross-tab locking**

  Use `navigator.locks.request("shadow-mate-piper:<packageId>@<version>", ...)` when available. When unavailable, use a short `localStorage` lease with owner token, expiry and release in `finally`; expose an `AbortSignal` and `canCommit()` context to the task. Lease loss must abort the task and make `canCommit()` false; the downloader checks that guard immediately before writing file/package completion markers. If storage is unavailable or ownership is lost, fail safe by allowing only the current tab’s single-flight operation and never deleting another tab’s cache. Lock failure cannot mark a download complete.

- [ ] **Step 5: Update guide copy and run UI tests**

  Replace the old fixed English download text in `renderGuide()` with the mounted resource manager and the generic local-first explanation. Run:

  ```bash
  npm test -- tests/unit/piper-resource-ui.test.js tests/unit/piper-tts.test.js
  node scripts/run-e2e.mjs tests/e2e/offline.spec.js
  ```

  Expected: PASS.

- [ ] **Step 6: Commit**

  ```bash
  git add src/piper-resource-ui.js src/app.js src/app.css tests/unit/piper-resource-ui.test.js tests/e2e/offline.spec.js
  git commit -m "feat: add Piper resource management UI"
  ```

### Task 6: Add release gates, browser lifecycle coverage and verification artifacts

**Files:**

- Create: `scripts/piper-resource-smoke.mjs`
- Modify: `scripts/check.mjs`
- Modify: `scripts/check-build.mjs`
- Modify: `tests/e2e/offline.spec.js`
- Modify: `tests/e2e/piper-dev-server.spec.js`
- Modify: `THIRD_PARTY_NOTICES.md`
- Modify: `RELEASE_NOTES.md`
- Modify: `docs/superpowers/specs/2026-09-02-piper-resource-package-design.md`

**Interfaces:**

- `node scripts/piper-resource-smoke.mjs --base-url https://voice.shadow.wang/piper --package en_US-ljspeech-medium`
- `node scripts/piper-resource-smoke.mjs --base-url https://voice.shadow.wang/piper --package zh_CN-chaowen-medium`

- [ ] **Step 1: Add failing static and lifecycle assertions**

  Add checks for:

  - The build contains `shadow-mate-app-v4` and does not have an unconditional all-cache delete.
  - `shadow-mate-piper-*` is never part of app-shell deletion.
  - User-facing voice size text comes from the registry and contains no fixed `90MB`/`115MB` copy.
  - Service Worker update and version-guard reload preserve a completed Piper cache.
  - A service-worker upgrade does not require a model GET after a completed package is present.

- [ ] **Step 2: Implement the CDN smoke command**

  The command must perform `HEAD` and `GET`, assert 2xx, `Content-Length`, expected content types, CORS headers, actual bytes and SHA-256. It must fail closed if a Chinese manifest has no approved license status or if the URL/hash/bytes differ from the registry. It must not upload files or alter CDN configuration.

- [ ] **Step 3: Add Preview-only acceptance hooks**

  Add an environment-gated browser smoke path for `https://preview-sm.shadow.wang` that records service-worker version, package status, one download, offline reload and no second GET. Keep the real Xiaomi device step manual and explicitly label desktop Playwright as insufficient evidence for Xiaomi acceptance.

- [ ] **Step 4: Run the affected verification set**

  ```bash
  npm test -- tests/unit/cache-policy.test.js tests/unit/version-guard.test.js tests/unit/piper-resource-store.test.js tests/unit/piper-resource-download.test.js tests/unit/piper-tts.test.js tests/unit/piper-resource-ui.test.js
  npm run verify
  node scripts/piper-resource-smoke.mjs --base-url https://voice.shadow.wang/piper --package en_US-ljspeech-medium
  ```

  Expected: all local checks pass; the smoke command records final CDN evidence or reports the exact external blocker. Do not call the external smoke or manual Xiaomi acceptance a local test.

- [ ] **Step 5: Record the gated Chinese status**

  If Phase 0 has not produced an approved final Chinese artifact, keep `zh_CN-chaowen-medium` gated, record the missing artifact/license/device evidence in the release notes, and do not claim Chinese offline acceptance. If the maintainer supplies the approved manifest, add only its actual URL/bytes/SHA-256/license values and rerun the smoke and browser checks.

- [ ] **Step 6: Commit**

  ```bash
  git add scripts/piper-resource-smoke.mjs scripts/check.mjs scripts/check-build.mjs tests/e2e/offline.spec.js tests/e2e/piper-dev-server.spec.js THIRD_PARTY_NOTICES.md docs/superpowers/specs/2026-09-02-piper-resource-package-design.md
  git commit -m "test: add Piper release and lifecycle gates"
  ```

## Final Verification

After all tasks and task reviews are clean, run the whole-branch review against the merge base and then run:

```bash
npm run verify
npm test
```

Report separately: local tests, build/security checks, CDN smoke evidence, Preview deployment evidence, and real Xiaomi device acceptance. A passing local build does not imply CDN upload, Preview deployment, production release or Xiaomi acceptance.
