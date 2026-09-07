# Child-Friendly Learning UX, Reading & Positive Feedback Implementation Plan
儿童友好交互、朗读伴读与正向反馈实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标 (Goal):**
将 Shadow Mate 从偏向成人的任务管理看板，升级为适合 3~7 岁幼童的沉浸式学习体验：落地语文古诗逐行点读与整首诵读、数学口算题目语音伴读、彻底剔除原生 `window.prompt`、增加全屏大字夸奖与星光礼花即时正反馈、以及糖果色与大圆角大触控人体工学 UI。

**架构原则 (Architecture):**
- **Local-first 优先**：纯前端与 Web Speech / Web Audio 本地可用，零网络外部强依赖。
- **轻量无负担**：CSS-only 动效与原生 DOM，零沉重第三方动画包引入，包体积增量控制在 5KB 内。
- **家长/儿童双重视角统一**：保持家长管理与同步数据严谨性，仅在孩子学习与打卡界面注入温暖童趣。

**对应规范 (Spec):** `docs/superpowers/specs/2026-09-07-child-friendly-learning-ux-design.md`

---

## 涉及文件清单 (File Structure)

| 文件路径 | 职责说明 |
| :--- | :--- |
| `src/learning-feedback.js` | 新增：轻量正反馈组件库（`praise()` 浮动大字夸奖、`flyStars()` 星光礼花、`shake()` 答错轻晃） |
| `src/app.css` | 扩展：糖果色系变量、大触控与大圆角规范、`.big-praise`、`.fxstar`、`.poem-line` 等样式 |
| `src/app.js` | 升级：古诗逐行点读与整首诵读编排、口算题目朗读、数感模块内联选择键盘替换原生 `prompt` |
| `tests/unit/learning-feedback.test.js` | 新增：正反馈组件的文本抽取、DOM 创建与自动销毁、减弱动态偏好无障碍测试 |
| `tests/e2e/poetry-reading.spec.js` | 新增：古诗单行点读高亮、整首诵读顺序播放与完成表扬 E2E 测试 |
| `tests/e2e/math-child-friendly.spec.js` | 新增：口算读题目语音、数感内联答题与正负反馈 E2E 测试 |
| `tests/e2e/sounds.spec.js` | 更新：确保新增音效与原音效引擎无冲突 |

---

## Task 1: 即时正反馈组件体系（`praise`、`flyStars`、`shake`）

**目标**：构建独立、轻量、高可测的正反馈动效模块，提供中央大字夸奖、星光散落和温和抖动能力。

**文件**：
- 创建：`src/learning-feedback.js`
- 创建：`tests/unit/learning-feedback.test.js`
- 修改：`src/app.css`

- [ ] **Step 1: 编写正反馈工具单元测试**
  在 `tests/unit/learning-feedback.test.js` 中编写测试用例：
  - 测试 `praise()` 能在容器中注入 `.big-praise` 元素，具有正确的随机文案或指定文案，并在超时后自动从 DOM 中移除。
  - 测试 `flyStars(n)` 能创建对应数量的星光粒子，并设置随机偏移 CSS 变量。
  - 测试 `shake(element)` 能够为目标节点附加 `.card-shake` 并在动画结束后清理。
  - 测试在 `prefers-reduced-motion` 启用时能够安全降级。

- [ ] **Step 2: 运行测试并验证失败**
  运行：`npx vitest run tests/unit/learning-feedback.test.js`
  预期：模块未创建，测试失败。

- [ ] **Step 3: 实现 `src/learning-feedback.js` 与 `src/app.css` 动画样式**
  - 在 `src/app.css` 中定义 `@keyframes praiseAnim`、`@keyframes flyStarAnim` 和 `@keyframes shake`。
  - 在 `src/learning-feedback.js` 中导出 `praise(text, options)`、`flyStars(count, options)`、`shake(element)`。

- [ ] **Step 4: 运行单元测试**
  运行：`npx vitest run tests/unit/learning-feedback.test.js`
  预期：PASS。

---

## Task 2: 语文古诗逐行点读与整首诵读升级

**目标**：将古诗卡片重构为低龄儿童友好的可点读列表，支持点击单句朗读该句，支持一键连读全诗，朗读完成触发庆祝反馈。

**文件**：
- 修改：`src/app.js`（`renderChinese()` 古诗部分）
- 修改：`src/app.css`（`.poem-box`, `.poem-line`, `.poem-line.hi` 样式）
- 创建：`tests/e2e/poetry-reading.spec.js`

- [ ] **Step 1: 编写古诗点读 E2E 测试**
  在 `tests/e2e/poetry-reading.spec.js` 中编写测试：
  - 进入语文模块，验证古诗诗句被渲染为独立的交互行。
  - 点击第二句诗，验证该行添加高亮样式 `.hi`，并触发了对该行诗句的 `speak` 朗读调用。
  - 点击「朗读整首」按钮，验证依次朗读诗名与全文各行。
  - 朗读完成时，验证触发庆祝音效或表扬浮层 `.big-praise`。

- [ ] **Step 2: 运行 E2E 测试验证失败**
  运行：`npx playwright test tests/e2e/poetry-reading.spec.js`
  预期：因尚无点读行和整首朗读按钮，测试失败。

