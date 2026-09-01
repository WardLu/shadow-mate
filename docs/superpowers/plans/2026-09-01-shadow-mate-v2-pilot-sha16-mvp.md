# Shadow Mate V2 Pilot + SHA-16 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不重做现有学习系统的前提下，把当前固定的 `WRITE_WORDS.slice(0, 4)` 替换为可版本化、稳定去重、同日固定、次日轮换的 V2 Pilot 字帖闭环，并保持现有打卡、离线、云同步、打印和 learner 隔离边界。

**Architecture:** 使用仓库内静态导入的 V2 Pilot 内容包、无 DOM/网络依赖的 `rotation-v1` 纯函数和现有 `extra` JSONB 状态容器。语文页先解析一个 assignment snapshot，屏幕和打印都只消费这个 snapshot；当前 MVP 不实现 SM-2、阶段选择、完整 200 字课程或普通话语音。

**Tech Stack:** Vite + Vanilla JavaScript、localStorage、Supabase JSONB/RLS、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-08-31-preschool-learning-pack-family-design.md`

## Global Constraints

- 当前 MVP 只交付启蒙学习包 V2 Pilot + SHA-16 字帖轮动；完整 V2、SM-2、阶段选择、V1/P1、V3/P3 和跨模块内容丰满化不属于本计划验收。
- Pilot 使用不可变 `contentVersion: "hanzi-v2-pilot-1"`，至少包含 32 个唯一、可书写的稳定内容项，覆盖至少 15 个 `dayKey`。
- 每日字帖固定 4 个练写行；同一 `dayKey` 的 assignment、顺序、字形和版本必须稳定，过去 7 个 `dayKey` 内尽量不重复。
- 不使用 `Math.random()`、渲染时隐式的全局 `Date` 或 UI 自行切片/随机；resolver 只使用注入的 `now` 和 `timeZone`。
- `chinese-writing` 仍是可撤销的每日打卡；MVP 完成记录只表示字帖完成，不生成 SM-2 评分或 mastery。
- 不新增学习包选择 UI，不新增生日、学校或其他儿童敏感字段，不新增内容后台、生产内容表、RPC 或 Supabase migration。
- 继续使用浏览器 publishable key、现有 RLS、现有 JSONB 乐观版本和最多两次冲突重试；本仓库仍是共享 Supabase 的 `proposal-only` 边界。
- 保留当前工作区其他未提交改动；不执行 stash、reset、clean、覆盖或删除无关改动。
- 本计划不授权 commit、push、PR、merge、Preview/Production 部署、生产迁移、真实家庭数据测试或 Multica 状态变更。

---

## File Map

### 新建文件

- `src/content/hanzi-writing/v2-pilot-1.json`：MVP 的不可变字帖内容数据，不放渲染逻辑。
- `src/content/hanzi-writing/manifest.js`：导出 active pack 和 pack 元数据。
- `src/content/hanzi-writing/validate-pack.js`：纯函数内容校验器，供单测和 `npm run check` 使用。
- `src/hanzi-worksheet-rotation.js`：`rotation-v1` 的 dayKey、选择、snapshot、完成和合并纯函数。
- `src/hanzi-writing-view.js`：只把已解析 worksheet snapshot 渲染成屏幕/打印 HTML，不负责选字和持久化。
- `src/local-state.js`：anonymous/profile scoped localStorage adapter。
- `tests/unit/hanzi-writing-pack.test.js`：内容包 schema、数量、唯一性和文本安全测试。
- `tests/unit/hanzi-worksheet-rotation.test.js`：轮动纯函数 golden、时间和合并测试。
- `tests/unit/hanzi-rotation-state.test.js`：rotation state normalize、容量和损坏降级测试。
- `tests/unit/local-state.test.js`：legacy global key、scope、迁移和隔离测试。
- `tests/e2e/hanzi-writing.spec.js`：语文页、同日稳定、次日轮换和打卡端到端测试。
- `tests/e2e/print.spec.js`：print media 下 snapshot-only 输出测试。

### 修改文件

- `src/learning-state.js`：保持顶层 state 白名单，增加受控 rotation state transition。
- `src/lib.js`：让 `stateHasData()` 和 `mergeState()` 识别并专门合并 rotation state。
- `src/app.js`：加载 V2 Pilot、解析一次 snapshot、渲染字帖、记录完成、切换 scoped state。
- `src/cloud.js`：切换 profile 时使用目标 scope，避免把当前 learner 状态混入目标 profile。
- `src/app.css`：增加 print-only sheet 隔离规则。
- `scripts/check.mjs`：增加 active pack validator 门禁。
- `docs/user-guide.md`：只补充实际存在的每日字帖/打印行为，不描述尚未实现的 SM-2 或完整课程。

不修改 `src/piper-tts.js`、普通英语发音逻辑、Supabase migration、`public/sw.js` 或其他学习模块；静态 pack 随应用构建，不新增运行时网络依赖。

## Migration Plan

### State migration

1. 现有 `checkins`、`points`、`bookShelf`、`peanutLog` 和 `peanutRead` 的形状不变。
2. 首次进入字帖页时，向 `extra.hanziWorksheetRotationV1` 懒创建 rotation state；不把 `WRITE_WORDS` 数组当作持久化数据。
3. 已有用户部署后首次进入字帖页会生成 V2 Pilot 的新 assignment；从该次生成开始，同日刷新保持不变，下一日使用新 dayKey。部署前页面没有可读取的 assignment snapshot，因此不伪造历史字帖完成记录。
4. 当前全局 `shadow_mate_workbench_v1` 先一次性复制到 `anonymous` scope；迁移过程 copy-on-write，迁移失败保留原 key。
5. 登录并选择一个没有云端 state 的 profile 时，只有现有明确的 `migrateLocal: true` 路径可以把 anonymous state 合并到该 profile；目标 profile 已有 state 时不得混入 anonymous 或其他 profile。
6. 不添加 `stage`、SM-2、`mastery` 或字符级识字字段；这些属于 MVP 后的独立状态迁移。

### Rollback and compatibility

- 内容问题通过切回旧 active manifest 或发布新 `contentVersion` 处理，不删除已有 assignment snapshot。
- `rotation-v1` 只读取自己的 `schemaVersion`、`learnerScope`、pack reference 和 assignments；损坏或跨 scope 状态降级为空安全状态，并保留现有非 rotation 学习记录。
- 云端仍使用现有 `learning_profile_states.state` 和 `learning_save_state`；没有数据库 schema 迁移和迁移历史操作。
- 已完成的 `chinese-writing` 每日打卡可以继续取消；取消不会删除已记录的字帖 completion，也不会创建复习计划。

## Task Breakdown

### Task 1: V2 Pilot 内容包与 validator

**Files:**

- Create: `src/content/hanzi-writing/v2-pilot-1.json`
- Create: `src/content/hanzi-writing/manifest.js`
- Create: `src/content/hanzi-writing/validate-pack.js`
- Create: `tests/unit/hanzi-writing-pack.test.js`
- Modify: `scripts/check.mjs`

**Interfaces:**

```js
export const HANZI_WRITING_V2_PILOT = {
  schemaVersion: 1,
  setId: "hanzi-writing-v2",
  contentVersion: "hanzi-v2-pilot-1",
  algorithmCompatibility: "rotation-v1",
  locale: "zh-CN",
  targetAgeRange: [4, 5],
  worksheetPolicy: {
    rowsPerDay: 4,
    recentDayWindow: 7,
  },
  reviewers: ["product-owner"],
  sourceRefs: ["shadow-mate-preschool-hanzi-curriculum"],
  items: [],
};

