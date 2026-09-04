# Shadow Mate V2 Pilot 图字学习纵向切片实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前只有拼音、例词和空白田字格的 V2 Pilot 字帖，修复为符合已确认 PRD 的“图片/场景 → 词语 → 目标字 → 发音 → 书写提示 → 轻量临摹”可验收纵向切片。

**Architecture:** 保留现有 `rotation-v1`、`worksheet snapshot`、`extra.hanziWorksheetRotationV1`、local-first、云同步、learner 隔离和 A4 print-only 根节点。扩展静态 Pilot 内容项的数据契约，纯 renderer 同时生成屏幕学习卡和打印练习行；`renderChinese()` 只解析一次 snapshot，交互层只消费 renderer 输出的 data attributes。

**Tech Stack:** Vite + Vanilla JavaScript、静态 JSON 内容包、浏览器 `speechSynthesis`、CSS、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-08-31-preschool-learning-pack-family-design.md`

## Global Constraints

- 当前产品包仍是启蒙学习包 V2 / P2，建议年龄 4–5 岁；V1/P1 重设计和 V3/P3 接入继续留在 roadmap。
- 当前 Pilot 仍使用 `contentVersion: "hanzi-v2-pilot-1"`、`algorithmCompatibility: "rotation-v1"`、每天 4 行和 `recentDayWindow: 7`；不实现完整 200/400 字课程。
- 不复制新的认证、打卡、同步、数据库或学习系统；现有 rotation state、`chinese-writing` 打卡和 `learning_profile_states` 契约必须保持兼容。
- 屏幕和打印必须消费同一份 immutable worksheet snapshot；renderer 不读取 localStorage、网络或全局时间，也不推进轮动或写入完成记录。
- 每个内容项必须保持单个 CJK 目标字、稳定 `id`、`pinyin`、`exampleWord`、`theme`、`sourceRefs` 和 `traceEligible`；新增字段必须经过 validator 检查并使用 `escapeHtml`。
- 发音只复用浏览器 `speechSynthesis`，通过 `zh-CN`/`en-US` locale 区分；不下载中文 Piper、不新增模型、不改变现有英语 Piper 兜底。
- 写字打卡仍可撤销；取消当天 UI 打卡不能删除 worksheet completion；不生成 SM-2、mastery、reviewCount 或复习评分。
- 不使用外部图片 URL；Pilot 的视觉内容使用版本化、离线安全的视觉描述（emoji/颜色/alt 文案），为后续本地插图资源保留 `visual` 字段。
- 不执行 Supabase 生产迁移、生产 SQL、Preview/Production 部署、push 或 PR；只在当前本地集成工作树验证。

## File Map

| 文件 | 责任 |
| --- | --- |
| `src/content/hanzi-writing/v2-pilot-1.json` | V2 Pilot 的概念、视觉、词语、句子、发音和书写提示数据 |
| `src/content/hanzi-writing/validate-pack.js` | 内容字段、视觉描述和书写提示的纯校验 |
| `src/hanzi-worksheet-rotation.js` | 将内容项的学习元数据带入 immutable worksheet snapshot，并兼容旧 snapshot |
| `src/hanzi-writing-view.js` | 从 worksheet snapshot 生成屏幕学习卡、练写行和 print sheet |
| `src/app.js` | 绑定发音交互并保持现有语文任务/打卡/rotation 生命周期 |
| `src/app.css` | 学习卡、视觉块、书写提示、练写格和 A4 print-only 布局 |
| `tests/unit/hanzi-writing-pack.test.js` | 新内容契约和安全字段回归 |
| `tests/unit/hanzi-writing-view.test.js` | renderer 输出字段、转义和屏幕/打印一致性 |
| `tests/e2e/hanzi-writing.spec.js` | 图字学习卡、发音按钮、轮动和打卡行为 |
| `tests/e2e/print.spec.js` | 丰富 snapshot 的打印隔离与 A4 版式 |
| `tests/e2e/offline.spec.js` | 未登录、统一学习入口和字帖回归 |
| `tests/e2e/cloud.spec.js` | 登录 learner scope 下的字帖回归 |
| `docs/user-guide.md` | 只描述实际存在的图字学习、书写和打印流程 |

---

### Task 1: Enrich the V2 Pilot content contract

**Files:**

- Modify: `src/content/hanzi-writing/v2-pilot-1.json`
- Modify: `src/content/hanzi-writing/validate-pack.js`
- Modify: `tests/unit/hanzi-writing-pack.test.js`

**Interfaces:**

每个 active item 在既有字段之外增加：

```json
{
  "concept": {
    "label": "火山",
    "visual": {
      "kind": "emoji",
      "value": "🌋",
      "alt": "一座火山"
    },
    "englishLabel": "volcano",
    "characterEnglishLabel": "fire",
    "characterMeaning": "燃烧时发光发热的东西"
  },
  "exampleWords": ["火山", "火光"],
  "sentence": "火山有火。",
  "writing": {
    "strokeCount": 4,
    "structure": "独体字",
    "hint": "先观察字的中间位置。"
  }
}
```

字段规则：

- `concept.label`、`concept.visual.alt`、`concept.englishLabel`、`concept.characterEnglishLabel`、`concept.characterMeaning`、`sentence`、`writing.structure` 和 `writing.hint` 是非空字符串，长度不超过 120。
- `concept.visual.kind` 只能是 `emoji`；`value` 是 1–8 个 Unicode grapheme，不能包含 HTML-like 文本、URL 或事件属性。
- `exampleWords` 至少两个非空词语；每个词语都必须包含当前 item 的 `glyph`。
- `writing.strokeCount` 是 1–64 的整数；`traceEligible` 为 false 的 item 不得包含 `writing`。
- 所有新字段纳入 `collectUnsafeText()` 安全检查；validator 错误必须指出完整字段路径。

- [ ] **Step 1: Write failing validator tests**

增加合法字段通过、缺少 visual/word/sentence/writing、非法 visual kind、超长 emoji/alt、exampleWords 不包含目标字、非法 strokeCount 和 `<script>` 文本失败测试；保留既有 32 item、唯一 id/glyph/order、来源和安全文本测试。

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
npm test -- tests/unit/hanzi-writing-pack.test.js
```

