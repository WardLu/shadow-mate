# UX、语音朗读与积分兑换闭环优化实施计划

> **For agentic workers:** Execute within existing authorization. Use subagents only when requested or justified for independent work and permitted by the active instructions. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复生字卡片播放时的布局破坏问题，平衡各语音通道的听感音量，实现字意行与朗读按钮联动，全面更新指南页内容，并在积分明细中增加撤销标记、精简待兑现冗余按钮并升级为「确认兑现」。

**Architecture:** 前端呈现层与交互逻辑优化。在 `speak()` 中增加对容器型点读组件的 DOM 保护，通过 `.speech-playing` 呈现温和脉冲呼吸动效；校准 Web Audio 与 Web Speech API 的响度匹配；写字卡片字意行直接委托代理「朗读字意」按钮动作；历史积分列表检测 `undo_of`/`adjustment`/`refund` 动态渲染标签；奖励待兑现分支去除冗余 disabled 按钮。保持 Local-first 与 Supabase 同步边界不变。

**Tech Stack:** Vanilla JavaScript (ES2022), Vite, Web Audio API, Web Speech API (SpeechSynthesis), CSS3 Transitions & Animations, Playwright E2E.

**Spec:** `docs/superpowers/specs/2026-09-08-ux-speech-points-refinements-spec.md`

## Global Constraints

- 不改变生字卡片与点读元素的既有布局与 CSS 盒模型（严禁重写容器元素的 `innerHTML`）；
- 保持 Local-first 离线优先原则，不更改底层 Ledger 数据结构与 Supabase 同步协议；
- 统一使用 `soundEffects.getSpeechVolume()` 作为全局课程朗读音量唯一数据源；
- 遵循单向数据流与安全基线，无敏感数据与多余第三方引入；
- 严格遵循分支双推规范（`feat/growth-loop-redemption-lifecycle` 与 `preview`）。

---

### Task 1: 生字卡片与点读元素播放交互优化（保留卡片结构，仅加播放态动效）

**Files:**
- Modify: `src/app.js:700-800` (`speak` 函数)
- Modify: `src/app.css:120-140` (新增 `.speech-playing` 呼吸微光律动动效)
- Test: `tests/e2e/child-friendly-prompts.spec.js`

**Interfaces:**
- Consumes: `speak(text, button, locale, contentId, options)`
- Produces: 保护容器元素，当 `isContainer` 时不替换 `button.innerHTML`，仅添加/移除 `speech-playing` 和 `aria-busy`

- [ ] **Step 1: 编写 E2E 测试验证生字卡片点击播放后内部结构完好**
  在 `tests/e2e/child-friendly-prompts.spec.js` 中增加断言：点击生字卡片后，卡片内部的 `.big`、`.py`、`.label` 元素依然存在，没有被替换为单行 `🔊` 文本，且卡片带有 `speech-playing` 类名。
- [ ] **Step 2: 运行测试并确认在当前实现下失败**
  `npx playwright test tests/e2e/child-friendly-prompts.spec.js`（确认当前因 `button.innerHTML` 被冲掉而失败）。
- [ ] **Step 3: 改造 `src/app.js` 中的 `speak()` 函数保护容器 DOM**
  判断 `button` 是否为容器型元素（带有 `speech-tap`、`mini-card` 或拥有元素子节点且不是普通小按钮）：
  ```javascript
  const isContainer = Boolean(
    button?.classList.contains("speech-tap") ||
    button?.classList.contains("mini-card") ||
    button?.dataset.speechTap !== undefined ||
    (button && button.firstElementChild && !button.matches(".btn, .speak-btn, .checkin, .btn-read-prompt, .btn-read-q"))
  );
  ```
  在 `setBusy()` 中：若是容器，仅设置 `button.classList.add("speech-playing")` 与 `button.setAttribute("aria-busy", "true")`，不改动 `button.innerHTML`；
  在 `restore()` 中：若是容器，移除 `button.classList.remove("speech-playing")` 与 `button.removeAttribute("aria-busy")`，不改动 `button.innerHTML`。
- [ ] **Step 4: 在 `src/app.css` 中增加 `.speech-playing` 柔和呼吸律动样式**
  ```css
  .speech-playing {
    outline: 3px solid var(--green, #2aa650);
    outline-offset: 2px;
    animation: speech-pulse 1.4s ease-in-out infinite;
  }
  @keyframes speech-pulse {
    0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(42, 166, 80, 0.35); }
    50% { transform: scale(1.02); box-shadow: 0 0 12px 2px rgba(42, 166, 80, 0.45); }
  }
  ```
- [ ] **Step 5: 运行测试并确认通过**
  `npx playwright test tests/e2e/child-friendly-prompts.spec.js`

---

### Task 2: 朗读音量平衡与统一当前设置

