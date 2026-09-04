# Tencent Cloud TTS MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unreliable browser-local Matcha speech path with pre-generated Tencent Cloud MP3 clips for all fixed writing-curriculum speech controls, while retaining same-language system TTS as the only runtime fallback.

**Architecture:** A shared catalog module derives 96 deterministic speech records from the 32 tracked curriculum items. A release-only Node command signs Tencent TTS and COS requests, reuses immutable objects, writes a verified public manifest, and a small browser player resolves content IDs from that manifest and plays CDN audio with immediate busy feedback. Matcha remains deletable as retired browser storage but is removed from the active speech path.

**Tech Stack:** Vite, vanilla JavaScript, Vitest, Playwright, Node.js `crypto`/`fetch`, Tencent Cloud TTS `TextToVoice`, Tencent COS/CDN, HTMLAudioElement, Web Speech API.

**Spec:** `docs/superpowers/specs/2026-09-05-tencent-cloud-tts-mvp-design.md`

## Global Constraints

- Chinese uses locale `zh-CN`, VoiceType `101030`, MP3, 16 kHz; English uses locale `en-US`, VoiceType `101050`, MP3, 16 kHz.
- Only fixed tracked curriculum text is synthesized; no runtime Tencent endpoint or browser credential is introduced.
- Object keys are `tts/tencent/v1/{locale}/{voiceId}/{sha256}.mp3`, and changing any synthesis input creates a new immutable object.
- Runtime order is CDN audio, then a verified same-language system voice, then a stable explicit error; cross-language fallback is forbidden.
- Browser reuse uses normal HTTP caching. No custom Cache Storage is added for MP3 files.
- Preview may proceed under the accepted legal-risk TODO; Production remains blocked pending written Tencent confirmation.
- No database migration is required. No commit, push, PR, merge, or deployment occurs without separate user authorization.

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/tencent-tts-catalog.js` | Shared normalization, fixed voice policy, deterministic IDs/hashes, manifest validation |
| `src/tencent-tts-player.js` | Manifest lookup, in-tab deduplication, CDN playback, stable runtime errors |
| `public/tts/tencent-v1-manifest.json` | Verified, sorted, credential-free mapping from content IDs to immutable CDN audio |
| `scripts/tencent-tts-prewarm.mjs` | Release-only Tencent synthesis, COS reuse/upload/readback, manifest generation |
| `scripts/tencent-tts-smoke.mjs` | Read-only CDN hard gate and playback/decode validation |
| `src/hanzi-writing-view.js` | Stable content IDs and AI-audio disclosure on the three speech controls |
| `src/app.js` | CDN-first orchestration and same-language system fallback |
| `src/piper-resource-registry.js`, `src/piper-resource-ui.js` | Retire Matcha from active speech while preserving explicit cache deletion |
| `vercel.json` | Permit `voice.shadow.wang` in `media-src` without widening other CSP directives |
| `tests/unit/tencent-tts-*.test.js` | Catalog, signing/prewarm, manifest, player and failure-contract coverage |
| `tests/e2e/tts-system-fallback.spec.js`, `tests/e2e/hanzi-writing.spec.js` | Browser interaction, busy state, fallback, no paid runtime request |
| `README.md`, `docs/user-guide.md`, `PRIVACY.md`, `privacy-policy.html`, `THIRD_PARTY_NOTICES.md`, `CHANGELOG.md`, `RELEASE_NOTES*.md`, `docs/releases/1.3.12/CONFIGURATION_IMPACT.json` | Consistent product, privacy, provider, release and configuration records |

---

### Task 1: Deterministic speech catalog and manifest contract

**Files:**
- Create: `src/tencent-tts-catalog.js`
- Create: `tests/unit/tencent-tts-catalog.test.js`

**Interfaces:**
- Consumes: curriculum items shaped as `{ id, glyph, concept }`.
- Produces: `buildTencentSpeechCatalog(items): Promise<SpeechCatalogEntry[]>`, `createTencentSpeechHash(input): Promise<string>`, `validateTencentTtsManifest(manifest, expected): true`, and constants `TENCENT_TTS_POLICY`, `TENCENT_TTS_MANIFEST_URL`.

- [ ] **Step 1: Write failing tests for the exact 96-entry catalog, stable IDs, fixed voices and hash invalidation**

```js
expect(await buildTencentSpeechCatalog(items)).toHaveLength(items.length * 3);
expect(catalog.find((x) => x.contentId === "hz-001:glyph")).toMatchObject({ locale: "zh-CN", voiceId: "101030", text: "一" });
expect(catalog.find((x) => x.contentId === "hz-001:english")).toMatchObject({ locale: "en-US", voiceId: "101050", text: "one" });
expect(catalog.find((x) => x.contentId === "hz-001:meaning")).toMatchObject({ locale: "zh-CN", voiceId: "101030", text: "表示数量一" });
expect(await createTencentSpeechHash({ ...input, voiceId: "101030" })).not.toBe(await createTencentSpeechHash({ ...input, voiceId: "101050" }));
```

- [ ] **Step 2: Run the focused test and verify it fails because the module does not exist**

Run: `npm test -- tests/unit/tencent-tts-catalog.test.js`

- [ ] **Step 3: Implement canonical normalization and SHA-256 derivation with the existing audited hash dependency**

```js
export const TENCENT_TTS_POLICY = Object.freeze({
  "zh-CN": Object.freeze({ voiceId: "101030", speed: 0, codec: "mp3", sampleRate: 16000 }),
  "en-US": Object.freeze({ voiceId: "101050", speed: 0, codec: "mp3", sampleRate: 16000 }),
});

