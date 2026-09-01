# Shadow Mate

<p align="center">
  <img src="./public/icons/icon-192.png" width="88" alt="Shadow Mate app icon">
</p>

<p align="center">
  <strong>Turn everyday learning into visible growth.</strong><br>
  A family-focused learning check-in PWA for learning, records, and sync in one place.
</p>

<p align="center">
  <code>v1.3.12</code> · <a href="./LICENSE">MIT License</a> · Vite + Vanilla JavaScript + Supabase
</p>

<p align="center">
  <a href="https://sm.shadow.wang/"><strong>Open Shadow Mate</strong></a> ·
  English · <a href="./README.zh-CN.md">简体中文</a> ·
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
<p align="center"><sub>Home screen example using local demo data; no real family information is included.</sub></p>

<p align="center">
  <img src="./assets/readme/growth-calendar.png" width="100%" alt="Shadow Mate growth calendar">
</p>
<p align="center"><sub>The growth calendar counts completed learning modules separately from behavior points.</sub></p>

<p align="center">
  <img src="./assets/readme/points-calendar.png" width="100%" alt="Shadow Mate points calendar">
</p>
<p align="center"><sub>The points calendar shows positive, negative, and mixed behavior-point records by date.</sub></p>

## Quick start

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. Do not open `index.html` directly with `file://`; browser modules require the development server. The local privacy page is available at [http://localhost:5173/privacy](http://localhost:5173/privacy).

## Local development boundaries

Use the canonical local entry for shared Supabase, Mailpit, database tests, and Edge Functions:

```bash
npm run local-dev
```

Mailpit is available at [http://127.0.0.1:54324](http://127.0.0.1:54324). Feature worktrees that start Vite directly must explicitly point the app to loopback Supabase; they do not automatically start Mailpit or switch environments. Non-production and Preview sources must not connect to production Supabase. Never commit production credentials or service-role keys.

Compatibility wrappers:

```bash
npm run supabase:local:start
npm run supabase:local:functions:serve
```

Do not run a bare `supabase start` in the repository root as a replacement for the shared local entry.

## Validation

```bash
npm run check
npm run build
npm run test:fast
npm run test:ui
```

Use `npm run test:full` before merging or releasing. Database, authentication, sync, security, and release changes require their corresponding checks.

## Data and security model

- Local learning state is stored in the browser and scoped to the active learner.
- Cloud state is stored as versioned JSON snapshots and protected by family boundaries and Supabase RLS.
- If a learner switch cannot confirm the complete active scope, the app fails closed and pauses local and cloud writes until the parent explicitly clears local data.
- Deleting a family removes Shadow Mate's associated family data without deleting the shared Auth identity.
- Production migrations are managed by the Shadow Portal control plane. Do not run production `db push`, `migration repair`, or linked SQL from this repository.

## Documentation

| Document | Purpose |
| --- | --- |
| [中文说明](README.zh-CN.md) | Complete Chinese product and development guide |
| [User guide](docs/user-guide.md) | Sign-in, family space, check-ins, sync, speech, and installation |
| [Release notes](RELEASE_NOTES.md) | English user-facing changes |
| [Chinese release notes](RELEASE_NOTES.zh-CN.md) | Chinese user-facing changes |
| [Release Notes template](docs/release-notes-template.md) | Authoring rules and structure |
| [Third-party notices](THIRD_PARTY_NOTICES.md) | Included libraries and assets |

## Contact

I share product and AI-building work across several channels:

- X: [@Gollumgulu](https://x.com/Gollumgulu)
- WeChat Official Account: **Ward 的 AI 产品实战**
- Xiaohongshu / Weibo / Douyin: **Ward 的 AI 产品实战** — [Xiaohongshu](https://xhslink.cn/m/4W1NWyRrxv5) · [Weibo](https://weibo.com/u/8344390431) · [Douyin](https://v.douyin.com/1y06PMohfoE/)
- Product site: [Shadow Nexus](https://www.shadow.wang/)
- Email: [wardlu@126.com](mailto:wardlu@126.com)

## License

The code is released under the [MIT License](LICENSE). Third-party content, models, and trademarks remain the property of their respective owners.
