import { createSpeechSession } from "./speech-session.js";
import { createLearningDesk } from "./learning-desk.js";
import { createLearnerSession } from "./learner-session.js";
import { inject } from "@vercel/analytics";
import { installVibeCafeTelemetry } from "./channel-telemetry.js";
import { ANALYTICS_EVENTS, hasConsecutiveCheckinDays, recordAnalyticsEvent } from "./analytics.js";
import { createUsageAnalytics } from "./usage-analytics.js";
import { installErrorMonitoring } from "./error-monitoring.js";
import { getActiveHanziWritingPack } from "./content/hanzi-writing/manifest.js";
import {
  renderWritingPrintSheetHtml,
  renderWritingWorksheetHtml,
  createOptionalWritingLayout,
} from "./hanzi-writing-view.js";
import { openWritingPrintWindow } from "./writing-print.js";
import {
  getDayKey,
  recordWorksheetCompletion,
  resolveDailyWorksheet,
} from "./hanzi-worksheet-rotation.js";
import { buildMissingSequence, escapeHtml } from "./lib.js";
import { cleanSpeechText } from "./speech-text-utils.js";
import { literacySpeechId } from "./content/literacy-speech.js";
import {
  mathSpeechContentIds,
} from "./content/core-learning-speech.js";
import { renderEnglishVisual } from "./content/english-visuals.js";
import { ENGLISH_DAILY_PROMPT } from "./content/learning-prompts.js";
import { numberSenseSpeech } from "./content/math-speech.js";
import { startVersionGuard } from "./version-guard.js";
import { installRapidActionGuard } from "./action-lock.js";
import { mountPiperResourceManager } from "./piper-resource-ui.js";
import { createPublishedSpeechPlayer } from "./tencent-tts-player.js";
import { icon, hydrateIcons } from "./icons.js";
import { mascot, kidAvatar } from "./toybox-art.js";
import {
  getHanziRotationState,
  getContentLearningState,
  replaceContentLearningState,
  hasCompatibleContentLearningScope,
  hasCompatibleHanziRotationScope,
  hasCheckin,
  replaceHanziRotationState,
  transitionLearningState,
} from "./learning-state.js";
import {
  ALL_CONTENT_MODULES,
  LEARNING_PACKAGES,
  getActiveLearningPackage,
  getActiveLearningPackages,
  setContentPackageId,
  setContentPackageIds,
  getContentLearningPace,
  getContentModuleDefinition,
  getEnabledModuleIds,
  normalizeContentConfig,
  setContentModuleEnabled,
  setContentPackageEnabled,
} from "./learning-content-package.js";
import { createIndexedDbLearningDb } from "./learning-local-db.js";
import { createGrowthLoopController } from "./learning-growth-loop-controller.js";
import { ACTIVITY_EVENT_TYPES, activityEventIdFor } from "./learning-analytics.js";
import { buildLegacyPointEntries, getActivePointAction, getBalance, getLegacyPeriodTotal, getLegacyPointsImport, getOpeningBalance, getPointDayTotal, getPointPeriodTotal } from "./learning-growth-loop.js";
import { createSoundEngine, SOUND_EVENTS, SOUND_EVENT_KEYS } from "./learning-sounds.js";
import { praise, flyStars, shake } from "./learning-feedback.js";
import { buildMentalQuestion, buildNumberSenseActivity, buildSudoku4, getMathPolicy } from "./math-learning.js";
import { resolveDailyLearningPlan, recordContentCompletion, recordManualContentCompletion, setContentFeedback, revokeContentCompletion, skipContentItem, listContentHistory } from "./content-learning.js";
import { getLearningCatalog, getLearningItem } from "./content/learning-catalog.js";
import { BOOKS, READING_LISTS, migrateLegacyBookState } from "./content/books.js";
import { canLearnSpokenCourse } from "./spoken-language-courses.js";
import { summarizeContentLearning } from "./content-learning-summary.js";
import { createContentLibrary } from "./content-library-view.js";

inject();
const usageAnalytics = createUsageAnalytics({ getMode: () => window.cloudSync?.getUsageMode?.() || "unknown" });
installErrorMonitoring({ isEnabled: () => usageAnalytics.status().enabled });
void usageAnalytics.record("open");
installVibeCafeTelemetry();
installRapidActionGuard(document);
startVersionGuard({ checkIntervalMs: 60_000 });
const publishedSpeechPlayer = createPublishedSpeechPlayer({
  getAudioContext: () => getAudioContext(),
});
if (typeof window !== "undefined" && window.speechSynthesis) {
  try {
    window.speechSynthesis.getVoices?.();
    window.speechSynthesis.addEventListener?.("voiceschanged", () => {
      try { window.speechSynthesis.getVoices?.(); } catch (_) {}
    });
  } catch (_) {}
}
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", primeSpeechAudio, { passive: true, capture: true });

  // 监听卡片“更多”操作详情菜单的展开与收起，提升所属卡片层叠上下文并关闭同级打开的菜单
  document.addEventListener("toggle", (e) => {
    const details = e.target;
    if (!details || !details.classList || !details.classList.contains("card-more-details")) return;
    const card = details.closest(".mini-card, .word-card, .card, .content-options");
    if (details.open) {
      if (card) card.classList.add("menu-open");
      document.querySelectorAll(".card-more-details[open]").forEach((other) => {
        if (other !== details) {
          other.removeAttribute("open");
          const otherCard = other.closest(".mini-card, .word-card, .card, .content-options");
          if (otherCard) otherCard.classList.remove("menu-open");
        }
      });
    } else {
      if (card) card.classList.remove("menu-open");
    }
  }, true);

  // 点击空白处收起已展开的卡片操作菜单
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".card-more-details")) {
      document.querySelectorAll(".card-more-details[open]").forEach((el) => {
        el.removeAttribute("open");
        const card = el.closest(".mini-card, .word-card, .card, .content-options");
        if (card) card.classList.remove("menu-open");
      });
    }
  });
}

/* =========================================================
   影伴学习任务台 —— 数据层
   ========================================================= */


const STROKES = ["点","横","竖","撇","捺","提","折","钩"];
const STROKE_GLYPHS = Object.freeze({
  点: "丶",
  横: "一",
  竖: "丨",
  撇: "丿",
  捺: "㇏",
  提: "㇀",
  折: "㇕",
  钩: "亅",
});

function renderStrokeChip(stroke) {
  return `<span class="stroke-chip" aria-label="基础笔画：${escapeHtml(stroke)}"><span class="stroke-glyph" aria-hidden="true">${escapeHtml(STROKE_GLYPHS[stroke] || "")}</span><span>${escapeHtml(stroke)}</span></span>`;
}

/* 积分打卡：加分项 / 减分项目（取自文档第 2 页） */
const POINT_ITEMS = [
  {group:"加分项",   name:"一起做家务",   desc:"收拾/洗碗",     pts:2},
  {group:"加分项",   name:"认真完成学习", desc:"",              pts:3},
  {group:"加分项",   name:"帮带带弟弟",   desc:"",              pts:2},
  {group:"加分项",   name:"古诗词跟读",   desc:"",              pts:3},
  {group:"减分项目", name:"撒谎",         desc:"",              pts:-10},
  {group:"减分项目", name:"白天摸当众摸鸡鸡", desc:"",          pts:-2},
  {group:"减分项目", name:"不收玩具",     desc:"",              pts:-3}
];

/* =========================================================
   状态 / 存档层（localStorage 永久存档）
   ========================================================= */
const learnerSession = createLearnerSession({
  storage: localStorage, sessionStorage,
  getLearningDesk: () => window.learningDesk,
  getGrowthLoop: () => window.growthLoop,
});
window.learnerSession = learnerSession;
function isProfileScopeBlocked() { return learnerSession.getStatus().phase === "blocked"; }

const profileScopeBlockedAtStartup = isProfileScopeBlocked();
if (!profileScopeBlockedAtStartup) recordAnalyticsEvent(ANALYTICS_EVENTS.activation, { once: true });
const growthLoopDb = createIndexedDbLearningDb({ deferOpen: profileScopeBlockedAtStartup });
const soundEffects = createSoundEngine();
const speechSession = createSpeechSession({
  publishedPlayer: publishedSpeechPlayer,
  synthesis: window.speechSynthesis,
  Utterance: window.SpeechSynthesisUtterance,
});
speechSession.subscribe(({ state }) => soundEffects.setTtsActive(state === "playing"));
window.soundEffects = soundEffects;
const growthLoopController = createGrowthLoopController({
  db: growthLoopDb,
  canWrite: () => learnerSession.getStatus().writable,
  canTransition: () => learnerSession.canTransition(),
  onRewardFulfilled: ({ redemption, userInitiated }) => {
    if (userInitiated && redemption?.status === "fulfilled") {
      soundEffects.play("reward_fulfilled");
      praise("奖励已兑现！🎉");
      flyStars(10);
    }
  },
});
let growthLoopSnapshot = growthLoopController.getSnapshot();
let CURRENT_MOD = "home";
// 双模态状态：默认儿童模式，门禁解锁后进入家长模式
let currentAppMode = "child";
window.growthLoop = growthLoopController;
window.switchMod = switchMod;

function clientRequestId(prefix = "growth") {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function queueGrowthActivity(event_type, payload = {}, bucket = "once") {
  const scope = growthLoopController.getScope();
  if (!scope.household_id || !scope.profile_id) return Promise.resolve(null);
  return growthLoopController.queueActivity({
    event_type,
    event_id: activityEventIdFor({ ...scope, event_type, bucket }),
    payload,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    client_version: document.documentElement.dataset.version || null,
  }).catch((error) => {
    console.warn("Growth Loop activity event queued locally but could not be written:", error);
    return null;
  });
}

growthLoopController.subscribe((nextSnapshot) => {
  growthLoopSnapshot = nextSnapshot;
  if (CURRENT_MOD === "points" || CURRENT_MOD === "grow") switchMod(CURRENT_MOD);
});

const learningDesk = createLearningDesk({
  storage: localStorage,
  canWrite: () => learnerSession.getStatus().writable,
  canTransition: () => learnerSession.canTransition(),
});
// A view draft; only Learning Desk owns the stored state and envelope.
let store = learningDesk.getState();
learningDesk.subscribe((next, { render, scopeChanged }) => {
  store = next;
  activeLearningPlan = null;
  if (scopeChanged) { removeWritingPrintRoot(); }
  if (render) switchMod(CURRENT_MOD);
});

const WRITING_PRINT_ROOT_ID = "writingPrintRoot";
let activeWorksheetSnapshot = null;

function getLearningTimeZone() {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timeZone === "string" && timeZone.length > 0 ? timeZone : "UTC";
  } catch {
    return "UTC";
  }
}

function getHanziLearnerScope() {
  const profileId = learningDesk.getEnvelope().scope?.profile_id;
  return typeof profileId === "string" && profileId.length > 0
    ? `profile:${profileId}`
    : "anonymous";
}

let activeLearningPlan = null;
const CONTENT_CHECKIN_ACTIVITIES = Object.freeze({
  "chinese-literacy": "literacy", "chinese-poem": "poem", "chinese-writing": "writing",
  "english-vocabulary": "english", "book-reading": "book",
});

function dailyLearningPlan() {
  const learnerScope = getHanziLearnerScope();
  if (!hasCompatibleContentLearningScope(store, learnerScope)) return null;
  const config = normalizeContentConfig(store.content_config);
  const packageId = getActiveLearningPackage(config).id;
  const packageIds = config.package_ids || [packageId];
  const enabled = enabledModuleIds();
  const enabledActivities = enabled.flatMap((id) => ({ chinese: ["literacy", "poem", "writing"], english: ["english"], book: ["book"] })[id] || []).sort();
  const dayKey = todayKey();
  const sourceCatalog = getLearningCatalog(packageIds);
  const bookState = migrateLegacyBookState(store);
  const catalog = { ...sourceCatalog, books: sourceCatalog.books.map((item) => ({ ...item, read: Boolean(bookState.bookShelf[item.id]) })) };
  const pace = getContentLearningPace(store.content_config);
  const requestedLimits = {
    literacy: { new: pace.literacy_new || 2 },
    english: { new: pace.english_new || 2 },
    poem: { new: pace.poems_new || 2, newPerIsoWeek: Math.min(20, (pace.poems_new || 2) * 7) },
  };
  const key = JSON.stringify([learnerScope, packageIds, dayKey, catalog.version, enabledActivities, requestedLimits]);
  if (activeLearningPlan?.key === key && getContentLearningState(store)?.plans?.[dayKey]?.candidates?.[activeLearningPlan.plan.planId]) {
    return activeLearningPlan.plan;
  }
  const resolved = resolveDailyLearningPlan({ learning: getContentLearningState(store), learnerScope, dayKey, packageId, packageIds, catalog, enabledActivities,
    limits: requestedLimits, deviceId: contentDeviceId() });
  if (canWriteLearningState() && JSON.stringify(resolved.nextLearning) !== JSON.stringify(getContentLearningState(store))) {
    const previous = store;
    store = replaceContentLearningState(store, resolved.nextLearning);
    if (!save()) { store = previous; return null; }
  }
  activeLearningPlan = { key, plan: resolved.plan };
  return resolved.plan;
}

let inMemoryContentDeviceId = null;
function contentDeviceId() {
  if (!canWriteLearningState()) return inMemoryContentDeviceId || "local";
  try {
    const key = "shadow_mate_content_device";
    let id = localStorage.getItem(key);
    if (!id) { id = clientRequestId("content"); localStorage.setItem(key, id); }
    inMemoryContentDeviceId = id;
    return id;
  } catch { return inMemoryContentDeviceId || "local"; }
}

function plannedContent(activityId) {
  return (dailyLearningPlan()?.activities?.[activityId] || []).map((row) => ({ ...row, item: getLearningItem(activityId, row.itemId) })).filter((row) => row.item);
}

function contentReasonLabel(reason) {
  return reason === "review" ? "复习" : "";
}

// 条目卡左上角的推荐原因胶囊：新内容 / 复习 / 上次没学完
function contentReasonTag(row, newLabel) {
  const label = { new: newLabel, review: "复习", continue: "继续学" }[row.reason];
  return label ? `<span class="chip reason-tag">${label}</span>` : "";
}

function contentFeedbackHtml(row) {
  const learning = getContentLearningState(store);
  const skipped = learning?.skips?.some((entry) => entry.activityId === row.activityId && entry.itemId === row.itemId && entry.skipped);
  const occurrence = learning?.occurrences?.find((entry) => entry.occurrenceId === row.occurrenceId);
  const title = row.item?.glyph || row.item?.word || row.item?.title || "本项内容";
  const status = skipped ? "已跳过" : occurrence?.revoked ? "误录已撤回" : occurrence ? "今天已学" : "";
  const actions = skipped ? '<button class="btn-subtle" type="button" data-content-skip="false">恢复推荐</button>' : occurrence?.revoked ? '<span class="desc">今天不再重复记录</span>' : `${occurrence ? '<button class="btn-subtle" type="button" data-content-observation="independent">可独立完成</button><button class="btn-subtle" type="button" data-content-observation="needs-help">仍需提示</button><button class="btn-subtle" type="button" data-content-revoke>撤回误录</button>' : ""}<button class="btn-subtle" type="button" data-content-skip="true">暂时跳过</button>`;
  return `<div class="content-options" data-content-feedback="${escapeHtml(row.occurrenceId)}" onclick="event.stopPropagation()">${status ? `<span class="content-status-pill">${status}</span>` : ""}<details class="card-more-details"><summary class="card-more-btn" aria-label="${escapeHtml(title)}的更多操作" title="更多操作"><span class="more-dots" aria-hidden="true">⋯</span></summary><div class="content-options-menu">${actions}</div></details></div>`;
}

let contentLibrary = null;
function openContentLibrary(activityId = "literacy", itemId = null) {
  contentLibrary ||= createContentLibrary({
    getCatalog: () => getLearningCatalog(normalizeContentConfig(store.content_config).package_ids || getActiveLearningPackage(store.content_config).id),
    getLearning: () => getContentLearningState(store), getDay: todayKey, getScope: getHanziLearnerScope,
    onStop: stopPoemSpeech,
    onMath: (section) => { switchMod("math"); el("main").querySelector(`[data-math-section="${section}"]`)?.scrollIntoView({ block: "start" }); },
    renderVisual: (item) => renderEnglishVisual(item.word, item.theme, item.meaning),
    onPlay: async (activity, item, button) => {
      stopPoemSpeech();
      if (activity === "poem") {
        const sequence = ++currentPoemSpeechId;
        await speak(`古诗《${item.title}》，${item.author}`, button, "zh-CN", item.headerSpeechId, { isPoemSpeech: true });
        for (let index = 0; index < item.lines.length && sequence === currentPoemSpeechId; index++) {
          await speak(item.lines[index].replace(/[，。！？、；：]/g, ""), null, "zh-CN", item.lineSpeechIds[index], { isPoemSpeech: true });
        }
      } else {
        const text = activity === "english" ? item.word : activity === "literacy" ? `${item.glyph}，${item.word}` : item.glyph || item.title;
        speak(text, button, activity === "english" ? "en-US" : "zh-CN", item.speechId || (activity === "writing" ? `${item.id}:glyph` : null));
      }
    },
    onAction: ({ activityId, itemId, action, occurrenceId }) => {
      if (!canWriteLearningState() || !getLearningItem(activityId, itemId)) return false;
      const previous = store;
      try {
        const learning = getContentLearningState(store);
        const next = action === "restore" || action === "skip"
          ? skipContentItem({ learning, activityId, itemId, skipped: action === "skip", deviceId: contentDeviceId() })
          : action === "revoke" ? revokeContentCompletion({ learning, occurrenceId, deviceId: contentDeviceId() })
          : action === "independent" || action === "needs-help" ? setContentFeedback({ learning, occurrenceId, feedback: action, deviceId: contentDeviceId() })
          : recordManualContentCompletion({ learning, learnerScope: getHanziLearnerScope(), activityId, itemId, dayKey: todayKey(), deviceId: contentDeviceId(), completedAt: new Date().toISOString() });
        store = replaceContentLearningState(store, next);
        if (!save()) { store = previous; return false; }
        return true;
      } catch (_) { store = previous; alert("这次学习未能保存，请重试。"); return false; }
    },
  });
  contentLibrary.open(activityId, itemId);
}

function removeWritingPrintRoot() {
  document.getElementById(WRITING_PRINT_ROOT_ID)?.remove();
  activeWorksheetSnapshot = null;
}

function createWritingPrintRoot(worksheet) {
  removeWritingPrintRoot();
  activeWorksheetSnapshot = structuredClone(worksheet);
  const root = document.createElement("div");
  root.id = WRITING_PRINT_ROOT_ID;
  root.className = "writing-print-root";
  root.innerHTML = renderWritingPrintSheetHtml(activeWorksheetSnapshot);
  document.body.appendChild(root);
}

function resolveWritingWorksheet() {
  const learnerScope = getHanziLearnerScope();
  if (!hasCompatibleHanziRotationScope(store, learnerScope)) return null;
  const pack = getActiveHanziWritingPack(getActiveLearningPackage(store.content_config).id);
  const planned = plannedContent("writing");
  let selectedItemIds = planned.map((row) => row.itemId);
  const existing = getHanziRotationState(store)?.assignments?.[todayKey()];
  if (!existing && selectedItemIds.length !== 4 && pack?.items) {
    const activePackItems = pack.items.filter((item) => item.status === "active");
    for (const item of activePackItems) {
      if (!selectedItemIds.includes(item.id)) selectedItemIds.push(item.id);
      if (selectedItemIds.length === 4) break;
    }
  }
  const resolved = resolveDailyWorksheet({
    rotationState: getHanziRotationState(store),
    pack,
    learnerScope,
    now: new Date(),
    timeZone: getLearningTimeZone(),
    selectedItemIds: selectedItemIds.length === 4 ? selectedItemIds : undefined,
  });
  if (!resolved?.worksheet) return null;
  activeWorksheetSnapshot = resolved.worksheet;
  const nextStore = transitionLearningState(store, {
    type: "STATE_REPLACED",
    state: replaceHanziRotationState(store, resolved.rotationState),
  });
  if (JSON.stringify(nextStore) !== JSON.stringify(store)) {
    const previous = store;
    store = nextStore;
    if (!save()) { store = previous; return null; }
  }
  return structuredClone(resolved.worksheet);
}

function hasActiveWorksheetCompletion() {
  if (!activeWorksheetSnapshot) return false;
  const rotationState = getHanziRotationState(store);
  return Boolean(
    rotationState?.assignments?.[activeWorksheetSnapshot.dayKey]
      ?.completions?.[activeWorksheetSnapshot.assignmentId]
  );
}

function recordActiveWorksheetCompletion() {
  if (!activeWorksheetSnapshot?.assignmentId) return;
  const rotationState = getHanziRotationState(store);
  if (!rotationState) return;
  store = transitionLearningState(store, {
    type: "STATE_REPLACED",
    state: replaceHanziRotationState(store, recordWorksheetCompletion({
      rotationState,
      worksheet: activeWorksheetSnapshot,
      completedAt: new Date().toISOString(),
    })),
  });
}

function canWriteLearningState({ allowScopeTransition = false } = {}) {
  const cloudWriteCheck = allowScopeTransition
    ? learnerSession.canTransition()
    : learnerSession.getStatus().writable;
  return !isProfileScopeBlocked()
    && cloudWriteCheck !== false;
}

function save(){
  if (!canWriteLearningState()) return false;
  try {
    if (!learningDesk.replaceState(store, { persist: true, render: false })) return false;
  } catch (_) {
    alert("本机保存失败，请检查存储空间后重试。");
    return false;
  }
  window.cloudSync?.schedule();
  return true;
}