export function normalizeSpeechText(value) {
  const text = String(value || "").normalize("NFC").trim().replace(/\s+/gu, " ");
  if (!text || /[\u0000-\u001f\u007f]/u.test(text) || /https?:\/\//iu.test(text) || /[<>]/u.test(text)) throw new Error("invalid-speech-text");
  return text;
}
```

The hash payload is the newline-joined sequence `tencent`, `v1`, locale, voice ID, speed, codec, sample rate, normalized text. Catalog output is sorted by `contentId` and rejects missing or duplicate IDs.

- [ ] **Step 4: Add strict manifest parity validation**

Validation requires exactly these public fields: `contentId`, `textSha256`, `provider`, `synthesisVersion`, `locale`, `voiceId`, `speed`, `codec`, `sampleRate`, `url`, `bytes`, `audioSha256`. It rejects missing, extra, stale, duplicated, unsorted, wrong-host, mutable-path, non-HTTPS, wrong-voice and malformed hash entries.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- tests/unit/tencent-tts-catalog.test.js`
Expected: PASS.

- [ ] **Step 6: Stage only after explicit commit authorization**

```bash
git add src/tencent-tts-catalog.js tests/unit/tencent-tts-catalog.test.js
```

### Task 2: CDN-first browser player and same-language fallback

**Files:**
- Create: `src/tencent-tts-player.js`
- Create: `tests/unit/tencent-tts-player.test.js`
- Modify: `src/hanzi-writing-view.js`
- Modify: `src/app.js`
- Modify: `vercel.json`
- Modify: `tests/e2e/hanzi-writing.spec.js`
- Modify: `tests/e2e/tts-system-fallback.spec.js`

**Interfaces:**
- Consumes: `loadTencentTtsManifest(fetchImpl)`, `playPublishedSpeech(contentId, options)` and `data-speech-content-id`.
- Produces: `{ status: "played", source: "cdn" }` or stable errors `published-audio-not-found`, `published-audio-timeout`, `published-audio-invalid-type`, `published-audio-http`, `published-audio-playback`.

- [ ] **Step 1: Write failing unit tests for manifest memoization, concurrent-play deduplication and stable errors**

```js
const one = player.play("hz-001:glyph");
const two = player.play("hz-001:glyph");
expect(one).toBe(two);
await expect(player.play("missing:glyph")).rejects.toMatchObject({ code: "published-audio-not-found" });
```

- [ ] **Step 2: Write failing E2E assertions for content IDs, immediate busy state and same-locale fallback**

```js
await expect(button).toHaveAttribute("data-speech-content-id", "hz-001:glyph");
await button.click();
await expect(button).toHaveAttribute("aria-busy", "true");
expect(systemSpeechLocales).toEqual(["zh-CN"]);
```

The E2E route must fail the CDN request and assert that no request targets Tencent Cloud APIs, Piper files or Matcha files.

- [ ] **Step 3: Run focused tests and verify the new expectations fail**

Run: `npm test -- tests/unit/tencent-tts-player.test.js`

Run: `node scripts/run-e2e.mjs tests/e2e/hanzi-writing.spec.js tests/e2e/tts-system-fallback.spec.js`

- [ ] **Step 4: Implement one manifest fetch and one in-flight playback promise per content ID**

```js
export function createPublishedSpeechPlayer({ fetchImpl = fetch, AudioCtor = Audio, timeoutMs = 12000 } = {}) {
  const inFlight = new Map();
  return { play(contentId) {
    if (inFlight.has(contentId)) return inFlight.get(contentId);
    const promise = playOnce(contentId, { fetchImpl, AudioCtor, timeoutMs }).finally(() => inFlight.delete(contentId));
    inFlight.set(contentId, promise);
    return promise;
  }};
}
```

Use `HEAD` only as an optional diagnostic; the hard runtime check is a successful `GET`/media response and actual `audio.play()` success. Revoke any blob URL after playback or failure.

- [ ] **Step 5: Bind stable speech content IDs and replace Matcha/Piper fallback in `speak()`**

Use `${row.id}:glyph`, `${row.id}:english`, `${row.id}:meaning`. Set `aria-busy=true` synchronously on click, try published CDN audio, then invoke the existing system-speech helper only with the requested locale. Preserve the existing user-facing error surface with stage-specific Chinese copy.

- [ ] **Step 6: Extend only CSP `media-src`**

Change `media-src 'self' blob:` to `media-src 'self' blob: https://voice.shadow.wang` and keep `script-src`, `connect-src`, `object-src` and all other directives unchanged.

- [ ] **Step 7: Run focused tests**

Run: `npm test -- tests/unit/tencent-tts-player.test.js`

Run: `node scripts/run-e2e.mjs tests/e2e/hanzi-writing.spec.js tests/e2e/tts-system-fallback.spec.js`
Expected: PASS.

- [ ] **Step 8: Stage only after explicit commit authorization**

```bash
git add src/tencent-tts-player.js src/hanzi-writing-view.js src/app.js vercel.json tests/unit/tencent-tts-player.test.js tests/e2e/hanzi-writing.spec.js tests/e2e/tts-system-fallback.spec.js
```

### Task 3: Release-only synthesis, COS reuse and manifest generation

**Files:**
- Create: `scripts/tencent-tts-prewarm.mjs`
- Create: `tests/unit/tencent-tts-prewarm.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `buildTencentSpeechCatalog(items)`, environment credentials and fixed COS/CDN configuration.
- Produces: `prewarmTencentTts({ catalog, ttsClient, cosClient, cdnFetch, manifestPath, dryRun }): Promise<{ reused, generated, entries }>` and `public/tts/tencent-v1-manifest.json` only after all readbacks pass.

- [ ] **Step 1: Write failing tests around injected fake clients**

Cover: dry-run reports 96 expected entries; existing immutable object is reused; missing object synthesizes once; provider timeout maps to `provider-timeout`; provider messages and base64 audio are redacted; COS upload/readback failure prevents manifest writes; rerun performs zero synthesis; partial failure leaves the previous manifest byte-for-byte unchanged.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- tests/unit/tencent-tts-prewarm.test.js`

- [ ] **Step 3: Implement Tencent TC3 signing and `TextToVoice` without adding a broad SDK**

Use Node `crypto.createHmac`/`createHash`, endpoint `tts.tencentcloudapi.com`, service `tts`, action `TextToVoice`, API version `2019-08-23`, region from `TENCENT_TTS_REGION`, and a 20-second `AbortSignal.timeout`. Request payload uses only the fixed catalog voice, locale-derived text, `Codec: "mp3"`, `SampleRate: 16000`, `Speed: 0`, `Volume: 0`, and a random `SessionId` that is not persisted.

- [ ] **Step 4: Implement narrowly scoped COS HEAD/PUT and CDN readback**

Read `TENCENT_COS_BUCKET=shadow-mate-voice-1307628881`, `TENCENT_COS_REGION=ap-guangzhou`, `TENCENT_TTS_CDN_BASE=https://voice.shadow.wang`. Upload only beneath `tts/tencent/v1/`; set `Content-Type: audio/mpeg`, `Cache-Control: public, max-age=31536000, immutable`, and non-secret metadata for provider/version/voice. Never log secret IDs, signatures, source text or audio bytes.

- [ ] **Step 5: Validate MP3 bytes before upload and after CDN readback**

Require non-empty bytes, `audio/mpeg`, matching `Content-Length`, matching SHA-256, and MP3 frame/ID3 signature. Treat CORS as valid only for `*`, `https://preview-sm.shadow.wang`, or `https://sm.shadow.wang`; require `GET` and `HEAD`, and exposed `Content-Length`. Record ETag/range as diagnostics only.

- [ ] **Step 6: Write the manifest atomically only after every entry verifies**

Write a sibling temporary file, parse and validate it with `validateTencentTtsManifest`, then rename it to `public/tts/tencent-v1-manifest.json`. The command supports `--dry-run`, `--manifest <path>`, and `--output-dir <path>` for audition files; unknown flags fail closed.

- [ ] **Step 7: Add explicit package scripts**

```json
{
  "tts:catalog": "node scripts/tencent-tts-prewarm.mjs --dry-run",
  "tts:prewarm": "node scripts/tencent-tts-prewarm.mjs",
  "tts:smoke": "node scripts/tencent-tts-smoke.mjs"
}
```

- [ ] **Step 8: Run focused tests and a credential-free dry run**

Run: `npm test -- tests/unit/tencent-tts-prewarm.test.js tests/unit/tencent-tts-catalog.test.js`

Run: `npm run tts:catalog`
Expected: 96 sorted entries, zero network writes, no credential requirement.

- [ ] **Step 9: Stage only after explicit commit authorization**

```bash
git add scripts/tencent-tts-prewarm.mjs tests/unit/tencent-tts-prewarm.test.js package.json
```

### Task 4: CDN manifest release gate

**Files:**
- Create: `scripts/tencent-tts-smoke.mjs`
- Create: `tests/unit/tencent-tts-smoke.test.js`
- Modify: `scripts/check.mjs`
- Modify: `scripts/release-check.mjs`

**Interfaces:**
- Consumes: committed `public/tts/tencent-v1-manifest.json` and optional `--origin`.
- Produces: zero exit only when all manifest records pass HTTP, media type, byte length, SHA-256, CORS and MP3 decode/signature checks.

- [ ] **Step 1: Write failing tests for each hard gate and non-blocking diagnostics**

Test 404, wrong media type, wrong length, wrong hash, missing CORS origin/method/exposed length, invalid MP3, and HEAD/range absence. Only the last diagnostic case may pass.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- tests/unit/tencent-tts-smoke.test.js`

- [ ] **Step 3: Implement the read-only smoke command with bounded concurrency of four**

The command never sends credentials or writes remote state. It accepts only manifest URLs under `https://voice.shadow.wang/tts/tencent/v1/` and prints content ID, status, bytes, latency and stable error category without source text.

- [ ] **Step 4: Add local parity checks and external release gate**

`scripts/check.mjs` recomputes the complete catalog and requires exact manifest parity. `scripts/release-check.mjs` invokes the external smoke command only when `--external` or the repository's existing external-release mode is selected; ordinary unit tests remain network-independent.

- [ ] **Step 5: Run focused and static checks**

Run: `npm test -- tests/unit/tencent-tts-smoke.test.js tests/unit/tencent-tts-catalog.test.js`

Run: `npm run check`
Expected: PASS once a verified manifest exists; before credentials/prewarming, report the manifest as the sole external-resource blocker rather than silently succeeding.

- [ ] **Step 6: Stage only after explicit commit authorization**

```bash
git add scripts/tencent-tts-smoke.mjs scripts/check.mjs scripts/release-check.mjs tests/unit/tencent-tts-smoke.test.js
```

### Task 5: Retire Matcha safely and preserve explicit storage cleanup

**Files:**
- Modify: `src/piper-resource-registry.js`
- Modify: `src/piper-resource-ui.js`
- Modify: `src/app.js`
- Modify: `tests/unit/piper-resource-registry.test.js`
- Modify: `tests/unit/piper-resource-ui.test.js`
- Modify: `scripts/check.mjs`

**Interfaces:**
- Consumes: existing `UNIFIED_OFFLINE_VOICE_PACKAGE_ID`, cache status and delete functions.
- Produces: `listRetiredPiperCdnVoicePackages()` and a delete-only retired-resource row; no active Matcha download/synthesis path.

- [ ] **Step 1: Write failing tests for retired package behavior**

```js
expect(listActivePiperCdnVoicePackages()).toEqual([]);
expect(listRetiredPiperCdnVoicePackages().map((x) => x.id)).toContain(UNIFIED_OFFLINE_VOICE_PACKAGE_ID);
expect(container.textContent).toContain("已停用，可删除以释放空间");
expect(container.querySelector('[data-piper-resource-action="download"]')).toBeNull();
expect(container.querySelector('[data-piper-resource-action="delete"]')).not.toBeNull();
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- tests/unit/piper-resource-registry.test.js tests/unit/piper-resource-ui.test.js`

- [ ] **Step 3: Mark Matcha retired and render it only when cached or partially cached**

Set `releaseApproved: false`, add `lifecycle: "retired"`, retain provenance/license metadata, and expose it through the retired list. The manager must not offer download/retry, must keep deletion explicit, and must not automatically remove another tab's cache.

- [ ] **Step 4: Remove active Matcha imports, warmup and download-dialog copy from `src/app.js`**

Do not delete vendored runtime files in this MVP; retain their audited notices for prior-release rollback and existing-cache cleanup. Static checks must no longer require an active CDN voice package.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- tests/unit/piper-resource-registry.test.js tests/unit/piper-resource-ui.test.js tests/unit/tencent-tts-player.test.js`
Expected: PASS.

- [ ] **Step 6: Stage only after explicit commit authorization**

```bash
git add src/piper-resource-registry.js src/piper-resource-ui.js src/app.js scripts/check.mjs tests/unit/piper-resource-registry.test.js tests/unit/piper-resource-ui.test.js
```

### Task 6: Documentation, release impact and final verification

**Files:**
- Modify: `README.md`
- Modify: `docs/user-guide.md`
- Modify: `docs/architecture.md`
- Modify: `PRIVACY.md`
- Modify: `privacy-policy.html`
- Modify: `THIRD_PARTY_NOTICES.md`
- Modify: `CHANGELOG.md`
- Modify: `RELEASE_NOTES.md`
- Modify: `RELEASE_NOTES.zh-CN.md`
- Modify: `docs/releases/1.3.12/CONFIGURATION_IMPACT.json`
- Modify: `docs/superpowers/specs/2026-09-05-tencent-cloud-tts-mvp-design.md`

**Interfaces:**
- Consumes: final implementation behavior and external verification evidence.
- Produces: one consistent release narrative and explicit Preview/Production gates.

- [ ] **Step 1: Update user and architecture documents with the implemented runtime order**

State that fixed AI-generated clips are synthesized at release time, reused through the shared CDN, normally cached by the browser, and fall back only to a matching system language. Remove claims that users must download one 154.6 MB Matcha package.

- [ ] **Step 2: Update privacy and third-party/provider notices**

State that only tracked public curriculum text is sent to Tencent during release preparation; no learner text, microphone audio, account data or learning history is sent at playback. Preserve old Matcha attribution as retired/rollback material. Keep the unresolved redistribution permission as an explicit Production-blocking checkbox with the existing 2026-09-05 acceptance record.

- [ ] **Step 3: Update changelog, bilingual release notes and configuration impact**

Record why Matcha was superseded: native auditions passed, but Xiaomi/Chrome/Quark browser runtime acceptance repeatedly failed after verified download. Record required release-time CAM permissions, TTS quota check, COS prefix, CDN headers/CORS, ordered prewarm/audition/readback/manifest/deploy flow, `production-impact: true`, `db-migration: false`, and no Tencent secret in Vercel.

- [ ] **Step 4: Run documentation and targeted verification**

Run: `git diff --check`

Run: `npm test -- tests/unit/tencent-tts-catalog.test.js tests/unit/tencent-tts-player.test.js tests/unit/tencent-tts-prewarm.test.js tests/unit/tencent-tts-smoke.test.js tests/unit/piper-resource-registry.test.js tests/unit/piper-resource-ui.test.js`

Run: `node scripts/run-e2e.mjs tests/e2e/hanzi-writing.spec.js tests/e2e/tts-system-fallback.spec.js`

Run: `npm run verify`

Expected: all local checks pass against the exact worktree HEAD. External TTS/COS work is reported separately until credentials and generated manifest are available.

- [ ] **Step 5: Perform the ordered Preview resource procedure when release credentials are available**

```bash
npm run tts:catalog
npm run tts:prewarm -- --output-dir artifacts/tencent-tts-audition
npm run tts:smoke -- --origin https://preview-sm.shadow.wang
```

Audition `花`, `从云中降落的水滴`, `花朵开了。天空下着细细的雨。`, `rain`, and `Hello, nice to meet you.` before accepting the manifest. Record before/after provider quota and generated/reused counts. Do not promote to Production while the permission checkbox remains open.

- [ ] **Step 6: Review the final diff and stage only after explicit commit authorization**

```bash
git status --short
git diff --check
git diff --stat
git add README.md docs/user-guide.md docs/architecture.md PRIVACY.md privacy-policy.html THIRD_PARTY_NOTICES.md CHANGELOG.md RELEASE_NOTES.md RELEASE_NOTES.zh-CN.md docs/releases/1.3.12/CONFIGURATION_IMPACT.json docs/superpowers/specs/2026-09-05-tencent-cloud-tts-mvp-design.md public/tts/tencent-v1-manifest.json
```
