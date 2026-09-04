# Release Notes

> This file lists user-visible product changes for each published version.

## v1.4.0 - 2026-09-05

### Print preview

- Fixed the A4 worksheet print preview briefly showing unstyled content while its print resources were loading.
- Kept the Shadow Mate logo visible in browser print previews and exported PDFs by embedding it in the print snapshot.

### Shared curriculum speech

- Fixed curriculum speech is generated before release with Tencent Cloud TTS, using Zhike (`101030`) for Mandarin and WeJack (`101050`) for English, then reused from the shared CDN.
- Browsers no longer download the 154.6 MB Matcha model. If a published clip fails, Shadow Mate tries only a matching system-language voice.
- Matcha is retired after repeated Android browser runtime failures; existing cached copies remain explicitly removable from the guide.

### Retired browser-local voice path

- Fixed the unified package downloading successfully but failing to speak on mobile browsers: the upstream WASM build eagerly reserved a 512 MB shared heap, which could terminate an Android worker after the 149 MB model was unpacked. The mobile-compatible runtime starts at 256 MB and retains memory growth.
- Existing browsers reuse the verified 149 MB model data and fetch only the replacement 12 MB mobile WASM, avoiding a full package download.
- Replaced separate English and Chinese Piper downloads with one 154.6 MB `matcha-icefall-zh-en` offline package powered by the pinned sherpa-onnx v1.13.2 WebAssembly worker.
- Recorded the migration reason: the previous Chinese model mispronounced isolated characters even in native inference, while Matcha passed listening checks for Chinese and English words and sentences. Its mechanical timbre is an accepted current limitation.
- One download serves both languages in the same browser profile and origin; browser security prevents sharing the package across Chrome, Quark, Xiaomi Browser, private profiles, or different domains.
- Unified active Piper CDN voice packages behind the resource registry: verified files are reused within the same browser profile and origin, while the guide reports package status and verified storage size. Switching browsers, profiles, domains, or environments has an independent cache by design.
- Added conservative cross-tab coordination and cache cleanup: concurrent downloads for one package are mutually exclusive, and automatic superseded-version cleanup is skipped unless active use can be established; otherwise old caches remain available until explicitly deleted.
- Added fail-closed CDN download checks for bounded `HEAD` and `GET` requests, manifest `Content-Length`, expected response types, CORS, actual byte count, and SHA-256. Timeouts and validation failures leave the package incomplete and retryable.
- Pinned the bundled Piper runtime audit to upstream commits and local license texts, with the audit required before release checks can approve the app-shell runtime.
- Added local release checks for versioned app-shell cache ownership and browser lifecycle coverage so an app-shell update must retain Piper package cache namespaces and must not trigger a model GET by itself.
- Added a read-only CDN smoke command for approved package manifests. Its result is external CDN evidence, not a local test or a deployment action.
- Opened the approved `zh_CN-chaowen-medium` Chinese Piper package through the same versioned CDN download, integrity, cache, and engine fallback path as English. Its final CDN bytes, hashes, model-card provenance, and CORS smoke evidence must remain attached to the release record; desktop Playwright Preview coverage is not Xiaomi acceptance.
- Fixed Chinese local synthesis so the Pinyin-based Chaowen model receives initial, final, and tone phonemes instead of eSpeak output. English voices continue to use the existing eSpeak runtime; real Xiaomi playback remains a separate Preview acceptance gate.

## v1.3.12 - 2026-09-01

- Fixed a learner switch that could remain incomplete after signing in again and creating a new family space.
- Hardened local and Preview environment boundaries so development does not silently connect to production services.
- Fixed product identification in local Auth emails so they no longer fall back to the Shadow Nexus brand.

## v1.3.11 - 2026-09-01

- Unified product identification for sign-in verification, email changes, invitations, two-factor verification, and password recovery emails.
- Kept the shared SMTP sender as `Shadow Nexus` while showing the correct product brand in the email content.
- Fixed re-login with the same authentication account after deleting family data; users can return to the signed-in state and create a new family learning space.

