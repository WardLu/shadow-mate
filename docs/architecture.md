# Shadow Mate architecture

Shadow Mate is a Vite and vanilla-JavaScript local-first PWA. `src/app.js` assembles the UI, `src/learning-desk.js` owns local learning state, `src/learner-session.js` owns learner scope transitions, and `src/cloud.js` owns authentication and remote household synchronization. Supabase changes in this repository are proposals for the shared Shadow Portal control plane.

## Local state and learner transitions

`createLearnerSession` accepts the existing learning and Growth Loop adapters through accessors so the two entry scripts can share one instance. It owns the serialized operation queue, cancellation tokens, the active learner storage key, scope readback and rollback, and the persistent fail-closed marker. Growth Loop loads first; Learning Desk loads second. The transition publishes a committed result only after both scopes agree. A failed load returns `restored` when compensation succeeds, or `blocked` when it cannot confirm recovery; the account panel owns the corresponding user-facing message.

Cloud metadata (profile display fields, snapshot versions, conflict protection and retry scheduling) stays in `cloud.js`. Remote operations capture an opaque token before starting; stale results cannot update the active learner. Debounced snapshot saves retain their captured learner and payload, preserving the existing behavior for edits made before a switch. The shared queue also serializes explicit sync and import confirmation. Changing account identity invalidates old operations; refreshing an unchanged identity alone does not. Auth workspace refreshes may separately invalidate pending work.

`createLearningDesk` owns the state envelope, existing v2 learner keys, v1 compatibility writes, pending-state adoption, and local cleanup. It returns detached copies. The app keeps a view draft and explicitly submits it; rendering subscriptions do not automatically save. Existing daily worksheet materialization may still explicitly save a newly assigned worksheet. A storage exception is not reported as a successful save. Both localStorage and IndexedDB cleanup must finish before protection is released; clearing state does not delete the shared Auth identity.

There is no cross-storage atomic transaction. Existing guarded IndexedDB writes, compensating scope restoration and fail-closed behavior remain necessary. The block marker is read from localStorage and sessionStorage, written to localStorage, and removed from both on successful cleanup. Write guards recheck the marker to honor another tab entering protection.

The temporary `window.learningDesk`, `window.growthLoop`, `window.learnerSession` and `window.cloudSync` entries share the runtime instances. `getPersistenceScope`, `renderCurrent` and the string-based `activateScope` bridge remain for existing browser integration; unused persistence-status and cloud-confirmation stubs were removed. The detached `src/local-state.js` implementation and retired voice assets are outside this refactor's cleanup scope.

## 年龄学习包与内容进度

`src/learning-content-package.js` 定义 4–5 岁启蒙包、5–6 岁幼小衔接包及默认关闭的语言听说模块。年龄包引用共用内容目录；切换包保留同一孩子的实际体验记录。推荐年龄不表示自动能力测评。

`src/content-learning.js` 在 `learning.extra.contentLearningV1` 保存内容引入、完成、家长反馈、跳过、撤回标记和每日计划候选。计划按未完成、到期重温和新体验的预算安排，首页与学科页共用同一计划。完成使用稳定 occurrence ID；取消模块打卡不删除内容事实。多端合并保留分歧计划和撤回标记，不把两端练习计数相加。内层账本和云端 envelope 都必须匹配当前孩子作用域，匿名导入需要明确的作用域迁移。

写字提供常驻四行字帖与 A4 打印；通过 `resolveWritingWorksheet()` 接收统一计划的选题并补齐四行（候选不足 4 个时补充简单入门字或标准空白田字格降级练习，空白行不产生虚假学习事实）。已发当天字帖继续复用。版本合并只接受同一 `setId` 下实际登记的内容版本，保留历史快照自己的 `packRef`。

`src/spoken-language-courses.js` 分开定义目标语言、地区变体和课程身份。当前课程均为准备中，不提供完成入口，不计入有效打卡模块。粤语系统语音要求匹配目标声音，没有匹配声音时返回不可用。

## Fixed curriculum speech

`src/tencent-tts-catalog.js` derives stable speech IDs and content-addressed object keys from the writing curriculum and `src/content/core-learning-speech.js`. `src/content/literacy.js` supplies the literacy cards; `src/content/literacy-speech.js` maps their text and every writing-card image, word, sentence and hint to published speech IDs using the same text normalization as the UI. The release-only `scripts/tencent-tts-prewarm.mjs` calls Tencent Cloud TTS with Zhike (`101030`) for `zh-CN` and WeJack (`101050`) for `en-US`, uploads only missing immutable MP3 objects to COS, verifies every object through `voice.shadow.wang`, and atomically writes the public manifest only after all readbacks pass.

