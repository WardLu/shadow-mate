# 全场景儿童点读与积分奖励动效实施计划（第二期）
Child-Friendly Voice Prompts & Points Feedback Implementation Plan (Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标 (Goal):**
依据 5 张核心界面截图与积分激励反馈需求，全量实现 5 大模块的关键文字/卡片点读（语文生字、古诗标题作者、图字写字 4 处要素、数感与数独题目指引、英语指引与往期单词芯片），并为日常积分加减、奖励兑换与兑现注入充沛的视听即时正反馈动效。

**架构原则 (Architecture):**
- **Local-first 优先**：纯前端与 Web Speech / Web Audio 本地运行，离线可用。
- **无沉重依赖**：复用已有 `src/learning-feedback.js` 与 CSS Keyframes 动效，包体积增量 < 3KB。
- **声音互斥保障**：点击任何新朗读元素时，自动取消前序发音，不叠音、不漏音。
- **适童交互与无障碍**：大触控区域（36~56px），具备明确的 `aria-label` 与键盘 `Tab/Enter` 交互。

**对应规范 (Spec):** `docs/superpowers/specs/2026-09-07-child-friendly-voice-prompts-spec.md`

---

## 涉及文件清单 (File Structure)

| 文件路径 | 职责说明 |
| :--- | :--- |
| `src/app.css` | 补充：`.btn-read-prompt` 胶囊按钮、`.desc-with-audio` 横排自适应布局、可点读元素（生字卡、词语、例句、口诀、往期 chip）的高亮与触控缩放样式 |
| `src/app.js` | 升级：语文生字与古诗标题点读、数感与数独读要求按钮、英语说明朗读与往期 chip 点读、加减分与奖励兑换动效挂载 |
| `src/hanzi-writing-view.js` | 升级：写字卡片（`.hanzi-visual`、`.hanzi-example-word`、`.hanzi-sentence`、`.hanzi-writing-hint`）增加点读标记与 A11y 属性 |
| `tests/unit/speech-text-utils.test.js` | 新增：朗读文案纯净化清洗（过滤 emoji、特殊符号、数字转自然中文）的单元测试 |
| `tests/e2e/child-friendly-prompts.spec.js` | 新增：5 大场景点读与伴读按钮的端到端交互与 TTS 触发测试 |
| `tests/e2e/points-feedback.spec.js` | 新增：积分加减与奖励兑换/兑现时 `praise`、`flyStars` 与 `shake` 动效触发测试 |

---

## Task 1: 文本纯净化工具函数与单元测试

**目标**：构建健壮的朗读文本清洗工具（过滤 emoji、特殊字符，将 "1-4"、"1 递增" 转为口语化发音），保证中文/英文 TTS 输出自然顺畅。

**文件**：
- 修改：`src/app.js`（增加 `cleanSpeechText(text)` 辅助函数）
- 创建：`tests/unit/speech-text-utils.test.js`

- [ ] **Step 1: 编写清洗工具单元测试**
  在 `tests/unit/speech-text-utils.test.js` 中测试：
  - 去除 Emoji 表情符号（如 🔟、🎉、🎁）。
  - 去除特殊书名号、括号、特殊标点。
  - 将 `1-4` 替换为 `一到四`，将 `按 1 递增` 替换为 `按一递增`。
  - 保留英文正常标点与字母。

- [ ] **Step 2: 运行测试验证失败**
  运行：`npx vitest run tests/unit/speech-text-utils.test.js`
  预期：失败。

- [ ] **Step 3: 实现清洗逻辑并导出**
  在 `src/app.js`（或专用工具模块）中实现文本清洗，并用于朗读前置管道。

- [ ] **Step 4: 运行单元测试**
  运行：`npx vitest run tests/unit/speech-text-utils.test.js`
  预期：PASS。

---

## Task 2: CSS 样式扩展（胶囊按钮、点读卡片与触控反馈）

**目标**：在 `src/app.css` 中建立统一的伴读胶囊按钮规范与可点读文本/卡片的视觉交互体系。

**文件**：
- 修改：`src/app.css`

- [ ] **Step 1: 添加 `.btn-read-prompt` 胶囊按钮样式**
  - 高度 28~32px，圆角 999px，内边距 4px 12px，字号 12px 粗体。
  - 糖果风柔黄色系（`background: #fff6dc; border: 1.5px solid #f6d289; color: #7c4a03;`）。
  - `:hover` 提亮背景，`:active` 缩放至 `0.96`。

- [ ] **Step 2: 添加 `.desc-with-audio` 弹性容器样式**
  - `display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;`

- [ ] **Step 3: 添加点读卡片与词语微动效样式**
  - `.mini-card.speech-tap`：鼠标手型、`:hover` 柔和边框光晕、`:active` 微缩放。
  - `.poem-title.speech-tap`：鼠标手型与微弱提示。
  - `.hanzi-example-word.speech-tap`：圆角高亮背景、`:active` 缩放。
  - `.mr-chip.speech-tap`：鼠标手型、音符/喇叭提示符。

---

## Task 3: 语文生字卡片与古诗标题点读（图 1 落地）

**目标**：用户点击今日新字卡片即朗读汉字与词语，点击古诗标题与作者即朗读诗名和作者。

**文件**：
- 修改：`src/app.js`（`renderChinese()`）
- 创建：`tests/e2e/child-friendly-prompts.spec.js`

- [ ] **Step 1: 为今日新字微卡片（`c1`, `c2`）挂载点读**
  - 为两个 `.mini-card` 添加 `class="mini-card speech-tap"`、`role="button"`、`tabindex="0"`、`aria-label`。
  - `onclick` 触发：`speak(`${char}，${word}`, null, "zh-CN")`。

- [ ] **Step 2: 为古诗标题与作者挂载点读**
  - 为 `.poem-title` 和 `.poem-meta`（或二者组合的容器）添加点读响应。
  - `onclick` 触发：`speak(`古诗《${p.t}》，${p.a}`, null, "zh-CN")`。

- [ ] **Step 3: 编写对应的 E2E 测试用例**
  - 在 `tests/e2e/child-friendly-prompts.spec.js` 中验证点击生字卡片与古诗标题能成功触发 TTS 播放。

---

## Task 4: 图字学习·写字卡片 4 处要素点读（图 2 落地）

**目标**：为今日图字卡片的顶部概念卡、认识词语、例句整行、笔顺口诀 4 处要素注入独立点读能力。

**文件**：
- 修改：`src/hanzi-writing-view.js`（渲染时附加 data 标记与交互属性）
- 修改：`src/app.js`（在挂载卡片事件处为 4 处元素绑定 `speak`）

- [ ] **Step 1: 更新 `src/hanzi-writing-view.js` 模板**
  - 在 `.hanzi-visual` 上增加 `class="... speech-tap"`、`role="button"`、`tabindex="0"`、`title="点击听概念"`。
  - 在每个 `.hanzi-example-word` 上增加 `class="... speech-tap"`、`role="button"`、`tabindex="0"`、`title="点击听发音"`。
  - 在 `.hanzi-sentence` 上增加 `class="... speech-tap"`、`role="button"`、`tabindex="0"`、`title="点击读例句"`。
  - 在 `.hanzi-writing-hint` 上增加 `class="... speech-tap"`、`role="button"`、`tabindex="0"`、`title="点击读口诀"`。

- [ ] **Step 2: 在 `src/app.js` 中挂载点击事件**
  - 点击 `.hanzi-visual`：朗读 `conceptLabel + "，" + visualAlt`（过滤 emoji）。
  - 点击 `.hanzi-example-word`：朗读单个词语文本。
  - 点击 `.hanzi-sentence`：朗读完整例句。
  - 点击 `.hanzi-writing-hint`：朗读笔顺书写口诀。

- [ ] **Step 3: 扩展 E2E 测试验证 4 处要素点读触发**

---

## Task 5: 数学数感、数独与英语任务伴读（图 3、图 4、图 5 落地）

**目标**：为数感星球、数独游戏增加“读要求/读规则”胶囊按钮，为英语增加“读指引”按钮并使往期单词芯片支持点击发音。

**文件**：
- 修改：`src/app.js`（`renderMath()`、`renderEnglish()`）

- [ ] **Step 1: 数感星球与数独游戏增加胶囊按钮**
  - 数感星球说明改造为 `.desc-with-audio`，添加按钮 `${icon("volume")} 读要求`，点击朗读清洗后的题目说明。
  - 数独游戏说明改造为 `.desc-with-audio`，添加按钮 `${icon("volume")} 读规则`，点击朗读清洗后的规则文本。

- [ ] **Step 2: 英语模块增加指引按钮与芯片点读**
  - 今日主题单词说明增加 `${icon("volume")} 读指引` 按钮。
  - 往期单词回看说明增加 `${icon("volume")} 读指引` 按钮。
  - 往期单词 `.mr-chip` 升级为 `speech-tap`，点击触发 `speak(w[0], null, "en-US")` 朗读英文单词。

- [ ] **Step 3: 编写端到端测试用例**
  - 验证按钮点击发音与往期单词芯片点击英文发音。

---

## Task 6: 积分加减与奖励兑换全链路动效增强（场景 6 落地）

**目标**：在加分时触发爆星与表扬大字，减分时触发温和左右抖动，兑换与兑现奖励时触发高光爆星庆贺。

**文件**：
- 修改：`src/app.js`（`changePoints`、`redeemReward`、`fulfillRedemption`）
- 创建：`tests/e2e/points-feedback.spec.js`

- [ ] **Step 1: 积分加减动效集成**
  - 在 `changePoints` 成功分支：
    - 若 `delta > 0` 且不是撤销：触发 `praise("+" + delta + " 积分！")` 与 `flyStars(6)`。
    - 若 `delta < 0` 且不是撤销：定位到对应的打卡项 DOM 元素并触发 `shake(targetElement)`。
- [ ] **Step 2: 奖励兑换与兑现动效集成**
  - 在 `redeemReward` 成功回调中：触发 `praise("兑换成功！🎁")` 与 `flyStars(8)`。
  - 在 `fulfillRedemption` 成功回调中：触发 `praise("奖励已兑现！🎉")` 与 `flyStars(10)`。

- [ ] **Step 3: 编写动效 E2E 测试**
  - 在 `tests/e2e/points-feedback.spec.js` 中验证加减分与奖励兑换时动效 DOM 节点的创建与清理。

---

## Task 7: 完整验证、门禁与线上 Preview 发布

**目标**：保障无任何功能倒退或静态门禁违例，平稳完成双分支推送与线上真实 Preview 验收。

**文件**：全部变动文件

- [ ] **Step 1: 运行全量单元测试与覆盖率检查**
  运行：`npm test`
  预期：全部通过。

- [ ] **Step 2: 运行专项 E2E 测试套件**
  运行：`npx playwright test tests/e2e/child-friendly-prompts.spec.js tests/e2e/points-feedback.spec.js tests/e2e/poetry-reading.spec.js tests/e2e/math-child-friendly.spec.js`
  预期：全部通过。

- [ ] **Step 3: 运行完整工程门禁**
  运行：`npm run verify`
  预期：静态检查、安全检查、构建以及制品检查 100% 通过。

- [ ] **Step 4: Git 提交与双分支推送**
  - 提交信息：`feat(ux): add comprehensive voice prompts and points reward animations`
  - 推送分支：`git push origin feat/growth-loop-redemption-lifecycle && git push origin feat/growth-loop-redemption-lifecycle:preview`

- [ ] **Step 5: 线上 Preview 自动化验收**
  - 验证 Vercel 构建就绪状态。
  - 运行对 `https://preview-sm.shadow.wang` 的线上端到端测试。
