# Release Notes

> This file lists user-visible product changes for each published version.

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