- [ ] **Step 3: 实现古诗单行点读与整首朗读逻辑**
  - 在 `src/app.js` 中改造古诗渲染结构：
    - 将 `p.c` 每行渲染为 `<div class="poem-line" data-poem-line="${index}">${line}</div>`。
    - 绑定单行点击事件：清除已有高亮，高亮当前行，调用 `speak(cleanLine, lineEl, "zh-CN")`。
    - 增加 `<button class="checkin poem-read-all">${icon("volume")} 朗读整首</button>`。
    - 实现顺序朗读队列（利用 `speak` 完成后的回调或 Promise 链式递归），并在读完后触发 `soundEffects.play("points_earned")` 与 `praise("念得真好！")`。
  - 在 `src/app.css` 中增加柔和的阅读器样式：高亮描边、文字微放大（`transform: scale(1.02)`）、内边距提升与平滑过渡。

- [ ] **Step 4: 运行古诗 E2E 测试**
  运行：`npx playwright test tests/e2e/poetry-reading.spec.js`
  预期：PASS。

---

## Task 3: 口算“读题目”与数感儿童化键盘交互

**目标**：为口算题目增设「读题目」语音伴读；彻底剔除数感模块中生硬的 `window.prompt`，改为展开式儿童大数字键盘。

**文件**：
- 修改：`src/app.js`（`renderMath()` 口算及数感部分）
- 修改：`src/app.css`（读题目按钮样式、数字键盘候选卡片样式）
- 创建：`tests/e2e/math-child-friendly.spec.js`

- [ ] **Step 1: 编写口算读题目与数感儿童键盘 E2E 测试**
  在 `tests/e2e/math-child-friendly.spec.js` 中编写测试：
  - 验证口算题目旁存在「读题目」语音按钮，点击触发语音播报。
  - 验证口算答对时弹出 `praise` 大字，答错时输入框触发 `shake` 动画。
  - 进入数感星球，点击缺失问号格：验证不弹出浏览器 `window.prompt`，而是在页面中展示候选数字大按钮。
  - 点击错误数字：触发摇晃与再试一次；点击正确数字：填入格子、变绿并表扬。

- [ ] **Step 2: 运行 E2E 测试验证失败**
  运行：`npx playwright test tests/e2e/math-child-friendly.spec.js`
  预期：测试失败。

- [ ] **Step 3: 实现口算伴读与数感交互重构**
  - 口算读题目：
    - 在 `#qq` 旁增加 `<button class="btn-read-q" type="button" aria-label="读题目">${icon("volume")} 读题目</button>`。
    - 生成口语化自然语言字串：将 `a + b =` 转化为 `${chineseNumber(a)} 加 ${chineseNumber(b)} 等于几？`，调用 `speak(...)`。
    - 提交答对时调用 `praise("答对啦！")`，答错时调用 `shake(el("qa"))`。
  - 数感星球交互改造：
    - 废除 `window.prompt()`。
    - 点击缺失格子时，动态生成包含正确答案与 3~4 个干扰项的大数字按钮组 `<div class="math-pad">...</div>`。
    - 孩子直接点击大按钮完成作答，即刻给以正负反馈。

- [ ] **Step 4: 运行数学模块 E2E 测试**
  运行：`npx playwright test tests/e2e/math-child-friendly.spec.js`
  预期：PASS。

---

## Task 4: 童趣糖果色与触控人体工学升级

**目标**：调整色彩变量、触控热区、圆角与弹性反馈，消除“AI化严肃感”，呈现生动温馨的儿童学习乐园界面。

**文件**：
- 修改：`src/app.css`

- [ ] **Step 1: 注入糖果色系与触控样式规则**
  - 在 `:root` 中加入糖果主题色变量：
    - `--candy-pink: #FF6FA5; --candy-pink-soft: #FFE6F0;`
    - `--candy-blue: #3FB4F0; --candy-blue-soft: #E1F4FE;`
    - `--candy-yellow: #FFC53C; --candy-yellow-soft: #FFF4D9;`
    - `--candy-green: #4FC777; --candy-green-soft: #E2F8E9;`
    - `--candy-purple: #A265E8; --candy-purple-soft: #F2E7FF;`
  - 将卡片圆角统一优化为 `--radius: 22px`，增强圆润亲和力。
  - 将主要可点击按钮（打卡按钮、提交按钮、语音按钮）最小高度提升至 `48px ~ 54px`，确保低龄幼儿易按防误触。
  - 添加按压缩放动效：`.checkin:active, .navbtn:active, .poem-line:active { transform: scale(0.96); }`。
  - 在手机容器顶底融入柔和的马卡龙浅光晕渐变背景。

- [ ] **Step 2: 视觉核对与已有 E2E 回归**
  - 运行全量 E2E 测试，验证布局调整未导致任何元素溢出或原有选择器失效：
    `npx playwright test`

---

## Task 5: 全量自动化验证与构建核验

**目标**：确保全套改动 100% 通过本地单元测试、E2E 测试与生产打包检查。

- [ ] **Step 1: 运行单元测试套件**
  运行：`npm test`
  预期：全部单元测试 PASS。

- [ ] **Step 2: 运行全量 E2E 测试**
  运行：`npx playwright test`
  预期：全部测试用例 PASS。

- [ ] **Step 3: 运行完整生产质量校验**
  运行：`npm run verify`
  预期：代码检查、安全审计、Vite 打包与覆盖率检测全绿通过。

---

## 评审检查清单 (Review Checklist)

- [ ] 方案是否覆盖了古诗点读、口算伴读、数感无 prompt 交互、正反馈动效与糖果色升级？
- [ ] 架构是否严格遵循了 Local-first 原则与零重型第三方依赖约束？
- [ ] 步骤拆分是否遵循了测试先行（TDD）与明确的验证指标？