**Files:**
- Modify: `src/tencent-tts-player.js:20-30, 190-205` (`calculatePerceptualSpeechGain` 与 Web Audio 增益参数)
- Modify: `src/app.js:810-840` (`speak` 函数中系统语音音量计算)
- Test: `tests/unit/tencent-tts-player.test.js`

**Interfaces:**
- Consumes: `soundEffects.getSpeechVolume()` (0.0 ~ 2.0，默认 0.6)
- Produces: 校准后的 CDN 预录音频播放音量与系统语音合成音量

- [ ] **Step 1: 编写/更新针对音量增益计算的单元测试**
  在 `tests/unit/tencent-tts-player.test.js` 中确认 `calculatePerceptualSpeechGain` 在默认音量 0.6 下输出合理的基准增益（约为 1.0，而非过高的 1.5x）。
- [ ] **Step 2: 调整 `src/tencent-tts-player.js` 中的基准感知增益**
  将 `baselineGain` 默认值从 1.5 校准为 1.0（或配合 0.6 基线输出约 1.0 的平坦增益），避免 Web Audio 叠加压缩器后音量过高轰鸣。
- [ ] **Step 3: 优化 `src/app.js` 中系统语音的音量映射**
  在 `speak()` 中确保 `utterance.volume` 能够充分使用可用动态范围：
  ```javascript
  utterance.volume = Math.max(0, Math.min(1, speechVolume <= 1 ? speechVolume : 1));
  ```
  保证当用户在“设置”中调整“课程语音朗读音量”时，无论是 CDN 预录发音还是系统 TTS 兜底，听感声级平稳一致。
- [ ] **Step 4: 运行单元测试确认音量计算正确**
  `npm test -- tests/unit/tencent-tts-player.test.js`

---

### Task 3: 写字卡片字意行点击点读联动（等同「朗读字意」按钮）

**Files:**
- Modify: `src/hanzi-writing-view.js:185-195` (`renderRow` 字意行 DOM)
- Modify: `src/app.js:1180-1205` (`renderChinese` 中写字卡片事件绑定)
- Test: `tests/e2e/child-friendly-prompts.spec.js`

**Interfaces:**
- Consumes: `[data-hanzi-meaning-speak]` 现有发音处理逻辑
- Produces: `.hanzi-meaning` 点击/键盘交互代理到对应的朗读字意动作

- [ ] **Step 1: 在 E2E 测试中增加字意行点击发音测试用例**
  在 `tests/e2e/child-friendly-prompts.spec.js` 中测试点击 `[data-hanzi-meaning-row]` 能触发对应的发音，且包含字意文本。
- [ ] **Step 2: 修改 `src/hanzi-writing-view.js` 为字意行添加交互属性**
  ```javascript
  const meaningTapAttr = includeSpeech
    ? ` class="hanzi-meaning speech-tap" role="button" tabindex="0" data-hanzi-meaning-row aria-label="${text(`朗读字意：${characterMeaning}`)}"`
    : ` class="hanzi-meaning"`;
  ```
- [ ] **Step 3: 修改 `src/app.js` 绑定字意行点击代理**
  ```javascript
  card3.querySelectorAll("[data-hanzi-meaning-row]").forEach((meaningRow) => {
    const card = meaningRow.closest("[data-writing-row], .writing-row, .hanzi-learning-card");
    const meaningBtn = card?.querySelector("[data-hanzi-meaning-speak]");
    const triggerMeaning = () => {
      meaningBtn?.click();
    };
    meaningRow.onclick = triggerMeaning;
    meaningRow.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        triggerMeaning();
      }
    };
  });
  ```
- [ ] **Step 4: 运行 E2E 测试验证联动通过**
  `npx playwright test tests/e2e/child-friendly-prompts.spec.js`

---

### Task 4: 积分明细撤销与退款标记

**Files:**
- Modify: `src/app.js:1895-1920` (`renderGrow` 中的 `growth-history-list` 渲染)
- Test: `tests/e2e/points-feedback.spec.js`

**Interfaces:**
- Consumes: `growthLoopSnapshot.ledger` 中的条目数据（`delta`, `item_name_snapshot`, `entry_type`, `metadata`, `note`）
- Produces: 带有 `（撤销）` 与 `（兑换取消）` 后缀的清晰历史列表项

- [ ] **Step 1: 在 `tests/e2e/points-feedback.spec.js` 中增加撤销明细断言**
  测试：记录一次扣分习惯（如撒谎 -10），再次点击撤销该记录（+10），进入成长/积分明细列表，验证列表中存在 `撒谎（撤销）` 且分数为 `+10`。
- [ ] **Step 2: 修改 `src/app.js` 增强明细条目名称格式化**
  在 `historyEntries.map` 循环中：
  ```javascript
  const isUndo = Boolean(
    entry.metadata?.undo_of ||
    entry.entry_type === "adjustment" ||
    entry.note?.includes("撤销")
  );
  const isRefund = Boolean(
    entry.entry_type === "refund" ||
    entry.metadata?.cancel_of
  );
  let displayName = entry.item_name_snapshot || "积分调整";
  if (isUndo) {
    displayName = `${displayName}（撤销）`;
  } else if (isRefund) {
    displayName = `${displayName}（兑换取消）`;
  }
  ```