function todayKey(){
  return getDayKey(new Date(), getLearningTimeZone());
}
function dateKeyOffset(off){
  const d = new Date(); d.setHours(0,0,0,0);
  d.setDate(d.getDate()-off);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function isChecked(mod){
  const t = todayKey();
  return hasCheckin(store.checkins[t], mod);
}

function enabledModuleIds(){
  return getEnabledModuleIds(store.content_config);
}

function availableModuleIds(){
  return enabledModuleIds().filter((moduleId) => moduleId !== "speaking" ||
    (store.content_config.spoken_courses || []).some(canLearnSpokenCourse));
}

function updateContentPackage(enabled){
  if (!canWriteLearningState()) return;
  const previous = store;
  store = { ...store, content_config: setContentPackageEnabled(store.content_config, enabled) };
  if (!save()) store = previous;
  switchMod(CURRENT_MOD);
}

function updateContentModule(moduleId, enabled){
  if (!canWriteLearningState()) return;
  const previous = store;
  store = { ...store, content_config: setContentModuleEnabled(store.content_config, moduleId, enabled) };
  if (!save()) store = previous;
  switchMod(CURRENT_MOD);
}

function contentModuleLabel(moduleId){
  const labels = { chinese: "语文学习", math: "数学与数感", english: "英语学习", book: "绘本读物", speaking: "语言听说" };
  return labels[moduleId] || moduleId;
}

function toggleCheckin(mod){
  if (!canWriteLearningState()) return;
  let checkinDate = todayKey();
  if (mod === "chinese-writing" && activeWorksheetSnapshot?.dayKey !== checkinDate) {
    switchMod("chinese");
    checkinDate = todayKey();
  }
  if (mod === "chinese-writing" && activeWorksheetSnapshot?.dayKey !== checkinDate) return;

  const wasChecked = hasCheckin(store.checkins[checkinDate], mod);
  const previousStore = store;
  const activityId = CONTENT_CHECKIN_ACTIVITIES[mod];
  if (!wasChecked && activityId) {
    const plan = dailyLearningPlan();
    if (!plan) return;
    let rows = plan.activities[activityId] || [];
    if (activityId === "book") rows = rows.slice(0, 1);
    if (activityId === "writing" && activeWorksheetSnapshot) {
      rows = rows.filter((row) => activeWorksheetSnapshot.rows.some((item) => item.itemId === row.itemId));
    }
    let learning = getContentLearningState(store);
    const eligibleRows = rows.filter((row) =>
      !learning?.skips?.some((entry) => entry.activityId === activityId && entry.itemId === row.itemId && entry.skipped) &&
      !learning?.occurrences?.some((entry) => entry.occurrenceId === row.occurrenceId && entry.revoked)
    );
    if (rows.length > 0 && eligibleRows.length === 0) {
      alert("当前内容已全部跳过，可在右上角内容库恢复或选择新内容。");
      return;
    }
    for (const row of eligibleRows) {
      learning = recordContentCompletion({ learning, plan, activityId, itemId: row.itemId, dayKey: checkinDate, deviceId: contentDeviceId(), completedAt: new Date().toISOString() });
    }
    store = replaceContentLearningState(store, learning);
  }
  const shouldRecordWorksheet = mod === "chinese-writing" &&
    !wasChecked &&
    !hasActiveWorksheetCompletion();
  store = transitionLearningState(store, {
    type: "CHECKIN_TOGGLED",
    date: checkinDate,
    key: mod,
  });
  if (shouldRecordWorksheet) recordActiveWorksheetCompletion();
  const saved = save();
  if (!saved) { store = previousStore; return; }
  if (saved && !wasChecked && hasCheckin(store.checkins[checkinDate], mod)) {
    void usageAnalytics.record("checkin", { meaningful: true });
    recordAnalyticsEvent(ANALYTICS_EVENTS.firstCheckin, { once: true });
    if (hasConsecutiveCheckinDays(store.checkins, 3)) {
      recordAnalyticsEvent(ANALYTICS_EVENTS.threeDayStreak, { once: true });
    }
  }
  if (isChecked(mod)) {
    soundEffects.play("action_completed");
    praise("太棒了！");
    flyStars(8);
  }
  void queueGrowthActivity(
    ACTIVITY_EVENT_TYPES.GROWTH_ACTIVITY_RECORDED,
    { source: "checkin", entry_type: "manual" },
    `${todayKey()}:${mod}`,
  );
  window.cloudSync?.scheduleGrowthLoop?.();
}
function streak(mod){
  let s = 0;
  for(let i=0;i<400;i++){
    const k = dateKeyOffset(i);
    if(hasCheckin(store.checkins[k], mod)) s++;
    else if(i>0) break;
  }
  return s;
}
function totalChecked(mod){
  let n = 0;
  for(const k in store.checkins) if(hasCheckin(store.checkins[k], mod)) n++;
  return n;
}

/* 积分打卡辅助 */
function ymKey(){ const d=new Date(); return d.getFullYear()+"-"+(d.getMonth()+1); }
function dateKeyForDay(day){
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(Number(day));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function visiblePointItems(){
  const items = window.growthLoop?.getPointItems?.() || [];
  if(items.length) return items;
  return POINT_ITEMS.map((item, index) => ({
    id: `recommended:${index}`,
    name: item.name,
    description: item.desc,
    default_points: item.pts,
    icon_key: PTS_ICON[item.name] || "star",
    item_kind: "recommended",
  }));
}
function pointItemAt(itemId){
  return visiblePointItems().find((item) => item.id === itemId) || null;
}
function pointOn(itemId, day){
  const item = pointItemAt(itemId);
  if(!item?.id || item.id.startsWith("recommended:")) return false;
  return getActivePointAction(growthLoopSnapshot, item.id, dateKeyForDay(day));
}
function togglePoint(itemId, day){
  if (!canWriteLearningState()) return;
  const item = pointItemAt(itemId);
  if(!item) return;
  const requestId = clientRequestId("point");
  const wasOn = pointOn(itemId, day);
  const delta = Number(item.default_points ?? item.pts);
  void window.growthLoop.recordPoint({ item, occurred_on: dateKeyForDay(day), request_id: requestId }).then((result) => {
    if (!result.error && !wasOn && result.ledger?.some(entry => entry.request_id === requestId && entry.entry_type === "manual")) {
      void usageAnalytics.record("point_recorded", { meaningful: true });
    }
    void queueGrowthActivity(
      ACTIVITY_EVENT_TYPES.GROWTH_ACTIVITY_RECORDED,
      { source: "point_item", entry_type: Number(item.default_points ?? item.pts) < 0 ? "adjustment" : "manual" },
      requestId,
    );
    void queueGrowthActivity(ACTIVITY_EVENT_TYPES.CORE_ACTIVATION, { source: "point_item" }, "once");
    window.cloudSync?.scheduleGrowthLoop?.();
    renderPoints();
    if (wasOn) {
      soundEffects.play("try_again");
    } else if (delta < 0) {
      soundEffects.play("points_deducted");
      const card = document.querySelector(`.pts-card[data-pts-card="${item.id}"]`)
        || document.querySelector(`.pts-card[data-pts-name="${item.name}"]`);
      if (card) shake(card, { durationMs: 600 });
    } else {
      soundEffects.play("points_earned");
      praise(`+${delta} 积分！`);
      flyStars(6);
    }
  }).catch((error) => {
    console.error("Growth Loop local point write failed:", error);
    alert("本机记录没有保存成功，请稍后重试。");
  });
}
function itemMonthTotal(itemId){
  const item = pointItemAt(itemId);
  if(!item?.id || item.id.startsWith("recommended:")) return 0;
  return getPointPeriodTotal(growthLoopSnapshot, item.id, currentPeriodKey());
}
function monthTotal(){
  return visiblePointItems().reduce((total, item) => total + itemMonthTotal(item.id), 0)
    + getLegacyPeriodTotal(growthLoopSnapshot, currentPeriodKey());
}
function currentPeriodKey(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function pointDayState(day){
  let total = 0;
  let positive = false;
  let negative = false;
  for(const item of visiblePointItems()){
    if(!pointOn(item.id,day)) continue;
    const points = Number(item?.default_points || 0);
    total += points;
    if(points > 0) positive = true;
    if(points < 0) negative = true;
  }
  return {
    total,
    positive,
    negative,
    kind: positive && negative ? "mixed" : positive ? "pos" : negative ? "neg" : "",
  };
}
function dayTotal(day){
  return pointDayState(day).total;
}

/* =========================================================
   工具
   ========================================================= */
function $(html){ const t=document.createElement("template"); t.innerHTML=html.trim(); return t.content.firstChild; }
function el(id){ return document.getElementById(id); }
function buttonContent(iconName, text){ return `${icon(iconName)}<span>${escapeHtml(text)}</span>`; }
let sharedAudioContext = null;
let activeSpeechView = null;
const speechViews = new WeakMap();

function getAudioContext() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (typeof AudioContextCtor !== "function") return null;
  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    try {
      sharedAudioContext = new AudioContextCtor();
    } catch (_) {
      sharedAudioContext = null;
    }
  }
  return sharedAudioContext;
}

function primeSpeechAudio() {
  const audioContext = getAudioContext();
  if (audioContext && audioContext.state === "suspended") {
    void audioContext.resume().catch(() => {});
  }
  const synth = window.speechSynthesis;
  if (synth) {
    try {
      synth.getVoices?.();
      if (synth.paused) {
        synth.resume();
      }
    } catch (_) {}
  }
}

function stopActivePlayback() { speechSession.stop(); }

async function speak(t, button, locale = "en-US", contentId = "", options = {}){
  primeSpeechAudio();
  if (button?.dataset.speechInFlight === "true") return;
  if (activeSpeechView) {
    if (activeSpeechView.button === button) return;
    const prev = activeSpeechView;
    activeSpeechView = null;
    prev.cancelled = true;
    prev.restore?.();
    stopActivePlayback();
  }
  const speechRequest = { button, cancelled: false, restore: null, isPoemSpeech: Boolean(options.isPoemSpeech) };
  activeSpeechView = speechRequest;
  if (button) speechViews.set(button, speechRequest);
  const isCurrentSpeech = () => activeSpeechView === speechRequest && !speechRequest.cancelled;
  if (button) button.dataset.speechInFlight = "true";
  const initialVisibleLabel = button?.textContent?.trim() || button?.dataset.label || "听发音";
  if (button && button.dataset.speechOriginalLabel === undefined) {
    button.dataset.speechOriginalLabel = initialVisibleLabel;
  }
  const originalLabel = button?.dataset.speechOriginalLabel || initialVisibleLabel;
  if (button && button.dataset.speechOriginalAriaLabel === undefined) {
    button.dataset.speechOriginalAriaLabel = button.getAttribute("aria-label") || originalLabel;
  }
  if (button && button.dataset.speechOriginalTitle === undefined) {
    button.dataset.speechOriginalTitle = button.getAttribute("title") || "";
  }
  const originalAriaLabel = button?.dataset.speechOriginalAriaLabel || originalLabel;
  const originalTitle = button?.dataset.speechOriginalTitle || "";
  if (button) {
    button.setAttribute("aria-live", "polite");
    button.setAttribute("aria-atomic", "true");
  }
  const isContainer = Boolean(
    button?.classList.contains("speech-tap") ||
    button?.classList.contains("mini-card") ||
    button?.dataset.speechTap !== undefined ||
    (button && button.firstElementChild && !button.matches(".btn, .speak-btn, .checkin, .btn-read-prompt, .btn-read-q"))
  );
  // 纯图标圆按钮（如首页问候）只换图标，状态文字放进 aria-label / title，避免文字撑破圆形
  const iconOnly = Boolean(button && !isContainer && button.matches(".btn.round"));
  const setButtonContent = (iconName, text) => {
    button.innerHTML = iconOnly ? icon(iconName) : buttonContent(iconName, text);
    if (iconOnly) button.title = text;
  };
  let shouldRestoreButtonFocus = false;
  const restoreButtonFocus = () => {
    if (!button || !shouldRestoreButtonFocus) return;
    const activeElement = document.activeElement;
    if (!activeElement || activeElement === document.body || activeElement === document.documentElement) {
      button.focus({ preventScroll: true });
    }
    shouldRestoreButtonFocus = false;
  };
  const restore = () => {
    if (button && speechViews.get(button) !== speechRequest) return;
    if (button) {
      if (isContainer) {
        button.classList.remove("speech-playing");
        button.removeAttribute("aria-busy");
        button.removeAttribute("data-speech-failure");
        button.removeAttribute("data-published-speech-error");
        button.removeAttribute("data-speech-in-flight");
        restoreButtonFocus();
      } else {
        setButtonContent("volume", originalLabel);
        button.setAttribute("aria-label", originalAriaLabel);
        if (originalTitle) button.title = originalTitle;
        else button.removeAttribute("title");
        button.disabled = false;
        button.removeAttribute("aria-busy");
        button.removeAttribute("data-speech-failure");
        button.removeAttribute("data-published-speech-error");
        button.removeAttribute("data-speech-in-flight");
        restoreButtonFocus();
      }
    }
    if (activeSpeechView === speechRequest) {
      activeSpeechView = null;
    }
  };
  speechRequest.restore = restore;
  const fail = (message) => {
    if (!isCurrentSpeech()) return;
    restore();
    if (!button) return;
    if (isContainer) {
      button.classList.remove("speech-playing");
      button.removeAttribute("aria-busy");
      button.dataset.speechFailure = "true";
      button.title = message;
      shake(button, { durationMs: 400 });
    } else {
      setButtonContent("alert", message);
      button.setAttribute("aria-label", message);
      button.title = message;
      button.dataset.speechFailure = "true";
    }
    if (button.isConnected) recordAnalyticsEvent(ANALYTICS_EVENTS.ttsFailed);
    const errorCode = message.includes("超时") ? "timeout" : message.includes("下载") ? "download_failed" : "synthesis_failed";
    void queueGrowthActivity(ACTIVITY_EVENT_TYPES.TTS_FAILED, {
      source: "published_tts",
      error_code: errorCode,
      retryable: true,
    }, `${errorCode}:${Date.now()}`);
    window.setTimeout(() => {
      if (speechViews.get(button) === speechRequest && button.dataset.speechFailure === "true") restore();
    }, 5000);
  };
  const setBusy = (label = "播放中…") => {
    if (!button) return;
    if (document.activeElement === button) shouldRestoreButtonFocus = true;
    if (isContainer) {
      button.classList.add("speech-playing");
      button.setAttribute("aria-busy", "true");
      button.removeAttribute("data-speech-failure");
      return;
    }
    button.dataset.label = originalLabel;
    setButtonContent("volume", label);
    button.setAttribute("aria-label", originalAriaLabel);
    if (originalTitle) button.title = originalTitle;
    else button.removeAttribute("title");
    button.removeAttribute("data-speech-failure");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  };

  setBusy();
  const result = await speechSession.play({
    text: t, locale,
    contentIds: (Array.isArray(contentId) ? contentId : [contentId]).filter(Boolean),
    volume: soundEffects.getSpeechVolume(),
  });
  if (!isCurrentSpeech()) return;
  if (result.status !== "failed") { restore(); return; }
  if (result.code === "system-unavailable") {
    const stage = result.publishedCode === "published-audio-timeout" ? "加载超时" : "暂不可用";
    fail(`AI 发音${stage}，且未检测到对应系统语音，请稍后重试`);
  } else if (result.code === "system-start-timeout") {
    fail("AI 发音不可用，系统语音未能启动，请重试");
  } else {
    fail("AI 发音不可用，系统语音播放也失败，请重试");
  }
}
function bilibili(q){ return "https://search.bilibili.com/all?keyword="+encodeURIComponent(q); }

/* =========================================================
   渲染：首页
   ========================================================= */
function renderHome(){
  const enabled = availableModuleIds();
  const summaries = [];
  if (enabled.includes("chinese")) {
    const literacy = plannedContent("literacy");
    const poems = plannedContent("poem");
    if (literacy.length) summaries.push(`识字「${literacy.map((row) => row.item.glyph).join("、")}」`);
    if (poems.length) summaries.push(`古诗《${poems[0].item.title || poems[0].item.t}》`);
  }
  if (enabled.includes("english")) {
    const words = plannedContent("english");
    if (words.length) summaries.push(`英语「${words.map((row) => row.item.word).join("、")}」`);
  }
  if (enabled.includes("book")) {
    const books = plannedContent("book");
    if (books.length) summaries.push(`共读《${books[0].item.t}》`);
  }
  const learningOn = enabled.length > 0;
  const checkedToday = enabled.filter(isChecked).length;
  const main = el("main");
  main.innerHTML = "";
  const home = $(`<div class="home"></div>`);
  main.appendChild(home);

  const banner = $(`
    <section class="panel hero a-hero" aria-label="今日问候">
      <span class="mascot-wrap">${mascot()}<span class="chip solid t-orange">队长</span></span>
      <div class="hero-body">
        <div class="bubble"><p>挖掘机小队长，今天也要加油哦！</p><button class="btn round sm t-blue" type="button" id="speakGreetingBtn" aria-label="朗读问候语">${icon("volume")}</button></div>
        <span class="chip t-orange" style="justify-self:start">${icon("flame")} ${streak("chinese") > 0 ? `连胜 ${streak("chinese")} 天！全家为你点赞` : "今天打卡，开启连胜！"}</span>
        <div class="hero-sum">${learningOn
          ? `今日已打卡 ${checkedToday}/${enabled.length} 个学习模块${summaries.length ? ` · ${escapeHtml(summaries.join(" · "))}` : ""}`
          : `学习包还没有启用，去「学习」页为这个孩子开启学习模块吧`}</div>
      </div>
    </section>
  `);
  home.appendChild(banner);
  const speakGreetingBtn = banner.querySelector("#speakGreetingBtn");
  if (speakGreetingBtn) {
    speakGreetingBtn.onclick = () => {
      speak("挖掘机小队长，今天也要加油哦！", speakGreetingBtn, "zh-CN");
    };
  }

  const accountBtn = document.querySelector("#accountButton");
  const isOnline = accountBtn?.dataset?.state === "online";
  let guestDismissed = false;
  try {
    guestDismissed = sessionStorage.getItem("shadow_mate_guest_banner_dismissed") === "1";
  } catch (_) {}

  // 今天的学习：彩虹能量条 + 学科卡（直达学科页）
  if (learningOn) {
    const route = $(`
      <section class="panel a-route" aria-labelledby="h-route">
        <div class="sec-h t-green"><h2 id="h-route">${icon("graduation")} 今天的学习</h2><span class="sp"></span><span class="meta">已完成 ${checkedToday} / ${enabled.length}</span></div>
        <div class="energy"><div class="energy-bar" style="--n:${enabled.length}" role="img" aria-label="今日已充能 ${checkedToday}/${enabled.length}">${enabled.map((module) => `<i class="${HOME_SUBJECTS[module]?.tone || "t-green"} ${isChecked(module) ? "on" : ""}"></i>`).join("")}</div>${icon("gift")}</div>
        <div class="route">${enabled.map((module) => {
          const meta = HOME_SUBJECTS[module] || { tone: "t-green", icon: "graduation", short: contentModuleLabel(module), teaser: "" };
          const done = isChecked(module);
          return `<button class="press ${meta.tone}" type="button" data-go="${module}" aria-label="${contentModuleLabel(module)}，${done ? "今日已打卡" : "今日待打卡"}">
            <span class="blob solid">${icon(meta.icon)}</span><b>${meta.short}</b>
            <span class="teaser">${escapeHtml(homeTeaser(module) || meta.teaser)}</span>
            <span class="chip state ${done ? "t-green" : meta.tone}">${done ? `${icon("checkCircle")} 已打卡` : "去学习"}</span>
            ${done ? `<span class="stamp">${icon("check")}已打卡</span>` : ""}
          </button>`;
        }).join("")}</div>
      </section>
    `);
    home.appendChild(route);
  } else {
    home.appendChild($(`
      <div class="empty a-route">${mascot()}<div><b>学习包还没有启用</b><p class="hint">去「学习」页为这个孩子开启学习模块吧。</p><div class="t-green" style="margin-top:10px"><button class="btn sm" type="button" data-go="learning">${icon("graduation")} 去学习页</button></div></div></div>
    `));
  }

  // 积分打卡
  const todayPoints = dayTotal(new Date().getDate());
  const pointsState = pointDayState(new Date().getDate());
  const pointsDone = pointsState.positive || pointsState.negative;
  const month = monthTotal();
  home.appendChild($(`
    <section class="panel t-sun stars-card a-stars" aria-label="积分打卡">
      <span class="blob lg solid">${icon("star")}</span>
      <div class="nums"><div class="big-num"><b>${todayPoints > 0 ? "+" : ""}${todayPoints}</b><span>今天的积分</span></div><div class="big-num"><b>${month > 0 ? "+" : ""}${month}</b><span>本月积分</span></div></div>
      <span class="chip ${pointsDone ? "t-green" : "line"}">${pointsDone ? `${icon("checkCircle")} 今日已打卡` : "今日待打卡"}</span>
      <button class="btn block" type="button" data-go="points">${icon("star")} 去积分打卡 · 加分减分</button>
    </section>
  `));

  // 今日成长数据
  if (learningOn) {
    const stats = $(`
      <section class="panel a-stats" aria-labelledby="h-stats">
        <div class="sec-h t-teal"><h2 id="h-stats">${icon("sprout")} 今日成长数据</h2><span class="sp"></span><span class="chip">${checkedToday}/${enabled.length} 已充能</span></div>
        <div class="stats stat-grid" style="--n:${enabled.length + 1}">
          <div class="stat t-green">${icon("checkCircle")}<b>${checkedToday}<small>/${enabled.length}</small></b><span>今日打卡</span></div>
          ${enabled.map((module) => {
            const meta = HOME_SUBJECTS[module] || { tone: "t-green", icon: "graduation", short: contentModuleLabel(module) };
            return module === "chinese"
              ? `<div class="stat ${meta.tone}">${icon("flame")}<b>${streak("chinese")}<small>天</small></b><span>语文连续</span></div>`
              : `<div class="stat ${meta.tone}">${icon(meta.icon)}<b>${totalChecked(module)}<small>天</small></b><span>${meta.short}累计</span></div>`;
          }).join("")}
        </div>
      </section>
    `);
    home.appendChild(stats);
  }

  if (!isOnline && !guestDismissed) {
    const isWeChat = typeof navigator !== "undefined" && /MicroMessenger/i.test(navigator.userAgent || "");
    const guestCard = $(`
      <section class="panel notice a-notice" data-guest-card aria-labelledby="h-notice">
        <div class="notice-top">
          <span class="blob sm t-green">${icon("cloud")}</span>
          <div>
            <span class="chip t-green">离线试用中 · 本机保存</span>
            <h3 id="h-notice">开启家庭空间，打卡记录换手机不丢失</h3>
            <p class="hint">当前数据仅保存在此设备。家长免费登录后即可建立家庭档案，手机、平板或电脑跨端同步。</p>
            ${isWeChat ? `<p class="hint notice-wechat">在微信里打开的？点击右上角「···」，选择在系统浏览器中打开，体验完整发音并可添加到桌面。</p>` : ""}
          </div>
          <button class="x-btn" type="button" aria-label="暂不提醒" data-dismiss-guest>${icon("close")}</button>
        </div>
        <div class="acts t-green">
          <button class="btn sm" type="button" data-action="guest-login">${icon("learner")} 家长登录 / 开启家庭空间</button>
          <button class="btn white sm" type="button" data-action="guest-guide">${icon("compass")} 使用指南</button>
        </div>
      </section>
    `);
    const loginBtn = guestCard.querySelector("[data-action='guest-login']");
    if (loginBtn) {
      loginBtn.onclick = () => document.querySelector("#accountButton")?.click();
    }
    const guideBtn = guestCard.querySelector("[data-action='guest-guide']");
    if (guideBtn) {
      guideBtn.onclick = () => switchMod("guide");
    }
    const closeBtn = guestCard.querySelector("[data-dismiss-guest]");
    if (closeBtn) {
      closeBtn.onclick = () => {
        try {
          sessionStorage.setItem("shadow_mate_guest_banner_dismissed", "1");
        } catch (_) {}
        guestCard.remove();
      };
    }
    home.appendChild(guestCard);
  }

  home.appendChild($(`<div class="a-foot"><p class="foot-note">${icon("construction")} 本机离线保存 · 家长登录后自动同步云端</p></div>`));
  home.querySelectorAll("[data-go]").forEach(c=>c.onclick=()=>switchMod(c.dataset.go));
}

// 首页学科卡的色调、图标与默认预告；预告优先使用当天计划内容
const HOME_SUBJECTS = {
  chinese: { tone: "t-orange", icon: "zi", short: "语文", teaser: "识字 · 古诗 · 写字" },
  math: { tone: "t-blue", icon: "calculator", short: "数学", teaser: "口算 · 数感 · 规律 · 数独" },
  english: { tone: "t-teal", icon: "languages", short: "英语", teaser: "今日单词 · 往期回看" },
  book: { tone: "t-purple", icon: "book", short: "绘本", teaser: "今日绘本 · 书架 · 书单" },
  speaking: { tone: "t-rose", icon: "chat", short: "听说", teaser: "跟读 · 对话练习" },
};
function homeTeaser(module) {
  if (module === "chinese") {
    const parts = [];
    const literacy = plannedContent("literacy");
    const poems = plannedContent("poem");
    if (literacy.length) parts.push(`识字「${literacy.map((row) => row.item.glyph).join("、")}」`);
    if (poems.length) parts.push(`古诗《${poems[0].item.title || poems[0].item.t}》`);
    return parts.join(" · ");
  }
  if (module === "english") {
    const words = plannedContent("english");
    return words.length ? `英语「${words.map((row) => row.item.word).join("、")}」` : "";
  }
  if (module === "book") {
    const books = plannedContent("book");
    return books.length ? `共读《${books[0].item.t}》` : "";
  }
  return "";
}

function renderLearning(){
  const main = el("main"); main.innerHTML="";
  const titleRow = $(`
    <div class="page-h">
      <h1><span class="blob sm solid t-green">${icon("graduation")}</span>学习</h1><span class="sp"></span>
      <div class="acts t-green"><button class="btn soft sm" type="button" data-open-library>${icon("library")} 内容库</button><button class="btn soft sm" type="button" data-go-settings="learning" aria-label="学习设置">${icon("settings")} 学习设置</button></div>
    </div>
  `);
  main.appendChild(titleRow);
  titleRow.querySelector("[data-open-library]").onclick = () => openContentLibrary();

  const enabled = enabledModuleIds();
  if (enabled.length) {
    const entries = enabled.map((moduleId) => {
      const module = getContentModuleDefinition(moduleId);
      const meta = HOME_SUBJECTS[moduleId] || { tone: "t-green", icon: module.icon_key };
      const available = availableModuleIds().includes(moduleId);
      const done = available && isChecked(moduleId);
      const tone = available ? meta.tone : "t-ink";
      return `<button class="press subj-card ${tone}" type="button" data-go="${escapeHtml(module.content_entry)}">
        <span class="blob lg ${available ? "solid" : ""}">${icon(meta.icon)}</span><b>${escapeHtml(module.name)}</b>
        <span class="sub">${available ? (SUBJECT_TASK_SUMMARY[moduleId] || "") : "课程准备中"}</span>
        <span class="row">${available
          ? `<span class="chip ${done ? "t-green" : tone}">${done ? `${icon("checkCircle")} 今日已打卡` : "今日待打卡"}</span><span class="chip line">累计 ${totalChecked(moduleId)} 天 · 连续 ${streak(moduleId)} 天</span>`
          : `<span class="chip line">准备中 · 暂不计入打卡统计</span>`}</span>
        ${done ? `<span class="stamp">${icon("check")}已打卡</span>` : ""}
      </button>`;
    }).join("");
    main.appendChild($(`<p class="hint">每个任务单独打卡，再点一次同一个打卡按钮就能取消。点读和播放不会自动记成完成。</p>`));
    main.appendChild($(`<div class="tb-grid g2-t">${entries}</div>`));
    main.querySelectorAll("[data-go]").forEach((c) => (c.onclick = () => switchMod(c.dataset.go)));
  } else {
    main.appendChild($(`
      <div class="empty">${mascot()}<div><b>学习模块未启用</b><p class="hint">由家长在学习设置里开启学习包并勾选需要的学科，关闭期间历史记录都会保留。</p><div class="t-green" style="margin-top:10px"><button class="btn sm" type="button" data-go-settings="learning">${icon("settings")} 前往设置开启模块</button></div></div></div>
    `));
  }
  main.querySelectorAll("[data-go-settings]").forEach((btn) => {
    btn.onclick = () => switchMod("settings", { tab: btn.dataset.goSettings });
  });
  main.appendChild($(`<p class="foot-note">${icon("construction")} 本机离线保存 · 登录后跨设备同步</p>`));
}

const SUBJECT_TASK_SUMMARY = {
  chinese: "识字 · 古诗 · 写字",
  math: "口算 · 数感 · 规律 · 数独",
  english: "今日单词 · 往期回看",
  book: "今日绘本 · 书架 · 书单 · 记录",
  speaking: "亲子听说",
};

/* =========================================================
   渲染：语文
   ========================================================= */
let currentPoemSpeechId = 0;
let currentPoemCardIndex = 0;
function stopPoemSpeech() {
  currentPoemSpeechId++;
  const readAllButton = document.querySelector(".poem-read-all");
  if (readAllButton) {
    readAllButton.disabled = false;
    readAllButton.removeAttribute("aria-busy");
  }
  if (activeSpeechView?.isPoemSpeech) {
    const prev = activeSpeechView;
    activeSpeechView = null;
    prev.cancelled = true;
    prev.restore?.();
    stopActivePlayback();
  }
  document.querySelectorAll(".poem-line.hi").forEach((el) => el.classList.remove("hi"));
}

function renderChinese(){
  const main = el("main"); main.innerHTML="";
  main.appendChild(subjectHero("chinese"));

  const chineseSections = [
    { id: "section-chinese-literacy", label: "识字", icon: "zi", checkin: "chinese-literacy" },
    { id: "section-chinese-poem", label: "古诗", icon: "scroll", checkin: "chinese-poem" },
    { id: "section-chinese-writing", label: "写字", icon: "pencil", checkin: "chinese-writing" },
  ];
  const tabs = renderSectionTabs(chineseSections);
  if (tabs) main.appendChild(tabs);

  const literacyRows = plannedContent("literacy");
  const poemRows = plannedContent("poem");

  const pace = getContentLearningPace(store.content_config);
  const currentPlan = dailyLearningPlan();
  const litLimits = currentPlan?.limits?.literacy || { new: pace.literacy_new || 2, review: 2 };

  const card1 = $(`
    <div class="card card-collapsible" data-literacy-plan id="section-chinese-literacy">
      <div class="card-collapse-header">
        <h3>${icon("zi")} 识字打卡 <span class="pill">生活识字 · 按实际记录复习</span></h3>
        <button class="card-collapse-toggle" type="button" aria-label="展开或收起识字打卡">
          <span class="card-collapse-label">收起</span>
          <span class="card-collapse-icon">${icon("chevronDown")}</span>
        </button>
      </div>
      <div class="card-collapse-body">
        <div class="desc">每天最多 ${litLimits.new} 个新字和 ${litLimits.review} 个复习字。未完成的内容继续保留，点读不代表已经掌握。</div>
        <div class="grid2">${literacyRows.map((row, index) => `
          <div class="mini-card speech-tap" role="button" tabindex="0" data-hanzi-mini="${index}" data-content-reason="${row.reason}" aria-label="点读生字：${escapeHtml(row.item.glyph)}，${escapeHtml(row.item.word)}">
            ${contentReasonTag(row, "新字")}
            ${contentFeedbackHtml(row)}
            <div class="big">${escapeHtml(row.item.glyph)}</div>
            <div class="py">${escapeHtml(row.item.pinyin)}</div>
            <div class="label">${escapeHtml(row.item.word)}</div>
            <span class="tap-hint" aria-hidden="true">${icon("volume")} 点一下听</span>
          </div>`).join("")}</div>
        ${literacyRows.length ? checkinBtn("chinese-literacy","识字") : '<div class="desc">今天没有安排新的或到期的识字内容，可以在生活中找找熟悉的字。</div>'}
      </div>
    </div>
  `);
  main.appendChild(card1);
  makeCollapsible(card1, "chinese_literacy", false);
  card1.querySelectorAll("[data-hanzi-mini]").forEach((mc) => {
    const item = literacyRows[Number(mc.dataset.hanziMini)].item;
    const playHanzi = () => { stopPoemSpeech(); speak(`${item.glyph}，${item.word}`, mc, "zh-CN", item.speechId); };
    mc.onclick = playHanzi;
    mc.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); playHanzi(); } };
  });

  // 古诗词按真实体验记录继续听读与重温，多首诗支持翻页导航
  if (poemRows.length) {
    if (currentPoemCardIndex >= poemRows.length) currentPoemCardIndex = 0;
    const poemContainer = document.createElement("div");
    poemContainer.className = "poem-container";
    poemContainer.id = "section-chinese-poem";
    main.appendChild(poemContainer);

    function renderActivePoem() {
      stopPoemSpeech();
      const poemRow = poemRows[currentPoemCardIndex];
      const p = poemRow.item;
      const linesHtml = p.lines.map((line, idx) => `
        <div class="poem-line" role="button" tabindex="0" data-poem-line="${idx}" aria-label="点读第 ${idx + 1} 句：${escapeHtml(line)}">
          <span class="poem-line-text">${escapeHtml(line)}</span>
          <span class="poem-line-icon" aria-hidden="true">${icon("volume")}</span>
        </div>
      `).join("");

      const card2 = $(`
        <div class="card card-collapsible poem-box" data-content-reason="${poemRow.reason}">
          <div class="card-collapse-header poem-card-header">
            <h3>${icon("bookMarked")} 古诗听读${poemRow.reason === "review" ? ' <span class="pill">复习</span>' : ""}</h3>
            <div class="card-collapse-actions">
              ${contentFeedbackHtml(poemRow)}
              <button class="card-collapse-toggle" type="button" aria-label="展开或收起古诗听读">
                <span class="card-collapse-label">收起</span>
                <span class="card-collapse-icon">${icon("chevronDown")}</span>
              </button>
            </div>
          </div>
          <div class="card-collapse-body">
            ${poemRows.length > 1 ? `
              <div class="poem-pager-container">
                <div class="poem-pager" role="navigation" aria-label="古诗切换">
                  <button type="button" class="btn-subtle poem-pager-btn" data-poem-prev aria-label="上一首古诗" ${currentPoemCardIndex === 0 ? "disabled" : ""}>
                    ${icon("chevronLeft")} 上一首
                  </button>
                  <span class="poem-pager-index" aria-live="polite">第 ${currentPoemCardIndex + 1} / ${poemRows.length} 首</span>
                  <button type="button" class="btn-subtle poem-pager-btn" data-poem-next aria-label="下一首古诗" ${currentPoemCardIndex === poemRows.length - 1 ? "disabled" : ""}>
                    下一首 ${icon("chevronRight")}
                  </button>
                </div>
              </div>
            ` : ""}
            <div class="poem-title speech-tap" role="button" tabindex="0" aria-label="点读古诗标题与作者：${escapeHtml(p.title)}，${escapeHtml(p.author)}">《${escapeHtml(p.title)}》</div>
            <div class="poem-meta speech-tap" role="button" tabindex="0" aria-label="点读古诗标题与作者：${escapeHtml(p.title)}，${escapeHtml(p.author)}">${escapeHtml(p.author)} · 亲子欣赏</div>
            <div class="poem-lines" role="region" aria-label="古诗诗句">${linesHtml}</div>
            <div class="poem-controls">
              <button class="checkin poem-read-all" type="button">${icon("volume")} 朗读整首</button>
              <a class="video-link poem-video" href="${bilibili(p.title+" 朗诵")}" target="_blank" rel="noopener noreferrer">${icon("play")} 跟读视频</a>
            </div>
            <div class="desc text-center mt-8">小提示：点击任意一句，可单独朗读该句</div>
            <div class="spacer-10"></div>
            <div class="desc">${escapeHtml(p.prompt || "一起找找诗中出现的景物，说说你想到了什么。不要求一次背会。")}</div>
          </div>
        </div>
      `);

      poemContainer.innerHTML = "";
      poemContainer.appendChild(card2);
      makeCollapsible(card2, "chinese_poem", false);

      const prevBtn = card2.querySelector("[data-poem-prev]");
      if (prevBtn) {
        prevBtn.onclick = () => {
          if (currentPoemCardIndex > 0) {
            currentPoemCardIndex--;
            renderActivePoem();
          }
        };
      }
      const nextBtn = card2.querySelector("[data-poem-next]");
      if (nextBtn) {
        nextBtn.onclick = () => {
          if (currentPoemCardIndex < poemRows.length - 1) {
            currentPoemCardIndex++;
            renderActivePoem();
          }
        };
      }

      const poemTitleEl = card2.querySelector(".poem-title");
      const poemMetaEl = card2.querySelector(".poem-meta");
      const playPoemHeader = () => {
        stopPoemSpeech();
        speak(`古诗《${p.title}》，${p.author}`, null, "zh-CN", p.headerSpeechId, { isPoemSpeech: true });
      };
      if (poemTitleEl) {
        poemTitleEl.onclick = playPoemHeader;
        poemTitleEl.onkeydown = (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); playPoemHeader(); }
        };
      }
      if (poemMetaEl) {
        poemMetaEl.onclick = playPoemHeader;
        poemMetaEl.onkeydown = (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); playPoemHeader(); }
        };
      }

      card2.querySelectorAll(".poem-line").forEach((lineEl) => {
        const idx = Number(lineEl.dataset.poemLine);
        const lineText = p.lines[idx];
        lineEl.onclick = async () => {
          stopPoemSpeech();
          card2.querySelectorAll(".poem-line.hi").forEach((el) => el.classList.remove("hi"));
          lineEl.classList.add("hi");
          const clean = lineText.replace(/[，。！？、；：]/g, "");
          try {
            await speak(clean, null, "zh-CN", p.lineSpeechIds[idx], { isPoemSpeech: true });
          } catch (_) {}
        };
      });

      const readAllBtn = card2.querySelector(".poem-read-all");
      if (readAllBtn) {
        readAllBtn.onclick = async () => {
          stopPoemSpeech();
          const thisSeqId = ++currentPoemSpeechId;
          readAllBtn.disabled = true;
          readAllBtn.setAttribute("aria-busy", "true");

          try {
            await speak(`古诗《${p.title}》，${p.author}`, null, "zh-CN", p.headerSpeechId, { isPoemSpeech: true });
            if (currentPoemSpeechId !== thisSeqId) return;

            for (let i = 0; i < p.lines.length; i++) {
              if (currentPoemSpeechId !== thisSeqId) return;
              const lineEl = card2.querySelector(`[data-poem-line="${i}"]`);
              card2.querySelectorAll(".poem-line.hi").forEach((el) => el.classList.remove("hi"));
              if (lineEl) lineEl.classList.add("hi");

              const clean = p.lines[i].replace(/[，。！？、；：]/g, "");
              await speak(clean, null, "zh-CN", p.lineSpeechIds[i], { isPoemSpeech: true });
              if (currentPoemSpeechId !== thisSeqId) return;
            }

            card2.querySelectorAll(".poem-line.hi").forEach((el) => el.classList.remove("hi"));
            soundEffects.play("points_earned");
            praise("念得真好！");
            flyStars(8);
          } catch (_) {
          } finally {
            if (currentPoemSpeechId === thisSeqId) {
              readAllBtn.disabled = false;
              readAllBtn.removeAttribute("aria-busy");
            }
          }
        };
      }
    }

    renderActivePoem();
    main.appendChild($(`<div class="card">${checkinBtn("chinese-poem", poemRows.length > 1 ? `古诗（共 ${poemRows.length} 首）` : "古诗")}</div>`));
  } else {
    const emptyPoemCard = $(`<div class="card card-collapsible" id="section-chinese-poem">
      <div class="card-collapse-header">
        <h3>${icon("bookMarked")} 古诗听读</h3>
        <button class="card-collapse-toggle" type="button" aria-label="展开或收起古诗听读">
          <span class="card-collapse-label">收起</span>
          <span class="card-collapse-icon">${icon("chevronDown")}</span>
        </button>
      </div>
      <div class="card-collapse-body">
        <div class="desc">今天没有安排新的或到期的古诗。可以休息，也可以到内容库自由听读。</div>
      </div>
    </div>`);
    main.appendChild(emptyPoemCard);
    makeCollapsible(emptyPoemCard, "chinese_poem", false);
  }

  // 写字打卡
  const worksheet = resolveWritingWorksheet();
  if (!worksheet) {
    const writingRows = plannedContent("writing");
    const emptyWritingCard = $(`<div class="card card-collapsible" id="section-chinese-writing">
      <div class="card-collapse-header">
        <h3>${icon("pen")} 可选写字练习</h3>
        <button class="card-collapse-toggle" type="button" aria-label="展开或收起写字练习">
          <span class="card-collapse-label">收起</span>
          <span class="card-collapse-icon">${icon("chevronDown")}</span>
        </button>
      </div>
      <div class="card-collapse-body">
        <div class="desc">先一起认识一些简单字。有足够的合适材料后，再提供四行字帖；今天可以用画线、涂画代替练写。</div>
        ${writingRows.map((row) => `<div class="mini-card" data-content-reason="${row.reason}"><div class="big">${escapeHtml(row.item.glyph)}</div><div class="py">${escapeHtml(row.item.pinyin)}</div><div class="label">${escapeHtml(row.item.exampleWord || row.item.word || "")}${row.reason === "review" ? " · 复习" : ""}</div>${contentFeedbackHtml(row)}</div>`).join("")}
      </div>
    </div>`);
    main.appendChild(emptyWritingCard);
    makeCollapsible(emptyWritingCard, "chinese_writing", false);
    return;
  }
  const worksheetHtml = renderWritingWorksheetHtml(worksheet);
  createWritingPrintRoot(worksheet);
  const strokesHtml = STROKES.map(renderStrokeChip).join("");
  const card3 = $(`
    <div class="card card-collapsible" data-writing-practice id="section-chinese-writing">
      <div class="card-collapse-header">
        <h3>${icon("pencil")} 写字练习 <span class="pill">可选 · 四行字帖</span></h3>
        <button class="card-collapse-toggle" type="button" aria-label="展开或收起写字练习">
          <span class="card-collapse-label">收起</span>
          <span class="card-collapse-icon">${icon("chevronDown")}</span>
        </button>
      </div>
      <div class="card-collapse-body">
        <div class="desc">8 个基础笔画：${strokesHtml}</div>
        <div class="desc">识字练习看字与认读，这里练描红与书写。四行供家长选择，先描一格，再试着独立书写。打印和点读不会自动记录学习。</div>
        ${worksheetHtml}
        <div class="spacer-12"></div>
        <button class="checkin secondary" type="button" data-print>${icon("download")} 打印 A4 字帖</button>
        <div class="spacer-10"></div>
        ${checkinBtn("chinese-writing","写字")}
      </div>
    </div>
  `);
  main.appendChild(card3);
  makeCollapsible(card3, "chinese_writing", false);
  const printButton = card3.querySelector("[data-print]");
  const printButtonLabel = printButton.innerHTML;
  let printErrorTimer = null;
  const restorePrintButton = () => {
    if (!printButton.isConnected) return;
    printButton.disabled = false;
    printButton.removeAttribute("aria-busy");
    printButton.removeAttribute("title");
    printButton.innerHTML = printButtonLabel;
  };
  printButton.onclick = () => {
    if (printButton.disabled) return;
    if (printErrorTimer !== null) window.clearTimeout(printErrorTimer);
    printButton.disabled = true;
    printButton.setAttribute("aria-busy", "true");
    printButton.textContent = "准备打印…";
    void openWritingPrintWindow(activeWorksheetSnapshot || worksheet)
      .then(restorePrintButton)
      .catch((error) => {
        console.error("Writing worksheet print failed:", error);
        if (!printButton.isConnected) return;
        printButton.disabled = false;
        printButton.removeAttribute("aria-busy");
        printButton.title = error?.message || "打印准备失败，请重试。";
        printButton.textContent = "打印准备失败，请重试";
        printErrorTimer = window.setTimeout(restorePrintButton, 5000);
      });
  };
  card3.querySelector("[data-writing-worksheet]")?.querySelectorAll("[data-hanzi-speak], [data-hanzi-meaning-speak]").forEach((button) => {
    button.dataset.speechOriginalLabel = button.textContent?.trim() || "听发音";
    button.setAttribute("aria-live", "polite");
    button.setAttribute("aria-atomic", "true");
    button.addEventListener("pointerdown", primeSpeechAudio, { passive: true });
    button.onclick = () => {
      const meaningRow = button.hasAttribute("data-hanzi-meaning-speak")
        ? button.closest(".writing-row, [data-writing-row], .hanzi-learning-card")?.querySelector("[data-hanzi-meaning-row]")
        : null;
      if (meaningRow) meaningRow.classList.add("speech-playing");
      return speak(
        button.dataset.speechText || "",
        button,
        button.dataset.speechLocale || "en-US",
        button.dataset.speechContentId || "",
      ).finally(() => {
        if (meaningRow) meaningRow.classList.remove("speech-playing");
      });
    };
  });
  card3.querySelector("[data-writing-worksheet]")?.querySelectorAll("[data-speech-tap]").forEach((el) => {
    el.setAttribute("aria-live", "polite");
    el.setAttribute("aria-atomic", "true");
    el.addEventListener("pointerdown", primeSpeechAudio, { passive: true });
    const playSpeechTap = () => {
      stopPoemSpeech();
      if (el.hasAttribute("data-hanzi-meaning-row")) {
        const card = el.closest(".writing-row, [data-writing-row], .hanzi-learning-card");
        const meaningBtn = card?.querySelector("[data-hanzi-meaning-speak]");
        if (meaningBtn) {
          meaningBtn.click();
          return;
        }
      }
      const rawText = el.dataset.speechText || el.textContent || "";
      const textToSpeak = cleanSpeechText(rawText);
      if (textToSpeak) speak(textToSpeak, el, "zh-CN", literacySpeechId(textToSpeak));
    };
    el.onclick = playSpeechTap;
    el.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        playSpeechTap();
      }
    };
  });
}