export function getActiveHanziWritingPack() {
  return HANZI_WRITING_V2_PILOT;
}

export function validateHanziWritingPack(pack) {
  return { valid: true, errors: [] };
}
```

`validateHanziWritingPack()` 的实现必须返回真实错误，不得使用示例中的固定成功结果。

**Steps:**

- [ ] 先写合法 pack、重复 `id`、重复 `glyph`、重复 `order`、少于 32 个 active item、非法 CJK glyph、缺少 `sourceRefs`、retired item 和包含 `<script>` 文本的失败 fixture。
- [ ] 运行 `npm test -- tests/unit/hanzi-writing-pack.test.js`，确认 validator/pack 尚未实现时失败。
- [ ] 从已存在的课程字表和当前 `HANZI` seed 中选取至少 32 个已审核、适合 4–5 岁书写练习的字；每项填写 `id`、`glyph`、`pinyin`、`exampleWord`、`order`、`theme`、`difficulty`、`status`、`sourceRefs` 和 `traceEligible`。
- [ ] 使用 `setId: "hanzi-writing-v2"`、`contentVersion: "hanzi-v2-pilot-1"`、`algorithmCompatibility: "rotation-v1"`、`rowsPerDay: 4` 和 `recentDayWindow: 7` 创建 JSON pack。
- [ ] 实现 schema、数量、唯一性、字段类型、active/retired、单字 CJK、来源引用和文本安全校验；validator 不访问 DOM、网络、Supabase 或全局时间。
- [ ] 在 `manifest.js` 静态导入 JSON 并导出 `getActiveHanziWritingPack()`；不再把写字内容继续追加到 `src/app.js` 的 `WRITE_WORDS`。
- [ ] 在 `scripts/check.mjs` 导入 active pack 并在静态检查阶段抛出 validator 错误。
- [ ] 运行 `npm test -- tests/unit/hanzi-writing-pack.test.js` 和 `npm run check`，确认真实 pack 至少 32 个 active item。

**Acceptance:**

- Pilot 是可审阅、可复现的不可变内容版本；修改字形、例词或顺序必须新建 content version。
- pack 至少有 32 个唯一 active item；没有重复 glyph、重复 ID 或未声明来源。
- 恶意文本只作为文本数据存在，后续 renderer 使用 escape/text node 时不会形成 HTML。
- 构建可以静态携带 pack，首次打开不依赖额外 fetch。

### Task 2: `rotation-v1` 字帖轮动纯函数

**Files:**

- Create: `src/hanzi-worksheet-rotation.js`
- Create: `tests/unit/hanzi-worksheet-rotation.test.js`

**Interfaces:**

```js
export const ROTATION_ALGORITHM_VERSION = "rotation-v1";

