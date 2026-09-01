# Shadow Mate

<p align="center">
  <img src="./public/icons/icon-192.png" width="88" alt="Shadow Mate app icon">
</p>

<p align="center">
  <strong>Turn everyday learning into visible growth.</strong><br>
  A family-focused learning check-in PWA for learning, records, and sync in one place.
</p>

<p align="center">
  <code>v1.3.11</code> · <a href="./LICENSE">MIT License</a> · Vite + Vanilla JavaScript + Supabase
</p>

<p align="center">
  <a href="https://sm.shadow.wang/"><strong>Open Shadow Mate</strong></a> ·
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="./docs/user-guide.md">User guide</a> ·
  <a href="./RELEASE_NOTES.md">Release notes</a>
</p>

## What it does

Shadow Mate is designed around a family's daily learning routine:

- Four learning modules: Chinese, mathematics, English, and picture books.
- Daily check-ins, growth records, and a separate behavior-points calendar.
- One parent-managed family space with multiple learners and learner-specific records.
- Passwordless email verification and shared email-password login for Shadow products.
- Offline-first local learning with optional cloud sync after sign-in.
- Cross-device recovery with optimistic version control and conflict protection.
- Responsive layouts for phones, tablets, and desktops, with optional PWA installation.
- Local Piper speech fallback for devices without a usable English system voice.

## Screenshots

<p align="center">
  <img src="./assets/readme/home.png" width="100%" alt="Shadow Mate home screen">
</p>

<p align="center"><sub>The screenshots use local demo data and contain no real family information.</sub></p>

## Quick start

\`\`\`bash
npm ci
npm run dev
\`\`\`

Open the local URL printed by Vite. Do not open \`index.html\` directly with \`file://\`; browser modules require the development server.

The local privacy page is available at \`http://localhost:5173/privacy\`.

## Local development boundaries

For shared local Supabase, Mailpit, database tests, and Edge Functions, use the canonical local entry:

\`\`\`bash
npm run local-dev
\`\`\`

The shared local Supabase API is local-only and Mailpit is available at \`http://127.0.0.1:54324\`. Feature worktrees that start Vite directly must explicitly point the app to loopback Supabase; they do not automatically start Mailpit or switch environments.

Non-production and Preview sources must not connect to production Supabase. Remote production access is blocked unless an explicitly authorized temporary verification override is provided. Never put production credentials or service-role keys in this repository.

For the compatibility wrappers:

\`\`\`bash
npm run supabase:local:start
npm run supabase:local:functions:serve
\`\`\`

Do not run a bare \`supabase start\` in the repository root as a replacement for the shared local entry.

## Validation

\`\`\`bash
npm run check
npm run build
npm run test:fast
npm run test:ui
\`\`\`

Use \`npm run test:full\` before merging or releasing. Choose the smallest sufficient test scope for ordinary changes; database, authentication, sync, security, and release changes require their corresponding checks.

## Data and security model

- Local learning state is stored in the browser and scoped to the active learner.
- Cloud state is stored as versioned JSON snapshots and protected by family boundaries and Supabase RLS.
- If a learner switch cannot confirm the complete active scope, the app fails closed and pauses local and cloud writes until the parent explicitly clears local data.
- Deleting a family removes Shadow Mate's associated family data without deleting the shared Auth identity.
- The repository contains migration proposals and isolated test copies; production migrations are managed by the Shadow Portal control plane. Do not run production \`db push\`, \`migration repair\`, or linked SQL from this repository.

## Repository structure

\`\`\`text
src/                       Application UI, state, auth, sync, and controls
tests/                     Unit, browser, database, and lifecycle tests
supabase/                  Local schema proposals and function sources
scripts/                   Development, validation, and release checks
docs/                      Architecture, user, and release documentation
\`\`\`

## Documentation

| Document | Purpose |
| --- | --- |
| [中文说明](README.zh-CN.md) | Chinese product and development guide |
| [User guide](docs/user-guide.md) | Sign-in, family space, check-ins, sync, speech, and installation |
| [Architecture](docs/architecture.md) | Data model, sync, RLS, migrations, and release boundaries |
| [Release notes](RELEASE_NOTES.md) | User-facing changes for every release |
| [Chinese release notes](RELEASE_NOTES.zh-CN.md) | Chinese translation of the release notes |
| [Release Notes template](docs/release-notes-template.md) | Authoring rules and structure |

## License

The code is released under the [MIT License](LICENSE). Third-party content, models, and trademarks remain the property of their respective owners. See [TRADEMARKS.md](TRADEMARKS.md) for Shadow Mate brand boundaries.

## Contact

- X: [@Gollumgulu](https://x.com/Gollumgulu)
- Product site: [Shadow Nexus](https://www.shadow.wang/)
- Email: [wardlu@126.com](mailto:wardlu@126.com)
