# 奖励兑换 24 小时撤销时效与重复兑换实施计划

> **For agentic workers:** Execute within existing authorization. Use subagents only when requested or justified for independent work and permitted by the active instructions. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现奖励卡片与历史兑换记录解耦，彻底消除置灰“已兑现”对重复兑换的阻碍，为已履约记录设立 24 小时防误触撤回窗口，并在界面多处清晰呈现时效说明。

**Architecture:** 前端呈现与交互控制层改造。在 `src/app.js` 的 `renderGrow` 中解耦心愿卡片货架态与单次兑换态；基于 `updated_at` 计算 24 小时时效判定 `isWithinUndoWindow`；新增 `.reward-undo-hint` 视觉标签；完善确认弹窗与模块底部说明；确保 `applyRedemption()` 随时可发起新兑换。保持数据层与 Supabase 同步协议 100% 兼容。

**Tech Stack:** Vanilla JavaScript (ES2022), Vite, Playwright E2E with Clock API, CSS3.

**Spec:** `docs/superpowers/specs/2026-09-08-reward-redemption-window-and-repeat-flow-spec.md`

## Global Constraints

- 严格保持 Local-first 离线可用，不引入数据库 Schema 变动；
- 货架卡片的主按钮在无待兑现时，永远呈现 `[再次兑换]` 或 `[兑换]`（积分不足置灰），严禁显示歧义的“已兑现”；
- 撤销动作仅限两种场景：待兑现时随时取消；已兑现时 24 小时内防误触撤回；
- 遵循分支双推规范（`feat/growth-loop-redemption-lifecycle` 与 `preview`）。

---

### Task 1: 奖励卡片状态解耦、24 小时时效计算与界面时效说明

**Files:**
- Modify: `src/app.js:1800-1845` (`rewardCards` 渲染逻辑与取消弹窗)
- Modify: `src/app.css:480-500` (新增 `.reward-undo-hint` 样式)
- Test: `tests/e2e/points-feedback.spec.js`

**Interfaces:**
- Consumes: `latest.status`, `latest.updated_at`, `latest.created_at`, `balance`, `cost`
- Produces: 解耦的主兑换按钮、24h 保护窗口内的 `[撤回兑现]` 按钮及 `.reward-undo-hint` 提示标签

- [ ] **Step 1: 在 `src/app.js` 中增加 24 小时时效计算与状态解耦逻辑**
  ```javascript
  const FULFILL_UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;
  const isPending = latest?.status === "pending";
  const isFulfilled = latest?.status === "fulfilled";
  const fulfilledTime = isFulfilled && (latest.updated_at || latest.created_at)
    ? new Date(latest.updated_at || latest.created_at).getTime()
    : 0;
  const isWithinUndoWindow = isFulfilled && (Date.now() - fulfilledTime <= FULFILL_UNDO_WINDOW_MS);
  const actionPending = (isPending || isFulfilled) && (latest.fulfill_requested || latest.cancel_requested);
  const canFulfill = isPending && isConfirmed && !actionPending;
  const canCancel = (isPending || isWithinUndoWindow) && isConfirmed && !actionPending;
  const redeemBtnText = latest && balance >= cost ? "再次兑换" : "兑换";
  ```
- [ ] **Step 2: 改造卡片 HTML 输出与时效标签**
  - 在描述文字下方展示时效说明标签：
    ```javascript
    ${isWithinUndoWindow ? `<span class="reward-undo-hint">已兑现 · 24小时内可撤回</span>` : ""}
    ```
  - 操作按钮区域：
    ```html
    <div class="reward-actions">
      ${!isPending ? `<button class="checkin reward-redeem" type="button" data-reward-id="${escapeHtml(reward.id)}" ${balance < cost ? "disabled" : ""}>${redeemBtnText}</button>` : ""}
      ${canFulfill ? `<button class="checkin reward-fulfill" type="button" data-fulfill-id="${escapeHtml(latest.id)}">${latest.sync_error ? "重试兑现" : "确认兑现"}</button>` : ""}
      ${canCancel ? `<button class="checkin danger reward-cancel" type="button" data-cancel-id="${escapeHtml(latest.id)}" title="${isFulfilled ? "兑现后 24 小时内支持撤销履约并退回积分" : "取消兑换并退回积分"}">${latest.sync_error ? "补偿退款 (取消)" : (isFulfilled ? "撤回兑现" : "取消兑换")}</button>` : ""}
    </div>
    ```
- [ ] **Step 3: 更新确认弹窗与模块底部说明文案**
  - 弹窗确认文案：`isFulfilled ? \`确定撤回“${rewardName}”的兑现并退回 ${cost} 积分吗？（此操作在兑现后 24 小时内有效）\` : ...`
  - 底部描述文案：更新单机模式说明为 `单机模式：兑换后扣除积分并记为待兑现，实际兑现约定后点击「确认兑现」；若属误触，兑现后 24 小时内支持撤回。`
- [ ] **Step 4: 在 `src/app.css` 中增加 `.reward-undo-hint` 样式**
  ```css
  .reward-undo-hint {
    display: inline-block;
    margin-top: 4px;
    font-size: 11px;
    color: var(--green-deep, #1f7a3a);
    background: var(--green-soft, #eaf8ee);
    padding: 1px 7px;
    border-radius: 6px;
    font-weight: 600;
  }
  ```

---

### Task 2: 自动化测试用例编写与全路径验证

**Files:**
- Modify: `tests/e2e/points-feedback.spec.js`

- [ ] **Step 1: 编写兑现后即时状态测试（在 24h 窗口内）**
  - 验证兑现后，卡片出现 `.reward-undo-hint`（包含“已兑现 · 24小时内可撤回”）；
  - 验证主按钮为 `[兑换]` 或 `[再次兑换]`，绝不包含文字为 `已兑现` 的 disabled 按钮；
  - 验证次操作按钮为 `[撤回兑现]`。
- [ ] **Step 2: 编写超过 24 小时时效后自动归档测试**
  - 使用 Playwright `page.clock.fastForward("25:00:00")` 或调整时间；
  - 重新触发卡片渲染，验证 `.reward-undo-hint` 和 `[撤回兑现]` 彻底消失，卡片恢复纯净货架态；
  - 验证再次点击 `[再次兑换]` 可顺利发起下一次兑换。
- [ ] **Step 3: 运行 E2E 测试并确保全部通过**
  `npx playwright test tests/e2e/points-feedback.spec.js`

---

### Task 3: 全量验证、回归测试与构建部署

**Files:**
- None (构建、验证与双推)

- [ ] **Step 1: 运行全量本地验证**
  `npm run verify`
- [ ] **Step 2: 提交代码到本地 Git 分支**
  `git commit -m "feat(rewards): add 24h undo window for fulfilled redemptions and decouple repeat redemption flow"`
- [ ] **Step 3: 双推到 `feat/growth-loop-redemption-lifecycle` 与 `preview` 分支**
  `git push origin feat/growth-loop-redemption-lifecycle && git push origin feat/growth-loop-redemption-lifecycle:preview`
- [ ] **Step 4: 线上 Preview 环境自动化测试验证**
  `PLAYWRIGHT_TEST_BASE_URL=https://preview-sm.shadow.wang npx playwright test tests/e2e/points-feedback.spec.js`