export function getDayKey(now, timeZone) {
  return "YYYY-MM-DD";
}

export function normalizeRotationState(input, options = {}) {
  return {
    schemaVersion: 1,
    learnerScope: options.learnerScope || "anonymous",
    algorithmVersion: ROTATION_ALGORITHM_VERSION,
    activePack: options.packRef,
    assignments: {},
    lastIssuedDayKey: null,
  };
}

export function resolveDailyWorksheet({
  rotationState,
  pack,
  learnerScope,
  now,
  timeZone,
}) {
  return { worksheet, rotationState };
}

export function recordWorksheetCompletion({
  rotationState,
  worksheet,
  completedAt,
}) {
  return rotationState;
}

export function mergeRotationState(localState, remoteState) {
  return localState;
}
```

实际返回类型必须如下：

```js
// worksheet
{
  assignmentId: "stable-id",
  dayKey: "2026-09-01",
  layoutVersion: "focus-rows-v1",
  packRef: { setId: "hanzi-writing-v2", contentVersion: "hanzi-v2-pilot-1" },
  rows: [
    { rowId: "row-1", itemId: "hz-001", glyph: "一", pinyin: "yī", exampleWord: "一个" },
  ],
}

// rotationState.assignments[dayKey]
{
  canonicalAssignmentId: "stable-id",
  candidates: {
    "stable-id": { /* immutable worksheet snapshot */ },
  },
  completions: {
    "stable-id": { completedAt: "2026-09-01T03:00:00.000Z" },
  },
}
```

**Selection contract:**

1. 用注入的 IANA `timeZone` 计算 `dayKey`；同一输入不读取全局当前时间。
2. `assignments[dayKey]` 已存在时直接返回 canonical snapshot，不重新排序、不生成新 ID。
3. 没有当天 assignment 时，从 active items 中排除前 7 个 `dayKey` 已出现的 item，再按 `stableHash(seed + learnerScope + dayKey + itemId)`、`order`、`id` 排序，取 4 个不同 item。
4. 候选不足 4 个时按最近出现日、`order`、稳定 hash 进行确定性降级填充；同一张 sheet 内仍不得重复 item。Pilot 的 32 个 item 在正常 4 行/天策略下不触发七日无重复不足。
5. `assignmentId` 由 algorithm version、pack ref、scope、dayKey 和 row item IDs 的稳定序列计算；不能包含生成时刻或随机数。
6. `recordWorksheetCompletion()` 只向该 assignment 的 `completions` 写入一次完成事实；重复调用必须幂等，不修改 worksheet snapshot。
7. 跳过日期不创建空 assignment；页面跨午夜但未重新渲染时，当前内存中的 screen/print snapshot 不变。
8. `mergeRotationState()` 只允许同一 `learnerScope`、同一 pack ref 和同一 algorithm version；同日 candidates/completions 做集合 union，canonical 取最小稳定 assignment ID。

**Steps:**

- [ ] 先写固定 pack、固定 `now`、固定 timezone 和空 state 的 golden test；同日连续 resolve 100 次必须 `toEqual` 且 assignment ID 相同。
- [ ] 写连续 15 个 dayKey 的测试：每天 4 个不同 item，当前 dayKey 与前 7 个 dayKey 的 item 集合不交；第 8 日以后仍按稳定降级规则工作。
- [ ] 写跨月、跨年、闰日、DST 和 `Asia/Singapore`/`America/Los_Angeles` dayKey 测试。
- [ ] 写跳过日期、页面跨午夜 snapshot 保持、pack version pinning 和 completion 幂等测试。
- [ ] 写同一日两个设备产生不同 candidates 时的 union/canonical 测试，以及跨 scope、跨 pack、跨算法版本拒绝测试。
- [ ] 实现稳定 hash、dayKey、normalize、selection、snapshot、completion、prune 和 merge；状态保留最近 90 个 dayKey，单次 rotation payload 目标小于 200 KB。
- [ ] 运行 `npm test -- tests/unit/hanzi-worksheet-rotation.test.js`，所有纯函数测试通过后才接 UI。

**Acceptance:**

- 同日 assignment byte-for-byte 稳定；次日 assignment 在固定 fixture 下不与前日 byte-for-byte 相同。
- 轮动结果只由输入决定，不受渲染次数、网络、随机数或真实系统时间漂移影响。
- rotation state 不记录 SM-2、mastery、review count 或阶段选择字段。
- merge 满足同 scope 的交换、结合、幂等；跨 scope fail closed。

### Task 3: 学习状态容器、rotation normalize 与专用 merge

**Files:**

- Modify: `src/learning-state.js`
- Modify: `src/lib.js`
- Create: `tests/unit/hanzi-rotation-state.test.js`
- Modify: `tests/unit/learning-state.test.js`
- Modify: `tests/unit/merge.test.js`

**Interfaces:**

```js
export function createLearningState(initial = {}) {
  // 顶层仍只返回 checkins/extra/points/bookShelf/peanutLog/peanutRead
}