/* =========================================================
   渲染：数学与数感
   ========================================================= */
let mathLevel = 5, mathAns = 0;
function genQuiz(){
  const question = buildMentalQuestion(mathLevel);
  mathAns = question.answer;
  return question.text.replace("-", "−");
}
function mathSpeechText(q) {
  const match = String(q).match(/^(\d+)\s*([+\-−])\s*(\d+)/);
  if (!match) return q.replace("=", "等于几").replace("?", "");
  const a = match[1];
  const op = (match[2] === "+" ? "加" : "减");
  const b = match[3];
  return `${a} ${op} ${b} 等于几？`;
}
function renderMath(){
  const main = el("main"); main.innerHTML="";
  main.appendChild(subjectHero("math"));

  const mathSections = [
    { id: "section-math-mental", label: "口算", icon: "calculator", checkin: "math-mental" },
    { id: "section-math-sense", label: "生活数感", icon: "apple" },
    { id: "section-math-sequence", label: "数字规律", icon: "beads" },
    { id: "section-math-sudoku", label: "简单数独", icon: "grid", checkin: "math-sense" },
  ];
  const tabs = renderSectionTabs(mathSections);
  if (tabs) main.appendChild(tabs);

  // 口算为家长可选活动，数域由当前学习包约束。
  const packageId = getActiveLearningPackage(store.content_config).id;
  const policy = getMathPolicy(packageId);
  const lvls = [5,10,20].filter((level) => level <= policy.defaultMaxResult);
  if (!lvls.includes(mathLevel)) mathLevel = policy.defaultMaxOperand;
  const q = genQuiz();
  const lvlHtml = lvls.map(n=>`<button class="lvl-btn ${n===mathLevel?'active':''}" data-lvl="${n}">${n}以内</button>`).join("");
  const card1 = $(`
    <div class="card card-collapsible" id="section-math-mental">
      <div class="card-collapse-header">
        <h3>${icon("calculator")} 口算打卡 <span class="pill">${mathLevel} 以内 · 可选练习</span></h3>
        <button class="card-collapse-toggle" type="button" aria-label="展开或收起口算打卡">
          <span class="card-collapse-label">收起</span>
          <span class="card-collapse-icon">${icon("chevronDown")}</span>
        </button>
      </div>
      <div class="card-collapse-body">
        <div class="desc">先用积木或小玩具数一数、分一分；有兴趣时再试口算，操作数和答案均在所选数域内。</div>
        <div class="lvl-row">${lvlHtml}</div>
        <div class="quiz-box">
          <div class="quiz-q-row">
            <div class="quiz-q" id="qq">${q}</div>
            <button class="btn-read-q" type="button" aria-label="朗读题目">${icon("volume")} 读题目</button>
          </div>
          <input class="quiz-input" id="qa" type="number" inputmode="numeric" aria-labelledby="qq" placeholder="?">
          <div class="feedback" id="qf"></div>
        </div>
        <button class="checkin" id="qsubmit">${icon("check")} 提交答案</button>
        <div class="spacer-8"></div>
        ${checkinBtn("math-mental","口算")}
      </div>
    </div>
  `);
  main.appendChild(card1);
  makeCollapsible(card1, "math_mental", false);
  card1.querySelectorAll("[data-lvl]").forEach(b=>b.onclick=()=>{ mathLevel=+b.dataset.lvl; renderMath(); });
  const readQBtn = card1.querySelector(".btn-read-q");
  if (readQBtn) {
    readQBtn.onclick = () => {
      speak(mathSpeechText(q), readQBtn, "zh-CN", mathSpeechContentIds(q));
    };
  }
  el("qsubmit").onclick=()=>{
    const qa = el("qa");
    const v = qa.value;
    const f = el("qf");
    if(v===""){
      f.textContent="请先写出答案哦";
      f.className="feedback no";
      shake(qa);
      return;
    }
    if(+v===mathAns){
      f.innerHTML=`${icon("party")} 答对啦，真棒！`;
      f.className="feedback ok";
      soundEffects.play("points_earned");
      praise("答对啦！");
      flyStars(6);
    } else {
      f.textContent=`再想想～正确答案是 ${mathAns}`;
      f.className="feedback no";
      soundEffects.play("try_again");
      shake(qa);
    }
  };

  const activity = buildNumberSenseActivity(`${getHanziLearnerScope()}:${todayKey()}`, packageId);
  const senseSpeech = numberSenseSpeech(activity);
  const activityCard = $(`<div class="card card-collapsible" data-number-sense id="section-math-sense">
    <div class="card-collapse-header">
      <h3 style="margin:0;">${icon("brain")} 生活数感 <span class="pill">亲子游戏</span></h3>
      <div style="display:flex;align-items:center;gap:6px;">
        <button class="btn-subtle btn-read-sense" type="button" aria-label="朗读生活数感题目">${icon("volume")} 读题目</button>
        <button class="card-collapse-toggle" type="button" aria-label="展开或收起生活数感">
          <span class="card-collapse-label">收起</span>
          <span class="card-collapse-icon">${icon("chevronDown")}</span>
        </button>
      </div>
    </div>
    <div class="card-collapse-body">
      <div class="desc">${escapeHtml(activity.prompt)}</div>
      <div class="desc" data-number-sense-illustration>${escapeHtml(activity.illustration.text)}</div>
      <div class="lvl-row">${activity.options.map((value, index) => `<button class="lvl-btn" type="button" data-sense-option="${index}">${escapeHtml(value)}</button>`).join("")}</div>
      <div class="feedback" aria-live="polite"></div>
    </div>
  </div>`);
  main.appendChild(activityCard);
  makeCollapsible(activityCard, "math_sense", false);
  const readSenseBtn = activityCard.querySelector(".btn-read-sense");
  if (readSenseBtn) {
    readSenseBtn.onclick = () => {
      speak(senseSpeech.speechText, readSenseBtn, "zh-CN", senseSpeech.contentIds);
    };
  }
  activityCard.querySelectorAll("[data-sense-option]").forEach((button) => {
    button.onclick = () => {
      const correct = activity.options[Number(button.dataset.senseOption)] === activity.answer;
      activityCard.querySelector(".feedback").textContent = correct ? "对啦，一起说说你是怎么发现的。" : "再观察一下，也可以用小玩具摆一摆。";
      activityCard.querySelector(".feedback").className = `feedback ${correct ? "ok" : "no"}`;
    };
  });

  const sequence = buildMissingSequence({
    start: 1,
    length: policy.maxSequenceValue,
    missingIndex: Math.floor(Math.random() * (policy.maxSequenceValue - 1)) + 1,
  });
  const miss = sequence.answer;
  const cells = sequence.values
    .map((num) => num === null
      ? `<button class="num-cell miss" type="button" data-num="${miss}" aria-label="填写缺失数字">?</button>`
      : `<div class="num-cell">${num}</div>`)
    .join("");
  const card2 = $(`
    <div class="card card-collapsible" id="section-math-sequence">
      <div class="card-collapse-header">
        <h3>${icon("dice")} 数字规律 <span class="pill">1-${policy.maxSequenceValue} · 家长可选</span></h3>
        <button class="card-collapse-toggle" type="button" aria-label="展开或收起数字规律">
          <span class="card-collapse-label">收起</span>
          <span class="card-collapse-icon">${icon("chevronDown")}</span>
        </button>
      </div>
      <div class="card-collapse-body">
        <div class="desc desc-with-audio">
          <span>点击问号格，选出它应该是哪个数字（按 1 递增顺序）。</span>
          <button class="btn-read-prompt" type="button" aria-label="朗读题目要求">${icon("volume")} 读要求</button>
        </div>
        <div class="num-grid">${cells}</div>
        <div class="math-pad" id="mathPad" style="display:none;"></div>
        <div class="feedback text-center" id="nf"></div>
      </div>
    </div>
  `);
  main.appendChild(card2);
  makeCollapsible(card2, "math_sequence", false);

  const mathPromptBtn = card2.querySelector(".btn-read-prompt");
  if (mathPromptBtn) {
    mathPromptBtn.onclick = () => {
      speak("点击问号格，选出它应该是哪个数字，按一递增顺序。", mathPromptBtn, "zh-CN", "prompt:math-sequence");
    };
  }

  const missCell = card2.querySelector(".num-cell.miss");
  const mathPad = card2.querySelector("#mathPad");
  const nf = card2.querySelector("#nf");

  if (missCell && mathPad && nf) {
    const candidates = [];
    const startOpt = Math.min(policy.maxSequenceValue - 4, Math.max(1, miss - 2));
    for (let opt = startOpt; opt < startOpt + 5; opt++) {
      candidates.push(opt);
    }

    missCell.onclick = () => {
      if (missCell.disabled) return;
      mathPad.style.display = "flex";
      mathPad.innerHTML = `
        <div class="math-pad-title">请选择缺失的数字：</div>
        <div class="math-pad-options">
          ${candidates.map((num) => `<button class="math-pad-btn" type="button" data-val="${num}">${num}</button>`).join("")}
        </div>
      `;
      mathPad.querySelectorAll(".math-pad-btn").forEach((btn) => {
        btn.onclick = () => {
          const val = Number(btn.dataset.val);
          if (val === miss) {
            nf.innerHTML = `${icon("checkCircle")} 正确！缺失数字是 ${miss}，数列按 1 递增`;
            nf.className = "feedback ok";
            missCell.classList.add("found");
            missCell.innerHTML = `${icon("check")} ${miss}`;
            missCell.setAttribute("aria-label", `缺失数字为 ${miss}`);
            missCell.disabled = true;
            mathPad.style.display = "none";
            soundEffects.play("points_earned");
            praise("太棒了！");
            flyStars(8);
          } else {
            nf.textContent = "不对哦，看看前后数字～";
            nf.className = "feedback no";
            soundEffects.play("try_again");
            shake(btn);
          }
        };
      });
    };
  }

  // 数独 4x4
  const card3 = $(`
    <div class="card card-collapsible" id="section-math-sudoku">
      <div class="card-collapse-header">
        <h3>${icon("grid")} 简单数独 <span class="pill">数感阶段</span></h3>
        <button class="card-collapse-toggle" type="button" aria-label="展开或收起简单数独">
          <span class="card-collapse-label">收起</span>
          <span class="card-collapse-icon">${icon("chevronDown")}</span>
        </button>
      </div>
      <div class="card-collapse-body">
        <div class="desc desc-with-audio">
          <span>把 1-4 填入空格，每行、每列和每个粗框内的 2×2 小宫都不重复。可和家长一起尝试。</span>
          <button class="btn-read-prompt" type="button" aria-label="朗读游戏规则">${icon("volume")} 读规则</button>
        </div>
        <div class="sudoku" id="sudoku"></div>
        <div class="feedback text-center" id="sf"></div>
        <div class="spacer-10"></div>
        ${checkinBtn("math-sense","数感")}
      </div>
    </div>
  `);
  main.appendChild(card3);
  makeCollapsible(card3, "math_sudoku", false);

  const sudokuPromptBtn = card3.querySelector(".btn-read-prompt");
  if (sudokuPromptBtn) {
    sudokuPromptBtn.onclick = () => {
      speak("把一到四填入每行每列，四乘四入门版，含比较、分类、形状思维。", sudokuPromptBtn, "zh-CN", "prompt:sudoku");
    };
  }
  buildSudoku();
}