## v1.3.10 - 2026-08-23

- Fixed daily writing points selecting the wrong workbook across month and year boundaries.
- Fixed concurrency issues during learner switching so records are not written or synced to the wrong learner.

## v1.3.9 - 2026-08-19

- Added Growth Loop points, including a points ledger, custom point items, growth projects, rewards, and redemption.
- Added opening-balance recovery so a parent or guardian can restore previous points once.
- Unified the brand templates for email changes, invitations, two-factor verification, and password recovery.
- Improved the local Supabase test environment connection path.

## v1.3.8 - 2026-08-15

- Moved the offline English speech model for Android devices without GMS to the `voice.shadow.wang` CDN; it is downloaded once, cached, and then available offline.
- Simplified local speech inference by removing local model shards and Worker runtime resources.
- Updated the user guide, third-party notices, and network security policy.

## v1.3.7 - 2026-08-13

- Updated the English speech fallback for Android devices without GMS to `en_US-lessac-high`, improving short or incomplete word output.
- Devices with a usable English system voice continue to prefer system TTS; other devices use local Piper in the browser.

## v1.3.6 - 2026-08-12

- Fixed the privacy policy page displaying raw HTML source.
- Served `/privacy` and `/privacy/` as normal static HTML pages.
- Improved privacy page styling and production compatibility.

## v1.3.5 - 2026-08-12

- Added parent or guardian consent records and learner privacy data boundaries.
- Added a bilingual privacy page and Shadow Mate branded landing content.
- Improved the privacy page growth-track presentation, data-minimization explanation, and mobile layout.
- Improved English speech fallback on domestic Android devices.

## v1.3.4 - 2026-08-10

- Improved offline speech download progress, cancellation, and failure messages.
- Warmed up the speech engine to reduce the wait after downloading a model.
- Fixed incorrect state after local Piper speech failures.
- Improved speech resource loading in development environments.

## v1.3.3 - 2026-08-09

- Automatically fall back to local Piper when system speech is unresponsive or fails.
- Start synthesis directly when an offline speech package is already cached.

## v1.3.2 - 2026-08-09

- Fixed offline speech being blocked by the security policy in macOS Chrome.
- Improved streaming download progress, cancellation, and failure messages.
- Added mobile Web App compatibility metadata.

## v1.3.1 - 2026-08-09

- Added system dark-theme support and improved readability in Android and Chrome night modes.
- Unified dark surfaces and accent colors across the home page, learning controls, guides, speech dialog, and account dialog.

## v1.3.0 - 2026-08-05

- Added a local Piper speech fallback for devices without an English system voice; the model can be downloaded once and used offline in the browser.
- Devices with an English system voice continue to prefer system TTS.

## v1.1.1 - 2026-08-04

- Added sync conflict circuit breaking with manual recovery.
- Fixed point-limit usage being consumed incorrectly during conflict handling.
- Improved conflict recovery and scheduled saves.

## v1.1.0 - 2026-08-03

- Added static-resource version detection and self-healing refreshes for stale or broken pages.
- Added per-user and per-operation request rate limits to protect sync stability.
- Fixed new-user password state detection, password-reset redirects, and family-space initialization.

## v1.0.1 - 2026-08-02

- Unified learning-module check-in statistics, growth calendar legends, and points calendar states.
- Added verification codes, in-app verification links, and multi-product branding to sign-in emails.
- Improved family deletion and in-app error recovery.

## v1.0.0 - 2026-08-01

- Added the learning check-in PWA with Chinese, mathematics, English, and picture-book modules.
- Added points check-ins and growth records.
- Added passwordless parent email sign-in with multiple learners per family.
- Added cross-device cloud sync and offline use.
- Added responsive layouts and optional desktop installation.
- Added family-level data isolation, content security policy, and an ad-free experience.
- Added Chinese sign-in verification emails and magic links.

See [CHANGELOG.md](CHANGELOG.md) for detailed technical changes.