Expected: 新字段 fixture 在 validator 尚未实现前失败。

- [ ] **Step 3: Add the Pilot metadata**

为 32 个 active item 补齐 concept visual、英文概念标签、至少两个包含目标字的例词、儿童可读短句和书写提示；不改 item 的稳定 id、glyph、order、pinyin、exampleWord、theme、sourceRefs 和 traceEligible。

- [ ] **Step 4: Implement validation**

实现上述字段规则，并让 `npm run check` 继续通过 active pack 校验。

- [ ] **Step 5: Run focused verification**

```bash
npm test -- tests/unit/hanzi-writing-pack.test.js
npm run check
```

- [ ] **Step 6: Commit**

```bash
git add src/content/hanzi-writing/v2-pilot-1.json src/content/hanzi-writing/validate-pack.js tests/unit/hanzi-writing-pack.test.js
git commit -m "feat(hanzi): enrich V2 pilot learning metadata"
```

**Acceptance:** 32 个 active item 都能通过内容校验，并能为 renderer 提供视觉、词语、句子和书写提示；没有任何外部图片依赖或 unsafe HTML。

---

### Task 2: Render the approved graph into screen and print snapshots

**Files:**

- Modify: `src/hanzi-worksheet-rotation.js`
- Modify: `src/hanzi-writing-view.js`
- Modify: `src/app.css`
- Modify: `tests/unit/hanzi-worksheet-rotation.test.js`
- Modify: `tests/unit/hanzi-writing-view.test.js`

**Consumes:** Task 1 的 `concept`, `exampleWords`, `sentence`, `writing` 字段；现有 worksheet row snapshot 仍提供 `glyph`, `pinyin`, `exampleWord`, `itemId`。

**Snapshot rule:** `resolveWritingWorksheet()` 必须把 renderer 所需的新增字段复制进每一行 immutable snapshot；`buildWorksheet()`、`normalizeWorksheet()` 和 merge 路径都要保留这些字段。遇到同一 Pilot item 的旧 snapshot 缺少新增字段时，优先按稳定 `itemId`/`glyph` 从当前 active pack 一次性补全并保留 assignment/completion；无法安全匹配时才按现有失效规则重新解析。renderer 不得为了补字段读取 pack、localStorage 或网络。

**Produces:**

- `renderWritingWorksheetHtml(worksheet)` 继续返回带 `data-writing-worksheet` 的 section，并新增 `[data-hanzi-learning-card]`、`[data-hanzi-visual]`、`[data-hanzi-example-word]`、`[data-hanzi-sentence]`、`[data-hanzi-writing-hint]` 和 `[data-hanzi-speak]`。
- `renderWritingPrintSheetHtml(worksheet)` 继续返回带 `data-writing-print-sheet` 的 section；打印保留同一份 snapshot 的词语、目标字、拼音、笔顺、组词、造句和练写格，不显示屏幕视觉卡与语音按钮。
- 每个语音按钮带 `data-speech-text` 和 `data-speech-locale`，renderer 只输出 data，不调用浏览器 API。

屏幕学习卡固定结构：

```text
视觉块（visual + alt）
        ↓
完整词语（目标字高亮）
        ↓
目标字 + 拼音 + 单字中文/英文发音按钮 + 单字字意朗读；顶部视觉卡片的 `concept.englishLabel` 只描述实例，不作为目标字英文发音。
        ↓
儿童短句
        ↓
笔画数 / 结构 / 书写提示
        ↓
屏幕学习卡展示笔画符号形式的笔顺与书写提示，不展示字帖格子；打印稿使用确认版式的 9 格：1 格示范、4 格描红、4 格临写
```