function buildSudoku(){
  const { solution: sol, puzzle } = buildSudoku4(`${getHanziLearnerScope()}:${todayKey()}`, {
    difficulty: getActiveLearningPackage(store.content_config).id === "bridging-v1" ? "medium" : "easy",
  });
  const blanks = new Set(puzzle.flatMap((row, r) => row.flatMap((value, c) => value === null ? [r * 4 + c] : [])));
  const box = el("sudoku"); if(!box) return;
  box.innerHTML="";
  let idx=0;
  for(let r=0;r<4;r++) for(let c=0;c<4;c++){
    const v=sol[r][c];
    if(blanks.has(idx)){
      const inp=document.createElement("div");
      inp.innerHTML=`<input type="number" min="1" max="4" inputmode="numeric" aria-label="第${r+1}行第${c+1}列" data-r="${r}" data-c="${c}">`;
      box.appendChild(inp.firstChild);
    } else {
      const d=document.createElement("div");
      d.className="fixed"; d.textContent=v;
      box.appendChild(d);
    }
    idx++;
  }
  const sf=el("sf");
  box.querySelectorAll("input").forEach(inp=>inp.onchange=()=>{
    const r=+inp.dataset.r, c=+inp.dataset.c, val=+inp.value;
    const cellValue = (row, column) => {
      const cell = box.children[row * 4 + column];
      return cell.matches("input") ? Number(cell.value) : Number(cell.textContent);
    };
    let ok = Number.isInteger(val) && val >= 1 && val <= 4;
    for (let index = 0; index < 4; index++) {
      if (index !== c && cellValue(r, index) === val) ok = false;
      if (index !== r && cellValue(index, c) === val) ok = false;
    }
    for (let row = Math.floor(r / 2) * 2; row < Math.floor(r / 2) * 2 + 2; row++) {
      for (let column = Math.floor(c / 2) * 2; column < Math.floor(c / 2) * 2 + 2; column++) {
        if ((row !== r || column !== c) && cellValue(row, column) === val) ok = false;
      }
    }
    const complete = [...box.querySelectorAll("input")].every((input) => Number(input.value) === sol[Number(input.dataset.r)][Number(input.dataset.c)]);
    sf.textContent = complete ? "完成啦！每行、每列和每个小宫都不重复。" : ok ? "继续加油，把空格都填完吧！" : "这一格和同行、同列或小宫重复了，请再看看。";
  });
}

/* =========================================================
   渲染：英语
   ========================================================= */
function renderEnglish(){
  const rows = plannedContent("english");
  const main = el("main"); main.innerHTML="";
  main.appendChild(subjectHero("english"));
  const tabs = renderSectionTabs([
    { id: "section-english-today", label: "今日单词", icon: "languages", checkin: "english-vocabulary" },
    { id: "section-english-review", label: "往期回看", icon: "calendar" },
  ]);
  if (tabs) main.appendChild(tabs);
  // 每日快照与首页共享，未体验的单词继续保留。
  const card1 = $(`
    <div class="card card-collapsible" id="section-english-today">
      <div class="card-collapse-header">
        <h3>${icon("languages")} 今日主题单词 <span class="pill">每日推送</span></h3>
        <button class="card-collapse-toggle" type="button" aria-label="展开或收起今日主题单词">
          <span class="card-collapse-label">收起</span>
          <span class="card-collapse-icon">${icon("chevronDown")}</span>
        </button>
      </div>
      <div class="card-collapse-body">
        <div class="desc desc-with-audio">
          <span>${escapeHtml(ENGLISH_DAILY_PROMPT.text)}</span>
          <button class="btn-read-prompt" type="button" aria-label="朗读今日单词要求">${icon("volume")} 读指引</button>
        </div>
        <div class="word-grid">${rows.map((row, index) => `<div class="word-card" data-content-reason="${row.reason}">
          ${contentReasonTag(row, "新词")}
          ${contentFeedbackHtml(row)}
          ${renderEnglishVisual(row.item.word, row.item.theme, row.item.meaning)}
          <div class="word-en">${escapeHtml(row.item.word)}</div>
          <div class="word-ph">${escapeHtml(row.item.phonetic)}</div>
          <div class="word-cn">${escapeHtml(row.item.meaning)} · ${escapeHtml(row.item.theme)}</div>
          <div class="desc">${escapeHtml(row.item.prompt || "和家长一起听一听，在生活中找找它。")}</div>
          <button class="speak-btn" type="button" data-speak="${index}" data-label="听发音">${buttonContent("volume", "听发音")}</button>
        </div>`).join("")}</div>
        <div class="spacer-10"></div>
        ${rows.length ? checkinBtn("english-vocabulary","单词") : '<div class="desc">今天没有安排新的或到期的词卡，可以在生活中听听、说说熟悉的词。</div>'}
      </div>
    </div>
  `);
  main.appendChild(card1);
  makeCollapsible(card1, "english_vocab", false);

  const englishPromptBtn = card1.querySelector(".btn-read-prompt");
  if (englishPromptBtn) {
    englishPromptBtn.onclick = () => {
      speak(ENGLISH_DAILY_PROMPT.text, englishPromptBtn, "zh-CN", ENGLISH_DAILY_PROMPT.speechId);
    };
  }

  const spokenWords = rows.map((row) => row.item.word);
  const spokenWordIds = rows.map((row) => row.item.speechId);
  card1.querySelectorAll("[data-speak]").forEach((button) => {
    button.addEventListener("pointerdown", primeSpeechAudio, { passive: true });
    button.onclick = () => {
      const index = Number(button.dataset.speak);
      speak(spokenWords[index], button, "en-US", spokenWordIds[index]);
    };
  });

  const history = listContentHistory(getContentLearningState(store), "english");
  const completedIds = [...new Set(history.filter((entry) => !entry.revoked).map((entry) => entry.itemId))];
  const historyWords = completedIds.map((id) => getLearningItem("english", id)).filter(Boolean);
  const chips = historyWords.map((item) => `<span class="mr-chip speech-tap" role="button" tabindex="0" data-word="${escapeHtml(item.word)}" data-word-id="${escapeHtml(item.speechId)}" aria-label="听发音：${escapeHtml(item.word)}">${escapeHtml(item.word)}</span>`).join("");
  const card2 = $(`
    <div class="card card-collapsible" id="section-english-review">
      <div class="card-collapse-header">
        <h3>${icon("calendar")} 往期单词回看 <span class="pill">已学记录</span></h3>
        <button class="card-collapse-toggle" type="button" aria-label="展开或收起往期单词回看">
          <span class="card-collapse-label">收起</span>
          <span class="card-collapse-icon">${icon("chevronDown")}</span>
        </button>
      </div>
      <div class="card-collapse-body">
        <div class="desc">这里只列出已确认打卡的单词，点读不会增加完成次数。</div>
        <div class="month-review">${chips || '<span class="desc">还没有单词打卡记录，旧打卡历史继续保留。</span>'}</div>
      </div>
    </div>
  `);
  main.appendChild(card2);
  makeCollapsible(card2, "english_review", false);

  card2.querySelectorAll(".mr-chip[data-word]").forEach((chip) => {
    chip.addEventListener("pointerdown", primeSpeechAudio, { passive: true });
    const playChip = () => {
      stopPoemSpeech();
      speak(chip.dataset.word, chip, "en-US", chip.dataset.wordId);
    };
    chip.onclick = playChip;
    chip.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        playChip();
      }
    };
  });
}

/* =========================================================
   渲染：成长
   ========================================================= */
function openingStatusLabel(entry) {
  if (!entry) return "";
  if (entry.status === "pending" || entry.status === "retryable") return "待联网确认";
  if (entry.status === "confirmed") return "已确认";
  if (entry.status === "conflict") return "待处理";
  return "确认失败";
}

function legacyImportPresentation(status) {
  switch (status) {
    case "confirmed":
      return {
        iconName: "checkCircle",
        title: "旧积分已导入",
        statusLabel: "云端已确认",
        description: "旧积分打卡明细已由云端确认，余额已恢复；导入记录只计入余额，不计入行为统计。如需纠错，请使用普通积分调整流水。",
        canRetry: false,
      };
    case "retryable":
      return {
        iconName: "refresh",
        title: "旧积分等待云端重试",
        statusLabel: "等待重试",
        description: "本机明细已保留，云端确认暂时失败，将自动重试；当前状态不能视为云端导入完成。",
        canRetry: false,
      };
    case "rejected":
      return {
        iconName: "alert",
        title: "旧积分导入未完成",
        statusLabel: "云端已拒绝",
        description: "云端拒绝了这次导入，本机尝试未计入当前余额。请检查登录与家庭权限后重新导入。",
        canRetry: true,
      };
    case "conflict":
      return {
        iconName: "alert",
        title: "旧积分导入发生冲突",
        statusLabel: "需要处理",
        description: "云端发现批次或积分明细冲突，本机尝试未计入当前余额。请刷新云端记录后再重新导入。",
        canRetry: true,
      };
    default:
      return {
        iconName: "refresh",
        title: "本机已导入，待云端确认",
        statusLabel: "待云端确认",
        description: "旧积分明细已安全保存在本机，正在等待云端确认；确认前不能视为导入完成，也不会显示成云端已恢复。",
        canRetry: false,
      };
  }
}

let LEDGER_FILTER = "all";
let LEDGER_LIMIT = 15;

function isUndoEntry(entry) {
  return Boolean(
    entry.metadata?.undo_of ||
    entry.entry_type === "adjustment" ||
    (typeof entry.note === "string" && entry.note.includes("撤销"))
  );
}

function isRefundEntry(entry) {
  return Boolean(
    entry.entry_type === "refund" ||
    entry.metadata?.cancel_of
  );
}

function formatLedgerDateHeader(dateKey) {
  if (!dateKey || dateKey === "其他记录") return "其他记录";
  const parts = dateKey.split("-");
  if (parts.length === 3) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const dateFormatted = `${Number(parts[1])}月${Number(parts[2])}日`;
    if (dateKey === todayStr) return `${dateFormatted} · 今天`;
    if (dateKey === yesterday) return `${dateFormatted} · 昨天`;
    return `${parts[0]}年${dateFormatted}`;
  }
  return dateKey;
}

function makeCollapsible(cardEl, storageKey, defaultCollapsed = false) {
  let isCollapsed;
  try {
    const saved = localStorage.getItem(`shadow_mate_collapse_${storageKey}`);
    isCollapsed = saved === "true" ? true : (saved === "false" ? false : defaultCollapsed);
  } catch {
    isCollapsed = defaultCollapsed;
  }

  const header = cardEl.querySelector(".card-collapse-header");
  const body = cardEl.querySelector(".card-collapse-body");
  const toggleBtn = cardEl.querySelector(".card-collapse-toggle");
  const iconSpan = cardEl.querySelector(".card-collapse-icon");
  const labelSpan = cardEl.querySelector(".card-collapse-label");

  function update(collapsed) {
    if (!body) return;
    if (collapsed) {
      body.classList.add("collapsed");
      if (iconSpan) iconSpan.classList.add("collapsed");
      if (labelSpan) labelSpan.textContent = "展开";
      if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "false");
    } else {
      body.classList.remove("collapsed");
      if (iconSpan) iconSpan.classList.remove("collapsed");
      if (labelSpan) labelSpan.textContent = "收起";
      if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "true");
    }
  }

  update(isCollapsed);

  const toggle = () => {
    if (!body) return;
    const next = !body.classList.contains("collapsed");
    update(next);
    try {
      localStorage.setItem(`shadow_mate_collapse_${storageKey}`, String(next));
    } catch {}
  };

  if (header) {
    header.onclick = (e) => {
      if (e.target.closest("button") && e.target.closest("button") !== toggleBtn) return;
      if (e.target.closest("input, select, textarea, a, .content-options, details, summary")) return;
      toggle();
    };
  }
}

// 学科、积分、成长页的分段页签：同一时刻只显示一个分区，并按模块记住上次选择
const SECTION_TAB_MEMORY = {};
const SECTION_TAB_TONES = { chinese: "t-orange", math: "t-blue", english: "t-teal", book: "t-purple", points: "t-sun", grow: "t-green" };
function renderSectionTabs(sections) {
  if (!Array.isArray(sections) || sections.length === 0) return null;
  const group = CURRENT_MOD;
  const ids = sections.map((sec) => sec.id);
  const tone = SECTION_TAB_TONES[group] || "t-green";
  const container = $(`<div class="seg section-nav-tabs ${tone} ${sections.length === 4 ? "n4" : ""}" ${sections.length === 4 ? "" : `style="--n:${sections.length}"`} role="tablist" aria-label="分区" data-section-tabs="${group}"></div>`);
  sections.forEach((sec) => {
    const done = sec.checkin && isChecked(sec.checkin);
    const tabBtn = $(`<button class="section-nav-tab" type="button" role="tab" id="tab-${sec.id}" aria-controls="${sec.id}" data-target-section="${sec.id}">${sec.icon ? icon(sec.icon) : ""}<span>${escapeHtml(sec.label)}</span>${done ? `<span class="badge" aria-label="已打卡">${icon("check")}</span>` : ""}</button>`);
    container.appendChild(tabBtn);
  });

  const show = (targetId, { focus = false } = {}) => {
    SECTION_TAB_MEMORY[group] = targetId;
    container.querySelectorAll("[data-target-section]").forEach((tab) => {
      const selected = tab.dataset.targetSection === targetId;
      tab.classList.toggle("active", selected);
      tab.setAttribute("aria-selected", selected ? "true" : "false");
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    });
    const main = container.parentElement;
    main?.querySelectorAll("[data-section-group]").forEach((node) => {
      node.classList.toggle("is-tab-hidden", node.dataset.sectionGroup !== targetId);
    });
    const target = document.getElementById(targetId);
    target?.querySelector('.card-collapse-toggle[aria-expanded="false"]')?.click();
  };

  container.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-target-section]");
    if (tab) show(tab.dataset.targetSection);
  });
  container.addEventListener("keydown", (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const index = ids.indexOf(SECTION_TAB_MEMORY[group]);
    show(ids[(index + step + ids.length) % ids.length], { focus: true });
  });

  // 渲染函数同步追加完全部卡片后，再把页签之后的元素归入各自分区。
  // 不带分区 id 的卡片（如古诗打卡卡）归入它前面最近的分区；底部说明始终显示。
  queueMicrotask(() => {
    const main = container.parentElement;
    if (!main) return;
    let current = null;
    let afterTabs = false;
    for (const node of main.children) {
      if (node === container) { afterTabs = true; continue; }
      if (!afterTabs) continue;
      const owner = ids.find((id) => node.id === id || node.querySelector?.(`#${id}`));
      if (owner) current = owner;
      if (current && !node.matches(".foot-note, .footer")) {
        node.dataset.sectionGroup = current;
        if (node.id === current) {
          node.setAttribute("role", "tabpanel");
          node.setAttribute("aria-labelledby", `tab-${current}`);
        }
      }
    }
    show(ids.includes(SECTION_TAB_MEMORY[group]) ? SECTION_TAB_MEMORY[group] : ids[0]);
  });

  return container;
}

