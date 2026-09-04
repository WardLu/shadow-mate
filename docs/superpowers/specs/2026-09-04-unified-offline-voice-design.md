# Unified Offline Chinese-English Voice Design

## Decision

Shadow Mate will replace the separate English and Chinese Piper fallback packages with one browser-local `matcha-icefall-zh-en` package running on the official sherpa-onnx WebAssembly TTS runtime. The package synthesizes both Mandarin and English; users approve and download it once per browser profile and site origin.

System voices remain the first choice when they are usable. The unified local package is the deterministic fallback for browsers such as Xiaomi and Quark that do not expose a working system Mandarin or English voice.

## Why this changes

The original English Piper package worked for English but could not synthesize Mandarin. The added `zh_CN-chaowen-medium` Piper package passed transport and cache checks, but listening tests showed that isolated `雨`、`风` and `牛` were pronounced incorrectly while `花` was correct. Direct native inference produced the same errors, so the defect belongs to the model's isolated-syllable behavior rather than the browser integration.

Kokoro was rejected after audition: its quantized build produced silent output in the tested runtime, while the non-quantized build added incorrect leading sounds and remained unsuitable for isolated-character teaching. MeloTTS also failed isolated-character validation. The official `matcha-icefall-zh-en` model was then auditioned at normal speed using Chinese single characters (`花`、`雨`、`风`、`牛`), English words (`flower`, `rain`, `wind`, `cow`), a Chinese definition/example sentence, and an English sentence. Pronunciation and completeness were accepted on 2026-09-04; the mechanical timbre is an accepted first-version limitation.

## Package and runtime

- Runtime and prebuilt browser package: sherpa-onnx `v1.13.2`, fixed release asset `sherpa-onnx-wasm-simd-1.13.2-matcha-icefall-zh-en.tar.bz2`.
- Model: `matcha-icefall-zh-en`, one speaker, 16 kHz, Chinese and English.
- Package payload: the release's `sherpa-onnx-wasm-main-tts.data` and `sherpa-onnx-wasm-main-tts.wasm`; the JavaScript adapter and worker are vendored from the same fixed release.
- Distribution: large immutable payloads are served from `https://voice.shadow.wang/`; small JavaScript adapters are served with the application.
- Integrity: every CDN payload has an exact byte size and SHA-256 in the resource registry. A package is `completed` only after all required files pass validation and the completion manifest is persisted.

The UI describes this as one "离线中英文语音包" even though the implementation contains a model data bundle, a WASM runtime, and adapter files. Its displayed size comes from the registry and must not use an outdated estimate.

## Browser storage boundary

Cache Storage is isolated by browser profile and origin. Chrome, Quark, Xiaomi Browser, private browsing profiles, and different origins cannot share one downloaded package. "Download once" therefore means once for the same browser profile on the same Shadow Mate origin. Product copy must state this limitation and must not promise cross-browser reuse.

The existing package store keeps cross-tab leases and completed manifests. The unified package uses a new immutable package ID/version. Old Piper caches are eligible for cleanup only after the new package is completed and no active lease protects the old cache.

## Speech flow

1. A speech request specifies text and locale (`zh-CN` or `en-US`).
2. If the unified package is already completed, use it directly so a cached deterministic voice is not bypassed by an unreliable system voice.
3. Otherwise try the matching browser system voice.
4. If system speech is unavailable or does not start, ask once to download the unified package.
5. Download all immutable payloads with progress, cancellation, timeout, cross-tab locking, content-type/size/hash validation, and resumable completed-file reuse.
6. Initialize sherpa-onnx in a module worker. Generate audio off the main thread and return PCM samples for playback.
7. On initialization or generation failure, reset the worker and show a specific retryable error. Never fall back across languages to the wrong voice.

## Acceptance

- One completed package serves both `zh-CN` and `en-US` requests.
- The dialog appears as one unified Chinese-English package and reports the registry-derived total size and browser-local storage boundary.
- Partial, corrupt, cancelled, timed-out, or cross-tab-contended downloads never become `completed`.
- Cached operation works after reload and offline reopening in the same browser profile.
- The four approved Chinese characters and four English words reach the same local provider in tests; long Chinese and English inputs are supported.
- The official payload source, fixed version, fingerprints, licenses, and migration reason are documented.
- Desktop browser smoke passes before Preview deployment. Xiaomi/Quark/Chrome mobile generation time and memory remain a Preview acceptance gate, not a locally proven claim.

## Non-goals

- Improving the accepted mechanical voice timbre.
- Sharing Cache Storage between different browsers or origins.
- Publishing to Production.
- Database, Supabase, authentication, or learner-data changes.