- [ ] **Step 1: Write failing renderer tests**

断言四行各生成一个学习卡；视觉 alt、英文标签、例词、句子、strokeCount/structure/strokeOrder/hint、中文/英文发音按钮和字意朗读按钮均出现，屏幕不出现练写格。使用 `<img>`, `<script>`, `onerror=` 和 `&` 等输入断言 HTML 转义；打印输出断言没有 button、每卡 9 格练写结构，且 screen/print 的 assignment/day/pack/rows 元数据一致。

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
npm test -- tests/unit/hanzi-writing-view.test.js
```

- [ ] **Step 3: Preserve snapshot metadata and implement pure rendering**

先在 rotation 的 build/normalize/merge 路径中保证新增字段进入 snapshot；随后 renderer 只从 snapshot rows 读取数据。用 `escapeHtml()` 输出 visual、word、sentence 和 hint；用确定性字符串分割高亮目标字，不把内容拼接为未转义 HTML。练写格使用明确的 `model`, `trace`, `empty` class，保留现有 `data-writing-row`/`data-writing-item-id` 契约。

- [ ] **Step 4: Add child-facing layout**

屏幕使用 2 列学习卡网格（窄屏单列），视觉块、词语、目标字和书写提示形成明确层级；屏幕不展示字帖或田字格，书写练习统一放到独立的 A4 打印稿中。

- [ ] **Step 5: Add print layout**

在现有 `#writingPrintRoot` 隔离规则内，为 A4 portrait 增加确认版式：每页 4 字，每字 1 格楷书示范、4 格描红、4 格临写，附组词、造句和自评区；打印只显示 snapshot，隐藏 app、导航和所有 button，品牌 Logo 使用本地资源，不依赖外部字体或网络资源。

- [ ] **Step 6: Run focused verification**

```bash
npm test -- tests/unit/hanzi-writing-view.test.js
npm run check
```

- [ ] **Step 7: Commit**

```bash
git add src/hanzi-writing-view.js src/app.css tests/unit/hanzi-writing-view.test.js
git commit -m "feat(hanzi): render visual learning and writing cues"
```

**Acceptance:** 语文页和打印页都不再是裸字帖；同一 snapshot 中每个目标字都有视觉、词语、目标字、句子和书写提示，且 renderer 无副作用。

---

### Task 3: Bind speech and preserve the existing learning lifecycle

**Files:**

- Modify: `src/app.js`
- Modify: `tests/e2e/hanzi-writing.spec.js`
- Modify: `tests/e2e/cloud.spec.js`

**Consumes:** Task 2 renderer data attributes；现有英语 `speak()`/Piper fallback、`toggleCheckin()`、`resolveWritingWorksheet()` 和 `createWritingPrintRoot()`。

**Interfaces:**

```js
speak(text, button, locale = "en-US")
```

`locale === "zh-CN"` 时使用浏览器系统普通话语音；`locale === "en-US"` 保持当前英语系统语音优先和 Piper 兜底。系统没有对应语音时只显示当前可重试提示，不把播放失败算作学习完成。

- [ ] **Step 1: Write failing browser tests**

在固定时间打开语文页，断言四张 `[data-hanzi-learning-card]`、视觉、目标字高亮、字意、笔顺、短句、书写提示和 `zh-CN`/`en-US` 发音按钮；mock `speechSynthesis`，点击中文、字意和英文按钮分别断言 utterance 的文本与语言。断言点击发音不改变 rotation state、completion 或每日打卡，且屏幕卡不含字帖格子。

- [ ] **Step 2: Run focused browser tests and confirm failure**

```bash
E2E_PORT=5185 npm run test:e2e -- tests/e2e/hanzi-writing.spec.js -g "learning card|speech"
```

- [ ] **Step 3: Parameterize speech locale**

为现有 speech helper 增加可选 locale；保留 busy、cancel、timeout、错误恢复和 Piper 逻辑，只让英文继续进入 Piper fallback，中文不使用英语模型。

- [ ] **Step 4: Bind only renderer-owned buttons**

在 `renderChinese()` 或专用绑定函数中查找 `[data-hanzi-speak]` 与 `[data-hanzi-meaning-speak]`，读取 data attributes 并调用 `speak()`；重复渲染时不留下旧 listener。发音按钮不得进入 print root。

- [ ] **Step 5: Re-run focused browser tests**

