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
        button.innerHTML = buttonContent("volume", originalLabel);
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
      button.innerHTML = buttonContent("alert", message);
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
    button.innerHTML = buttonContent("volume", label);
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
  main.appendChild($(`
    <div class="banner">
      <div class="t">${icon("construction")} 挖掘机小队长，今天也要加油哦！</div>
      <div class="d">${learningOn
        ? `今日已打卡 ${checkedToday}/${enabled.length} 个学习模块${summaries.length ? ` · ${escapeHtml(summaries.join(" · "))}` : ""}`
        : `学习包还没有启用，去「学习」页为这个孩子开启学习模块吧`}</div>
    </div>
  `));

  const accountBtn = document.querySelector("#accountButton");
  const isOnline = accountBtn?.dataset?.state === "online";
  let guestDismissed = false;
  try {
    guestDismissed = sessionStorage.getItem("shadow_mate_guest_banner_dismissed") === "1";
  } catch (_) {}

  if (!isOnline && !guestDismissed) {
    const isWeChat = typeof navigator !== "undefined" && /MicroMessenger/i.test(navigator.userAgent || "");
    const guestCard = $(`
      <div class="guest-sync-prompt" data-guest-card>
        <div class="guest-onboarding-header">
          <div class="guest-onboarding-badge">${icon("cloud")} 离线试用中 · 本机保存</div>
          <button class="guest-onboarding-close" type="button" aria-label="暂不提醒" data-dismiss-guest>×</button>
        </div>
        <div class="guest-onboarding-title">开启家庭空间，打卡记录换手机不丢失</div>
        <div class="guest-onboarding-desc">
          当前数据仅保存在此设备。家长免费登录后即可建立家庭档案，手机、平板或电脑跨端实时同步。
        </div>
        ${isWeChat ? `<div class="guest-onboarding-wechat">${icon("compass")} 微信提示：点击右上角「···」在系统浏览器中打开，体验完整发音并可添加到桌面独立使用。</div>` : ""}
        <div class="guest-onboarding-actions">
          <button class="guest-onboarding-btn primary" type="button" data-action="guest-login">
            ${icon("learner")} 家长登录 / 开启家庭空间
          </button>
          <button class="guest-onboarding-btn secondary" type="button" data-action="guest-guide">
            ${icon("compass")} 使用指南
          </button>
        </div>
      </div>
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
    main.appendChild(guestCard);
  }

  if (learningOn) {
    const moduleStats = enabled.map((module) => ({
      value: module === "chinese" ? streak("chinese") : totalChecked(module),
      caption: module === "chinese" ? "语文连续(天)" : `${contentModuleLabel(module)}累计打卡`,
    }));
    const stat = $(`
      <div class="card">
        <h3>${icon("chart")} 今日成长数据</h3>
        <div class="stat-grid">
          <div class="stat"><div class="n">${checkedToday}/${enabled.length}</div><div class="t">今日打卡</div></div>
          ${moduleStats.map((s) => `<div class="stat"><div class="n">${s.value}</div><div class="t">${s.caption}</div></div>`).join("")}
        </div>
        <div class="progressbar"><i></i></div>
      </div>
    `);
    main.appendChild(stat);
    stat.querySelector(".progressbar i").style.width = (checkedToday/enabled.length*100)+"%";
  }

  // 统一学习入口 + 积分
  const mk = (mod,iconName,t,d,pillText)=>$(`
    <button class="card card-action" type="button" data-go="${mod}">
      <h3>${icon(iconName)} ${t}</h3>
      <div class="desc">${d}</div>
      <span class="pill">${pillText || (isChecked(mod)?`${icon("checkCircle")} 今日已打卡`:"今日待打卡")}</span>
    </button>
  `);
  main.appendChild(mk("learning","graduation","学习", learningOn ? "语文 · 数学 · 英语 · 绘本，按孩子启停" : "学习包未启用，点此开启", learningOn ? "学习" : "未启用"));
  main.appendChild(mk("points","star","积分打卡","加分减分 · 月度行为积分表"));
  main.querySelectorAll("[data-go]").forEach(c=>c.onclick=()=>switchMod(c.dataset.go));
  main.appendChild($(`<div class="footer">${icon("construction")} 本机离线保存 · 家长登录后自动同步云端</div>`));
}

function renderLearning(){
  const main = el("main"); main.innerHTML="";
  const titleRow = $(`
    <div class="module-title-row">
      <div class="module-title"><span class="em">${icon("graduation")}</span><h2>学习</h2></div>
      <div class="module-title-actions"><button class="btn-subtle" type="button" data-open-library>${icon("library")} 内容库</button><button class="btn-subtle" type="button" data-go-settings="learning" aria-label="学习设置">${icon("settings")} 学习设置</button></div>
    </div>
  `);
  main.appendChild(titleRow);
  titleRow.querySelector("[data-open-library]").onclick = () => openContentLibrary();

  const enabled = enabledModuleIds();
  if (enabled.length) {
    const entries = enabled.map((moduleId) => {
      const module = getContentModuleDefinition(moduleId);
      const available = availableModuleIds().includes(moduleId);
      const done = available && isChecked(moduleId);
      return `<button class="card card-action" type="button" data-go="${escapeHtml(module.content_entry)}">
        <h3>${icon(module.icon_key)} ${escapeHtml(module.name)}</h3>
        <div class="desc">${available ? `${done ? "今日已完成" : "今日待打卡"} · 累计 ${totalChecked(moduleId)} 天 · 连续 ${streak(moduleId)} 天` : "课程准备中，暂不计入打卡统计"}</div>
        <span class="pill">${available ? (done ? `${icon("checkCircle")} 今日已打卡` : "今日待打卡") : "准备中"}</span>
      </button>`;
    }).join("");
    main.appendChild($(`
      <div class="card">
        <h3>${icon("list")} 学习模块</h3>
        ${entries}
      </div>
    `));
    main.querySelectorAll("[data-go]").forEach((c) => (c.onclick = () => switchMod(c.dataset.go)));
  } else {
    main.appendChild($(`
      <div class="card">
        <h3>${icon("sprout")} 学习模块未启用</h3>
        <div class="desc">当前孩子的启蒙学习包未开启或各学科已关闭。可在「学习设置」中开启学习包并勾选需要的学科。</div>
        <button class="checkin" type="button" data-go-settings="learning">${icon("settings")} 前往设置开启模块</button>
      </div>
    `));
  }
  main.querySelectorAll("[data-go-settings]").forEach((btn) => {
    btn.onclick = () => switchMod("settings", { tab: btn.dataset.goSettings });
  });
  main.appendChild($(`<div class="footer">${icon("construction")} 本机离线保存 · 登录后跨设备同步</div>`));
}

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
  main.appendChild(modTitle("book","语文学习"));

  const chineseSections = [
    { id: "section-chinese-literacy", label: "识字打卡", icon: "pen" },
    { id: "section-chinese-poem", label: "古诗听读", icon: "bookMarked" },
    { id: "section-chinese-writing", label: "写字练习", icon: "pencil" },
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
        <h3>${icon("pen")} 识字打卡 <span class="pill">生活识字 · 按实际记录复习</span></h3>
        <button class="card-collapse-toggle" type="button" aria-label="展开或收起识字打卡">
          <span class="card-collapse-label">收起</span>
          <span class="card-collapse-icon">${icon("chevronDown")}</span>
        </button>
      </div>
      <div class="card-collapse-body">
        <div class="desc">每天最多 ${litLimits.new} 个新字和 ${litLimits.review} 个复习字。未完成的内容继续保留，点读不代表已经掌握。</div>
        <div class="grid2">${literacyRows.map((row, index) => `
          <div class="mini-card speech-tap" role="button" tabindex="0" data-hanzi-mini="${index}" data-content-reason="${row.reason}" aria-label="点读生字：${escapeHtml(row.item.glyph)}，${escapeHtml(row.item.word)}">
            ${contentFeedbackHtml(row)}
            <div class="big">${escapeHtml(row.item.glyph)}</div>
            <div class="py">${escapeHtml(row.item.pinyin)}</div>
            <div class="label">${escapeHtml(row.item.word)}${row.reason === "review" ? " · 复习" : ""}</div>
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
  main.appendChild(modTitle("calculator","数学与数感"));

  const mathSections = [
    { id: "section-math-mental", label: "口算打卡", icon: "calculator" },
    { id: "section-math-sense", label: "生活数感", icon: "brain" },
    { id: "section-math-sequence", label: "数字规律", icon: "dice" },
    { id: "section-math-sudoku", label: "简单数独", icon: "grid" },
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
  main.appendChild(modTitle("languages","英语学习"));
  // 每日快照与首页共享，未体验的单词继续保留。
  const card1 = $(`
    <div class="card card-collapsible">
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
        ${rows.map((row, index) => `<div class="word-card" data-content-reason="${row.reason}">
          ${contentFeedbackHtml(row)}
          ${renderEnglishVisual(row.item.word, row.item.theme, row.item.meaning)}
          <div class="word-en">${escapeHtml(row.item.word)}</div>
          <div class="word-ph">${escapeHtml(row.item.phonetic)}</div>
          <div class="word-cn">${escapeHtml(row.item.meaning)} · ${escapeHtml(row.item.theme)}${row.reason === "review" ? " · 复习" : ""}</div>
          <div class="desc">${escapeHtml(row.item.prompt || "和家长一起听一听，在生活中找找它。")}</div>
          <button class="speak-btn" type="button" data-speak="${index}" data-label="听发音">${buttonContent("volume", "听发音")}</button>
        </div>`).join("")}
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
    <div class="card card-collapsible">
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

function renderSectionTabs(sections) {
  if (!Array.isArray(sections) || sections.length === 0) return null;
  const container = document.createElement("nav");
  container.className = "section-nav-tabs";
  container.setAttribute("role", "tablist");
  container.setAttribute("aria-label", "页面板块快速跳转");

  let isClickScrolling = false;
  let clickTimeout = null;

  const setActiveTab = (targetId) => {
    container.querySelectorAll(".section-nav-tab").forEach((t) => {
      const match = t.dataset.targetSection === targetId;
      t.classList.toggle("active", match);
      t.setAttribute("aria-selected", match ? "true" : "false");
      if (match) {
        // 仅在横向溢出时轻量调整 TAB 容器自身的 scrollLeft，严禁调用 t.scrollIntoView 阻断页面纵向滚动
        const cRect = container.getBoundingClientRect();
        const tRect = t.getBoundingClientRect();
        if (tRect.left < cRect.left) {
          container.scrollLeft += (tRect.left - cRect.left) - 8;
        } else if (tRect.right > cRect.right) {
          container.scrollLeft += (tRect.right - cRect.right) + 8;
        }
      }
    });
  };

  sections.forEach((sec, idx) => {
    const tabBtn = document.createElement("button");
    tabBtn.type = "button";
    tabBtn.className = `section-nav-tab ${idx === 0 ? "active" : ""}`;
    tabBtn.setAttribute("role", "tab");
    tabBtn.setAttribute("aria-selected", idx === 0 ? "true" : "false");
    tabBtn.setAttribute("data-target-section", sec.id);
    tabBtn.innerHTML = `${sec.icon ? icon(sec.icon) : ""} <span>${escapeHtml(sec.label)}</span>`;

    tabBtn.onclick = () => {
      const target = document.getElementById(sec.id);
      if (!target) return;

      isClickScrolling = true;
      if (clickTimeout) clearTimeout(clickTimeout);
      setActiveTab(sec.id);

      const toggleBtn = target.querySelector('.card-collapse-toggle[aria-expanded="false"]');
      if (toggleBtn) {
        toggleBtn.click();
      }

      if (typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      clickTimeout = setTimeout(() => {
        isClickScrolling = false;
      }, 800);
    };

    container.appendChild(tabBtn);
  });

  let ticking = false;
  const onScroll = () => {
    if (isClickScrolling) return;
    if (!ticking) {
      window.requestAnimationFrame(() => {
        if (!container.isConnected) {
          window.removeEventListener("scroll", onScroll);
          return;
        }
        const scrollPosition = window.scrollY + 130;
        let currentSectionId = sections[0].id;

        for (let i = 0; i < sections.length; i++) {
          const el = document.getElementById(sections[i].id);
          if (el) {
            const top = el.getBoundingClientRect().top + window.scrollY;
            if (scrollPosition >= top) {
              currentSectionId = sections[i].id;
            }
          }
        }
        setActiveTab(currentSectionId);
        ticking = false;
      });
      ticking = true;
    }
  };

  window.addEventListener("scroll", onScroll, { passive: true });

  return container;
}

function renderGrow(){
  const main = el("main"); main.innerHTML="";
  const titleRow = $(`
    <div class="module-title-row">
      <div class="module-title"><span class="em">${icon("sprout")}</span><h2>成长记录</h2></div>
      <button class="btn-subtle" type="button" data-go-settings="growth" aria-label="成长设置">${icon("settings")} 成长设置</button>
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
      <div class="module-title"><span class="em">${icon("star")}</span><h2>积分打卡</h2></div>
      <button class="btn-subtle" type="button" data-go-settings="points" aria-label="积分设置">${icon("settings")} 积分设置</button>
    </div>
  `);
  main.appendChild(titleRow);
  titleRow.querySelector("[data-go-settings]").onclick = () => switchMod("settings", { tab: "points" });

  const pointsSections = [
    { id: "section-points-checkin", label: "习惯打卡", icon: "checkCircle" },
    { id: "section-points-calendar", label: "打卡日历", icon: "calendar" },
  ];
  const tabs = renderSectionTabs(pointsSections);
  if (tabs) main.appendChild(tabs);

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

  // 挖掘机主题横幅
  main.appendChild($(`<div class="exc-banner">
      <div class="em">${icon("construction")}</div>
      <div><div class="t">挖掘机小队长 · 积分打卡榜</div><div class="d">完成好习惯就点亮小星星，绿挖挖帮你攒积分！</div></div>
      <div class="badge">${icon("star")} ${mt>0?'+':''}${mt} 分</div>
    </div>`));

  // 顶部统计
  main.appendChild($(`<div class="card">
      <h3>${icon("construction")} 本月积分</h3>
      <div class="stat-grid">
        <div class="stat"><div class="n">${mt>0?'+':''}${mt}</div><div class="t">本月累计</div></div>
        <div class="stat"><div class="n">${dt>0?'+':''}${dt}</div><div class="t">${activeDay}日积分</div></div>
      </div>
    </div>`));

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
  main.appendChild(modTitle("library","绘本读物"));

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
    <div class="card card-collapsible">
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
    const emptyBookCard = $(`<div class="card card-collapsible">
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
    <div class="card card-collapsible">
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
    <div class="card card-collapsible">
      <div class="card-collapse-header">
        <h3>${icon("bookOpenCheck")} 共读参考书单 <span class="pill">自由选读</span></h3>
        <button class="card-collapse-toggle" type="button" aria-label="展开或收起共读参考书单">
          <span class="card-collapse-label">收起</span>
          <span class="card-collapse-icon">${icon("chevronDown")}</span>
        </button>
      </div>
      <div class="card-collapse-body">
        <div class="desc">按孩子的兴趣和当前阅读状态选择童书或分级读物，级别不代表年龄要求。点一下标记已读，也可添加自己的阅读记录。</div>
        <div class="grid2">${peanutRead}</div>
        <div class="spacer-12"></div>
        <div class="pts-sec">${icon("notebook")} 我的阅读记录</div>
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
  main.appendChild(card3);
  makeCollapsible(card3, "book_peanut", false);

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
  const starEls = card3.querySelectorAll(".pstar");
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
  card3.querySelectorAll("[data-del]").forEach(x=>x.onclick=()=>{
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
  main.appendChild(modTitle("volume", "语言听说"));
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
  if (options?.tab) {
    currentSettingsTab = options.tab;
  }
  const main = el("main"); main.innerHTML="";
  main.appendChild(modTitle("settings","设置"));

  const tabs = [
    { id: "learning", icon: "graduation", label: "学习设置" },
    { id: "points", icon: "star", label: "积分规则" },
    { id: "growth", icon: "sprout", label: "愿望成长" },
    { id: "sound", icon: "volume", label: "声音音效" },
    { id: "privacy", icon: "shield", label: "隐私" },
  ];
  const tabsBar = $(`
    <div class="settings-tabs" role="tablist" aria-label="设置分类">
      ${tabs.map((tab) => `
        <button class="settings-tab ${currentSettingsTab === tab.id ? "active" : ""}" 
                type="button" 
                role="tab" 
                data-tab="${tab.id}" 
                aria-selected="${currentSettingsTab === tab.id}">
          ${icon(tab.icon)} ${tab.label}
        </button>
      `).join("")}
    </div>
  `);
  main.appendChild(tabsBar);
  const activeTab = tabsBar.querySelector(".settings-tab.active");
  const hiddenWidth = activeTab?.getBoundingClientRect().right - tabsBar.getBoundingClientRect().right;
  if (hiddenWidth > 0) tabsBar.scrollLeft += hiddenWidth + 8;
  tabsBar.querySelectorAll(".settings-tab").forEach((btn) => {
    btn.onclick = () => {
      currentSettingsTab = btn.dataset.tab;
      renderSettings();
    };
  });

  if (currentSettingsTab === "learning") {
    renderSettingsLearning(main);
  } else if (currentSettingsTab === "points") {
    renderSettingsPoints(main);
  } else if (currentSettingsTab === "growth") {
    renderSettingsGrowth(main);
  } else if (currentSettingsTab === "sound") {
    renderSettingsSound(main);
  } else if (currentSettingsTab === "privacy") {
    renderSettingsPrivacy(main);
  }
}

function renderSettingsPrivacy(main) {
  const status = usageAnalytics.status();
  const card = $(`<div class="card">
    <h3>${icon("shield")} 体验改进</h3>
    <label class="switch-row">
      <span class="switch-label"><strong>使用统计</strong><span class="desc">收集使用数据，帮助改进产品体验。</span></span>
      <input id="usageConsent" type="checkbox" class="switch" role="switch" aria-label="使用统计" ${status.configured && status.consent ? "checked" : ""} ${status.configured ? "" : "disabled"}>
    </label>
    <a class="guide-link" href="/privacy" target="_blank" rel="noopener">隐私政策</a>
  </div>`);
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
    <div class="card">
      <h3>${icon("grid")} 学习包设置</h3>
      <div class="desc" style="font-weight:700;margin-top:8px;">推荐阶段（支持多选，至少选 1 项）</div>
      <div class="package-list" role="group" aria-label="选择学习包">
        ${LEARNING_PACKAGES.map((item) => `
          <label class="switch-row">
            <span class="switch-label"><strong>${escapeHtml(item.name)}</strong><span class="desc">建议年龄 ${escapeHtml(item.suggested_age)} 岁 · ${escapeHtml(item.description)}</span></span>
            <input type="checkbox" class="switch" data-package-toggle="${item.id}" ${config.package_ids.includes(item.id) ? "checked" : ""} aria-label="选择 ${escapeHtml(item.name)}">
          </label>
        `).join("")}
      </div>
      <div class="desc">按孩子独立启停。关闭模块只影响入口和统计，不会删除学习历史。</div>
      <div class="desc">调整后将即时按新推荐节奏安排；已完成打卡的内容保持记录不变。复习间隔表示练习节奏，不表示掌握程度。</div>
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
      <label class="switch-row">
        <span class="switch-label"><strong>启用学习包</strong><span class="desc">关闭后首页和成长记录隐藏学习模块统计</span></span>
        <input type="checkbox" class="switch" ${config.enabled ? "checked" : ""} data-config-toggle="package" aria-label="启用学习包">
      </label>
      ${ALL_CONTENT_MODULES.map((module) => `
      <label class="switch-row">
        <span class="switch-label"><strong>${icon(module.icon_key)} ${escapeHtml(module.name)}</strong><span class="desc">${module.id === "speaking" ? "可选 · 课程和音频准备中，暂不计入打卡统计" : `累计 ${totalChecked(module.id)} 天 · 连续 ${streak(module.id)} 天`}</span></span>
        <input type="checkbox" class="switch" ${config.modules[module.id] ? "checked" : ""} data-config-toggle="module" data-module-id="${module.id}" aria-label="启用 ${escapeHtml(module.name)}">
      </label>`).join("")}
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
    <div class="card growth-custom-card">
      <h3>${icon("pencil")} 自定义积分项</h3>
      <div class="desc">把成长任务纳入积分管理：正数是加分，负数是扣分；每个孩子可以有自己的分值。</div>
      <form id="pointItemForm" class="growth-form">
        <label>项目名称<input name="name" maxlength="60" required placeholder="例如：自己刷牙"></label>
        <label>分值<input name="points" type="number" min="-1000" max="1000" step="1" required placeholder="例如：2"></label>
        <button class="checkin" type="submit">${icon("plus")} 添加积分项</button>
      </form>
      ${customItems.length ? `
        <div class="desc mt-12" style="font-weight:700;">已添加的自定义积分项：</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
          ${customItems.map(it => `<span class="pill" style="padding:4px 8px;font-size:12px;">${escapeHtml(it.name)} (${Number(it.default_points) > 0 ? '+' : ''}${it.default_points}分)</span>`).join("")}
        </div>
      ` : ""}
    </div>
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
          <button class="checkin" type="submit">${icon("check")} 确认期初积分</button>
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
    <div class="card growth-custom-card">
      <h3>${icon("gift")} 添加心愿奖品</h3>
      <div class="desc">设定孩子期待兑换的心愿奖品与兑换所需积分。</div>
      <form id="rewardForm" class="growth-form">
        <label>奖品名称<input name="name" maxlength="60" required placeholder="例如：去一次游乐园"></label>
        <label>所需积分<input name="cost" type="number" min="1" max="100000" step="1" required placeholder="例如：10"></label>
        <button class="checkin" type="submit">${icon("plus")} 添加心愿奖品</button>
      </form>
      ${existingRewards.length ? `
        <div class="desc mt-12" style="font-weight:700;">已设定的心愿奖品：</div>
        <div class="reward-list mt-8">
          ${existingRewards.map(r => `
            <div class="reward-card">
              <div class="reward-icon">${icon(r.icon_key || "gift")}</div>
              <div class="reward-info">
                <strong>${escapeHtml(r.name)}</strong>
                <span>${escapeHtml(r.description || "家庭约定奖励")}</span>
              </div>
              <span class="pts-badge">${r.cost_points || 0}分</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
    </div>
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
    <div class="card">
      <h3>${icon("volume")} 界面音效总开关与音量</h3>
      <div class="sound-row">
        <span class="sound-label">启用界面音效</span>
        <button class="sound-switch ${settings.enabled?"on":""}" type="button" id="snd-master" role="switch" aria-checked="${settings.enabled}">${settings.enabled?"开":"关"}</button>
      </div>
      <div class="sound-row">
        <span class="sound-label" id="snd-volume-label">${masterLabelText}</span>
        <input class="sound-range" type="range" id="snd-volume" min="0" max="200" step="5" value="${masterVol}" aria-label="总音量" ${settings.enabled?"":"disabled"}>
      </div>
      <div class="desc">控制点击、打卡、获得积分等界面操作音效。</div>
    </div>
  `));
  const speechVol = Math.round((settings.speechVolume ?? 0.6)*100);
  const speechLabelText = `朗读音量 ${speechVol}%${speechVol > 100 ? " (超额增强)" : ""}`;
  main.appendChild($(`
    <div class="card">
      <h3>${icon("volume")} 课程语音朗读音量</h3>
      <div class="sound-row">
        <span class="sound-label" id="speech-volume-label">${speechLabelText}</span>
        <input class="sound-range" type="range" id="speech-volume" min="0" max="200" step="5" value="${speechVol}" aria-label="课程语音朗读音量">
      </div>
      <div class="sound-event-controls" style="margin-top: 10px;">
        <button class="checkin sound-preview" type="button" id="speech-preview">${icon("play")} 试听示范发音</button>
      </div>
      <div class="desc">控制汉字发音、英文单词和字意朗读的音量。</div>
    </div>
  `));
  const eventsCard = $(`<div class="card"><h3>${icon("list")} 事件音效</h3><div class="sound-events"></div></div>`);
  main.appendChild(eventsCard);
  const list = eventsCard.querySelector(".sound-events");
  for (const key of SOUND_EVENT_KEYS) {
    const def = SOUND_EVENTS[key];
    const eventSettings = settings.events[key];
    const variantOptions = Object.entries(def.variants).map(([variantKey, variant]) =>
      `<option value="${variantKey}" ${variantKey===eventSettings.variant?"selected":""}>${variant.name}</option>`
    ).join("");
    list.appendChild($(`
      <div class="sound-event" data-event="${key}">
        <div class="sound-event-head">
          <span class="sound-label">${def.label}</span>
          <button class="sound-switch ${eventSettings.enabled?"on":""}" type="button" data-event-enable="${key}" role="switch" aria-checked="${eventSettings.enabled}">${eventSettings.enabled?"开":"关"}</button>
        </div>
        <div class="sound-event-controls">
          <select data-event-variant="${key}" aria-label="${def.label}变体" ${eventSettings.enabled?"":"disabled"}>${variantOptions}</select>
          <button class="checkin sound-preview" type="button" data-event-preview="${key}">${icon("play")} 试听</button>
        </div>
      </div>
    `));
  }
  main.appendChild($(`
    <div class="card">
      <button class="checkin danger" id="snd-reset" type="button">${icon("rotate")} 恢复默认设置</button>
      <div class="desc">恢复为默认的总开关、音效音量、语音朗读音量与每个事件的变体选择。</div>
    </div>
  `));
  main.appendChild($(`<div class="footer">${icon("settings")} 声音设置只保存在当前设备，不会同步到云端。</div>`));

  el("snd-master").onclick = () => {
    soundEffects.setEnabled(!soundEffects.getSettings().enabled);
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
  main.querySelectorAll("[data-event-enable]").forEach((button) => button.onclick = () => {
    soundEffects.setEventEnabled(button.dataset.eventEnable, !soundEffects.getSettings().events[button.dataset.eventEnable].enabled);
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

function renderGuide(){
  const accountBtn = document.querySelector("#accountButton");
  const isOnline = accountBtn?.dataset?.state === "online";

  const main = el("main");
  main.innerHTML = "";
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
function modTitle(iconName,t){
  const category = { chinese: "literacy", english: "english", math: "math", book: "book" }[CURRENT_MOD];
  const title = $(`<div class="module-title-row"><div class="module-title"><span class="em">${icon(iconName)}</span><h2>${t}</h2></div>${category ? `<button class="btn-subtle" type="button" data-open-library>${icon("library")} 内容库</button>` : ""}</div>`);
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
  if (mod !== CURRENT_MOD) void usageAnalytics.record("view", { view: mod });
  contentLibrary?.close();
  CURRENT_MOD = mod;
  removeWritingPrintRoot();
  stopPoemSpeech();
  document.querySelectorAll(".navbtn").forEach(b=>{
    const active = b.dataset.mod === mod;
    b.classList.toggle("active", active);
    if(active) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
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
      switchMod(mod, options);
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
        switchMod(mod, options);
      };
    });
  });
  el("main").scrollTop = 0;
  window.scrollTo({ top: 0 });
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

document.querySelectorAll(".navbtn").forEach(b=>b.onclick=()=>switchMod(b.dataset.mod));
hydrateIcons();

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