### Speech catalog maintenance

The published manifest contains 2,385 entries (1,944 Chinese, 441 English). The expanded catalog is derived from the active content registries; `npm run tts:catalog` reports unchanged, added, changed and removed entries without network writes. All 2,385 entries match the published manifest. Existing published IDs, text hashes and synthesis parameters stay compatible. Speech assets require paid synthesis, CDN readback and verification before release; local fallback does not satisfy manifest parity. Math fragments cover numbers from 0 to 100, while age-package settings constrain each question's operands and result. Each question plays four fragments (operand, operator, operand, question suffix). Synthesis is never performed during user playback.

Run `npm run tts:catalog` for a network-free inventory. `npm run tts:prewarm` reads exported `TENCENTCLOUD_SECRET_ID` and `TENCENTCLOUD_SECRET_KEY` from the same terminal, or the optional `.env.tts.local` file. An absent file is harmless when environment variables are present. Exported values are inherited only by child processes, not unrelated terminals or agent sessions. Never put credentials in browser variables or tracked files.

Prewarm calls the paid TTS service and writes missing objects to COS; its final `reused`, `generated` and `entries` statistics describe the completed run. The manifest updates only after every readback passes. Validate with `npm run tts:smoke -- --origin http://192.168.124.14:5173` for the local device-test origin, and `npm run verify` for catalog parity, build and unit checks. Existing objects are reused, including identical text shared across entries.

CDN smoke checks keep a 20-second deadline per request, including response-body download, with four concurrent checks. Failures report the public content ID, a fixed reason and the stage (`entry`, `request`, `headers`, `body`, `verify` or `decode`); logs omit the raw URL, response body and underlying error text. `request` identifies waiting for a response but does not distinguish DNS, TLS or first-byte delays. A passing check on one network does not replace acceptance on another path.

On 2026-09-09, all 634 manifest entries passed CDN hash, size, media and CORS checks (4,003,200 summed bytes). The user confirmed Xiaomi/Quark playback via the LAN development server, including literacy and writing-card taps. This is local device acceptance, not production deployment evidence.

The app-shell cache generation is v5. Service Worker registration requires a secure context; a plain HTTP LAN address normally does not register one. The earlier attribution of the Quark failure to a stale Service Worker was not established by device evidence. An empty voice list alone also does not establish absent Web Speech support.

At runtime `src/tencent-tts-player.js` reads that manifest and plays CDN audio. Standard HTTP caching provides repeat reuse; there is no public synthesis endpoint and no Tencent credential in the browser or Vercel. Playback routes through the Web Audio API with an input-leveling compressor (-20 dBFS threshold, 2.5:1 ratio) to level vocal syllables, a presence peaking filter (+2.5 dB @ 3000 Hz) for clarity on mobile speakers, a post-leveler scalable gain multiplier (`SPEECH_GAIN_MULTIPLIER = 2.5x` delivering 1.5x at 60%, 2.5x / +8 dB at 100%, and up to 5.0x / +14 dB at 200% excess boost), and a final safety limiter (-0.5 dBFS) ensuring true linear decibel scaling across the slider while preventing DAC clipping, falling back to standard `Audio` elements if Web Audio is unavailable. Decoded `AudioBuffer` objects are cached in memory for zero-latency repeated taps, and active speech is interrupted cleanly via `player.stop()`. Device-local speech volume (`speechVolume`, default `60%`, range 0%~200%) is configured independently from UI sound effects under Settings (`声音与音效设置`) and stored in `localStorage`. A failed CDN clip falls back to a matching voice when listed; if the voice list is empty, the app attempts the browser default with the requested language. Missing APIs, playback errors and start timeouts still fail visibly. The retired Matcha/Piper assets remain in the app shell solely for rollback history and explicit deletion of old browser caches.

## Interface sound effects

`src/speech-session.js` owns sequential published playback, system-language fallback, start timeout and cancellation through `play`, `stop` and `subscribe`. It does not manipulate DOM or send analytics. The app renders each button's busy/error/focus state and observes playback state for sound-effect ducking. Cancellation settles the old request even if the browser never emits an end event; stale callbacks and failure timers cannot reset a newer request. The published player captures request identity before manifest loading, preventing a cancelled load from starting late playback.