```bash
E2E_PORT=5185 npm run test:e2e -- tests/e2e/hanzi-writing.spec.js
LOCAL_PUBLISHABLE_KEY="$(supabase status -o env | awk -F= '/^API_KEY=/{gsub(/\047/, "", $2); print $2; exit}')"
E2E_BASE_URL=http://127.0.0.1:5184 E2E_EXTERNAL_SERVER=1 VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY="$LOCAL_PUBLISHABLE_KEY" npx playwright test tests/e2e/cloud.spec.js -g "writing workbook"
```

- [ ] **Step 6: Commit**

```bash
git add src/app.js tests/e2e/hanzi-writing.spec.js tests/e2e/cloud.spec.js
git commit -m "feat(hanzi): connect bilingual speech to learning cards"
```

**Acceptance:** 中文/英文发音和字意朗读按钮按 locale 工作，失败不改变学习状态；屏幕不展示字帖格子，打印稿保留确认版式；现有写字打卡、rotation、learner scope 和英语 Piper 不回归。

---

### Task 4: Align offline/print acceptance and documentation

**Files:**

- Modify: `tests/e2e/print.spec.js`
- Modify: `tests/e2e/offline.spec.js`
- Modify: `docs/user-guide.md`
- Modify: `docs/superpowers/plans/2026-09-01-shadow-mate-v2-pilot-sha16-mvp.md`

**Consumes:** Task 1–3 final selectors and actual product behavior.

- [ ] **Step 1: Update failing legacy selectors**

删除 `write-grid`/旧固定 `EXPECTED_WRITING_GROUPS` 断言，改为断言四张学习卡、四行五格、visual/word/sentence/writing hint、屏幕/打印 snapshot 一致和 `window.print()` 不推进 state。

- [ ] **Step 2: Add unified navigation regression**

继续断言一级导航精确为 `首页 / 学习 / 积分 / 成长 / 指南`，四科只能通过学习页进入。

- [ ] **Step 3: Update the guide**

说明当前真实流程：进入“学习”→“语文”→“今日图字学习”→听中文/英文→查看书写提示→轻量临摹→打印 A4；明确当前是 V2 Pilot，不宣称完整 200 字、SM-2 或中文 Piper 离线能力。

- [ ] **Step 4: Mark the old technical-only acceptance boundary**

在 SHA-16 计划中明确：`focus-rows-v1` 的裸字帖输出已被 V2 Pilot 图字纵向切片替换；rotation/print/state 约束不变，完整课程、SM-2、P1/P3 仍 deferred。

- [ ] **Step 5: Run the complete affected browser tests**

```bash
E2E_PORT=5186 npm run test:e2e -- tests/e2e/hanzi-writing.spec.js tests/e2e/print.spec.js tests/e2e/offline.spec.js
LOCAL_PUBLISHABLE_KEY="$(supabase status -o env | awk -F= '/^API_KEY=/{gsub(/\047/, "", $2); print $2; exit}')"
E2E_BASE_URL=http://127.0.0.1:5184 E2E_EXTERNAL_SERVER=1 VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY="$LOCAL_PUBLISHABLE_KEY" npx playwright test tests/e2e/cloud.spec.js
```

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/print.spec.js tests/e2e/offline.spec.js docs/user-guide.md docs/superpowers/plans/2026-09-01-shadow-mate-v2-pilot-sha16-mvp.md
git commit -m "test(docs): align Hanzi visual acceptance contract"
```

**Acceptance:** 所有浏览器验收均按图字学习契约断言，使用指南与实际 UI 一致，旧的“只显示裸字帖”测试不再作为正确标准。

---

## Final verification

```bash
npm run test:fast
npm run build
E2E_PORT=5187 npm run test:e2e -- tests/e2e/hanzi-writing.spec.js tests/e2e/print.spec.js tests/e2e/offline.spec.js
LOCAL_PUBLISHABLE_KEY="$(supabase status -o env | awk -F= '/^API_KEY=/{gsub(/\047/, "", $2); print $2; exit}')"
E2E_BASE_URL=http://127.0.0.1:5184 E2E_EXTERNAL_SERVER=1 VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY="$LOCAL_PUBLISHABLE_KEY" npx playwright test tests/e2e/cloud.spec.js
git diff --check
node scripts/check-integration.mjs --base origin/main --strict --json
```

最终人工验收必须看到：

1. 首页只有“学习”一级入口，四科位于学习页内。
2. 语文页先看到图字学习卡，再看到书写练习，不是直接出现裸字格。
3. 每张卡都有视觉、词语、目标字、拼音、短句和书写提示。
4. 中文/英文发音按钮按语言工作；播放失败不影响完成状态。
5. 刷新、切换模块和重新进入保持同一份当日 snapshot。
6. 打印只显示同一份丰富字帖 snapshot，A4 可读且不含导航/按钮。
7. 写字打卡可取消，但不会删除 worksheet completion；不出现 SM-2 或 mastery 文案。

本计划不代表完整 V2、P1/V1、P3/V3、SM-2、中文 Piper、内容后台或跨模块丰满化已完成。