- [ ] **Step 3: 运行 E2E 测试并确认通过**
  `npx playwright test tests/e2e/points-feedback.spec.js`

---

### Task 5: 奖励兑现按钮精简与文案升级

**Files:**
- Modify: `src/app.js:1750-1785` (`rewardCards` 渲染逻辑)
- Test: `tests/e2e/points-feedback.spec.js`

**Interfaces:**
- Consumes: `latest.status === "pending"` 状态
- Produces: 隐藏置灰 `待兑现` 按钮，主操作文案为 `确认兑现`

- [ ] **Step 1: 在 `tests/e2e/points-feedback.spec.js` 中增加待兑现状态按钮断言**
  兑换奖励后，验证：
  - 页面中不再出现文字为 `待兑现` 的 disabled 按钮；
  - 出现文字为 `确认兑现` 的主按钮；
  - 出现文字为 `取消兑换` 的次要按钮。
- [ ] **Step 2: 修改 `src/app.js` 的 `rewardCards` 渲染逻辑**
  仅在非待兑现（`latest?.status !== "pending"`）时渲染兑换主按钮；
  在待兑现（`canFulfill`）时将原 `标记已兑现` 改为 `确认兑现`：
  ```javascript
  ${latest?.status !== "pending" ? `<button class="checkin reward-redeem" type="button" data-reward-id="${escapeHtml(reward.id)}" ${balance < cost ? "disabled" : ""}>${latest?.status === "fulfilled" && balance >= cost ? "再次兑换" : (status || "兑换")}</button>` : ""}
  ${canFulfill ? `<button class="checkin reward-fulfill" type="button" data-fulfill-id="${escapeHtml(latest.id)}">${latest.sync_error ? "重试兑现" : "确认兑现"}</button>` : ""}
  ${canCancel ? `<button class="checkin danger reward-cancel" type="button" data-cancel-id="${escapeHtml(latest.id)}">${latest.sync_error ? "补偿退款 (取消)" : (latest.status === "fulfilled" ? "撤销兑换" : "取消兑换")}</button>` : ""}
  ```
- [ ] **Step 3: 运行 E2E 测试验证兑现按钮精简与操作流程**
  `npx playwright test tests/e2e/points-feedback.spec.js`

---

### Task 6: 使用指南页信息全面同步更新

**Files:**
- Modify: `src/app.js:2340-2390` (`renderGuide` 函数)
- Test: `tests/e2e/child-friendly-prompts.spec.js`

**Interfaces:**
- Consumes: 全新学习模块、点读功能、积分闭环、音量控制设定
- Produces: 完整、规范、现代化的家长使用指南页面

- [ ] **Step 1: 编写指南页面新板块的结构内容**
  - **儿童自主语音点读指引**：明确说明语文新字、古诗逐句、写字五大要素、数学题目要求与规则、英语拼读与往期回顾均支持点击发音；
  - **习惯积分与心愿兑换成长闭环**：讲解好习惯打卡、失误撤销、心愿设立与家长现实履约后「确认兑现」机制；
  - **音量与音效管理说明**：说明界面音效总开关和课程语音朗读音量独立调节功能。
- [ ] **Step 2: 更新 `src/app.js` 中的 `renderGuide()` 模板**
  将原有的简版指南扩充为条理清晰的 5 大专题指南卡片，保持原有无障碍与排版风格。
- [ ] **Step 3: 验证指南页在浏览器与视口中的渲染表现**
  运行 Playwright 验证指南页面包含全新关键词与语义结构。

---

### Task 7: 全量验证、回归测试与构建部署

**Files:**
- None (系统全套验证与分支合并)

- [ ] **Step 1: 运行全量单元测试与静态代码检查**
  `npm run verify`
- [ ] **Step 2: 运行全量 E2E 自动化测试**
  `npx playwright test tests/e2e/child-friendly-prompts.spec.js tests/e2e/points-feedback.spec.js`
- [ ] **Step 3: 提交代码到本地分支**
  `git add ... && git commit -m "fix(ux): preserve card layout during speech, balance volume, link meaning row, clarify undo points, and streamline redemption"`
- [ ] **Step 4: 双推到 `feat/growth-loop-redemption-lifecycle` 与 `preview` 分支**
  `git push origin feat/growth-loop-redemption-lifecycle && git push origin feat/growth-loop-redemption-lifecycle:preview`
- [ ] **Step 5: 线上环境 E2E 自动化回归验证**
  `PLAYWRIGHT_TEST_BASE_URL=https://preview-sm.shadow.wang npx playwright test tests/e2e/child-friendly-prompts.spec.js tests/e2e/points-feedback.spec.js`
