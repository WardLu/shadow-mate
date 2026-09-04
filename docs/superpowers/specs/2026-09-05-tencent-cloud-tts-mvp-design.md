# Tencent Cloud TTS MVP Design

## Decision

Shadow Mate will use release-time Tencent Cloud text-to-speech to build the primary audio source for fixed curriculum content, served from the existing COS/CDN. Chinese speech uses the audition-approved premium voice `101030` (Zhike/智柯). English speech uses premium voice `101050` (WeJack). A matching browser system voice is used only when the published CDN audio cannot be played. The browser-local sherpa-onnx Matcha package is removed from the active speech path because Xiaomi-device acceptance showed that its worker can still fail after a verified download.

Tencent synthesis is a release operation, not a public runtime endpoint. Tencent credentials never enter application JavaScript, Vercel runtime configuration, static assets, browser storage, URLs, logs, or repository files.

## MVP scope

The MVP covers the existing Chinese-character learning controls:

- Chinese character pronunciation and Chinese definition/example reading use `zh-CN` and voice `101030`.
- English word pronunciation uses `en-US` and voice `101050`.
- Only fixed curriculum text tracked by Shadow Mate is synthesized.
- Preview deployment and Xiaomi-browser acceptance are included.

The MVP does not add a user-facing voice picker, native mobile SDK, account requirement, database migration, public synthesis endpoint, user-entered arbitrary TTS, production deployment, or a new paid storage product.

## Request flow

1. A release-time script extracts every speech item from the tracked curriculum, normalizes locale and text, and derives a versioned SHA-256 cache key from provider, voice, locale, speed, codec, and normalized text.
2. The script checks the deterministic object path in the existing `shadow-mate-voice-1307628881` COS bucket.
3. Existing objects are reused. Missing objects are synthesized through Tencent Cloud `TextToVoice`, verified as playable MP3, and uploaded to COS.
4. After every upload, the script reads the final object back through the CDN and verifies its status, media type, byte length, SHA-256, and CORS headers. It then writes a sorted public manifest that maps curriculum speech IDs to immutable CDN objects and records the verified metadata. It contains no credentials or source text.
5. At runtime, the client resolves the speech ID from the manifest, fetches the immutable object from `voice.shadow.wang`, verifies a successful audio response, and plays it. Standard browser HTTP caching provides repeat reuse.
6. A missing or invalid shared object is a published-audio defect. The client tries a matching same-language system voice and reports an explicit error if that also fails. The browser does not call Tencent Cloud dynamically.

The object layout is:

```text
tts/tencent/v1/zh-CN/101030/{sha256}.mp3
tts/tencent/v1/en-US/101050/{sha256}.mp3
```

The hash input includes all synthesis parameters, so changing voice, speed, codec, provider, or normalization creates a new immutable object instead of silently changing an existing recording. Object metadata records the non-secret synthesis version and content type; object names and access logs do not contain the original text.

Each manifest entry contains exactly:

```text
contentId, textSha256, provider, synthesisVersion, locale, voiceId,
speed, codec, sampleRate, url, bytes, audioSha256
```

The manifest is committed only after CDN readback succeeds. CI recomputes the expected `contentId`, `textSha256`, locale, voice, synthesis parameters, and sorted entry set from tracked curriculum content. The release-time external check verifies URL, response type, length, hash, CORS, and playback decoding against the committed manifest. A missing, extra, stale, or unverifiable entry fails the release gate. ETag and byte-range support may be recorded as diagnostics but do not block this short-audio MVP.

CDN audio responses use `Content-Type: audio/mpeg` and `Cache-Control: public, max-age=31536000, immutable`, support `GET` and `HEAD`, and expose `Content-Length` through CORS. Preview and Production origins must both be allowed before their respective deployments.

## Shared reuse and prewarming

The shared COS/CDN layer is the primary cost-control mechanism. All users reuse one generated object for identical curriculum text, and standard browser HTTP caching avoids repeat transfers when available. Normal product usage therefore consumes CDN traffic but zero Tencent synthesis characters.

A repository script extracts the fixed Chinese-writing curriculum speech strings, produces the same deterministic keys as the runtime, and reports missing objects. An authenticated release-time command performs prewarming and is idempotent: existing immutable objects are never regenerated. The first Preview release prewarms the current writing curriculum before mobile acceptance.

Curriculum additions remain supported through the release process: updating tracked content changes the manifest input, the release check reports missing audio, and prewarming creates only the new objects. This does not limit future fixed curriculum, but arbitrary user-entered speech remains outside the MVP.

## Security and abuse controls

- Tencent Cloud credentials are release-only secrets. A dedicated CAM identity receives only the TTS call permission and write/read permission for the single COS prefix.
- Locale and voice are fixed by the release configuration (`zh-CN`/`101030` and `en-US`/`101050`); content cannot choose another billable voice or synthesis model.
- Text is read from validated repository content, normalized, must be non-empty, and is capped below Tencent's API limits. Control characters, markup, URLs, and unsupported content are rejected before synthesis.
- Provider error responses, credentials, and base64 audio are not logged. Release diagnostics may contain the tracked content ID, request ID, locale, voice ID, cache state, latency, response size, and stable error category.
- The browser has read-only CDN access and never receives Tencent or COS write credentials.
- There is no public paid synthesis endpoint to abuse.

## Privacy