function renderGrow(){
  const main = el("main"); main.innerHTML="";
  const titleRow = $(`
    <div class="module-title-row">
      <div class="module-title"><span class="em blob sm solid t-green">${icon("sprout")}</span><h2 data-page-title>成长记录</h2></div>
      <div class="t-green"><button class="btn soft sm" type="button" data-go-settings="growth" aria-label="成长设置">${icon("settings")} 成长设置</button></div>
    </div>
  `);
  main.appendChild(titleRow);
  titleRow.querySelector("[data-go-settings]").onclick = () => switchMod("settings", { tab: "growth" });

  const enabled = availableModuleIds();
  const learningOn = enabled.length > 0;
  const growSections = [
    { id: "section-grow-footprint", label: "学习足迹", icon: "sprout" },
    { id: "section-grow-rewards", label: "奖励兑换", icon: "gift" },
    { id: "section-grow-ledger", label: "积分明细", icon: "list" },
    ...(learningOn ? [{ id: "section-grow-overview", label: "打卡记录", icon: "trophy" }] : []),
  ];
  const tabs = renderSectionTabs(growSections);
  if (tabs) main.appendChild(tabs);

  const footprint = summarizeContentLearning(getContentLearningState(store), { referenceDay: todayKey() });
  const activityItems = [
    { id: "literacy", label: "识字", unit: "字", icon: "book" },
    { id: "poem", label: "古诗听读", unit: "首", icon: "bookMarked" },
    { id: "english", label: "英语", unit: "词", icon: "languages" },
    { id: "writing", label: "练写", unit: "字", icon: "pencil" },
    { id: "book", label: "共读推荐", unit: "本", icon: "bookCheck" },
    { id: "math", label: "数学打卡", unit: "天", icon: "calculator", isMath: true },
  ];
  const bookState = migrateLegacyBookState(store);

  const footprintCardsHtml = activityItems.map((item) => {
    if (item.isMath) {
      const mathDays = totalChecked("math");
      return `
        <button type="button" class="footprint-card" data-footprint-activity="math" aria-label="数学打卡 ${mathDays} 天，查看学习内容">
          <div class="footprint-card-header">
            <span class="footprint-card-title">${icon(item.icon)} <span>${item.label}</span></span>
            <span class="footprint-card-arrow" aria-hidden="true">${icon("chevronRight")}</span>
          </div>
          <div class="footprint-card-metric">
            <span class="footprint-card-val">${mathDays}</span>
            <span class="footprint-card-unit">${item.unit}</span>
          </div>
          <div class="footprint-card-sub">模块打卡天数 · 每日口算</div>
        </button>
      `;
    }
    const summary = footprint.activities[item.id] || { itemCount: 0, occurrenceCount: 0 };
    const subText = `${summary.occurrenceCount} ${item.id === "writing" ? "行次" : "次记录"}${summary.latestDay ? ` · ${summary.latestDay.slice(5)}` : ""}`;
    return `
      <button type="button" class="footprint-card" data-footprint-activity="${item.id}" aria-label="${item.label} ${summary.itemCount} ${item.unit}，${subText}，点击查看条目与历史">
        <div class="footprint-card-header">
          <span class="footprint-card-title">${icon(item.icon)} <span>${item.label}</span></span>
          <span class="footprint-card-arrow" aria-hidden="true">${icon("chevronRight")}</span>
        </div>
        <div class="footprint-card-metric">
          <span class="footprint-card-val">${summary.itemCount}</span>
          <span class="footprint-card-unit">${item.unit}</span>
        </div>
        <div class="footprint-card-sub">${subText}</div>
      </button>
    `;
  }).join("");

  const footprintCard = $(`
    <section class="card card-collapsible" data-learning-footprint id="section-grow-footprint">
      <div class="card-collapse-header">
        <h3>${icon("sprout")} 学习足迹</h3>
        <button class="card-collapse-toggle" type="button" aria-label="展开或收起学习足迹">
          <span class="card-collapse-label">收起</span>
          <span class="card-collapse-icon">${icon("chevronDown")}</span>
        </button>
      </div>
      <div class="card-collapse-body">
        <div class="footprint-summary-row">
          <div class="footprint-stat-pill">
            <span class="n">${footprint.dayCount}</span>
            <span class="t">学习天数</span>
          </div>
          <div class="footprint-stat-pill">
            <span class="n">${footprint.occurrenceCount}</span>
            <span class="t">有效记录</span>
          </div>
          <div class="footprint-stat-pill">
            <span class="n">${footprint.reviewCount}</span>
            <span class="t">温故复习</span>
          </div>
        </div>
        <div class="footprint-grid" role="group" aria-label="各学科学习足迹">
          ${footprintCardsHtml}
        </div>
        <div class="footprint-footer-notes">
          <p class="desc">记录按实际内容和学习日期计数，不表示掌握程度。点击学科卡片可查看条目与历史；关闭学习包不会删除这些足迹。</p>
          ${footprint.occurrenceCount ? "" : '<p class="desc">还没有逐项内容记录。旧打卡会保留，但不能推算具体学过哪些内容。</p>'}
          <p class="desc">书架已读 ${Object.values(bookState.bookShelf || {}).filter(Boolean).length} 本 · 自填阅读日志 ${(store.peanutLog || []).length} 条（与共读推荐分别统计）</p>
        </div>
      </div>
    </section>
  `);
  main.appendChild(footprintCard);
  footprintCard.querySelectorAll("[data-footprint-activity]").forEach(button => { button.onclick = () => openContentLibrary(button.dataset.footprintActivity); });
  makeCollapsible(footprintCard, "grow_footprint", false);

  const balance = getBalance(growthLoopSnapshot);
  const FULFILL_UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;
  const rewards = window.growthLoop?.getRewards?.() || [];
  const isCloudConnected = Boolean(growthLoopController.getScope()?.household_id);
  const pendingRedemptions = growthLoopSnapshot.redemptions.filter((item) => item.status === "pending").length;
  const unconfirmedRedemptions = growthLoopSnapshot.redemptions.filter((item) => item.status === "pending" && !item.confirmed).length;
  const rewardCards = rewards.map((reward) => {
    const cost = Number(reward.cost_points || 0);
    const latest = growthLoopSnapshot.redemptions
      .filter((item) => item.reward_id === reward.id)
      .sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")))[0];
    const isLocalMode = !isCloudConnected;
    const isConfirmed = isLocalMode || Boolean(latest?.confirmed);
    const isPending = latest?.status === "pending";
    const isFulfilled = latest?.status === "fulfilled";
    const fulfilledTime = isFulfilled && (latest.updated_at || latest.created_at)
      ? new Date(latest.updated_at || latest.created_at).getTime()
      : 0;
    const isWithinUndoWindow = isFulfilled && (Date.now() - fulfilledTime <= FULFILL_UNDO_WINDOW_MS);
    const status = isPending
      ? isConfirmed
        ? latest.cancel_requested ? "取消同步中" : latest.fulfill_requested ? "兑现同步中" : (latest.sync_error ? "同步未成功" : "待兑现")
        : (latest.sync_error ? "同步未成功" : "待联网确认")
      : isFulfilled
        ? (latest.cancel_requested ? "取消同步中" : (latest.sync_error ? "同步未成功" : "已兑现"))
        : "";
    const actionPending = (isPending || isFulfilled) && (latest.fulfill_requested || latest.cancel_requested);
    const canFulfill = isPending && isConfirmed && !actionPending;
    const canCancel = (isPending || isWithinUndoWindow) && isConfirmed && !actionPending;
    const redeemBtnText = isFulfilled && balance >= cost ? "再次兑换" : "兑换";
    return `<div class="reward-card">
      <div class="reward-icon">${icon(reward.icon_key || "gift")}</div>
      <div class="reward-info">
        <strong>${escapeHtml(reward.name)}</strong>
        <span>${escapeHtml(reward.description || "家长和孩子一起约定")}</span>
        ${isPending && status ? `<span class="reward-pending-hint">${status}</span>` : ""}
        ${isWithinUndoWindow ? `<span class="reward-undo-hint">已兑现 · 24小时内可撤回</span>` : ""}
        ${latest?.sync_error ? `<span class="reward-sync-error" style="color:var(--c-danger,#d9534f);font-size:12px;display:block;margin-top:2px;">⚠️ 同步未成功（${escapeHtml(latest.sync_error)}），可重试兑现或取消退款</span>` : ""}
      </div>
      <span class="pts-badge">${cost}分</span>
      <div class="reward-actions">
        ${!isPending ? `<button class="checkin reward-redeem" type="button" data-reward-id="${escapeHtml(reward.id)}" ${balance < cost ? "disabled" : ""}>${redeemBtnText}</button>` : ""}
        ${canFulfill ? `<button class="checkin reward-fulfill" type="button" data-fulfill-id="${escapeHtml(latest.id)}">${latest.sync_error ? "重试兑现" : "确认兑现"}</button>` : ""}
        ${canCancel ? `<button class="checkin danger reward-cancel" type="button" data-cancel-id="${escapeHtml(latest.id)}" title="${isFulfilled ? "兑现后 24 小时内支持撤销履约并退还积分" : "取消兑换并退回积分"}">${latest.sync_error ? "补偿退款 (取消)" : (isFulfilled ? "撤回兑现" : "取消兑换")}</button>` : ""}
      </div>
    </div>`;
  }).join("");

  // 1. 置顶核心：奖励兑换（可折叠，默认展开）
  const rewardCard = $(`<div class="card growth-reward-card card-collapsible" id="section-grow-rewards">
      <div class="card-collapse-header">
        <h3>${icon("gift")} 奖励兑换</h3>
        <button class="card-collapse-toggle" type="button" aria-label="展开或收起奖励兑换">
          <span class="card-collapse-label">收起</span>
          <span class="card-collapse-icon">${icon("chevronDown")}</span>
        </button>
      </div>
      <div class="card-collapse-body">
        <div class="stat-grid">
          <div class="stat"><div class="n">${balance}</div><div class="t">当前可用积分</div></div>
          <div class="stat"><div class="n">${isCloudConnected && unconfirmedRedemptions > 0 ? unconfirmedRedemptions : pendingRedemptions}</div><div class="t">${isCloudConnected && unconfirmedRedemptions > 0 ? "待联网确认" : "待兑现约定"}</div></div>
        </div>
        <div class="desc">${
          isCloudConnected
            ? (unconfirmedRedemptions > 0
              ? "离线兑换会先记为“待联网确认”，联网并完成服务端确认后生效。"
              : "奖励兑换已与云端同步，兑现约定后可标记完成；若属误触，兑现后 24 小时内支持撤回。")
            : "单机模式：兑换后扣除积分并记为待兑现，实际兑现约定后点击「确认兑现」；若属误触，兑现后 24 小时内支持撤回。"
        }</div>
        <div class="reward-list">${rewardCards || '<div class="desc">还没有奖励约定，可在右上角「成长设置」中添加。</div>'}</div>
      </div>
    </div>`);
  main.appendChild(rewardCard);
  rewardCard.querySelectorAll("[data-reward-id]").forEach((button) => {
    button.onclick = async () => {
      const requestId = clientRequestId("redemption");
      button.disabled = true;
      const result = await window.growthLoop.redeemReward({ reward_id: button.dataset.rewardId, request_id: requestId });
      if (result.error) {
        button.disabled = false;
        alert(result.error === "insufficient_points" ? "积分还不够，继续积累后再兑换吧。" : "这个奖励暂时不能兑换，请刷新后重试。");
        return;
      }
      void queueGrowthActivity(ACTIVITY_EVENT_TYPES.REWARD_REDEEMED, { source: "reward" }, requestId);
      if (result.redemptions?.some(entry => entry.request_id === requestId)) void usageAnalytics.record("reward_redeemed");
      window.cloudSync?.scheduleGrowthLoop?.();
      renderGrow();
      soundEffects.play("points_deducted");
      praise("兑换成功！🎁");
      flyStars(8);
    };
  });
  rewardCard.querySelectorAll("[data-fulfill-id]").forEach((button) => {
    button.onclick = async () => {
      button.disabled = true;
      const result = await window.growthLoop.fulfillRedemption({
        redemption_id: button.dataset.fulfillId,
        request_id: clientRequestId("redemption-fulfill"),
      });
      if (result.error) {
        button.disabled = false;
        alert(result.error === "redemption_waiting_for_confirmation"
          ? "这次兑换还在等待云端确认，请稍后再兑现。"
          : "这个奖励暂时不能兑现，请稍后重试。");
        return;
      }
      window.cloudSync?.scheduleGrowthLoop?.();
      renderGrow();
      praise("奖励已兑现！🎉");
      if (result.redemptions?.some(entry => entry.id === button.dataset.fulfillId && entry.status === "fulfilled")) {
        void usageAnalytics.record("reward_fulfilled");
      }
      flyStars(10);
    };
  });
  rewardCard.querySelectorAll("[data-cancel-id]").forEach((button) => {
    button.onclick = async () => {
      const redemptionId = button.dataset.cancelId;
      const redemption = growthLoopSnapshot.redemptions.find((item) => item.id === redemptionId);
      const isFulfilled = redemption?.status === "fulfilled";
      const cost = redemption?.cost_points_snapshot || 0;
      const rewardName = redemption?.reward_name_snapshot || "该奖励";
      const confirmMsg = isCloudConnected
        ? (isFulfilled
            ? `确定撤回“${rewardName}”的兑现并退回 ${cost} 积分吗？（此操作在兑现后 24 小时内有效，云端确认后退款生效）`
            : "确定取消这次兑换吗？云端确认后积分会通过一条新的退款流水退回。")
        : (isFulfilled
            ? `确定撤回“${rewardName}”的兑现并退回 ${cost} 积分吗？（此操作在兑现后 24 小时内有效）已扣减的积分将立即恢复。`
            : "确定取消这次兑换吗？已扣减的积分将立即恢复。");
      if (!window.confirm(confirmMsg)) return;
      button.disabled = true;
      const result = await window.growthLoop.cancelRedemption({
        redemption_id: redemptionId,
        request_id: clientRequestId("redemption-cancel"),
        note: isFulfilled ? "撤回兑现退款" : "本次暂不兑现",
      });
      if (result.error) {
        button.disabled = false;
        alert(result.error === "redemption_waiting_for_confirmation"
          ? "这次兑换还在等待云端确认，请稍后再修正。"
          : "这个兑换暂时不能取消，请稍后重试。");
        return;
      }
      window.cloudSync?.scheduleGrowthLoop?.();
      renderGrow();
      soundEffects.play("try_again");
    };
  });
  makeCollapsible(rewardCard, "grow_rewards", false);

  // 2. 次级高频：最近积分明细（可折叠，默认展开）
  const allLedgerEntries = growthLoopSnapshot.ledger
    .filter((entry) => !["rejected", "conflict"].includes(entry.status))
    .sort((left, right) => String(right.occurred_on || "").localeCompare(String(left.occurred_on || ""))
      || String(right.created_at || "").localeCompare(String(left.created_at || "")));

  const filteredEntries = allLedgerEntries.filter((entry) => {
    const isUndo = isUndoEntry(entry);
    const isRefund = isRefundEntry(entry);
    if (LEDGER_FILTER === "earned") {
      return entry.delta > 0 && !isUndo && !isRefund && entry.entry_type !== "redemption";
    }
    if (LEDGER_FILTER === "redeemed") {
      return entry.entry_type === "redemption" || isRefund;
    }
    if (LEDGER_FILTER === "undo") {
      return isUndo || isRefund || entry.entry_type === "adjustment";
    }
    return true;
  });

  const totalFilteredCount = filteredEntries.length;
  const displayedEntries = filteredEntries.slice(0, LEDGER_LIMIT);
  const hasMore = totalFilteredCount > displayedEntries.length;

  const groups = [];
  const groupMap = new Map();

  for (const entry of displayedEntries) {
    const dateKey = entry.occurred_on || (entry.created_at ? entry.created_at.slice(0, 10) : "") || "其他记录";
    if (!groupMap.has(dateKey)) {
      const group = { dateKey, entries: [], netPoints: 0 };
      groupMap.set(dateKey, group);
      groups.push(group);
    }
    const group = groupMap.get(dateKey);
    group.entries.push(entry);
    group.netPoints += Number(entry.delta || 0);
  }

  const groupsHtml = groups.map((group) => {
    const headerTitle = formatLedgerDateHeader(group.dateKey);
    const netSign = group.netPoints > 0 ? "+" : "";
    const netCls = group.netPoints > 0 ? "pos" : group.netPoints < 0 ? "neg" : "";
    const netLabel = `当日净得 ${netSign}${group.netPoints} 分`;

    const itemsHtml = group.entries.map((entry) => {
      const isUndo = isUndoEntry(entry);
      const isRefund = isRefundEntry(entry);
      let rawName = entry.item_name_snapshot || "积分调整";
      let title = escapeHtml(rawName);
      if (isUndo) {
        title = `${escapeHtml(rawName)}（撤销）`;
      } else if (isRefund) {
        title = `${escapeHtml(rawName)}（兑换取消）`;
      }

      let iconClass = "icon-pos";
      let iconSvg = icon("star");
      let tagClass = "tag-habit";
      let tagLabel = "日常打卡";

      if (isUndo) {
        iconClass = "icon-undo";
        iconSvg = icon("rotate");
        tagClass = "tag-undo";
        tagLabel = "已撤销";
      } else if (isRefund) {
        iconClass = "icon-undo";
        iconSvg = icon("rotate");
        tagClass = "tag-undo";
        tagLabel = "已退还";
      } else if (entry.entry_type === "redemption") {
        iconClass = "icon-reward";
        iconSvg = icon("gift");
        tagClass = "tag-reward";
        tagLabel = "心愿兑换";
      } else if (entry.entry_type === "legacy_import" || entry.entry_type === "opening_balance") {
        iconClass = "icon-pos";
        iconSvg = icon("download");
        tagClass = "tag-habit";
        tagLabel = "积分结转";
      } else if (entry.delta < 0) {
        iconClass = "icon-neg";
        iconSvg = icon("alert");
        tagClass = "tag-habit";
        tagLabel = "习惯扣分";
      }

      const ptsClass = isUndo ? "undo" : entry.delta > 0 ? "pos" : "neg";
      const deltaSign = entry.delta > 0 ? "+" : "";
      const ptsText = `${deltaSign}${entry.delta}`;

      return `<li>
        <div class="ledger-item-icon ${iconClass}">${iconSvg}</div>
        <div class="ledger-item-info">
          <span class="ledger-item-title">${title}</span>
          <div class="ledger-item-tags">
            <span class="ledger-tag ${tagClass}">${tagLabel}</span>
          </div>
        </div>
        <span class="pts ${ptsClass}">${ptsText}</span>
      </li>`;
    }).join("");

    return `<div class="ledger-group">
      <div class="ledger-group-header">
        <span>${headerTitle}</span>
        <span class="ledger-group-net ${netCls}">${netLabel}</span>
      </div>
      <ul class="ledger-group-items">
        ${itemsHtml}
      </ul>
    </div>`;
  }).join("");

  const historyCard = $(`<div class="card growth-history-card card-collapsible" id="section-grow-ledger">
      <div class="card-collapse-header">
        <h3>${icon("list")} 积分明细</h3>
        <button class="card-collapse-toggle" type="button" aria-label="展开或收起积分明细">
          <span class="card-collapse-label">收起</span>
          <span class="card-collapse-icon">${icon("chevronDown")}</span>
        </button>
      </div>
      <div class="card-collapse-body">
        <div class="ledger-filter-bar">
          <button class="ledger-filter-chip ${LEDGER_FILTER === "all" ? "active" : ""}" type="button" data-filter="all">全部 (${allLedgerEntries.length})</button>
          <button class="ledger-filter-chip ${LEDGER_FILTER === "earned" ? "active" : ""}" type="button" data-filter="earned">获得 🌟</button>
          <button class="ledger-filter-chip ${LEDGER_FILTER === "redeemed" ? "active" : ""}" type="button" data-filter="redeemed">兑换 🎁</button>
          <button class="ledger-filter-chip ${LEDGER_FILTER === "undo" ? "active" : ""}" type="button" data-filter="undo">撤销/调整 ↩️</button>
        </div>
        ${allLedgerEntries.length === 0
          ? `<div class="desc">还没有积分记录。完成打卡或导入旧积分后会显示在这里。</div>`
          : displayedEntries.length === 0
            ? `<div class="desc" style="text-align:center;padding:16px 0;">暂无对应分类记录</div>`
            : `<div class="growth-history-list">${groupsHtml}</div>`
        }
        ${hasMore ? `<button class="checkin secondary ledger-more-btn" type="button" id="ledgerMoreBtn">加载更多记录（剩余 ${totalFilteredCount - displayedEntries.length} 条）</button>` : ""}
      </div>
    </div>`);
  main.appendChild(historyCard);

  historyCard.querySelectorAll(".ledger-filter-chip").forEach((chip) => {
    chip.onclick = () => {
      LEDGER_FILTER = chip.dataset.filter;
      LEDGER_LIMIT = 15;
      renderGrow();
    };
  });

  const moreBtn = historyCard.querySelector("#ledgerMoreBtn");
  if (moreBtn) {
    moreBtn.onclick = () => {
      LEDGER_LIMIT += 15;
      renderGrow();
    };
  }
  makeCollapsible(historyCard, "grow_ledger", false);

  // 3. 辅助功能：打卡记录与近 30 天日历（置于底部，可折叠）
  if (learningOn) {
    const total = enabled.reduce((sum, module) => sum + totalChecked(module), 0);
    // 日历式最近记录（只统计已启用模块）
    let cells="";
    for(let i=29;i>=0;i--){
      const k=dateKeyOffset(i);
      const c=store.checkins[k];
      const n = enabled.filter((module) => hasCheckin(c, module)).length;
      const day = Number(k.slice(-2));
      const label = `${k}，${n ? `已完成 ${n}/${enabled.length} 个学习模块` : "未打卡"}`;
      cells += `<div class="cal-cell lvl-${n}${i===0 ? " today" : ""}" title="${label}" aria-label="${label}"><span class="cal-day">${day}</span><span class="cal-count">${n}/${enabled.length}</span></div>`;
    }
    const legendLevels = Array.from({ length: enabled.length + 1 }, (_, level) =>
      `<span class="cal-legend-item"><i class="cal-swatch lvl-${level}" aria-hidden="true"></i>${level}/${enabled.length} ${level === 0 ? "未打卡" : level === enabled.length ? "全部完成" : "模块"}</span>`
    ).join("");
    const learningCard = $(`
      <div class="card card-collapsible growth-learning-card" id="section-grow-overview">
        <div class="card-collapse-header">
          <h3>${icon("trophy")} 打卡记录</h3>
          <button class="card-collapse-toggle" type="button" aria-label="展开或收起打卡记录">
            <span class="card-collapse-label">收起</span>
            <span class="card-collapse-icon">${icon("chevronDown")}</span>
          </button>
        </div>
        <div class="card-collapse-body">
          <div class="stat-grid">
            ${enabled.map((module) => `<div class="stat"><div class="n">${totalChecked(module)}</div><div class="t">${contentModuleLabel(module)}累计(天)</div></div>`).join("")}
          </div>
          <div class="desc mt-10">${icon("chart")} 累计模块打卡：${total} 次</div>
          <div class="desc mt-14">${icon("flame")} 连续打卡：${enabled.map((module) => `${contentModuleLabel(module)} ${streak(module)} 天`).join(" · ")}</div>
          <div class="progressbar"><i></i></div>
          <div class="desc mt-6 note-sm">目标：累计 30 次打卡解锁「挖掘机小队长」徽章</div>
          <div class="spacer-12"></div>
          <div class="pts-sec">${icon("calendar")} 近 30 天打卡日历</div>
          <div class="cal-grid">${cells}</div>
          <div class="cal-helper">颜色表示当天完成的学习模块数，格内比例是已完成/共 ${enabled.length} 个模块，边框表示今天。</div>
          <div class="cal-legend" aria-label="成长日历图例">
            ${legendLevels}
            <span class="cal-legend-item"><i class="cal-swatch selected" aria-hidden="true"></i>今天</span>
          </div>
        </div>
      </div>
    `);
    main.appendChild(learningCard);
    learningCard.querySelector(".progressbar i").style.width = Math.min(100,total/30*100)+"%";
    makeCollapsible(learningCard, "grow_overview", false);
  } else {
    const hint = $(`
      <div class="card">
        <h3>${icon("sprout")} 学习模块统计已隐藏</h3>
        <div class="desc">当前孩子的学习包未启用，首页和这里不会显示学习模块统计。启用后在「学习」页为这个孩子开启学习模块。</div>
        <button class="checkin" type="button" data-go="learning">${icon("graduation")} 去开启学习模块</button>
      </div>
    `);
    main.appendChild(hint);
    hint.querySelector("[data-go]").onclick = () => switchMod("learning");
  }

  main.appendChild($(`<div class="footer">${icon("construction")} 本机离线保存 · 登录后跨设备同步</div>`));
}

/* =========================================================
   渲染：积分打卡
   ========================================================= */
/* 积分卡片辅助 */
const PTS_ICON = {"一起做家务":"house","认真完成学习":"bookCheck","帮带带弟弟":"learner","古诗词跟读":"bookMarked","撒谎":"circleX","白天摸当众摸鸡鸡":"alert","不收玩具":"eraser"};
let PT_DAY = null;
function ptsCardHTML(it, day){
  const done = pointOn(it.id, day);
  const points = Number(it.default_points ?? it.pts ?? 0);
  const description = it.description ?? it.desc ?? "";
  const sub = points < 0;
  const ptsIcon = it.icon_key || PTS_ICON[it.name] || (sub ? "alert" : "star");
  return `<div class="pts-card ${sub?'sub':''} ${done?'done':''}" data-pts-card="${escapeHtml(it.id)}" data-pts-name="${escapeHtml(it.name)}">
    <div class="pts-ic">${icon(ptsIcon)}</div>
    <div class="pts-info">
      <div class="pts-name">${escapeHtml(it.name)}</div>
      ${description?`<div class="pts-desc">${escapeHtml(description)}</div>`:""}
    </div>
    <div class="pts-badge">${points>0?'+':'-'}${Math.abs(points)}分</div>
    <button class="pts-toggle" type="button" data-item-id="${escapeHtml(it.id)}" aria-pressed="${done}" aria-label="${done?"取消":"记录"}${escapeHtml(it.name)}">${done?icon("check"):icon("plus")}</button>
  </div>`;
}

function renderPoints(){
  const main = el("main"); main.innerHTML="";
  const titleRow = $(`
    <div class="module-title-row">
      <div class="module-title"><span class="em blob sm solid t-sun">${icon("star")}</span><h2 data-page-title>积分打卡</h2></div>
      <div class="t-sun"><button class="btn soft sm" type="button" data-go-settings="points" aria-label="积分设置">${icon("settings")} 积分设置</button></div>
    </div>
  `);
  main.appendChild(titleRow);
  titleRow.querySelector("[data-go-settings]").onclick = () => switchMod("settings", { tab: "points" });

  const currentDate = new Date();
  const today = currentDate.getDate();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const ymLabel = year+"年"+(month+1)+"月";
  if(PT_DAY===null || PT_DAY > daysInMonth) PT_DAY = Math.min(today, daysInMonth);
  const activeDay = PT_DAY;
  const mt = monthTotal();
  const dt = getPointDayTotal(growthLoopSnapshot, dateKeyForDay(activeDay));
  const pointItems = visiblePointItems();

  // 挖掘机主题积分概览：本月累计与所选日期积分，放在分段页签之前始终可见
  main.appendChild($(`<section class="panel pts-sum t-sun" aria-label="积分概览">
      <span class="blob solid">${icon("star")}</span>
      <div class="pts-sum-txt"><b>挖掘机小队长 · 积分打卡榜</b><p class="hint">完成好习惯就点亮小星星，绿挖挖帮你攒积分！</p></div>
      <div class="nums">
        <div class="big-num"><b>${mt>0?'+':''}${mt}</b><span>本月积分</span></div>
        <div class="big-num"><b>${dt>0?'+':''}${dt}</b><span>${activeDay} 日积分</span></div>
      </div>
    </section>`));

  const pointsSections = [
    { id: "section-points-checkin", label: "习惯打卡", icon: "checkCircle" },
    { id: "section-points-calendar", label: "打卡日历", icon: "calendar" },
  ];
  const tabs = renderSectionTabs(pointsSections);
  if (tabs) main.appendChild(tabs);

  // 1. 打卡区（卡片化，置顶核心）
  const isToday = activeDay===today;
  const head = $(`<div class="card card-collapsible" id="section-points-checkin">
      <div class="card-collapse-header">
        <div class="pts-sec" style="margin-bottom:0;">${icon("checkCircle")} 为 ${new Date().getMonth()+1}月${activeDay}日打卡 ${isToday?'<span class="pill">今天</span>':''}</div>
        <button class="card-collapse-toggle" type="button" aria-label="展开或收起打卡区">
          <span class="card-collapse-label">收起</span>
          <span class="card-collapse-icon">${icon("chevronDown")}</span>
        </button>
      </div>
      <div class="card-collapse-body">
        ${isToday?"":`<button class="checkin danger mb-12" id="backtoday">${icon("rotate")} 回到今天</button>`}
        <div class="pts-sec">${icon("plus")} 加分项</div>
        ${pointItems.filter((it) => Number(it.default_points ?? it.pts) > 0).map((it)=>ptsCardHTML(it,activeDay)).join("")}
        <div class="pts-sec">${icon("minus")} 减分项目</div>
        ${pointItems.filter((it) => Number(it.default_points ?? it.pts) < 0).map((it)=>ptsCardHTML(it,activeDay)).join("")}
      </div>
    </div>`);
  main.appendChild(head);
  head.querySelectorAll(".pts-toggle").forEach((button)=>{
    button.onclick=()=>{
      togglePoint(button.dataset.itemId, activeDay);
      button.disabled = true;
    };
  });
  const bt = head.querySelector("#backtoday"); if(bt) bt.onclick=()=>{PT_DAY=today; renderPoints();};
  makeCollapsible(head, "points_checkin", false);

  // 2. 积分日历（圆角 chip，紧凑置底，可折叠）
  let chips="";
  for(let d=1;d<=daysInMonth;d++){
    const state=pointDayState(d);
    const stateText=state.kind==="pos"?"有加分":state.kind==="neg"?"有扣分":state.kind==="mixed"?"有加分和扣分":"无积分";
    const cls=[d===activeDay?"active":"",state.kind].filter(Boolean).join(" ");
    const selectedText=d===activeDay?"，当前选中":"";
    chips+=`<button class="cal-chip ${cls}" type="button" data-d="${d}" aria-pressed="${d===activeDay}" aria-label="${d}日，${stateText}${selectedText}">${d}</button>`;
  }
  const calCard=$(`<div class="card card-collapsible" id="section-points-calendar">
      <div class="card-collapse-header">
        <h3>${icon("calendar")} 打卡日历 <span class="pill">${ymLabel}</span></h3>
        <button class="card-collapse-toggle" type="button" aria-label="展开或收起打卡日历">
          <span class="card-collapse-label">收起</span>
          <span class="card-collapse-icon">${icon("chevronDown")}</span>
        </button>
      </div>
      <div class="card-collapse-body">
        <div class="cal-helper">点击日期选择要补打卡的日期；边框表示当前选中日期。</div>
        <div class="cal-legend" aria-label="积分日历图例">
          <span class="cal-legend-item"><i class="cal-swatch neutral" aria-hidden="true"></i>无积分</span>
          <span class="cal-legend-item"><i class="cal-swatch pos" aria-hidden="true"></i>有加分</span>
          <span class="cal-legend-item"><i class="cal-swatch neg" aria-hidden="true"></i>有扣分</span>
          <span class="cal-legend-item"><i class="cal-swatch mixed" aria-hidden="true"></i>加分和扣分</span>
          <span class="cal-legend-item"><i class="cal-swatch selected" aria-hidden="true"></i>当前选中</span>
        </div>
        <div class="cal">${chips}</div>
      </div>
    </div>`);
  main.appendChild(calCard);
  calCard.querySelectorAll(".cal-chip").forEach(c=>c.onclick=()=>{PT_DAY=+c.dataset.d; renderPoints();});
  makeCollapsible(calCard, "points_cal", false);

  main.appendChild($(`<div class="footer">${icon("star")} 每日按日期记录 · 本机离线保存并可同步云端</div>`));
}