export function getHanziRotationState(state) {
  return state?.extra?.hanziWorksheetRotationV1 || null;
}

export function replaceHanziRotationState(state, rotationState) {
  return state;
}

export function stateHasData(state) {
  return Boolean(/* legacy fields or valid rotation assignment */);
}

export function mergeState(local, remote) {
  return mergedState;
}
```

**Steps:**

- [ ] 先为 `stateHasData({ extra: { hanziWorksheetRotationV1: validState } })` 写失败测试；空对象、数组、损坏 assignment 和跨 scope rotation 必须返回 false。
- [ ] 先为 `replaceHanziRotationState()`、`STATE_REPLACED` 和 rotation-only state 写失败测试，确认未知顶层字段仍被丢弃、`extra` 仍被保留。
- [ ] 先为 `mergeState()` 的同 scope candidates/completions union、跨 scope拒绝、损坏状态降级和非 rotation legacy fields 保持原行为写失败测试。
- [ ] 在 `learning-state.js` 中增加受控 rotation replacement transition；不增加新的顶层 state key，不把 resolver 逻辑复制进状态机。
- [ ] 在 `lib.js` 中调用 `normalizeRotationState()` 和 `mergeRotationState()`；legacy fields 继续使用当前 `mergeObjects()` 和 peanutLog 去重规则。
- [ ] 对 rotation assignment、candidates 和 completions 做确定性裁剪；JSONB 单 state 保持远低于 1 MB。
- [ ] 运行 `npm test -- tests/unit/learning-state.test.js tests/unit/merge.test.js tests/unit/hanzi-rotation-state.test.js`。

**Acceptance:**

- 既有 check-in、积分、书架和阅读日志测试全部保持通过。
- 只有 rotation 的匿名状态会触发 local → cloud migration 判断。
- merge 不再用 local array 覆盖 remote rotation；同日不同设备的 assignment information 不会静默丢失。
- normalize 不会让非法或跨 learner 的状态进入 renderer。

### Task 4: anonymous/profile scoped local state 与 cloud seam

**Files:**

- Create: `src/local-state.js`
- Modify: `src/app.js` 的状态初始化、`save()`、`window.learningDesk`
- Modify: `src/cloud.js` 的 `selectProfile()`、`saveCloudState()`、退出/清除本机/删除学习者路径
- Create: `tests/unit/local-state.test.js`
- Modify: `tests/e2e/cloud.spec.js`

**Interfaces:**

```js
export function createScopedStateStorage({
  storage,
  legacyKey = "shadow_mate_workbench_v1",
  scopedKey = "shadow_mate_workbench_scoped_v1",
  normalize,
}) {
  return {
    load(scope),
    save(scope, state),
    remove(scope),
    clear(),
    listScopes(),
    migrateLegacyToAnonymous(),
  };
}