`src/learning-sounds.js` provides deterministic, real-time synthesized Web Audio sound effects across five key learning events (`action_completed`, `points_earned`, `try_again`, `points_deducted`, `reward_fulfilled`). Sound synthesis routes note envelopes through a master gain scaled by `SOUND_GAIN_MULTIPLIER` (`2.5x`), a presence peaking filter (`+2.5 dB @ 2800 Hz`) for clarity on mobile speakers, and a dynamics compressor/limiter (`-6 dBFS` threshold, `6:1` ratio) to ensure rich, punchy feedback without clipping. Device-local settings (`shadow_mate_sound_settings_v1`) support master toggle, event variant selection, and independent volume control (`volume`, default `60%`, range `0%~200%` with excess boost).

## Growth Loop and local-first redemption lifecycle

`src/learning-growth-loop.js` and `src/learning-growth-loop-controller.js` manage the point ledger, point items, rewards, and redemption lifecycle under a strict local-first contract:

- **Unauthenticated mode (single device, local only)**: With no remote household (`household_id === null`), redemptions and refunds are authoritative on the local device. Redeeming a reward immediately creates a confirmed redemption and debits the ledger, allowing parents to directly confirm fulfillment via `[确认兑现]`, cancel pending redemptions, or revoke a fulfilled redemption within 24 hours to recover from misoperations without waiting for network connectivity.
- **Reusable reward catalog & 24h undo safety window**: The reward catalog operates as reusable agreement templates decoupled from single transaction fulfillment history. Once fulfilled, cards restore their main redeem action (`[再次兑换]` or `[兑换]`), allowing repeat redemptions. Fulfilled redemptions provide a secondary `[撤回兑现]` button with badge `已兑现 · 24小时内可撤回` within 24 hours (`FULFILL_UNDO_WINDOW_MS = 24 * 60 * 60 * 1000`). Beyond 24 hours, the redemption is automatically archived and revocation entry points cleanly disappear.
- **Authenticated mode (cloud synchronized)**: When associated with a Supabase household, redemptions use an outbox-driven two-phase protocol (`pending` -> `confirmed`) to prevent concurrent double-spending across multiple household devices. Offline redemptions show as "待联网确认" until confirmed by the server RPC `learning_redeem_reward`.
- **Account adoption**: When an unauthenticated user subsequently registers or logs in, local data under `pending:pending` (including completed or pending redemptions) is rebound and merged into the authenticated cloud household via `adoptPending` without loss or ledger duplication.

## UI 组件体系与设计规范 (UI Components & Design System)

严禁在页面或模块中直接拼接、裸写未带样式的原生 HTML 标签（如默认 `<button>`、`<input>`、`<div>`），导致界面出现浏览器默认黑色线框、直角边缘与未经设计的凌乱排布。所有新增界面与数据展示模块必须遵循以下规范：

1. **统一复用系统组件与卡片模式**：
   - **统计与看板指标**：使用 `.stat-grid`、`.stat`（大号强调看板），或 `.footprint-summary-row` / `.footprint-stat-pill`（多列药丸统计），严禁裸写纯文本数字。
   - **交互数据卡片与操作入口**：使用 `.footprint-card`（带头部图标、大数值、单位、次级描述与箭头指示的响应式卡片）或 `.card.card-action`，统一样式与点击反馈。
   - **内容卡片**：复用 `.mini-card`（拼音/汉字）、`.word-card`（英语图片/发音）、`.poem-box`（古诗听读与翻页）。
   - **徽标与状态胶囊**：使用 `.pill`、`.badge-*` 或 `.content-status-pill`，内圆角严格服从同心圆角规范。
2. **强制使用语义化设计系统变量**：
   - 颜色：`var(--bg)`、`var(--card)`、`var(--line)`、`var(--ink)`、`var(--ink-soft)`、`var(--green)`、`var(--green-deep)`、`var(--green-soft)` 等，确保自动完美适配暗色模式（Dark Mode）。
   - 尺寸与形状：圆角使用 `var(--radius)` 或规范的 16px/18px/999px（胶囊），阴影统一使用 `var(--shadow)`。
   - 动效与手感：交互卡片标配悬浮微位移（`transform: translateY(-2px);`）与按压微缩（`transform: scale(0.98);`），支持无障碍高对比度与减弱动效（`prefers-reduced-motion`）。
3. **视觉验收铁律**：
   - 任何涉及 HTML/CSS 结构变更的改动，必须使用 Playwright 脚本在桌面（1200px）与移动端（440px）视口生成实机渲染截图进行目视审查；
   - 凡发现未带样式、挤压排版或错位的 UI 元素，一律视为未达到验收标准，严禁直接交付。