/* =========================================================
   渲染：绘本读物（独立栏目）
   ========================================================= */
function renderBook(){
  const main = el("main"); main.innerHTML="";
  main.appendChild(subjectHero("book"));
  const tabs = renderSectionTabs([
    { id: "section-book-today", label: "今日绘本", icon: "book", checkin: "book-reading" },
    { id: "section-book-shelf", label: "小书架", icon: "bookMarked" },
    { id: "section-book-peanut", label: "参考书单", icon: "list" },
    { id: "section-book-log", label: "阅读记录", icon: "pencil" },
  ]);
  if (tabs) main.appendChild(tabs);

  const migrated = migrateLegacyBookState(store);
  if (JSON.stringify(migrated.bookShelf) !== JSON.stringify(store.bookShelf) ||
      JSON.stringify(migrated.peanutRead) !== JSON.stringify(store.peanutRead)) {
    const previous = store;
    store = { ...store, ...migrated };
    if (!save()) store = previous;
  }
  const bookRows = plannedContent("book");
  const b = bookRows[0]?.item;

  // 推荐实体绘本，不提供书内正文或插图。
  if (b) {
  const card1 = $(`
    <div class="card card-collapsible" id="section-book-today">
      <div class="card-collapse-header">
        <h3>${icon("book")} 今日绘本${bookRows[0].reason === "review" ? ' <span class="pill">复习</span>' : ""}</h3>
        <div class="card-collapse-actions">
          ${contentFeedbackHtml(bookRows[0])}
          <button class="card-collapse-toggle" type="button" aria-label="展开或收起今日绘本">
            <span class="card-collapse-label">收起</span>
            <span class="card-collapse-icon">${icon("chevronDown")}</span>
          </button>
        </div>
      </div>
      <div class="card-collapse-body">
        <div class="desc">《${escapeHtml(b.t)}》— ${escapeHtml(b.a)}</div>
        <div class="desc">这是实体书共读推荐，请选择家里或图书馆可借到的书。</div>
        <div class="desc">${escapeHtml(b.prompt)}</div>
        <div class="spacer-10"></div>
        ${checkinBtn("book-reading","绘本")}
      </div>
    </div>
  `);
  main.appendChild(card1);
  makeCollapsible(card1, "book_today", false);

  } else {
    const emptyBookCard = $(`<div class="card card-collapsible" id="section-book-today">
      <div class="card-collapse-header">
        <h3>${icon("book")} 今日绘本</h3>
        <button class="card-collapse-toggle" type="button" aria-label="展开或收起今日绘本">
          <span class="card-collapse-label">收起</span>
          <span class="card-collapse-icon">${icon("chevronDown")}</span>
        </button>
      </div>
      <div class="card-collapse-body">
        <div class="desc">今天没有到期推荐，可在小书架自由选一本共读。</div>
      </div>
    </div>`);
    main.appendChild(emptyBookCard);
    makeCollapsible(emptyBookCard, "book_today", false);
  }

  // 我的小书架（已读标记，永久存档）
  let shelf = BOOKS.map((bk)=>{
    const read = !!store.bookShelf[bk.id];
    return `<button class="mini-card shelf-card" type="button" data-bk="${bk.id}" aria-pressed="${read}" aria-label="标记《${escapeHtml(bk.t)}》已读">
      <div class="big">${read?icon("checkCircle"):icon("book")}</div>
      <div class="py">${bk.t}</div>
      <div class="label">${bk.r}</div>
    </button>`;
  }).join("");
  const readN = BOOKS.filter((item) => store.bookShelf[item.id]).length;
  const card2 = $(`
    <div class="card card-collapsible" id="section-book-shelf">
      <div class="card-collapse-header">
        <h3>${icon("bookMarked")} 我的小书架 <span class="pill">点击标记已读</span></h3>
        <button class="card-collapse-toggle" type="button" aria-label="展开或收起我的小书架">
          <span class="card-collapse-label">收起</span>
          <span class="card-collapse-icon">${icon("chevronDown")}</span>
        </button>
      </div>
      <div class="card-collapse-body">
        <div class="desc">这里是实体书共读参考书目。按孩子的兴趣选读，共读后可标记已读，不要求完成统一题目。</div>
        <div class="grid2">${shelf}</div>
        <div class="desc mt-12">已读 <b>${readN}</b> / ${BOOKS.length} 本</div>
      </div>
    </div>
  `);
  main.appendChild(card2);
  makeCollapsible(card2, "book_shelf", false);
  card2.querySelectorAll("[data-bk]").forEach(c=>{
    c.style.opacity = store.bookShelf[c.dataset.bk] ? 1 : 0.55;
    c.onclick=()=>{
      if (!canWriteLearningState()) return;
      const i=c.dataset.bk;
      const previous = store;
      store = transitionLearningState(store, { type: "SHELF_TOGGLED", bookIndex: i });
      if (!save()) store = previous;
      switchMod("book");
    };
  });

  // 参考书单与自主阅读记录
  const peanutRead = READING_LISTS.map((b)=>{
    const on = !!store.peanutRead[b.id];
    return `<button class="mini-card peanut-card" type="button" data-pb="${b.id}" aria-pressed="${on}" aria-label="标记《${b.t}》已读">
      <div class="big">${on?icon("checkCircle"):icon("bookOpenCheck")}</div>
      <div class="py">${b.t}</div>
      <div class="label">${b.tag}</div>
    </button>`;
  }).join("");
  const logRows = store.peanutLog.slice().reverse().map((r,idx)=>{
    const stars = Array.from({ length: 5 }, (_, starIndex) => icon("star", { filled: starIndex < r.rating })).join("");
    return `<div class="log-row">
      <div class="log-main">${r.title}<span class="log-stars">${stars}</span></div>
      <div class="log-meta">${r.date} <button class="log-del" type="button" data-del="${idx}" aria-label="删除阅读记录 ${escapeHtml(r.title)}">${icon("trash")}</button></div>
    </div>`;
  }).join("");

  const card3 = $(`
    <div class="card card-collapsible" id="section-book-peanut">
      <div class="card-collapse-header">
        <h3>${icon("bookOpenCheck")} 共读参考书单 <span class="pill">自由选读</span></h3>
        <button class="card-collapse-toggle" type="button" aria-label="展开或收起共读参考书单">
          <span class="card-collapse-label">收起</span>
          <span class="card-collapse-icon">${icon("chevronDown")}</span>
        </button>
      </div>
      <div class="card-collapse-body">
        <div class="desc">按孩子的兴趣和当前阅读状态选择童书或分级读物，级别不代表年龄要求。点一下标记已读，也可在「阅读记录」添加自己的记录。</div>
        <div class="grid2">${peanutRead}</div>
      </div>
    </div>
  `);
  main.appendChild(card3);
  makeCollapsible(card3, "book_peanut", false);

  const card4 = $(`
    <div class="card card-collapsible" id="section-book-log">
      <div class="card-collapse-header">
        <h3>${icon("notebook")} 我的阅读记录</h3>
        <button class="card-collapse-toggle" type="button" aria-label="展开或收起我的阅读记录">
          <span class="card-collapse-label">收起</span>
          <span class="card-collapse-icon">${icon("chevronDown")}</span>
        </button>
      </div>
      <div class="card-collapse-body">
        <div class="peanut-form">
          <label class="peanut-label" for="pbTitle">阅读书名</label>
          <input class="peanut-input" id="pbTitle" aria-label="阅读书名" placeholder="输入书名（如：牛津阅读树 L3）">
          <div class="peanut-stars" id="pbStars" role="group" aria-label="阅读评分">
            ${[1,2,3,4,5].map(n=>`<button class="pstar" type="button" data-n="${n}" aria-label="${n}星">${icon("star", { filled: n <= 3 })}</button>`).join("")}
          </div>
          <button class="checkin mt-8" id="pbAdd">${icon("plus")} 添加阅读记录</button>
        </div>
        <div class="peanut-log">${logRows || '<div class="desc">还没有记录，添加一本吧～</div>'}</div>
      </div>
    </div>
  `);
  main.appendChild(card4);
  makeCollapsible(card4, "book_log", false);

  // 绑定：书单已读标记
  card3.querySelectorAll("[data-pb]").forEach(c=>{
    c.style.opacity = store.peanutRead[c.dataset.pb] ? 1 : 0.6;
    c.onclick=()=>{
    if (!canWriteLearningState()) return;
    const i=c.dataset.pb;
    const previous = store;
    store = transitionLearningState(store, { type: "PEANUT_READ_TOGGLED", bookIndex: i });
    if (!save()) store = previous;
    switchMod("book");
    };
  });
  // 绑定：评分星
  let rating = 3;
  const starEls = card4.querySelectorAll(".pstar");
  const paintStars = (n)=>starEls.forEach(s=>{
    const active = +s.dataset.n <= n;
    s.innerHTML = icon("star", { filled: active });
    s.setAttribute("aria-pressed", String(active));
  });
  paintStars(rating);
  starEls.forEach(s=>s.onclick=()=>{ rating=+s.dataset.n; paintStars(rating); });
  // 绑定：添加记录
  el("pbAdd").onclick=()=>{
    if (!canWriteLearningState()) return;
    const title = el("pbTitle").value.trim();
    if(!title){ alert("请先输入书名"); return; }
    const previous = store;
    store = transitionLearningState(store, {
      type: "READING_LOG_ADDED",
      record: { title, date: todayKey(), rating },
    });
    if (!save()) store = previous;
    switchMod("book");
  };
  // 绑定：删除记录
  card4.querySelectorAll("[data-del]").forEach(x=>x.onclick=()=>{
    if (!canWriteLearningState()) return;
    const i = +x.dataset.del;
    const previous = store;
    store = transitionLearningState(store, {
      type: "READING_LOG_REMOVED",
      index: store.peanutLog.length - 1 - i,
    });
    if (!save()) store = previous;
    switchMod("book");
  });

  main.appendChild($(`<div class="footer">${icon("library")} 本机离线保存 · 登录后跨设备同步</div>`));
}


/* =========================================================
   渲染：系统设置（分类标签页）
   ========================================================= */
function renderSpeaking() {
  const main = el("main"); main.innerHTML = "";
  main.appendChild(subjectHero("speaking"));
  main.appendChild($(`<div class="card">
    <h3>${icon("languages")} 粤语亲子听说 · 准备中</h3>
    <div class="desc">将从生活短句、亲子互动和对话接话开始。本次先保存可选模块设置，课程内容和合适的粤语音频验收完成后再开放学习。</div>
    <div class="desc">可以先在吃饭、收玩具和出门时，用家里熟悉的粤语和孩子聊一两句，让孩子自在地回应。</div>
    <button class="btn-subtle" type="button" data-speaking-settings>学习设置</button>
  </div>`));
  main.querySelector("[data-speaking-settings]").onclick = () => switchMod("settings", { tab: "learning" });
}

let currentSettingsTab = "learning";

function renderSettings(options = {}){
  // 同一分类内的原地重渲染（开关、步进器、表单提交）保留滚动位置
  const previousTab = currentSettingsTab;
  const keepScrollY = window.scrollY;
  if (options?.tab) {
    currentSettingsTab = options.tab;
  }
  const main = el("main"); main.innerHTML="";
  main.appendChild(modTitle("settings","家长设置"));

  const tabs = [
    { id: "family", icon: "family", label: "家庭与账户" },
    { id: "learning", icon: "settings", label: "学习设置" },
    { id: "points", icon: "star", label: "积分规则" },
    { id: "growth", icon: "gift", label: "愿望成长" },
    { id: "sound", icon: "volume", label: "声音音效" },
    { id: "privacy", icon: "shield", label: "隐私" },
    { id: "guide", icon: "compass", label: "使用指南" },
    { id: "about", icon: "heart", label: "关于与反馈" },
  ];
  if (!tabs.some((tab) => tab.id === currentSettingsTab)) currentSettingsTab = "learning";
  const layout = $(`
    <div class="p-layout">
      <nav class="p-nav settings-tabs" role="tablist" aria-label="家长区分类">
        ${tabs.map((tab) => `<button class="settings-tab ${currentSettingsTab === tab.id ? "active" : ""}" type="button" role="tab" id="settings-tab-${tab.id}" data-tab="${tab.id}" aria-controls="settingsPanel" aria-selected="${currentSettingsTab === tab.id}">${icon(tab.icon)}<span>${tab.label}</span></button>`).join("")}
      </nav>
      <div class="p-body t-green" id="settingsPanel" role="tabpanel" aria-labelledby="settings-tab-${currentSettingsTab}"></div>
    </div>
  `);
  main.appendChild(layout);
  const tabsBar = layout.querySelector(".p-nav");
  tabsBar.querySelectorAll(".settings-tab").forEach((btn) => {
    btn.onclick = () => {
      currentSettingsTab = btn.dataset.tab;
      renderSettings();
    };
  });
  tabsBar.addEventListener("keydown", (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.id === currentSettingsTab);
    tabsBar.querySelectorAll(".settings-tab")[(index + step + tabs.length) % tabs.length]?.click();
    document.getElementById(`settings-tab-${currentSettingsTab}`)?.focus();
  });

  const body = layout.querySelector(".p-body");
  const panels = {
    family: renderSettingsFamily,
    learning: renderSettingsLearning,
    points: renderSettingsPoints,
    growth: renderSettingsGrowth,
    sound: renderSettingsSound,
    privacy: renderSettingsPrivacy,
    guide: renderGuide,
    about: renderSettingsAbout,
  };
  panels[currentSettingsTab](body);
  if (currentSettingsTab === previousTab) window.scrollTo({ top: keepScrollY });
  else if (layout.getBoundingClientRect().top < 0) layout.scrollIntoView({ block: "start" });
}

// 家庭与账户：登录、家庭空间、孩子档案、导出与删除都在账户面板中完成，这里给出状态与入口。
function renderSettingsFamily(main) {
  const accountBtn = document.querySelector("#accountButton");
  const state = accountBtn?.dataset?.state || "local";
  const kidName = document.querySelector("#topKid .top-kid-name")?.textContent?.trim() || "";
  const online = state === "online";
  const card = $(`<section class="card p-card">
    <h3>${icon(online ? "cloudCheck" : "cloud")} 账户与云端同步</h3>
    <div class="p-row"><span class="blob sm">${icon(online ? "cloudCheck" : "construction")}</span><span class="t"><b>${online ? escapeHtml(accountBtn?.title || "云端已连接") : "离线试用中 · 本机保存"}</b><small>${online ? `当前学习者：${escapeHtml(kidName)}` : "登录后建立家庭档案，手机、平板、电脑跨设备同步。"}</small></span>
      <button class="btn sm" type="button" data-open-account>${icon(online ? "settings" : "learner")} ${online ? "管理家庭与账户" : "家长登录"}</button></div>
    <p class="hint">家庭空间、孩子档案、共享密码、导出家庭数据、清除本机数据与删除家庭数据都在账户面板中操作。学习者是家庭内的独立档案，不是登录账号。</p>
  </section>`);
  card.querySelector("[data-open-account]").onclick = () => accountBtn?.click();
  main.appendChild(card);
}

// 关于与反馈：外链以页脚为唯一来源，儿童空间不展示站外链接。
// 新趣集是作品收录站点，不属于影伴自身信息，家长区不展示（页脚 SEO 链接保留）。
const ABOUT_HIDDEN_LINKS = [/^https:\/\/xinquji\.com/];
const BRAND_LINK_PATTERNS = { xiaohongshu: /xhslink\.cn|xiaohongshu\.com/, douyin: /douyin\.com/, x: /^https:\/\/(x|twitter)\.com/ };
// 社交平台标识：单色剪影，底色取各平台品牌色
const BRAND_ICONS = {
  wechat: `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M9.2 3.5C5 3.5 1.6 6.3 1.6 9.8c0 2 1.1 3.8 2.9 5l-.7 2.2 2.6-1.3c.9.3 1.8.4 2.8.4h.5a5.6 5.6 0 0 1-.2-1.5c0-3.6 3.4-6.4 7.6-6.4h.5C16.9 5.4 13.4 3.5 9.2 3.5Zm-2.6 4.6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm5.2 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/><path fill="currentColor" d="M22.4 14.6c0-2.9-2.9-5.3-6.4-5.3s-6.4 2.4-6.4 5.3 2.9 5.3 6.4 5.3c.7 0 1.4-.1 2.1-.3l2.1 1.1-.6-1.8c1.7-1 2.8-2.5 2.8-4.3Zm-8.5-.9a.9.9 0 1 1 0-1.7.9.9 0 0 1 0 1.7Zm4.3 0a.9.9 0 1 1 0-1.7.9.9 0 0 1 0 1.7Z"/></svg>`,
  xiaohongshu: `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><text x="12" y="15.6" text-anchor="middle" fill="currentColor" font-size="8.4" font-weight="900" font-family="PingFang SC, Microsoft YaHei, sans-serif">小红书</text></svg>`,
  douyin: `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12.5.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07Z"/></svg>`,
  x: `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.59-6.64 7.59H.47l8.6-9.83L0 1.15h7.59l5.24 6.93Zm-1.29 19.5h2.04L6.49 3.24H4.3Z"/></svg>`,
};
function renderSettingsAbout(main) {
  const card = $(`<section class="card p-card" data-settings-about>
    <h3>${icon("heart")} 关于与反馈</h3>
    <div class="links"></div>
    <p class="hint">外部链接在新窗口打开。影伴由 Shadow Lab 出品，问题反馈会通过邮件发送给我们。</p>
  </section>`);
  const links = card.querySelector(".links");
  // 按用途分组；分组只决定展示位置，链接本身仍逐条取自页脚
  const groups = [
    { title: "关于影伴", tone: "t-green", match: (href) => /^https:\/\/shadow\.wang/.test(href) },
    { title: "关注我们", tone: "t-orange", match: (href, source) => source.id === "wechatButton" || /xhslink|douyin|x\.com/.test(href) },
    { title: "帮助与隐私", tone: "t-blue", match: (href) => href.startsWith("mailto:") || href === "/privacy" },
    { title: "更多", tone: "t-ink", match: () => true },
  ].map((group) => ({ ...group, rows: [] }));
  document.querySelectorAll(".site-footer-links > .site-footer-link").forEach((source) => {
    const label = source.textContent.trim();
    const href = source.getAttribute("href") || "";
    if (ABOUT_HIDDEN_LINKS.some((pattern) => pattern.test(href))) return;
    const group = groups.find((item) => item.match(href, source));
    const brand = source.id === "wechatButton" ? "wechat" : Object.keys(BRAND_LINK_PATTERNS).find((key) => BRAND_LINK_PATTERNS[key].test(href));
    const iconName = href.startsWith("mailto:") ? "mail" : href === "/privacy" ? "shield" : "externalLink";
    const badge = brand
      ? `<span class="blob sm brand-badge brand-${brand}">${BRAND_ICONS[brand]}</span>`
      : `<span class="blob sm ${group.tone}">${icon(iconName)}</span>`;
    const inner = `${badge}<span class="t"><b>${escapeHtml(label)}</b></span>${icon("chevronRight", { className: "link-row-go" })}`;
    if (source.id === "wechatButton") {
      const button = $(`<button class="link-row" type="button" aria-haspopup="dialog" data-open-wechat>${inner}</button>`);
      button.onclick = () => source.click();
      group.rows.push(button);
      return;
    }
    const link = $(`<a class="link-row" href="${escapeHtml(href)}">${inner}</a>`);
    ["target", "rel", "title", "aria-label"].forEach((name) => {
      if (source.hasAttribute(name)) link.setAttribute(name, source.getAttribute(name));
    });
    group.rows.push(link);
  });
  groups.filter((group) => group.rows.length).forEach((group) => {
    const section = $(`<div class="p-group"><div class="p-group-h"><b>${group.title}</b></div><div class="link-grid"></div></div>`);
    section.querySelector(".link-grid").append(...group.rows);
    links.appendChild(section);
  });
  main.appendChild(card);
}

function renderSettingsPrivacy(main) {
  const status = usageAnalytics.status();
  const card = $(`<section class="card p-card">
    <h3>${icon("shield")} 体验改进</h3>
    <div class="p-rows">
      <label class="switch-row">
        <span class="switch-label"><strong>使用统计</strong><span class="desc">收集使用数据，帮助改进产品体验。</span></span>
        <input id="usageConsent" type="checkbox" class="switch" role="switch" aria-label="使用统计" ${status.configured && status.consent ? "checked" : ""} ${status.configured ? "" : "disabled"}>
      </label>
    </div>
    <p class="hint" data-usage-hint>${status.configured
      ? "只记录打开应用、模块切换、打卡、积分与奖励兑换等固定事件，不关联账号、家庭或孩子，不发送学习内容；关闭后同时停止错误上报。"
      : "使用统计仅在正式站点 sm.shadow.wang 启用。当前是本地或预览环境，不收集使用数据，开关暂不可用。"}</p>
    <a class="link-btn" href="/privacy" target="_blank" rel="noopener">${icon("externalLink")} 隐私政策</a>
  </section>`);
  main.appendChild(card);
  card.querySelector("#usageConsent").onchange = (event) => {
    const enabled = event.target.checked;
    if (!usageAnalytics.setConsent(enabled)) {
      event.target.checked = usageAnalytics.status().consent;
      alert("浏览器无法保存统计偏好，使用统计保持关闭。");
      return;
    }
    if (enabled) void usageAnalytics.record("open");
  };
}