// envelope stored in scopedKey
{
  schemaVersion: 1,
  scopes: {
    anonymous: { /* LearningState */ },
    "profile:<uuid>": { /* LearningState */ },
  },
}
```

`window.learningDesk` 保持 `getState()`、`replaceState()`、`clearLocalData()` 兼容，并增加：

```js
window.learningDesk.getPersistenceScope()
window.learningDesk.activateScope(scope, { state, persist: true })
window.learningDesk.flushLocalState()
```

**Steps:**

- [ ] 先测试 legacy global key 只复制到 `anonymous` 一次；复制失败保留旧 key，损坏 JSON 降级为空 state。
- [ ] 先测试 profile A/B 各自保存 rotation、退出登录回到 anonymous、清除本机删除所有 scope、删除单个 learner 只删除对应 scope。
- [ ] 先测试 `selectProfile()` 目标有 remote state 时不合并当前 local state；目标为空且 `migrateLocal: true` 时只合并 anonymous scope。
- [ ] 先测试异步 profile switch 期间旧 profile 的 cloud response 不会写入新 scope；save 请求绑定开始时的 profile ID、scope 和 state snapshot。
- [ ] 实现 `createScopedStateStorage()`，所有读写先 `normalizeLearningState()`，使用 copy-on-write envelope。
- [ ] 修改 `app.js`：启动读取 anonymous scope；切换 scope 前 flush 当前 scope；`save()` 只写当前 scope并触发现有 cloud schedule。
- [ ] 修改 `cloud.js`：加载目标 profile 后先激活目标 scope，再将 remote state normalize；删除当前“只要 local 有数据就自动混入目标 profile”的分支。
- [ ] 保留现有 RPC、optimistic version、最多两次 conflict retry、`cloudSyncBlocked` 熔断和错误提示；rotation merge 在提交 RPC 前完成。
- [ ] 运行 `npm test -- tests/unit/local-state.test.js`，再运行 cloud E2E 中的 profile switch、empty target migration、clear local 和 conflict case。

**Acceptance:**

- anonymous、profile A、profile B 的字帖 assignment、completion 和非汉字学习记录互不串联。
- anonymous → 空 profile 的迁移只发生一次；已有云端 profile 不被匿名数据覆盖。
- 网络失败不破坏当前本机 snapshot；云端冲突不把远端 rotation 静默覆盖掉。
- 不新增设备指纹、儿童敏感字段或生产数据库字段。

### Task 5: 语文页、字帖 renderer、可撤销打卡和 snapshot-only 打印

**Files:**

- Create: `src/hanzi-writing-view.js`
- Modify: `src/app.js` 的 `renderChinese()`、`toggleCheckin()` 和模块切换清理
- Modify: `src/app.css` 的 print media 规则
- Modify: `docs/user-guide.md`
- Create: `tests/e2e/hanzi-writing.spec.js`
- Create: `tests/e2e/print.spec.js`

**Interfaces:**

```js
export function renderWritingWorksheetHtml(worksheet) {
  return "<section data-writing-worksheet>...</section>";
}