Release-time synthesis sends fixed, public curriculum text to Tencent Cloud before users access it. Runtime playback sends no learner-provided text to Tencent Cloud. It does not send microphone audio, recordings, learner names, authentication tokens, household identifiers, or learning history. User-facing documentation and privacy notices must distinguish system TTS, CDN audio playback, browser audio caching, release-time Tencent synthesis, and the retired browser-local Matcha experiment.

## Failure handling

- Shared-object `404`, invalid content type, timeout, and playback failure have separate stable error codes. After a CDN failure, the client tries a matching browser system voice for the same locale. It must never fall back across languages. If system speech is unavailable or does not start, the UI reports that the published AI audio is unavailable and identifies the retryable stage; none of these runtime failures trigger a paid provider request.
- Provider, quota, synthesis, validation, and COS-write failures stop the release-time prewarm command and identify the affected content ID.
- If synthesis succeeds but COS write or readback fails, the release remains incomplete; it must not claim shared persistence.
- Repeated clicks for the same cache key share one in-flight promise in a tab.
- The old Matcha package is not automatically deleted in the MVP. The UI stops offering it and the resource manager labels it retired so the user can explicitly reclaim storage.

## Ordered release procedure

Preview release follows this order and may not skip or reorder the external-resource steps:

1. Extract and validate the complete speech catalog from the final candidate source revision.
2. Record provider quota before synthesis; synthesize only missing deterministic objects with the fixed voices.
3. Audition the required Chinese single-character, Chinese sentence, English word, and English sentence samples from the generated files.
4. Upload missing MP3 objects to the versioned COS prefix with immutable metadata.
5. Read every catalog object back through `voice.shadow.wang`; verify media type, bytes, SHA-256, CORS, and playback decoding. Record ETag and range support only as non-blocking diagnostics.
6. Generate the sorted manifest from the verified final objects, commit it with the implementation, and run local checks.
7. Run hosted CI and the external CDN manifest gate against the exact PR head. Record provider usage after synthesis and the number of reused/generated objects.
8. Only after steps 1–7 pass, merge to `preview`. The merge triggers Vercel deployment; no Preview deployment may be treated as ready before the fixed domain serves the merge commit and matching manifest.
9. Verify `preview-sm.shadow.wang` on desktop, Xiaomi Browser, mobile Chrome, and Quark. Verify first CDN playback, repeat HTTP-cache reuse when the browser provides it, same-locale system fallback, and no additional provider usage during runtime.
10. Record Preview evidence and remaining Production blockers in the release-impact receipt. Production remains separately authorized and blocked by the accepted licensing TODO.

Rollback reverts the application and manifest to the prior known-good revision. Content-addressed COS objects are immutable and may remain unused; rollback must not overwrite or delete them. The retired Matcha path remains available only as the prior application revision's fallback, not as a mixed runtime with the new manifest.

## Verification

Automated checks cover:

- deterministic cache-key and manifest parity between browser and prewarm script;
- locale-to-voice enforcement (`101030` and `101050` only);
- release-input validation, provider timeout, provider error redaction, COS write/readback failure, and idempotent prewarming;
- shared-CDN playback, standard HTTP-cache reuse, concurrent click deduplication, playback failure, and same-language system-voice fallback;
- no Tencent secret or full text in browser bundles and logs;
- documentation and release-impact metadata.

Preview acceptance uses the same fixed samples auditioned during selection:

- Chinese character: `花`
- Chinese definition: `从云中降落的水滴`
- Chinese sentence: `花朵开了。天空下着细细的雨。`
- English word: `rain`
- English sentence: `Hello, nice to meet you.`

Acceptance requires first-play success on Xiaomi Browser, mobile Chrome, and Quark; a repeat play must not invoke Tencent synthesis; a clean-browser second device must use the shared COS/CDN object without another Tencent synthesis. Provider usage, generated manifest, and COS objects are read back after the test. Desktop success alone is insufficient.

## Documentation and release impact

The implementation updates the architecture/user guide, privacy documents, third-party/provider notices, changelog, release notes, and release configuration-impact record. User-facing guidance identifies the clips as AI-generated speech. The records explain why the approved offline Matcha model was superseded: native audition validated pronunciation, but browser-mobile runtime acceptance repeatedly failed after successful package download.

The change has production impact because Preview and any later Production release require a restricted release-time CAM identity, COS prefix access, CDN behavior, provider quota checks, and successful audio prewarming before deployment. Vercel receives no Tencent secret. The change has no database migration impact.

## Accepted MVP risk and follow-up

The public Tencent Cloud TTS product page describes commercial scenarios such as customer service, reading, broadcasting, and mobile applications, while the currently published service terms contain language that may restrict generated audio to personal use and prohibit providing it to third parties. The applicability of that clause to standard API customers caching fixed curriculum audio in their own COS/CDN is unresolved.

The product owner explicitly accepted this uncertainty for the Preview MVP on 2026-09-05. This acceptance permits Preview implementation and private product validation only; it does not establish redistribution rights and does not authorize Production promotion.

- [ ] Before Production promotion, obtain written Tencent Cloud confirmation that audio generated with premium voices `101030` and `101050` may be stored in the account's COS bucket and delivered through the account's CDN to Shadow Mate end users. Record the support ticket or contract reference, applicable product/SKU, permitted use, AI-generated-content labeling requirement, and any additional voice authorization. If permission is denied or remains ambiguous, replace the provider or remove shared distribution before Production.