function renderSettingsLearning(main){
  const config = normalizeContentConfig(store.content_config);
  const selectedPackages = getActiveLearningPackages(config);
  const pace = getContentLearningPace(config);
  const settings = $(`
    <div class="p-stack">
      <section class="card p-card">
        <h3>${icon("grid")} 学习阶段</h3>
        <p class="hint">按孩子年龄选择推荐学习包，支持多选，至少保留 1 项。</p>
        <div class="package-list p-rows" role="group" aria-label="选择学习包">
          ${LEARNING_PACKAGES.map((item) => `
            <label class="switch-row">
              <span class="switch-label"><strong>${escapeHtml(item.name)}</strong><span class="desc">建议年龄 ${escapeHtml(item.suggested_age)} 岁${item.description ? ` · ${escapeHtml(item.description)}` : ""}</span></span>
              <input type="checkbox" class="switch" data-package-toggle="${item.id}" ${config.package_ids.includes(item.id) ? "checked" : ""} aria-label="选择 ${escapeHtml(item.name)}">
            </label>
          `).join("")}
        </div>
      </section>
      <section class="card p-card">
        <h3>${icon("calendar")} 每日学习节奏</h3>
        <p class="hint">调整后将即时按新推荐节奏安排；已完成打卡的内容保持记录不变。复习间隔表示练习节奏，不表示掌握程度。</p>
        <div class="p-rows">
          ${[["literacy_new", "每天新学生字", "个"], ["english_new", "每天新学单词", "词"], ["poems_new", "每天新学古诗", "首"]].map(([key, label, unit]) => `
            <div class="switch-row stepper-row">
              <span class="switch-label">
                <strong>${label}</strong>
                <span class="desc">每天推荐 1–20 ${unit}，默认 2</span>
              </span>
              <div class="stepper-control" role="group" aria-label="${label}">
                <button type="button" class="stepper-btn stepper-btn-minus" data-pace-step="${key}" data-step="-1" aria-label="减少${label}">−</button>
                <input class="stepper-input" type="number" min="1" max="20" step="1" data-learning-pace="${key}" value="${pace[key] || 2}" aria-label="${label}">
                <button type="button" class="stepper-btn stepper-btn-plus" data-pace-step="${key}" data-step="1" aria-label="增加${label}">+</button>
                <span class="stepper-unit">${unit}/天</span>
              </div>
            </div>
          `).join("")}
        </div>
      </section>
      <section class="card p-card">
        <h3>${icon("list")} 学习模块</h3>
        <p class="hint">按孩子独立启停。关闭模块只影响入口和统计，不会删除学习历史。</p>
        <div class="p-rows">
          <label class="switch-row">
            <span class="switch-label"><strong>启用学习包</strong><span class="desc">关闭后首页和成长记录隐藏学习模块统计</span></span>
            <input type="checkbox" class="switch" ${config.enabled ? "checked" : ""} data-config-toggle="package" aria-label="启用学习包">
          </label>
        </div>
        <div class="p-group">
          <div class="p-group-h"><b>学科模块</b><small>${ALL_CONTENT_MODULES.filter((module) => config.modules[module.id]).length} / ${ALL_CONTENT_MODULES.length} 已启用</small></div>
          <div class="p-rows">
            ${ALL_CONTENT_MODULES.map((module) => `
            <label class="switch-row">
              <span class="switch-label"><strong>${icon(module.icon_key)} ${escapeHtml(module.name)}</strong><span class="desc">${module.id === "speaking" ? "可选 · 课程和音频准备中，暂不计入打卡统计" : `累计 ${totalChecked(module.id)} 天 · 连续 ${streak(module.id)} 天`}</span></span>
              <input type="checkbox" class="switch" ${config.modules[module.id] ? "checked" : ""} data-config-toggle="module" data-module-id="${module.id}" aria-label="启用 ${escapeHtml(module.name)}">
            </label>`).join("")}
          </div>
        </div>
      </section>
    </div>
  `);
  main.appendChild(settings);
  function handlePaceUpdate(key, nextVal) {
    if (!canWriteLearningState()) return;
    let val = Math.floor(Number(nextVal));
    if (!Number.isFinite(val) || val < 1) val = 1;
    if (val > 20) val = 20;
    const nextPace = { ...pace, [key]: val };
    if (key === "poems_new") {
      nextPace.poems_per_week = val;
    }
    const previous = store;
    store = { ...store, content_config: normalizeContentConfig({ ...config,
      learning_pace: nextPace }) };
    activeLearningPlan = null;
    if (!save()) { store = previous; return; }
    dailyLearningPlan();
    switchMod("settings", { tab: "learning" });
  }
  settings.querySelectorAll("[data-learning-pace]").forEach((input) => {
    input.onchange = () => {
      handlePaceUpdate(input.dataset.learningPace, input.value);
    };
  });
  settings.querySelectorAll("[data-pace-step]").forEach((btn) => {
    btn.onclick = () => {
      const key = btn.dataset.paceStep;
      const step = Number(btn.dataset.step) || 0;
      const input = settings.querySelector(`input[data-learning-pace="${key}"]`);
      const current = Number(input?.value) || 2;
      handlePaceUpdate(key, current + step);
    };
  });
  settings.querySelectorAll("[data-package-toggle]").forEach((input) => {
    input.onchange = () => {
      if (!canWriteLearningState()) return;
      const currentSelected = [...(config.package_ids || [selectedPackages[0].id])];
      const pkgId = input.dataset.packageToggle;
      let nextSelected;
      if (input.checked) {
        nextSelected = [...new Set([...currentSelected, pkgId])];
      } else {
        nextSelected = currentSelected.filter((id) => id !== pkgId);
        if (nextSelected.length === 0) {
          input.checked = true;
          alert("至少需要保留 1 个学习包哦");
          return;
        }
      }
      const previous = store;
      store = { ...store, content_config: setContentPackageIds(store.content_config, nextSelected) };
      if (!save()) store = previous;
      mathLevel = getMathPolicy(store.content_config.package_ids[0]).defaultMaxOperand;
      switchMod("settings", { tab: "learning" });
    };
  });
  settings.querySelectorAll("[data-config-toggle='package']").forEach((input) => {
    input.onchange = () => {
      updateContentPackage(input.checked);
      renderSettings({ tab: "learning" });
    };
  });
  settings.querySelectorAll("[data-config-toggle='module']").forEach((input) => {
    input.onchange = () => {
      updateContentModule(input.dataset.moduleId, input.checked);
      renderSettings({ tab: "learning" });
    };
  });
  main.appendChild($(`<div class="footer">${icon("graduation")} 学习包配置按孩子独立保存 · 登录后跨设备同步</div>`));
}

function renderSettingsPoints(main){
  const customItems = (growthLoopSnapshot.items || []).filter(it => it.item_kind === "custom");
  const customCard = $(`
    <section class="card p-card">
      <h3>${icon("pencil")} 自定义积分项</h3>
      <p class="hint">把成长任务纳入积分管理：正数是加分，负数是扣分；每个孩子可以有自己的分值。</p>
      <form id="pointItemForm" class="growth-form">
        <label>项目名称<input name="name" maxlength="60" required placeholder="例如：自己刷牙"></label>
        <label>分值<input name="points" type="number" min="-1000" max="1000" step="1" required placeholder="例如：2"></label>
        <button class="btn" type="submit">${icon("plus")} 添加积分项</button>
      </form>
      ${customItems.length ? `
        <div class="p-group">
          <div class="p-group-h"><b>已添加的自定义积分项</b><small>${customItems.length} 项</small></div>
          <div class="p-rows">
            ${customItems.map((it) => {
              const positive = Number(it.default_points) > 0;
              const tone = positive ? "t-green" : "t-rose";
              return `<div class="p-row"><span class="blob sm ${tone}">${icon(positive ? "star" : "alert")}</span><span class="t"><b>${escapeHtml(it.name)}</b><small>${positive ? "加分项" : "扣分项"}</small></span><span class="chip ${tone}">${positive ? "+" : ""}${it.default_points} 分</span></div>`;
            }).join("")}
          </div>
        </div>
      ` : ""}
    </section>
  `);
  main.appendChild(customCard);
  customCard.querySelector("#pointItemForm").onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const points = Number(form.get("points"));
    if (!name || !Number.isInteger(points) || points === 0 || Math.abs(points) > 1000) {
      alert("请填写名称，并输入 1 到 1000 的整数分值（可填负数）。");
      return;
    }
    try {
      await window.growthLoop.createPointItem({
        request_id: clientRequestId("point-item"),
        item: {
          name,
          description: "自定义成长任务",
          default_points: points,
          category: "growth",
          icon_key: points > 0 ? "star" : "alert",
          item_kind: "custom",
        },
      });
      window.cloudSync?.scheduleGrowthLoop?.();
      renderSettings({ tab: "points" });
      praise("积分项已添加！✨");
      flyStars(6);
    } catch (error) {
      console.error("Growth Loop custom point item creation failed:", error);
      alert("积分项没有保存成功，请稍后重试。");
    }
  };

  const periodCard = $(`
    <div class="card">
      <h3>${icon("trash")} 结束本月积分周期</h3>
      <div class="desc">不会删除历史记录，会追加反向调整，让本月重新开始。</div>
      <button class="checkin danger" id="ptclear" type="button">${icon("trash")} 结束本月积分周期</button>
    </div>
  `);
  main.appendChild(periodCard);
  periodCard.querySelector("#ptclear").onclick = async () => {
    if (confirm("确定结束本月积分周期？历史记录会保留，但本月积分会归零。")) {
      try {
        await window.growthLoop.closePeriod({ period_key: currentPeriodKey(), request_id: clientRequestId("period-close") });
        window.cloudSync?.scheduleGrowthLoop?.();
        renderSettings({ tab: "points" });
      } catch (error) {
        console.error("Growth Loop point period close failed:", error);
        alert("积分周期没有结束成功，请稍后重试。");
      }
    }
  };
  main.appendChild($(`<div class="footer">${icon("star")} 每日按日期记录 · 本机离线保存并可同步云端</div>`));
}

function renderSettingsGrowth(main){
  const opening = getOpeningBalance(growthLoopSnapshot);
  const legacyImport = getLegacyPointsImport(growthLoopSnapshot);
  const legacyEntries = buildLegacyPointEntries(learningDesk.getEnvelope().legacy?.points_readonly || {});
  const legacyTotal = legacyEntries.reduce((sum, entry) => sum + entry.delta, 0);
  const legacyPreview = legacyEntries.slice(-6).reverse();

  let openingCard;
  if (opening) {
    openingCard = $(`
      <div class="card growth-opening-card">
        <h3>${icon("checkCircle")} 期初积分已确认</h3>
        <div class="stat-grid">
          <div class="stat"><div class="n">${opening.delta}</div><div class="t">期初积分</div></div>
          <div class="stat"><div class="n">${openingStatusLabel(opening)}</div><div class="t">状态</div></div>
        </div>
        <div class="desc">已确认的期初积分计入余额，不计入行为统计；如需纠错，请使用普通积分调整流水。</div>
      </div>
    `);
  } else if (legacyImport) {
    const presentation = legacyImportPresentation(legacyImport.status);
    openingCard = $(`
      <div class="card growth-opening-card">
        <h3>${icon(presentation.iconName)} ${presentation.title}</h3>
        <div class="stat-grid">
          <div class="stat"><div class="n">${legacyImport.total}</div><div class="t">导入积分</div></div>
          <div class="stat"><div class="n">${legacyImport.count}</div><div class="t">打卡明细</div></div>
          <div class="stat"><div class="n">${presentation.statusLabel}</div><div class="t">状态</div></div>
        </div>
        <div class="desc">${presentation.description}</div>
        ${presentation.canRetry ? `<button class="checkin" id="legacyImportBtn" type="button">${icon("refresh")} 重新导入</button>` : ""}
      </div>
    `);
  } else if (legacyEntries.length > 0) {
    openingCard = $(`
      <div class="card growth-opening-card">
        <h3>${icon("download")} 恢复旧积分</h3>
        <div class="stat-grid">
          <div class="stat"><div class="n">${legacyTotal}</div><div class="t">旧积分合计</div></div>
          <div class="stat"><div class="n">${legacyEntries.length}</div><div class="t">打卡明细</div></div>
        </div>
        <div class="desc">已自动找到这个孩子的旧积分打卡记录。导入后余额与每天明细都会恢复，家长无需手动填写积分；每个孩子只能导入一次。</div>
        <div class="legacy-preview">
          ${legacyPreview.map((entry) => `<div class="legacy-row"><span>${escapeHtml(entry.occurred_on)}</span><span>${escapeHtml(entry.item_name_snapshot)}</span><span class="${entry.delta > 0 ? "pos" : "neg"}">${entry.delta > 0 ? "+" : ""}${entry.delta}</span></div>`).join("")}
          ${legacyEntries.length > legacyPreview.length ? `<div class="legacy-more">… 最近 6 条 / 共 ${legacyEntries.length} 条</div>` : ""}
        </div>
        <button class="checkin" id="legacyImportBtn" type="button">${icon("download")} 导入并恢复</button>
      </div>
    `);
  } else {
    openingCard = $(`
      <div class="card growth-opening-card">
        <h3>${icon("star")} 期初积分</h3>
        <div class="desc">没有找到可自动导入的旧积分记录。如需手动结转，由家长为当前孩子明确确认一次期初积分；确认后如需调整，请用普通积分调整流水。</div>
        <form id="openingBalanceForm" class="growth-form">
          <label>期初积分<input name="balance" type="number" min="1" max="1000000" step="1" required placeholder="例如：128"></label>
          <button class="btn" type="submit">${icon("check")} 确认期初积分</button>
        </form>
      </div>
    `);
  }
  main.appendChild(openingCard);
  const openingForm = openingCard.querySelector("#openingBalanceForm");
  if (openingForm) {
    openingForm.onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const value = Number(form.get("balance"));
      if (!Number.isInteger(value) || value < 1 || value > 1000000) {
        alert("请填写 1 到 1000000 的整数积分。");
        return;
      }
      if (!window.confirm(`确定为当前孩子确认 ${value} 分期初积分？每个孩子只能确认一次。`)) return;
      try {
        const result = await window.growthLoop.confirmOpeningBalance({
          balance: value,
          note: "期初积分",
          request_id: clientRequestId("opening"),
        });
        if (result.error === "opening_balance_already_confirmed") {
          alert("这个孩子的期初积分已经确认过了。");
        } else if (result.error) {
          alert("期初积分确认失败，请稍后重试。");
        } else {
          window.cloudSync?.scheduleGrowthLoop?.();
          renderSettings({ tab: "growth" });
        }
      } catch (error) {
        console.error("Growth Loop opening balance confirm failed:", error);
        alert("期初积分没有保存成功，请稍后重试。");
      }
    };
  }
  const legacyImportBtn = openingCard.querySelector("#legacyImportBtn");
  if (legacyImportBtn) {
    legacyImportBtn.onclick = async () => {
      if (!window.confirm(`将导入这个孩子的 ${legacyEntries.length} 条旧积分打卡明细，合计 ${legacyTotal} 分，并恢复为当前余额。每个孩子只能导入一次，确认导入？`)) return;
      legacyImportBtn.disabled = true;
      try {
        const result = await window.growthLoop.importLegacyPoints({
          entries: legacyEntries,
          request_id: clientRequestId("legacy-import"),
        });
        if (result.error === "legacy_points_already_imported") {
          alert("这个孩子的旧积分已经导入过了。");
        } else if (result.error) {
          alert("旧积分导入失败，请稍后重试。");
        } else {
          window.cloudSync?.scheduleGrowthLoop?.();
          renderSettings({ tab: "growth" });
        }
      } catch (error) {
        console.error("Growth Loop legacy points import failed:", error);
        alert("旧积分没有导入成功，请稍后重试。");
      } finally {
        legacyImportBtn.disabled = false;
      }
    };
  }

  const existingRewards = window.growthLoop?.getRewards?.() || [];
  const rewardCard = $(`
    <section class="card p-card">
      <h3>${icon("gift")} 添加心愿奖品</h3>
      <p class="hint">设定孩子期待兑换的心愿奖品与兑换所需积分。</p>
      <form id="rewardForm" class="growth-form">
        <label>奖品名称<input name="name" maxlength="60" required placeholder="例如：去一次游乐园"></label>
        <label>所需积分<input name="cost" type="number" min="1" max="100000" step="1" required placeholder="例如：10"></label>
        <button class="btn" type="submit">${icon("plus")} 添加心愿奖品</button>
      </form>
      ${existingRewards.length ? `
        <div class="p-group">
          <div class="p-group-h"><b>已设定的心愿奖品</b><small>${existingRewards.length} 个</small></div>
          <div class="p-rows">
            ${existingRewards.map((r) => `<div class="p-row"><span class="blob sm t-sun">${icon(r.icon_key || "gift")}</span><span class="t"><b>${escapeHtml(r.name)}</b><small>${escapeHtml(r.description || "家庭约定奖励")}</small></span><span class="chip t-sun">${r.cost_points || 0} 分</span></div>`).join("")}
          </div>
        </div>
      ` : ""}
    </section>
  `);
  main.appendChild(rewardCard);
  rewardCard.querySelector("#rewardForm").onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const cost = Number(form.get("cost"));
    if (!name || !Number.isInteger(cost) || cost <= 0 || cost > 100000) {
      alert("请填写奖品名称，并输入 1 到 100000 的所需积分。");
      return;
    }
    try {
      await window.growthLoop.createReward({
        request_id: clientRequestId("reward"),
        reward: {
          name,
          description: "家庭约定奖励",
          cost_points: cost,
          category: "family",
          icon_key: "gift",
        },
      });
      window.cloudSync?.scheduleGrowthLoop?.();
      renderSettings({ tab: "growth" });
      praise("心愿奖品已添加！🎁");
      flyStars(6);
    } catch (error) {
      console.error("Growth Loop create reward failed:", error);
      alert("心愿奖品添加失败，请稍后重试。");
    }
  };

  main.appendChild($(`<div class="footer">${icon("sprout")} 期初积分与心愿奖品按孩子独立管理 · 登录后跨设备同步</div>`));
}

function renderSettingsSound(main){
  const settings = soundEffects.getSettings();
  const masterVol = Math.round((settings.volume ?? 0.6)*100);
  const masterLabelText = `总音量 ${masterVol}%${masterVol > 100 ? " (超额增强)" : ""}`;
  main.appendChild($(`
    <section class="card p-card">
      <h3>${icon("volume")} 界面音效</h3>
      <div class="p-rows">
        <label class="switch-row">
          <span class="switch-label"><strong>启用界面音效</strong><span class="desc">控制点击、打卡、获得积分等界面操作音效。</span></span>
          <input type="checkbox" class="switch" id="snd-master" role="switch" aria-label="启用界面音效" ${settings.enabled ? "checked" : ""}>
        </label>
        <div class="sound-row">
          <span class="sound-label" id="snd-volume-label">${masterLabelText}</span>
          <input class="sound-range" type="range" id="snd-volume" min="0" max="200" step="5" value="${masterVol}" aria-label="总音量" ${settings.enabled?"":"disabled"}>
        </div>
      </div>
    </section>
  `));
  const speechVol = Math.round((settings.speechVolume ?? 0.6)*100);
  const speechLabelText = `朗读音量 ${speechVol}%${speechVol > 100 ? " (超额增强)" : ""}`;
  main.appendChild($(`
    <section class="card p-card">
      <h3>${icon("volume")} 课程语音朗读</h3>
      <p class="hint">控制汉字发音、英文单词和字意朗读的音量。</p>
      <div class="p-rows">
        <div class="sound-row">
          <span class="sound-label" id="speech-volume-label">${speechLabelText}</span>
          <input class="sound-range" type="range" id="speech-volume" min="0" max="200" step="5" value="${speechVol}" aria-label="课程语音朗读音量">
          <button class="btn soft sm" type="button" id="speech-preview">${icon("play")} 试听示范发音</button>
        </div>
      </div>
    </section>
  `));
  const eventsCard = $(`<section class="card p-card"><h3>${icon("list")} 事件音效</h3><p class="hint">每个事件可以单独开关、选择音色并试听。</p><div class="sound-events p-rows"></div></section>`);
  main.appendChild(eventsCard);
  const list = eventsCard.querySelector(".sound-events");
  for (const key of SOUND_EVENT_KEYS) {
    const def = SOUND_EVENTS[key];
    const eventSettings = settings.events[key];
    const variantOptions = Object.entries(def.variants).map(([variantKey, variant]) =>
      `<option value="${variantKey}" ${variantKey===eventSettings.variant?"selected":""}>${variant.name}</option>`
    ).join("");
    list.appendChild($(`
      <div class="sound-event switch-row" data-event="${key}">
        <label class="sound-label" for="snd-event-${key}">${def.label}</label>
        <div class="sound-event-controls">
          <select data-event-variant="${key}" aria-label="${def.label}变体" ${eventSettings.enabled?"":"disabled"}>${variantOptions}</select>
          <button class="btn white sm" type="button" data-event-preview="${key}">${icon("play")} 试听</button>
        </div>
        <input type="checkbox" class="switch" id="snd-event-${key}" data-event-enable="${key}" role="switch" aria-label="启用${def.label}音效" ${eventSettings.enabled ? "checked" : ""}>
      </div>
    `));
  }
  main.appendChild($(`
    <section class="card p-card">
      <div class="p-row">
        <span class="t"><b>恢复默认设置</b><small>恢复为默认的总开关、音效音量、语音朗读音量与每个事件的变体选择。</small></span>
        <button class="btn white sm" id="snd-reset" type="button">${icon("rotate")} 恢复默认</button>
      </div>
    </section>
  `));
  main.appendChild($(`<div class="footer">${icon("settings")} 声音设置只保存在当前设备，不会同步到云端。</div>`));

  el("snd-master").onchange = (event) => {
    soundEffects.setEnabled(event.target.checked);
    renderSettings({ tab: "sound" });
  };
  el("snd-volume").oninput = (event) => {
    const val = Number(event.target.value);
    soundEffects.setVolume(val / 100);
    const label = el("snd-volume-label");
    if (label) {
      label.textContent = `总音量 ${val}%${val > 100 ? " (超额增强)" : ""}`;
    }
  };
  el("snd-volume").onchange = () => {
    primeSpeechAudio();
    soundEffects.preview("points_earned");
  };
  el("snd-volume").addEventListener?.("pointerdown", primeSpeechAudio, { passive: true });
  el("speech-volume").oninput = (event) => {
    const val = Number(event.target.value);
    soundEffects.setSpeechVolume(val / 100);
    const label = el("speech-volume-label");
    if (label) {
      label.textContent = `朗读音量 ${val}%${val > 100 ? " (超额增强)" : ""}`;
    }
  };
  const triggerSpeechPreview = () => {
    primeSpeechAudio();
    const previewBtn = el("speech-preview");
    speak("日", previewBtn, "zh-CN", "hz-001:glyph");
  };
  el("speech-volume").onchange = triggerSpeechPreview;
  el("speech-preview").onclick = triggerSpeechPreview;
  el("speech-preview").addEventListener?.("pointerdown", primeSpeechAudio, { passive: true });

  el("snd-reset").onclick = () => {
    soundEffects.resetDefaults();
    renderSettings({ tab: "sound" });
  };
  main.querySelectorAll("[data-event-enable]").forEach((input) => input.onchange = () => {
    soundEffects.setEventEnabled(input.dataset.eventEnable, input.checked);
    renderSettings({ tab: "sound" });
  });
  main.querySelectorAll("[data-event-variant]").forEach((select) => select.onchange = () => {
    soundEffects.setEventVariant(select.dataset.eventVariant, select.value);
    renderSettings({ tab: "sound" });
  });
  main.querySelectorAll("[data-event-preview]").forEach((button) => button.onclick = () => {
    soundEffects.preview(button.dataset.eventPreview);
  });
}