export function renderWritingPrintSheetHtml(worksheet) {
  return '<section class="writing-print-sheet" data-writing-print-sheet>...</section>';
}
```

两个 renderer 只读取 worksheet snapshot；它们不调用 resolver、不读取 localStorage、不调用 `Date`、不记录完成。所有 glyph、pinyin、exampleWord 和 dayKey 进入 HTML 前使用 `escapeHtml()` 或 DOM text node。

**Steps:**

- [ ] 先写 Playwright 时间 fixture：固定 `2026-09-01T10:00:00+08:00` 打开语文页，断言写字区域存在 4 个 `data-writing-row`、一个 assignment ID 和 `hanzi-v2-pilot-1`。
- [ ] 先写 reload/切换到英语再切回/重复打开测试，断言 assignment ID、row item IDs、顺序和字形不变。
- [ ] 先 mock `window.print()`，在 print media 下断言只有 `data-writing-print-sheet` 可见；识字卡、古诗、导航、按钮和其他模块不进入打印树。
- [ ] 先写打印前后 state snapshot 相等、`window.print()` 不创建新 assignment、不新增 completion 的测试。
- [ ] 先写 `chinese-writing` false → true 时记录当前 assignment completion，重复点击不重复写入；true → false 只取消每日 UI 打卡，不删除 completion 的测试。
- [ ] 在 `renderChinese()` 中加载 active pack，调用一次 `resolveDailyWorksheet()`，把返回 snapshot 写入受控 state，再同时渲染 screen root 和 print root。
- [ ] 删除写字主路径对 `WRITE_WORDS.slice(0,4)` 的依赖；保留 `HANZI` 识字卡、古诗、英语和其他模块原有行为。
- [ ] 在 `toggleCheckin()` 的 `chinese-writing` 路径中，仅在从未完成变为完成时调用 `recordWorksheetCompletion()`；不要把完成映射为 `good` 或任何 SM-2 结果。
- [ ] 增加默认隐藏的 `.writing-print-sheet`；`@media print` 隐藏普通 app tree，只显示 print sheet，并设置 A4 portrait、边距、分页和可打印练写格。
- [ ] 让离开语文页、清除本机数据和切换 learner 时移除/重建 print root，防止旧 learner 的 sheet 残留。
- [ ] 在使用指南中说明“今日字帖、打印和每日打卡”的实际行为，不写入 SM-2、完整 200 字或普通话离线能力。
- [ ] 运行 `node scripts/run-e2e.mjs tests/e2e/hanzi-writing.spec.js tests/e2e/print.spec.js`，修复真实浏览器失败后再进行总验证。

**Acceptance:**

- 当前屏幕和打印严格来自同一 worksheet snapshot；打印不会重新 resolve、推进轮动或改变状态。
- 同日刷新、切模块、重开页面都稳定；新 dayKey 生成不同 assignment。
- 字帖完成与可撤销的每日 `chinese-writing` 打卡分离；MVP 不出现 SM-2 评分按钮或 mastery 文案。
- 打印预览只显示字帖，不显示完整语文页或其他模块。

### Task 6: MVP 集成验证与交付审计

**Files:**

- Read: `docs/superpowers/specs/2026-08-31-preschool-learning-pack-family-design.md`
- Read: `README.md`, `docs/architecture.md`, `docs/user-guide.md`
- Verify: Task 1–5 changed files and final diff/status

**Steps:**

- [ ] 运行聚焦 unit tests：

```bash
npm test -- tests/unit/hanzi-writing-pack.test.js tests/unit/hanzi-worksheet-rotation.test.js tests/unit/hanzi-rotation-state.test.js tests/unit/local-state.test.js
```

- [ ] 运行既有状态回归：

```bash
npm test -- tests/unit/learning-state.test.js tests/unit/merge.test.js
```

- [ ] 运行 MVP 浏览器场景：

```bash
node scripts/run-e2e.mjs tests/e2e/hanzi-writing.spec.js tests/e2e/print.spec.js
```

- [ ] 运行静态检查、构建和构建产物检查：

```bash
npm run check
npm run build
node scripts/check-build.mjs
```

- [ ] 运行与 PWA、状态、云同步和打印边界相匹配的完整本地门禁：

```bash
npm run verify
```

- [ ] 对照 MVP 验收逐项核对：Pilot >=32、4 行、7 日去重、同日稳定、次日轮换、print-only、可撤销打卡、profile 隔离、无数据库迁移、无 SM-2。
- [ ] 检查 `git diff --check`、未跟踪文件清单和最终文件是否只在本计划范围内；不修改、不提交、不推送任何其他工作区变更。
- [ ] 分开记录本地测试结果、Hosted CI 状态、Preview/Production 状态、独立 QA 状态和真实家庭验收状态；缺少证据的类别标记为未验证。

**Acceptance:**

- MVP 端到端闭环通过，且现有其他模块和英语发音没有回归。
- `npm run verify` 的结果只作为本地技术证据，不表述为 CI、部署或生产验收。
- 计划完成不代表 SM-2、完整 V2、阶段选择、V1/P1、V3/P3 或跨模块内容工作完成。

## Explicitly Deferred Work

以下工作不得在本 MVP PR 中顺带加入：

- Quick-flomo `sm2-compat-v1` 复习评分、家长确认、同日更正和历史重算；
- V2 累计 200 字、P1 基础内容混排以及按阶段不同的每日新内容预算；
- learner profile 级 P1/P2/P3 阶段选择和切换；
- 普通话系统/离线语音以及 Piper 中文模型；
- 英语、数学、绘本、诗词和非汉字语文内容扩充；
- 内容编辑后台、AI 自由选课、生产内容表和新的 Supabase migration；
- `LearningEvent`、`UserCharacterProgress` 或字符级 mastery 平台。

这些能力已经记录在主规范和产品路线图中，必须在 MVP 通过真实使用验证后另立独立计划。
