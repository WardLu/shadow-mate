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

界面采用“触感玩具箱”（Tactile Toybox）设计系统：温暖奶油底色、实体按压按钮（按压底边 + 下沉位移）、同心圆角与双色图标。

1. **样式分层**（按 `index.html` 加载顺序）：
   - `src/legacy-components.css`：`@layer legacy` 中保留的业务组件样式（内容库、积分流水、成长足迹、使用指南、语音资源、字帖打印等），优先级最低。
   - `src/cloud.css`、`src/app.css`：账户面板与页面级样式。
   - `src/toybox.css`：设计系统外壳与通用组件——顶栏、Dock 导航（手机底部，768px 起平板窄侧栏，1100px 起桌面宽侧栏，可收起为仅图标）、卡片、按钮、胶囊开关、弹窗 `.sheet` 与色调类 `.t-green`/`.t-orange`/`.t-blue`/`.t-teal`/`.t-purple`/`.t-sun`/`.t-rose`/`.t-ink`。
   - `src/toybox-icons.js` 提供双色图标 sprite（主线条 `currentColor`，`.i2` 浅色填充）；`src/toybox-art.js` 提供装饰插画（`aria-hidden`）。
2. **双模态空间**：`body.parent-mode` 区分孩子模式与家长区。首页、学习、积分、成长属于孩子模式；设置各分页（家庭与账户、学习设置、积分规则、愿望成长、声音音效、隐私、使用指南、关于与反馈）属于家长区，需经 `#parentGateDialog` 长按 3 秒进入。UI 门禁只防误触，不是授权边界；数据访问仍由 RLS 与家庭成员关系约束。
3. **组件复用**：新增界面复用现有卡片、按钮、胶囊、`.tb-icon` 图标与色调类，不裸写未带样式的原生控件；启用/禁用统一使用胶囊开关（`role="switch"`）。
4. **设计变量**：颜色使用语义变量（`var(--surface)`、`var(--line)`、`var(--ink)`、`var(--green)` 等与色调变量 `--c`/`--c-f`/`--c-e`），承载白字的按钮填充对比度不低于 4.5:1；触控目标不小于 44px；支持 `prefers-reduced-motion`。
5. **视觉验收**：涉及 HTML/CSS 结构变更时，在手机（390px）、平板（768px）与桌面（1440px）视口生成实机渲染截图并操作关键交互；出现未带样式、挤压、截断或水平溢出的元素视为未达标。