function renderGuide(container = null){
  const accountBtn = document.querySelector("#accountButton");
  const isOnline = accountBtn?.dataset?.state === "online";

  const main = container || el("main");
  if (!container) main.innerHTML = "";
  main.appendChild($(`
    <div class="guide-page">
      <section class="guide-hero">
        <div class="guide-kicker">给家长的快速上手</div>
        <h2>使用指南</h2>
        <p>第一次使用影伴，照着这条路线走一遍：推荐使用 Chrome 与大屏平板、登录开启免费云同步，让孩子轻松开始自主学习。</p>
        <div class="guide-badges">
          <span>约 3 分钟上手</span>
          <span>推荐 Chrome</span>
          <span>大屏平板优先</span>
          <span>免费云同步</span>
        </div>
      </section>

      <section class="guide-card guide-recommend-card" data-guide-section="recommendations">
        <div class="guide-section-heading">
          <span class="guide-rec-icon">${icon("star")}</span>
          <div>
            <h3>最佳体验建议：Chrome + 平板电脑 + 登录开启免费云同步</h3>
            <p>为保障孩子的专注力、视力健康与发音顺畅，推荐按以下搭配使用影伴：</p>
          </div>
        </div>

        <div class="guide-recommend-grid">
          <article class="guide-recommend-item">
            <div class="guide-recommend-badge tablet">${icon("book")} 平板首选</div>
            <h4>首推平板电脑（iPad / 安卓平板）</h4>
            <p><strong>大屏护眼防疲劳</strong>：大屏幕下生字卡片、笔画笔顺和图文更清晰，减少孩子低头与视力疲劳。</p>
            <p><strong>自主触控点读</strong>：放置在书桌支架上，孩子伸手指即可自主点读汉字、古诗与题目，无需家长全程举着手机陪读。</p>
          </article>

          <article class="guide-recommend-item">
            <div class="guide-recommend-badge chrome">${icon("compass")} 极速浏览器</div>
            <h4>推荐使用 Google Chrome 浏览器</h4>
            <p><strong>现代音频与硬件加速</strong>：完整支持 Web Audio 引擎与 PWA 离线技术，发音响应即点即播、音质洪亮清晰。</p>
            <p><strong>避开应用内限制</strong>：微信内置浏览器容易限制音频自动播放或离线缓存，使用系统 Chrome 体验最流畅。</p>
          </article>

          <article class="guide-recommend-item">
            <div class="guide-recommend-badge cloud">${icon("cloud")} 数据安全</div>
            <h4>家长免费登录开启云端同步</h4>
            <p><strong>防丢失防误清</strong>：未登录数据仅保存在当前设备，清理缓存会导致记录丢失；登录后自动多副本安全备份。</p>
            <p><strong>多端无缝协同</strong>：平板学习打卡、家长手机查看进度实时同步；家庭积分与心愿契约多端拉齐，换机无忧。</p>
          </article>
        </div>

        <div class="guide-recommend-actions">
          ${isOnline ? `
            <div class="guide-sync-status-tip">
              ${icon("checkCircle")} <span>已开启家庭空间：您的打卡与积分数据正在享受免费实时云端同步。</span>
            </div>
          ` : `
            <button class="guide-login-action-btn" type="button" data-action="guide-login">
              ${icon("cloud")} 立即免费登录 · 开启家庭空间与数据云同步
            </button>
          `}
        </div>
      </section>

      <section class="guide-card" data-guide-section="quickstart">
        <div class="guide-section-heading"><span>01</span><div><h3>第一次使用怎么做</h3><p>孩子不需要注册账号，家长一个邮箱就能管理多个孩子。</p></div></div>
        <div class="guide-steps">
          <article class="guide-step"><span class="guide-step-no">1</span><div><h4>家长登录</h4><p>点击右上角“登录”，输入家长邮箱。可以使用邮箱验证码或共享密码登录；尚未设置密码时，先用验证码完成登录。</p></div></article>
          <article class="guide-step"><span class="guide-step-no">2</span><div><h4>建立家庭空间</h4><p>填写家庭名称和第一个学习者；之后可以在家庭空间里添加孩子、修改资料和切换当前孩子。</p></div></article>
          <article class="guide-step"><span class="guide-step-no">3</span><div><h4>开始学习和打卡</h4><p>从左侧进入“学习”，再选择语文、数学、英语或绘本。每个任务单独打卡，再次点击同一个按钮即可取消。</p></div></article>
        </div>
      </section>

      <section class="guide-card" data-guide-section="speech-features">
        <div class="guide-section-heading"><span>02</span><div><h3>儿童全场景点读与自主学习</h3><p>让孩子无需家长一直陪读，点到哪里读到哪里。</p></div></div>
        <div class="guide-steps">
          <article class="guide-step"><span class="guide-step-no">文</span><div><h4>语文识字、古诗与写字</h4><p>点击生字卡片即听拼读组词；点击古诗任意行或标题听诵读；写字练习中点击字意、词语、例句与笔顺口诀均支持纯净发音辅导。</p></div></article>
          <article class="guide-step"><span class="guide-step-no">数</span><div><h4>数学题目与游戏规则</h4><p>加减习题点击“读题目”；数感星球点“读要求”；数独入门点“读规则”，语音自动播报通俗易懂的儿童规则。</p></div></article>
          <article class="guide-step"><span class="guide-step-no">英</span><div><h4>英语拼读与往期回顾</h4><p>今日核心词支持中英文发音引导；往期回顾直接点击单词标签即可听美式标准发音，温故而知新。</p></div></article>
        </div>
      </section>

      <section class="guide-card" data-guide-section="growth-loop">
        <div class="guide-section-heading"><span>03</span><div><h3>习惯积分与心愿兑换成长闭环</h3><p>把好习惯变成动力，建立看得见、守信用的家庭激励约定。</p></div></div>
        <div class="guide-facts">
          <div><strong>习惯打卡</strong><span>鼓励做家务、认真学习等好习惯；误操作可再次点击撤销，明细中清晰显示“（撤销）”。</span></div>
          <div><strong>自主兑换</strong><span>孩子用攒下的积分挑选心愿奖励；心愿货架支持随时「再次兑换」，不再因历史履约而锁死。</span></div>
          <div><strong>契约履约</strong><span>家长在现实履约后点击「确认兑现」；待兑现可随时取消，兑现后 24 小时内支持防误触「撤回兑现」并退还积分，超时自动归档。</span></div>
        </div>
      </section>

      <section class="guide-card" data-guide-section="sound-settings">
        <div class="guide-section-heading"><span>04</span><div><h3>音效与语音独立调节</h3><p>界面交互星星动效与课程朗读音量分轨调节，适应不同家庭环境。</p></div></div>
        <div class="guide-facts">
          <div><strong>界面音效</strong><span>打卡成功、连胜与获得积分时的星星音效，可开启/关闭并自由调节总音量。</span></div>
          <div><strong>朗读音量</strong><span>专门调节课程朗读、古诗跟读与题目规则的音量大小，支持即时点击试听。</span></div>
          <div><strong>本机记忆</strong><span>声音与音量设置保存在当前设备，切换设备时不会互相干扰。</span></div>
        </div>
      </section>

      <section class="guide-card" data-guide-section="speech">
        <div class="guide-section-heading"><span>05</span><div><h3>发音来源与备用系统语音</h3><p>影伴优先播放经过专业调优的高质量预录音频；离线时自动尝试同语言系统语音。绝不上传录音。</p></div></div>
        <div class="guide-device-grid">
          <article class="guide-device"><h4>Windows</h4><p>设置 → 时间和语言 → 语言和区域 → English → 语言选项 → 语音 → 下载。</p><a class="guide-link" href="https://support.microsoft.com/windows/change-your-keyboard-layout-245c49b8-f856-7fd7-2cf5-41e54c66f5b3" target="_blank" rel="noopener">查看微软安装说明 ↗</a></article>
          <article class="guide-device"><h4>macOS</h4><p>系统设置 → 辅助功能 → 朗读内容 → 系统声音 → 管理声音，下载 English 语音。</p><a class="guide-link" href="https://support.apple.com/guide/mac-help/change-the-voice-your-mac-uses-to-speak-text-mchlp2290/mac" target="_blank" rel="noopener">查看 Apple 安装说明 ↗</a></article>
          <article class="guide-device"><h4>iPhone / iPad</h4><p>设置 → 辅助功能 → 朗读内容 → 声音 → English，点击下载需要的声音。</p><a class="guide-link" href="https://support.apple.com/en-us/105018" target="_blank" rel="noopener">查看 Apple 语音说明 ↗</a></article>
          <article class="guide-device"><h4>Android</h4><p>设置 → 无障碍 → 文字转语音输出 → 选择引擎和语言 → 安装语音数据 → English。</p><a class="guide-link" href="https://support.google.com/accessibility/android/answer/6006983?hl=en" target="_blank" rel="noopener">查看 Google 安装说明 ↗</a></article>
          <p class="guide-device-tip">固定课程音频由 CDN 提供并按标准 HTTP 规则缓存，不需要下载本地模型。下方仅显示旧离线包的清理入口；旧包已停用，不会再次下载。</p>
        </div>
        <div data-piper-resource-manager></div>
        <div class="guide-note">播放失败时先检查网络、设备音量、静音开关和浏览器声音权限；旧离线包只需在需要释放空间时手动删除。</div>
      </section>

      <section class="guide-card" data-guide-section="sync">
        <div class="guide-section-heading"><span>06</span><div><h3>家庭空间和同步</h3><p>家庭空间是统一入口，学习记录按孩子分别同步和保存。</p></div></div>
        <div class="guide-facts">
          <div><strong>家庭维度</strong><span>管理家庭名称、孩子档案和当前选择。</span></div>
          <div><strong>孩子维度</strong><span>每个孩子的打卡、积分和绘本记录分别同步。</span></div>
          <div><strong>看同步状态</strong><span>进入家庭空间可查看家庭内最近同步时间。</span></div>
          <div><strong>跨端免配置</strong><span>无论在平板、手机还是电脑上登录同一家长账号，孩子学习数据实时拉齐。</span></div>
        </div>
      </section>

      <section class="guide-card" data-guide-section="install">
        <div class="guide-section-heading"><span>07</span><div><h3>添加到主屏幕：实现像原生 App 一样的独立安装体验</h3><p>影伴支持现代 PWA 渐进式 Web 应用标准，无需在应用商店搜索或下载臃肿安装包，添加到主屏幕即可像独立 App 一样打开使用。</p></div></div>
        
        <div class="guide-pwa-benefits">
          <div><strong>全屏沉浸无干扰</strong><span>隐藏浏览器地址栏与前进后退按键，全屏纯净展示，孩子点读学习更专注、防误触。</span></div>
          <div><strong>系统独立进程长久保活</strong><span>系统为桌面图标分配专属独立沙盒，登录状态长效保持，彻底告别频繁掉登录。</span></div>
          <div><strong>秒开与离线能力</strong><span>学习界面与课程发音由本地智能缓存，网络不佳或离线时也能秒开并完成打卡。</span></div>
        </div>

        <div class="guide-install-steps">
          <article class="guide-install-card">
            <h4>🍎 iPad / iPhone (Safari 浏览器)</h4>
            <ol>
              <li>在系统自带的 <strong>Safari 浏览器</strong> 中打开影伴（若在微信内，先点右上角「···」选择“在 Safari 中打开”）。</li>
              <li>点击屏幕底栏（iPhone）或顶栏（iPad）的 <strong>「分享」图标</strong>（带向上箭头的方框）。</li>
              <li>在弹出的分享菜单中向下滑动，找到并点击 <strong>「添加到主屏幕」</strong>（Add to Home Screen）。</li>
              <li>在右上角确认点击 <strong>「添加」</strong>，桌面就会出现绿色的“影伴”独立应用图标。</li>
            </ol>
          </article>

          <article class="guide-install-card">
            <h4>🤖 Android 平板 / 手机 (Chrome 浏览器)</h4>
            <ol>
              <li>使用系统自带或下载的 <strong>Google Chrome 浏览器</strong> 打开影伴。</li>
              <li>点击浏览器右上角的 <strong>三个点「⋮」</strong> 菜单。</li>
              <li>选择 <strong>「添加到主屏幕」</strong> 或 <strong>「安装应用」</strong>（部分系统底部会直接提示“安装影伴”横幅）。</li>
              <li>点击确认，系统即可在桌面自动生成独立的影伴应用图标。</li>
            </ol>
          </article>

          <article class="guide-install-card">
            <h4>💻 电脑 (Windows PC / Mac)</h4>
            <ol>
              <li>使用 Chrome 或 Edge 浏览器打开影伴网页。</li>
              <li>观察浏览器地址栏最右侧，会看到一个 <strong>显示屏带箭头的「安装应用」小图标</strong>。</li>
              <li>点击该图标并选择 <strong>「安装」</strong>（或在浏览器菜单选择“安装影伴”）。</li>
              <li>安装后自动生成独立桌面快捷方式，支持固定到任务栏或 Dock 栏独立窗口运行。</li>
            </ol>
          </article>
        </div>
      </section>

      <section class="guide-card guide-help-card">
        <h3>遇到问题怎么办？</h3>
        <p>先刷新页面，再确认网络、设备音量和系统语音包。登录、家庭空间或同步异常时，打开右上角账户面板查看具体提示。</p>
      </section>
    </div>
  `));
  mountPiperResourceManager(main.querySelector("[data-piper-resource-manager]"));

  const guideLoginBtn = main.querySelector("[data-action='guide-login']");
  if (guideLoginBtn) {
    guideLoginBtn.onclick = () => document.querySelector("#accountButton")?.click();
  }
}

/* =========================================================
   公共组件
   ========================================================= */
// 学科页头：返回学习 + 内容库，下方为学科色头卡（累计/连续/今日状态）
function subjectHero(moduleId){
  const meta = HOME_SUBJECTS[moduleId] || { tone: "t-green", icon: "graduation" };
  const category = { chinese: "literacy", english: "english", math: "math", book: "book" }[moduleId];
  const available = availableModuleIds().includes(moduleId);
  const done = available && isChecked(moduleId);
  const hero = $(`<div class="subject-head">
    <div class="page-h"><button class="btn white sm" type="button" data-back-learning>${icon("chevronLeft")} 学习</button><span class="sp"></span>${category ? `<div class="${meta.tone}"><button class="btn soft sm" type="button" data-open-library>${icon("library")} 内容库</button></div>` : ""}</div>
    <div class="subj-hero ${meta.tone}"><span class="blob lg solid">${icon(meta.icon)}</span><div><h1 data-page-title>${escapeHtml(contentModuleLabel(moduleId))}</h1><p>${available ? `累计 ${totalChecked(moduleId)} 天 · 连续 ${streak(moduleId)} 天` : "课程准备中"}</p></div><span class="sp"></span>
      ${available ? `<span class="chip ${done ? "t-green" : ""}">${done ? `${icon("checkCircle")} 今日已打卡` : "今日待打卡"}</span>` : ""}</div>
  </div>`);
  hero.querySelector("[data-back-learning]").onclick = () => switchMod("learning");
  hero.querySelector("[data-open-library]")?.addEventListener("click", () => openContentLibrary(category));
  return hero;
}
function modTitle(iconName,t){
  const category = { chinese: "literacy", english: "english", math: "math", book: "book" }[CURRENT_MOD];
  const title = $(`<div class="module-title-row"><div class="module-title"><span class="em blob sm solid t-green">${icon(iconName)}</span><h2 data-page-title>${t}</h2></div>${category ? `<div class="t-green"><button class="btn soft sm" type="button" data-open-library>${icon("library")} 内容库</button></div>` : ""}</div>`);
  title.querySelector("[data-open-library]")?.addEventListener("click", () => openContentLibrary(category));
  return title;
}
function checkinBtn(mod,label){
  const done = isChecked(mod);
  return `<button class="checkin ${done?'done':''}" type="button" data-cmod="${mod}" data-clabel="${label}" aria-pressed="${done}">${done?`${icon("checkCircle")} 今日已打卡 · ${label}（点击取消）`:`${icon("check")} 完成今日打卡 · ${label}`}</button>`;
}

/* =========================================================
   导航切换
   ========================================================= */
function switchMod(mod, options = {}){
  if (mod === "settings" && currentAppMode !== "parent") {
    openParentGate(options);
    return;
  }
  if (mod !== "settings" && mod !== "guide" && currentAppMode === "parent") setAppMode("child");
  if (mod !== CURRENT_MOD) void usageAnalytics.record("view", { view: mod });
  contentLibrary?.close();
  // 同一页面原地重渲染（打卡、开关、步进器）保留滚动位置；切换页面或从导航进入才回到顶部
  const keepScrollY = mod === CURRENT_MOD && !options.resetScroll ? window.scrollY : 0;
  CURRENT_MOD = mod;
  const rerenderOptions = { ...options, resetScroll: false };
  removeWritingPrintRoot();
  stopPoemSpeech();
  // 学科页归属「学习」，Dock 上保持「学习」高亮
  const navMod = ["chinese", "math", "english", "book", "speaking"].includes(mod) ? "learning" : mod;
  document.querySelectorAll(".navbtn").forEach(b=>{
    const active = b.dataset.mod === navMod;
    b.classList.toggle("active", active);
    if(active) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  // 学科页整页套用学科色调（分区标题图标、打卡按钮、档位按钮随之变色）；
  // 积分页的黄色只用于局部，白字不能压在黄底上。
  const mainEl = el("main");
  Object.values(HOME_SUBJECTS).forEach((meta) => mainEl.classList.remove(meta.tone));
  if (navMod === "learning" && HOME_SUBJECTS[mod]) mainEl.classList.add(HOME_SUBJECTS[mod].tone);
  if(mod==="home") renderHome();
  else if(mod==="learning") renderLearning();
  else if(mod==="chinese") renderChinese();
  else if(mod==="math") renderMath();
  else if(mod==="english") renderEnglish();
  else if(mod==="book") renderBook();
  else if(mod==="speaking") renderSpeaking();
  else if(mod==="points") renderPoints();
  else if(mod==="grow") renderGrow();
  else if(mod==="guide") renderGuide();
  else if(mod==="settings") renderSettings(options);
  // 绑定打卡按钮
  el("main").querySelectorAll("[data-cmod]").forEach(btn=>{
    btn.onclick=()=>{
      const m=btn.dataset.cmod;
      toggleCheckin(m);
      switchMod(mod, rerenderOptions);
    };
  });
  el("main").querySelectorAll("[data-content-feedback]").forEach((group) => {
    group.querySelectorAll("button").forEach((button) => {
      button.onclick = () => {
        if (!canWriteLearningState()) return;
        const previous = store;
        const occurrenceId = group.dataset.contentFeedback;
        const feedbackAction = button.dataset.contentObservation;
        const plan = dailyLearningPlan();
        const selectedRow = Object.values(plan?.activities || {}).flat().find((row) => row.occurrenceId === occurrenceId);
        if (!selectedRow) return;
        const learning = button.hasAttribute("data-content-skip")
          ? skipContentItem({ learning: getContentLearningState(store), activityId: selectedRow.activityId, itemId: selectedRow.itemId, skipped: button.dataset.contentSkip === "true", deviceId: contentDeviceId() })
          : button.hasAttribute("data-content-revoke")
            ? revokeContentCompletion({ learning: getContentLearningState(store), occurrenceId, deviceId: contentDeviceId() })
          : feedbackAction === "complete"
            ? recordContentCompletion({ learning: getContentLearningState(store), plan, activityId: selectedRow.activityId, itemId: selectedRow.itemId, dayKey: plan.dayKey, deviceId: contentDeviceId(), completedAt: new Date().toISOString() })
            : setContentFeedback({ learning: getContentLearningState(store), occurrenceId, feedback: feedbackAction, deviceId: contentDeviceId() });
        store = replaceContentLearningState(store, learning);
        if (!save()) store = previous;
        switchMod(mod, rerenderOptions);
      };
    });
  });
  el("main").scrollTop = 0;
  window.scrollTo({ top: keepScrollY });
  updateBackToTopVisibility?.();
}

let updateBackToTopVisibility = null;
function initBackToTop() {
  let backBtn = document.getElementById("btnBackToTop");
  if (!backBtn) {
    backBtn = document.createElement("button");
    backBtn.id = "btnBackToTop";
    backBtn.className = "btn-back-to-top";
    backBtn.type = "button";
    backBtn.setAttribute("aria-label", "回到页面顶部");
    backBtn.innerHTML = `${icon("arrowUp")}<span>顶部</span>`;
    document.body.appendChild(backBtn);

    backBtn.onclick = () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      const mainEl = el("main");
      if (mainEl && mainEl.scrollTop > 0) {
        mainEl.scrollTo({ top: 0, behavior: "smooth" });
      }
      backBtn.blur();
    };
  }

  const update = () => {
    const mainEl = el("main");
    const mainScroll = mainEl ? mainEl.scrollTop : 0;
    const winScroll = window.scrollY || document.documentElement.scrollTop || 0;
    const shouldShow = winScroll > 280 || mainScroll > 280;
    backBtn.classList.toggle("visible", shouldShow);
  };

  window.addEventListener("scroll", update, { passive: true });
  const mainEl = el("main");
  if (mainEl) {
    mainEl.addEventListener("scroll", update, { passive: true });
  }

  updateBackToTopVisibility = update;
  return update;
}

initBackToTop();

document.querySelectorAll(".navbtn").forEach(b=>b.onclick=()=>switchMod(b.dataset.mod, { resetScroll: true }));
document.querySelectorAll("[data-go-home]").forEach((b) => b.onclick = () => switchMod("home", { resetScroll: true }));

// 平板/桌面侧栏可收起为仅图标；状态保存在本机。手机底部 Dock 不受影响（按钮在 CSS 中隐藏）。
const DOCK_COLLAPSED_KEY = "shadow_mate_dock_collapsed";
function setDockCollapsed(collapsed) {
  document.querySelector(".app")?.classList.toggle("dock-collapsed", collapsed);
  const toggle = document.querySelector("[data-nav-collapse]");
  if (toggle) {
    const label = collapsed ? "展开侧边栏" : "收起侧边栏";
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
    toggle.innerHTML = `${icon(collapsed ? "chevronRight" : "chevronLeft")}<span class="dock-label">${collapsed ? "展开" : "收起"}</span>`;
  }
  document.querySelectorAll(".dock-item").forEach((item) => {
    if (collapsed) item.title = item.querySelector(".dock-label")?.textContent || "";
    else item.removeAttribute("title");
  });
}
let dockCollapsed = false;
try { dockCollapsed = localStorage.getItem(DOCK_COLLAPSED_KEY) === "1"; } catch { /* unavailable */ }
document.querySelector("[data-nav-collapse]")?.addEventListener("click", () => {
  dockCollapsed = !dockCollapsed;
  try { localStorage.setItem(DOCK_COLLAPSED_KEY, dockCollapsed ? "1" : "0"); } catch { /* unavailable */ }
  setDockCollapsed(dockCollapsed);
});
hydrateIcons();
setDockCollapsed(dockCollapsed);

const wechatButton = document.querySelector("#wechatButton");
const wechatDialog = document.querySelector("#wechatDialog");
const wechatDialogClose = document.querySelector("#wechatDialogClose");
let wechatDialogTrigger = null;
const closeWechatDialog = () => {
  if (wechatDialog?.open) wechatDialog.close();
};
wechatButton?.addEventListener("click", () => {
  wechatDialogTrigger = document.activeElement;
  wechatDialog?.showModal();
  wechatDialogClose?.focus();
});
wechatDialogClose?.addEventListener("click", closeWechatDialog);
wechatDialog?.addEventListener("click", (event) => {
  if (event.target === wechatDialog) closeWechatDialog();
});
wechatDialog?.addEventListener("close", () => {
  if (wechatDialogTrigger instanceof HTMLElement) wechatDialogTrigger.focus();
  wechatDialogTrigger = null;
});

function setAppMode(mode) {
  currentAppMode = mode;
  document.body.classList.toggle("parent-mode", mode === "parent");
  document.body.classList.toggle("child-mode", mode === "child");
  const gateBtn = document.getElementById("parentGateBtn");
  if (gateBtn) gateBtn.hidden = mode !== "parent";
}
setAppMode("child");

let pendingParentOptions = {};
function openParentGate(options = {}) {
  const gateDialog = document.getElementById("parentGateDialog");
  pendingParentOptions = options;
  if (gateDialog && !gateDialog.open) gateDialog.showModal();
}

(function initParentGate() {
  const gateDialog = document.getElementById("parentGateDialog");
  const gateBtn = document.getElementById("parentGateBtn");
  const closeGateBtn = document.getElementById("closeGateBtn");
  const gateX = document.getElementById("parentGateX");
  const holdBtn = document.getElementById("holdUnlockBtn");
  const holdBtnText = document.getElementById("holdBtnText");

  if (!gateDialog || !gateBtn || !holdBtn) return;

  gateBtn.addEventListener("click", () => switchMod("home"));
  const closeGate = () => { if (gateDialog.open) gateDialog.close(); };
  closeGateBtn?.addEventListener("click", closeGate);
  gateX?.addEventListener("click", closeGate);

  // E2E 可通过 window.__SM_PARENT_GATE_MS__ 缩短长按时长；门禁用于防误触，不是权限边界
  const holdDuration = () => Number(window.__SM_PARENT_GATE_MS__) || 3000;
  let holdFrame = 0;
  let holdStartTime = 0;

  function setProgress(progress) {
    holdBtn.style.setProperty("--p", String(progress));
    if (holdBtnText) {
      holdBtnText.textContent = progress > 0 ? `再按 ${Math.ceil(3 - progress * 3)} 秒` : "长按 3 秒";
    }
  }
  function tick() {
    const progress = Math.min(1, (performance.now() - holdStartTime) / holdDuration());
    setProgress(progress);
    if (progress < 1) {
      holdFrame = requestAnimationFrame(tick);
      return;
    }
    holdFrame = 0;
    closeGate();
    setProgress(0);
    setAppMode("parent");
    soundEffects?.play?.("points_earned");
    const options = pendingParentOptions;
    pendingParentOptions = {};
    switchMod("settings", options);
  }
  function startHold(event) {
    if (holdFrame) return;
    event.preventDefault();
    holdStartTime = performance.now();
    soundEffects?.play?.("action_completed");
    holdFrame = requestAnimationFrame(tick);
  }
  function cancelHold() {
    if (!holdFrame) return;
    cancelAnimationFrame(holdFrame);
    holdFrame = 0;
    setProgress(0);
  }

  holdBtn.addEventListener("pointerdown", startHold);
  holdBtn.addEventListener("pointerup", cancelHold);
  holdBtn.addEventListener("pointerleave", cancelHold);
  holdBtn.addEventListener("pointercancel", cancelHold);
  holdBtn.addEventListener("contextmenu", (event) => event.preventDefault());
  // 键盘用户：按住空格或回车同样需要满 3 秒
  holdBtn.addEventListener("keydown", (event) => {
    if ((event.key === " " || event.key === "Enter") && !event.repeat) startHold(event);
    else if (event.key === " " || event.key === "Enter") event.preventDefault();
  });
  holdBtn.addEventListener("keyup", (event) => { if (event.key === " " || event.key === "Enter") cancelHold(); });
  holdBtn.addEventListener("blur", cancelHold);
  gateDialog.addEventListener("close", cancelHold);
})();

// 顶栏学习者头像
document.querySelectorAll(".top-kid-ava").forEach((node) => { node.innerHTML = kidAvatar("#7CC8F2"); });

// 日期显示
(function(){
  const d=new Date();
  const wk=["日","一","二","三","四","五","六"][d.getDay()];
  el("datepill").textContent=`${d.getMonth()+1}月${d.getDate()}日 周${wk}`;
})();

// 初始渲染
switchMod("home");

// Compatibility for the existing browser harness; no independent state.
window.learningDesk = learningDesk;
learningDesk.getPersistenceScope = getHanziLearnerScope;
learningDesk.renderCurrent = () => switchMod(CURRENT_MOD);
learningDesk.activateScope = async (scope, options = {}) => {
  if (typeof scope !== "string" || !scope.trim() || !learnerSession.canTransition()) return false;
  const nextScope = scope === "anonymous"
    ? { household_id: null, profile_id: null }
    : { household_id: "compatibility-household", profile_id: scope.replace(/^profile:/, "") };
  await learningDesk.setScope(nextScope);
  return learningDesk.replaceState(options.state || {}, { persist: options.persist !== false, render: options.render !== false });
};

void growthLoopController.hydrate().catch((error) => {
  console.warn("Growth Loop 本地数据库初始化失败，已保持只读推荐项：", error);
});
