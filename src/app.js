import { inject } from "@vercel/analytics";
import { getActiveHanziWritingPack } from "./content/hanzi-writing/manifest.js";
import {
  renderWritingPrintSheetHtml,
  renderWritingWorksheetHtml,
} from "./hanzi-writing-view.js";
import { openWritingPrintWindow } from "./writing-print.js";
import {
  recordWorksheetCompletion,
  resolveDailyWorksheet,
} from "./hanzi-worksheet-rotation.js";
import { buildMissingSequence, escapeHtml } from "./lib.js";
import { startVersionGuard } from "./version-guard.js";
import { installRapidActionGuard } from "./action-lock.js";
import { mountPiperResourceManager } from "./piper-resource-ui.js";
import { createPublishedSpeechPlayer } from "./tencent-tts-player.js";
import { icon, hydrateIcons } from "./icons.js";
import {
  createLearningState,
  getHanziRotationState,
  hasCompatibleHanziRotationScope,
  hasCheckin,
  replaceHanziRotationState,
  transitionLearningState,
} from "./learning-state.js";
import { getLearningStateStorageKey, migrateLegacyLearningState } from "./learning-state-envelope.js";
import {
  FOUNDATION_PACKAGE,
  getContentModuleDefinition,
  getEnabledModuleIds,
  normalizeContentConfig,
  setContentModuleEnabled,
  setContentPackageEnabled,
} from "./learning-content-package.js";
import {
  clearLearningDeskStorage,
  loadLearningStateEnvelope,
  adoptPendingLearningState,
} from "./learning-state-storage.js";
import { createIndexedDbLearningDb } from "./learning-local-db.js";
import { createGrowthLoopController } from "./learning-growth-loop-controller.js";
import { ACTIVITY_EVENT_TYPES, activityEventIdFor } from "./learning-analytics.js";
import { buildLegacyPointEntries, getActivePointAction, getBalance, getLegacyPeriodTotal, getLegacyPointsImport, getOpeningBalance, getPointDayTotal, getPointPeriodTotal } from "./learning-growth-loop.js";

inject();
installRapidActionGuard(document);
startVersionGuard({ checkIntervalMs: 60_000 });
const publishedSpeechPlayer = createPublishedSpeechPlayer();

/* =========================================================
   影伴学习任务台 —— 数据层
   ========================================================= */
const HANZI = [
  ["一","yī","一个"],["二","èr","二月"],["三","sān","三天"],["十","shí","十天"],["人","rén","大人"],
  ["口","kǒu","口水"],["手","shǒu","小手"],["日","rì","日子"],["月","yuè","月儿"],["水","shuǐ","水果"],
  ["火","huǒ","火山"],["木","mù","木头"],["山","shān","大山"],["石","shí","石头"],["田","tián","田地"],
  ["土","tǔ","土地"],["上","shàng","上下"],["下","xià","下雨"],["大","dà","大门"],["小","xiǎo","小猫"],
  ["中","zhōng","中间"],["天","tiān","天空"],["王","wáng","王子"],["马","mǎ","马车"],["牛","niú","水牛"],
  ["羊","yáng","山羊"],["鸟","niǎo","小鸟"],["虫","chóng","虫子"],["云","yún","白云"],["雨","yǔ","下雨"],
  ["风","fēng","大风"],["花","huā","花朵"],["草","cǎo","小草"],["树","shù","大树"],["叶","yè","叶子"],
  ["米","mǐ","大米"],["牙","yá","牙齿"],["目","mù","目光"],["耳","ěr","耳朵"],["足","zú","足球"],
  ["心","xīn","开心"],["头","tóu","头发"],["力","lì","力气"],["刀","dāo","小刀"],["尺","chǐ","尺子"],
  ["书","shū","书本"],["笔","bǐ","铅笔"],["学","xué","学习"],["生","shēng","学生"],["门","mén","大门"],
  ["车","chē","火车"],["飞","fēi","飞机"],["鱼","yú","小鱼"],["瓜","guā","西瓜"],["果","guǒ","水果"],
  ["豆","dòu","红豆"],["红","hóng","红色"],["白","bái","白云"],["黑","hēi","黑夜"],["黄","huáng","黄色"],
  ["开","kāi","开门"],["关","guān","关门"],["来","lái","来去"],["去","qù","回去"],["多","duō","多少"],
  ["少","shǎo","多少"],["前","qián","前面"],["后","hòu","后面"],["左","zuǒ","左边"],["右","yòu","右边"],
  ["里","lǐ","里面"],["外","wài","外面"],["东","dōng","东西"],["西","xī","东西"],["南","nán","南方"],
  ["北","běi","北方"],["春","chūn","春天"],["夏","xià","夏天"],["秋","qiū","秋天"],["冬","dōng","冬天"],
  ["早","zǎo","早上"],["晚","wǎn","晚上"],["明","míng","明天"],["年","nián","新年"],["时","shí","时间"],
  ["走","zǒu","走路"],["跑","pǎo","跑步"],["跳","tiào","跳高"],["笑","xiào","笑话"],["哭","kū","哭声"],
  ["好","hǎo","好人"],["坏","huài","坏事"],["高","gāo","高山"],["低","dī","低头"],["长","cháng","长河"],
  ["短","duǎn","短发"],["方","fāng","方块"],["圆","yuán","圆圈"]
];

const POEMS = [
  {g:"一年级上",t:"咏鹅",a:"骆宾王",c:["鹅，鹅，鹅，","曲项向天歌。","白毛浮绿水，","红掌拨清波。"]},
  {g:"一年级上",t:"静夜思",a:"李白",c:["床前明月光，","疑是地上霜。","举头望明月，","低头思故乡。"]},
  {g:"一年级上",t:"悯农（其二）",a:"李绅",c:["锄禾日当午，","汗滴禾下土。","谁知盘中餐，","粒粒皆辛苦。"]},
  {g:"一年级上",t:"画",a:"王维",c:["远看山有色，","近听水无声。","春去花还在，","人来鸟不惊。"]},
  {g:"一年级上",t:"风",a:"李峤",c:["解落三秋叶，","能开二月花。","过江千尺浪，","入竹万竿斜。"]},
  {g:"一年级上",t:"古朗月行（节选）",a:"李白",c:["小时不识月，","呼作白玉盘。","又疑瑶台镜，","飞在青云端。"]},
  {g:"一年级下",t:"春晓",a:"孟浩然",c:["春眠不觉晓，","处处闻啼鸟。","夜来风雨声，","花落知多少。"]},
  {g:"一年级下",t:"村居",a:"高鼎",c:["草长莺飞二月天，","拂堤杨柳醉春烟。","儿童散学归来早，","忙趁东风放纸鸢。"]},
  {g:"一年级下",t:"所见",a:"袁枚",c:["牧童骑黄牛，","歌声振林樾。","意欲捕鸣蝉，","忽然闭口立。"]},
  {g:"一年级下",t:"小池",a:"杨万里",c:["泉眼无声惜细流，","树阴照水爱晴柔。","小荷才露尖尖角，","早有蜻蜓立上头。"]},
  {g:"二年级上",t:"登鹳雀楼",a:"王之涣",c:["白日依山尽，","黄河入海流。","欲穷千里目，","更上一层楼。"]},
  {g:"二年级上",t:"望庐山瀑布",a:"李白",c:["日照香炉生紫烟，","遥看瀑布挂前川。","飞流直下三千尺，","疑是银河落九天。"]},
  {g:"二年级上",t:"夜宿山寺",a:"李白",c:["危楼高百尺，","手可摘星辰。","不敢高声语，","恐惊天上人。"]},
  {g:"二年级上",t:"敕勒歌",a:"北朝民歌",c:["敕勒川，阴山下，","天似穹庐，笼盖四野。","天苍苍，野茫茫，","风吹草低见牛羊。"]},
  {g:"二年级下",t:"赋得古原草送别（节选）",a:"白居易",c:["离离原上草，","一岁一枯荣。","野火烧不尽，","春风吹又生。"]},
  {g:"三年级上",t:"山行",a:"杜牧",c:["远上寒山石径斜，","白云生处有人家。","停车坐爱枫林晚，","霜叶红于二月花。"]}
];

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

const ENGLISH = [
  ["apple","/ˈæp.əl/","苹果","水果"],["banana","/bəˈnɑː.nə/","香蕉","水果"],["orange","/ˈɒr.ɪndʒ/","橙子","水果"],
  ["red","/red/","红色","颜色"],["yellow","/ˈjel.əʊ/","黄色","颜色"],["blue","/bluː/","蓝色","颜色"],
  ["green","/ɡriːn/","绿色","颜色"],["cat","/kæt/","猫","动物"],["dog","/dɒɡ/","狗","动物"],["fish","/fɪʃ/","鱼","动物"],
  ["bird","/bɜːd/","鸟","动物"],["duck","/dʌk/","鸭子","动物"],["cow","/kaʊ/","奶牛","动物"],["pig","/pɪɡ/","猪","动物"],
  ["rabbit","/ˈræb.ɪt/","兔子","动物"],["tiger","/ˈtaɪ.ɡər/","老虎","动物"],["elephant","/ˈel.ɪ.fənt/","大象","动物"],
  ["monkey","/ˈmʌŋ.ki/","猴子","动物"],["mom","/mɒm/","妈妈","家人"],["dad","/dæd/","爸爸","家人"],
  ["brother","/ˈbrʌð.ər/","兄弟","家人"],["sister","/ˈsɪs.tər/","姐妹","家人"],["grandma","/ˈɡræn.mɑː/","奶奶","家人"],
  ["grandpa","/ˈɡræn.pɑː/","爷爷","家人"],["eye","/aɪ/","眼睛","身体"],["ear","/ɪər/","耳朵","身体"],
  ["nose","/nəʊz/","鼻子","身体"],["mouth","/maʊθ/","嘴巴","身体"],["hand","/hænd/","手","身体"],
  ["foot","/fʊt/","脚","身体"],["head","/hed/","头","身体"],["book","/bʊk/","书","学习"],
  ["pen","/pen/","钢笔","学习"],["bag","/bæɡ/","书包","学习"],["desk","/desk/","书桌","学习"],
  ["sun","/sʌn/","太阳","自然"],["moon","/muːn/","月亮","自然"],["star","/stɑːr/","星星","自然"],
  ["flower","/ˈflaʊ.ər/","花","自然"],["tree","/triː/","树","自然"],["water","/ˈwɔː.tər/","水","自然"],
  ["eat","/iːt/","吃","动作"],["drink","/drɪŋk/","喝","动作"],["run","/rʌn/","跑","动作"],
  ["jump","/dʒʌmp/","跳","动作"],["read","/riːd/","读","动作"],["write","/raɪt/","写","动作"],
  ["sing","/sɪŋ/","唱","动作"],["play","/pleɪ/","玩","动作"],["sleep","/sliːp/","睡觉","动作"],
  ["big","/bɪɡ/","大的","形容词"],["small","/smɔːl/","小的","形容词"],["hot","/hɒt/","热的","形容词"],
  ["cold","/kəʊld/","冷的","形容词"],["happy","/ˈhæp.i/","开心","形容词"],["one","/wʌn/","一","数字"],
  ["two","/tuː/","二","数字"],["three","/θriː/","三","数字"],["four","/fɔːr/","四","数字"],
  ["five","/faɪv/","五","数字"],["six","/sɪks/","六","数字"],["seven","/ˈsev.ən/","七","数字"],
  ["eight","/eɪt/","八","数字"],  ["nine","/naɪn/","九","数字"],["ten","/ten/","十","数字"]
];

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

/* 小花生APP 热门书单（绘本读物模块展示用，结构参照小花生书库） */
const PEANUT_BOOKS = [
  {t:"牛津阅读树 Oxford Reading Tree", a:"Roderick Hunt", tag:"分级 L1-9"},
  {t:"红火箭 Red Rocket Readers",       a:"Pam Holden",    tag:"分级 入门"},
  {t:"培生儿童英语分级阅读",            a:"Pearson",       tag:"分级"},
  {t:"饼干狗 Biscuit",                  a:"A. S. Capucilli",tag:"绘本"},
  {t:"苍蝇小子 Fly Guy",                a:"Tedd Arnold",   tag:"桥梁"},
  {t:"小猪小象 Elephant&Piggie",        a:"Mo Willems",    tag:"绘本"},
  {t:"棕色的熊 Brown Bear",             a:"Bill Martin Jr.",tag:"绘本"},
  {t:"好饿的毛毛虫 The Very Hungry Caterpillar", a:"Eric Carle", tag:"绘本"},
  {t:"廖彩杏书单",                      a:"廖彩杏",        tag:"英文书单"},
  {t:"汪培珽书单",                      a:"汪培珽",        tag:"英文书单"},
  {t:"吴敏兰书单",                      a:"吴敏兰",        tag:"英文书单"},
  {t:"I Can Read 分级",                 a:"HarperCollins", tag:"分级"}
];

/* =========================================================
   状态 / 存档层（localStorage 永久存档）
   ========================================================= */
const STORE_KEY = "shadow_mate_workbench_v1";
const PROFILE_SCOPE_BLOCKED_KEY = "shadow_mate_profile_scope_blocked";

function isProfileScopeBlocked() {
  return localStorage.getItem(PROFILE_SCOPE_BLOCKED_KEY) === "1"
    || sessionStorage.getItem(PROFILE_SCOPE_BLOCKED_KEY) === "1";
}

const profileScopeBlockedAtStartup = isProfileScopeBlocked();
const growthLoopDb = createIndexedDbLearningDb({ deferOpen: profileScopeBlockedAtStartup });
const growthLoopController = createGrowthLoopController({
  db: growthLoopDb,
  canWrite: () => !isProfileScopeBlocked()
    && window.cloudSync?.canWriteLocalState?.() !== false,
  canTransition: () => !isProfileScopeBlocked()
    && window.cloudSync?.canWriteScopeTransition?.() !== false,
});
let growthLoopSnapshot = growthLoopController.getSnapshot();
let CURRENT_MOD = "home";
window.growthLoop = growthLoopController;

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

function learningStateFromEnvelope(envelope) {
  return envelope?.schema_version === 2 && envelope.learning ? envelope.learning : envelope;
}

function learningStateReadStorage() {
  if (!isProfileScopeBlocked()) return localStorage;
  // Storage migration helpers are intentionally read-only while a prior
  // profile operation is fail-closed, including during a same-tab reload.
  return {
    getItem: (key) => localStorage.getItem(key),
    setItem: () => {},
  };
}

function readStoredState(){
  return learningStateFromEnvelope(loadLearningStateEnvelope(learningStateReadStorage(), {}));
}

let store = createLearningState(readStoredState());
if(!store.checkins) store.checkins = {};   // {date: {module:true}}
if(!store.extra) store.extra = {};         // 扩展记录（如数学题数）
if(!store.points) store.points = {};       // 仅保留旧积分历史；新 Growth Loop 不再写入此字段
if(!store.bookShelf) store.bookShelf = {};  // {bookIdx:1} 绘本已读标记
if(!store.peanutLog) store.peanutLog = [];  // [{title,date,rating}] 小花生阅读记录
if(!store.peanutRead) store.peanutRead = {}; // {bookIdx:1} 小花生书单已读标记

let learningEnvelope = loadLearningStateEnvelope(learningStateReadStorage(), {});

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
  const profileId = learningEnvelope?.scope?.profile_id;
  return typeof profileId === "string" && profileId.length > 0
    ? `profile:${profileId}`
    : "anonymous";
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
  const resolved = resolveDailyWorksheet({
    rotationState: getHanziRotationState(store),
    pack: getActiveHanziWritingPack(),
    learnerScope,
    now: new Date(),
    timeZone: getLearningTimeZone(),
  });
  const nextStore = transitionLearningState(store, {
    type: "STATE_REPLACED",
    state: replaceHanziRotationState(store, resolved.rotationState),
  });
  if (JSON.stringify(nextStore) !== JSON.stringify(store)) {
    store = nextStore;
    save();
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
  if (!activeWorksheetSnapshot) return;
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
    ? window.cloudSync?.canWriteScopeTransition?.()
    : window.cloudSync?.canWriteLocalState?.();
  return !isProfileScopeBlocked()
    && cloudWriteCheck !== false;
}

function persistLearningState({ canCommit = () => true, allowScopeTransition = false } = {}){
  if (!canWriteLearningState({ allowScopeTransition }) || !canCommit()) return false;
  learningEnvelope = {
    ...learningEnvelope,
    schema_version: 2,
    product_id: "shadow-mate",
    learning: structuredClone(store),
  };
  const scope = learningEnvelope.scope || {};
  localStorage.setItem(getLearningStateStorageKey(scope), JSON.stringify(learningEnvelope));
  // 兼容旧版本的低风险学习状态读取和既有冲突测试；新 Growth Loop
  // 账本永远不写入旧 state.points。
  localStorage.setItem(STORE_KEY, JSON.stringify({ ...store, points: {} }));
  return true;
}

function save(){
  if (!canWriteLearningState()) return false;
  persistLearningState();
  window.cloudSync?.schedule();
  return true;
}

async function setLearningScope(scope, { adoptPending = false, canCommit = () => true } = {}) {
  if (!canWriteLearningState({ allowScopeTransition: true }) || !canCommit()) return structuredClone(learningEnvelope);
  learningEnvelope = adoptPending
    ? adoptPendingLearningState(localStorage, scope)
    : loadLearningStateEnvelope(localStorage, scope);
  store = createLearningState(learningStateFromEnvelope(learningEnvelope));
  if(!store.checkins) store.checkins = {};
  if(!store.extra) store.extra = {};
  if(!store.points) store.points = {};
  if(!store.bookShelf) store.bookShelf = {};
  if(!store.peanutLog) store.peanutLog = [];
  if(!store.peanutRead) store.peanutRead = {};
  if (!canWriteLearningState({ allowScopeTransition: true }) || !canCommit()) return structuredClone(learningEnvelope);
  persistLearningState({ canCommit, allowScopeTransition: true });
  switchMod(CURRENT_MOD);
  return structuredClone(learningEnvelope);
}

function todayKey(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function dayIndex(){
  const d = new Date(); d.setHours(0,0,0,0);
  const start = new Date(d.getFullYear(),0,1);
  return Math.floor((d - start)/86400000);
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

function updateContentPackage(enabled){
  if (!canWriteLearningState()) return;
  store = { ...store, content_config: setContentPackageEnabled(store.content_config, enabled) };
  save();
  switchMod(CURRENT_MOD);
}

function updateContentModule(moduleId, enabled){
  if (!canWriteLearningState()) return;
  store = { ...store, content_config: setContentModuleEnabled(store.content_config, moduleId, enabled) };
  save();
  switchMod(CURRENT_MOD);
}

function contentModuleLabel(moduleId){
  const labels = { chinese: "语文学习", math: "数学与数感", english: "英语学习", book: "绘本读物" };
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
  const shouldRecordWorksheet = mod === "chinese-writing" &&
    !wasChecked &&
    !hasActiveWorksheetCompletion();
  store = transitionLearningState(store, {
    type: "CHECKIN_TOGGLED",
    date: checkinDate,
    key: mod,
  });
  if (shouldRecordWorksheet) recordActiveWorksheetCompletion();
  save();
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
  void window.growthLoop.recordPoint({ item, occurred_on: dateKeyForDay(day), request_id: requestId }).then(() => {
    void queueGrowthActivity(
      ACTIVITY_EVENT_TYPES.GROWTH_ACTIVITY_RECORDED,
      { source: "point_item", entry_type: Number(item.default_points ?? item.pts) < 0 ? "adjustment" : "manual" },
      requestId,
    );
    void queueGrowthActivity(ACTIVITY_EVENT_TYPES.CORE_ACTIVATION, { source: "point_item" }, "once");
    window.cloudSync?.scheduleGrowthLoop?.();
    renderPoints();
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
let activeAudio = null;
let activeAudioSource = null;
let activeAudioSourceUrl = null;
let sharedAudioContext = null;
let activeSpeechRequest = null;

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
  if (!audioContext || audioContext.state !== "suspended") return;
  void audioContext.resume().catch(() => {});
}

function releaseObjectUrl(url) {
  if (!url?.startsWith("blob:")) return;
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function releaseAudio(audio, url) {
  if (activeAudio === audio) activeAudio = null;
  audio.remove();
  releaseObjectUrl(url);
}

function stopActivePlayback() {
  if (activeAudioSource) {
    const source = activeAudioSource;
    activeAudioSource = null;
    try {
      source.stop();
    } catch (_) {
      // The source may already have ended.
    }
    try {
      source.disconnect();
    } catch (_) {
      // Some lightweight browser implementations do not expose disconnect().
    }
    releaseObjectUrl(activeAudioSourceUrl);
    activeAudioSourceUrl = null;
  }
  if (activeAudio) {
    const previousAudio = activeAudio;
    activeAudio = null;
    previousAudio.pause();
    const previousUrl = previousAudio.src;
    previousAudio.remove();
    releaseObjectUrl(previousUrl);
  }
}

function isMandarinChineseVoiceLocale(locale) {
  const normalizedLocale = String(locale || "").replace(/_/g, "-").toLowerCase();
  if (!normalizedLocale || /^yue(?:-|$)/.test(normalizedLocale)) return false;
  if (/^cmn(?:-|$)/.test(normalizedLocale)) return true;
  if (normalizedLocale === "zh") return true;
  if (!/^zh-/.test(normalizedLocale)) return false;

  const subtags = normalizedLocale.split("-").slice(1);
  return subtags.includes("hans") || subtags.includes("cn") || subtags.includes("sg");
}

function findSystemVoice(locale) {
  const synth = window.speechSynthesis;
  if (!(synth && typeof window.SpeechSynthesisUtterance === "function")) return null;
  const voices = typeof synth.getVoices === "function" ? synth.getVoices() : null;
  if (!Array.isArray(voices)) return null;
  const normalizedLocale = String(locale || "").replace(/_/g, "-").toLowerCase();
  const language = normalizedLocale.split("-")[0];
  const normalizeVoiceLocale = (voice) => String(voice?.lang || "").replace(/_/g, "-").toLowerCase();
  return voices.find((voice) => normalizeVoiceLocale(voice) === normalizedLocale)
    || voices.find((voice) => locale === "zh-CN"
      ? isMandarinChineseVoiceLocale(normalizeVoiceLocale(voice))
      : normalizeVoiceLocale(voice) === language)
    || null;
}

function waitForSystemVoice(locale, timeoutMs = 1200) {
  const immediateVoice = findSystemVoice(locale);
  if (immediateVoice) return Promise.resolve(immediateVoice);

  const synth = window.speechSynthesis;
  if (!synth || typeof synth.addEventListener !== "function") return Promise.resolve(null);

  return new Promise((resolve) => {
    let timer = null;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer !== null) window.clearTimeout(timer);
      synth.removeEventListener?.("voiceschanged", check);
      resolve(findSystemVoice(locale));
    };
    const check = () => {
      if (findSystemVoice(locale)) finish();
    };
    synth.addEventListener?.("voiceschanged", check);
    timer = window.setTimeout(finish, timeoutMs);
    check();
  });
}

async function speak(t, button, locale = "en-US", contentId = ""){
  if (button?.dataset.speechInFlight === "true") return;
  if (activeSpeechRequest) {
    if (activeSpeechRequest.button?.isConnected) return;
    activeSpeechRequest.cancelled = true;
    activeSpeechRequest = null;
    try {
      window.speechSynthesis?.cancel();
    } catch (_) {
      // Some browser speech implementations throw while cancelling a stale utterance.
    }
    stopActivePlayback();
  }
  const speechRequest = { button, cancelled: false };
  activeSpeechRequest = speechRequest;
  const isCurrentSpeech = () => activeSpeechRequest === speechRequest && !speechRequest.cancelled;
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
    clearSystemTimer();
    if (!isCurrentSpeech()) return;
    if (!button) {
      activeSpeechRequest = null;
      return;
    }
    button.innerHTML = buttonContent("volume", originalLabel);
    button.setAttribute("aria-label", originalAriaLabel);
    if (originalTitle) button.title = originalTitle;
    else button.removeAttribute("title");
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.removeAttribute("data-speech-failure");
    button.removeAttribute("data-published-speech-error");
    button.removeAttribute("data-speech-in-flight");
    activeSpeechRequest = null;
    restoreButtonFocus();
  };
  const fail = (message) => {
    if (!isCurrentSpeech()) return;
    restore();
    if (!button) return;
    button.innerHTML = buttonContent("alert", message);
    button.setAttribute("aria-label", message);
    button.title = message;
    button.dataset.speechFailure = "true";
    const errorCode = message.includes("超时") ? "timeout" : message.includes("下载") ? "download_failed" : "synthesis_failed";
    void queueGrowthActivity(ACTIVITY_EVENT_TYPES.TTS_FAILED, {
      source: "published_tts",
      error_code: errorCode,
      retryable: true,
    }, `${errorCode}:${Date.now()}`);
    window.setTimeout(() => {
      if (button.dataset.speechFailure === "true") restore();
    }, 5000);
  };
  const setBusy = (label = "播放中…") => {
    if (!button) return;
    if (document.activeElement === button) shouldRestoreButtonFocus = true;
    button.dataset.label = originalLabel;
    button.innerHTML = buttonContent("volume", label);
    button.setAttribute("aria-label", originalAriaLabel);
    if (originalTitle) button.title = originalTitle;
    else button.removeAttribute("title");
    button.removeAttribute("data-speech-failure");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  };

  let systemTimer = null;
  const clearSystemTimer = () => {
    if (systemTimer !== null) {
      window.clearTimeout(systemTimer);
      systemTimer = null;
    }
  };

  const synth = window.speechSynthesis;
  const Utterance = window.SpeechSynthesisUtterance;
  setBusy();
  try {
    await publishedSpeechPlayer.play(contentId);
    restore();
    return;
  } catch (publishedError) {
    if (!isCurrentSpeech()) return;
    if (button) button.dataset.publishedSpeechError = publishedError?.code || "published-audio-unknown";
    const systemVoice = await waitForSystemVoice(locale, 1200);
    if (!isCurrentSpeech()) return;
    if (!(synth && typeof Utterance === "function") || !systemVoice) {
      const stage = publishedError?.code === "published-audio-timeout" ? "加载超时" : "暂不可用";
      fail(`AI 发音${stage}，且未检测到对应系统语音，请稍后重试`);
      return;
    }
    await new Promise((resolve) => {
      const utterance = new Utterance(t);
      let started = false;
      utterance.lang = locale;
      utterance.rate = 0.9;
      utterance.voice = systemVoice;
      utterance.onstart = () => { started = true; clearSystemTimer(); };
      utterance.onend = () => { restore(); resolve(); };
      utterance.onerror = (event) => {
        if (event?.error === "canceled" || event?.error === "interrupted") restore();
        else fail("AI 发音不可用，系统语音播放也失败，请重试");
        resolve();
      };
      try {
        synth.cancel();
        synth.speak(utterance);
        systemTimer = window.setTimeout(() => {
          if (!started) {
            try { synth.cancel(); } catch (_) {}
            fail("AI 发音不可用，系统语音未能启动，请重试");
            resolve();
          }
        }, 4000);
      } catch (_) {
        fail("AI 发音不可用，系统语音播放也失败，请重试");
        resolve();
      }
    });
  }
}
function bilibili(q){ return "https://search.bilibili.com/all?keyword="+encodeURIComponent(q); }

/* =========================================================
   渲染：首页
   ========================================================= */
function renderHome(){
  const di = dayIndex();
  const hz = HANZI[(di*2)%HANZI.length];
  const poem = POEMS[di%POEMS.length];
  const en = ENGLISH[di%ENGLISH.length];
  const enabled = enabledModuleIds();
  const learningOn = enabled.length > 0;
  const checkedToday = enabled.filter(isChecked).length;
  const main = el("main");
  main.innerHTML = "";
  main.appendChild($(`
    <div class="banner">
      <div class="t">${icon("construction")} 挖掘机小队长，今天也要加油哦！</div>
      <div class="d">${learningOn
        ? `今日已打卡 ${checkedToday}/${enabled.length} 个学习模块 · 语文今日新字「${hz[0]}」· 古诗《${poem.t}》· 英语单词「${en[0]}」`
        : `学习包还没有启用，去「学习」页为这个孩子开启学习模块吧`}</div>
    </div>
  `));

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
  main.appendChild(modTitle("graduation","学习"));
  const config = normalizeContentConfig(store.content_config);
  const enabled = enabledModuleIds();
  const settings = $(`
    <div class="card">
      <h3>${icon("grid")} 学习包设置</h3>
      <div class="desc">${escapeHtml(FOUNDATION_PACKAGE.name)} · 建议年龄 ${escapeHtml(FOUNDATION_PACKAGE.suggested_age)} 岁 · 按孩子独立启停。关闭模块只影响入口和统计，不会删除打卡历史。</div>
      <label class="switch-row">
        <span class="switch-label"><strong>启用学习包</strong><span class="desc">关闭后首页和成长记录隐藏学习模块统计</span></span>
        <input type="checkbox" class="switch" ${config.enabled ? "checked" : ""} data-config-toggle="package" aria-label="启用学习包">
      </label>
      ${FOUNDATION_PACKAGE.modules.map((module) => `
      <label class="switch-row">
        <span class="switch-label"><strong>${icon(module.icon_key)} ${escapeHtml(module.name)}</strong><span class="desc">累计 ${totalChecked(module.id)} 天 · 连续 ${streak(module.id)} 天</span></span>
        <input type="checkbox" class="switch" ${config.modules[module.id] ? "checked" : ""} data-config-toggle="module" data-module-id="${module.id}" aria-label="启用 ${escapeHtml(module.name)}">
      </label>`).join("")}
    </div>
  `);
  main.appendChild(settings);
  settings.querySelectorAll("[data-config-toggle='package']").forEach((input) => {
    input.onchange = () => updateContentPackage(input.checked);
  });
  settings.querySelectorAll("[data-config-toggle='module']").forEach((input) => {
    input.onchange = () => updateContentModule(input.dataset.moduleId, input.checked);
  });

  if (enabled.length) {
    const entries = enabled.map((moduleId) => {
      const module = getContentModuleDefinition(moduleId);
      const done = isChecked(moduleId);
      return `<button class="card card-action" type="button" data-go="${escapeHtml(module.content_entry)}">
        <h3>${icon(module.icon_key)} ${escapeHtml(module.name)}</h3>
        <div class="desc">${done ? "今日已完成" : "今日待打卡"} · 累计 ${totalChecked(moduleId)} 天 · 连续 ${streak(moduleId)} 天</div>
        <span class="pill">${done ? `${icon("checkCircle")} 今日已打卡` : "今日待打卡"}</span>
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
        <h3>${icon("sprout")} 学习包未启用</h3>
        <div class="desc">开启上方「启用学习包」后，才能看到并进入学习模块。</div>
      </div>
    `));
  }
  main.appendChild($(`<div class="footer">${icon("construction")} 本机离线保存 · 登录后跨设备同步</div>`));
}

/* =========================================================
   渲染：语文
   ========================================================= */
function renderChinese(){
  const di = dayIndex();
  const main = el("main"); main.innerHTML="";
  main.appendChild(modTitle("book","语文学习"));

  // 识字打卡（每日2新字 + 复习昨日）
  const i1 = (di*2)%HANZI.length, i2=(di*2+1)%HANZI.length;
  const c1=HANZI[i1], c2=HANZI[i2];
  const ri = ((di-1)*2)%HANZI.length; const rc=HANZI[(ri+1)%HANZI.length];
  const card1 = $(`
    <div class="card">
      <h3>${icon("pen")} 识字打卡 <span class="pill">每日 2 新字 + 复习</span></h3>
      <div class="desc">3000 常用字按频次排序，每天学 2 个新字并复习旧字。今日新字：</div>
      <div class="grid2">
        <div class="mini-card"><div class="big">${c1[0]}</div><div class="py">${c1[1]}</div><div class="label">${c1[2]}</div></div>
        <div class="mini-card"><div class="big">${c2[0]}</div><div class="py">${c2[1]}</div><div class="label">${c2[2]}</div></div>
      </div>
      <div class="desc mt-12">${icon("rotate")} 复习昨日字：<b>${HANZI[ri][0]}</b> ${HANZI[ri][1]} · <b>${rc[0]}</b> ${rc[1]}</div>
      <a class="video-link" href="${bilibili("小学语文 识字 "+c1[0]+c2[0])}" target="_blank">${icon("play")} B站教学视频</a>
      <div class="spacer-12"></div>
      ${checkinBtn("chinese-literacy","识字")}
    </div>
  `);
  main.appendChild(card1);

  // 古诗词
  const p = POEMS[di%POEMS.length];
  const card2 = $(`
    <div class="card">
      <h3>${icon("bookMarked")} 背诵古诗词 <span class="pill">${p.g}</span></h3>
      <div class="poem-title">《${p.t}》</div>
      <div class="poem-meta">${p.a} · 人教版</div>
      <div class="poem-body">${p.c.join("<br>")}</div>
      <div class="text-center"><a class="video-link" href="${bilibili(p.t+" 朗诵")}" target="_blank">${icon("play")} 跟读视频</a></div>
      <div class="spacer-12"></div>
      ${checkinBtn("chinese-poem","古诗")}
    </div>
  `);
  main.appendChild(card2);

  // 写字打卡
  const worksheet = resolveWritingWorksheet();
  if (!worksheet) return;
  const worksheetHtml = renderWritingWorksheetHtml(worksheet);
  createWritingPrintRoot(worksheet);
  const strokesHtml = STROKES.map(renderStrokeChip).join("");
  const card3 = $(`
    <div class="card" data-writing-practice>
      <h3>${icon("pen")} 写字打卡 <span class="pill">今日字帖 · 4 行</span></h3>
      <div class="desc">8 个基础笔画：${strokesHtml}</div>
      <div class="desc">今天练习下面 4 行字帖，先描一格，再试着独立书写。</div>
      ${worksheetHtml}
      <div class="spacer-12"></div>
      <button class="checkin" type="button" data-print>${icon("download")} 打印 A4 字帖</button>
      <div class="spacer-10"></div>
      ${checkinBtn("chinese-writing","写字")}
    </div>
  `);
  main.appendChild(card3);
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
    button.onclick = () => speak(
      button.dataset.speechText || "",
      button,
      button.dataset.speechLocale || "en-US",
      button.dataset.speechContentId || "",
    );
  });
}

/* =========================================================
   渲染：数学与数感
   ========================================================= */
let mathLevel = 10, mathAns = 0;
function genQuiz(){
  const a = Math.floor(Math.random()*(mathLevel+1));
  const b = Math.floor(Math.random()*(mathLevel+1));
  const op = Math.random()<0.5 ? "+" : "−";
  if(op==="+"){ mathAns=a+b; return `${a} ${op} ${b} = ?`; }
  else { const big=Math.max(a,b), small=Math.min(a,b); mathAns=big-small; return `${big} ${op} ${small} = ?`; }
}
function renderMath(){
  const main = el("main"); main.innerHTML="";
  main.appendChild(modTitle("calculator","数学与数感"));

  // 口算
  const q = genQuiz();
  const lvls = [10,20,50,100];
  const lvlHtml = lvls.map(n=>`<button class="lvl-btn ${n===mathLevel?'active':''}" data-lvl="${n}">${n}以内</button>`).join("");
  const card1 = $(`
    <div class="card">
      <h3>${icon("calculator")} 口算打卡 <span class="pill">10/20/50/100 以内加减</span></h3>
      <div class="lvl-row">${lvlHtml}</div>
      <div class="quiz-box">
        <div class="quiz-q" id="qq">${q}</div>
        <input class="quiz-input" id="qa" type="number" inputmode="numeric" aria-labelledby="qq" placeholder="?">
        <div class="feedback" id="qf"></div>
      </div>
      <button class="checkin" id="qsubmit">${icon("check")} 提交答案</button>
      <div class="spacer-8"></div>
      ${checkinBtn("math-mental","口算")}
    </div>
  `);
  main.appendChild(card1);
  card1.querySelectorAll("[data-lvl]").forEach(b=>b.onclick=()=>{ mathLevel=+b.dataset.lvl; renderMath(); });
  el("qsubmit").onclick=()=>{
    const v = el("qa").value;
    const f = el("qf");
    if(v===""){ f.textContent="请先写出答案哦"; f.className="feedback no"; return; }
    if(+v===mathAns){ f.innerHTML=`${icon("party")} 答对啦，真棒！`; f.className="feedback ok"; }
    else { f.textContent=`再想想～正确答案是 ${mathAns}`; f.className="feedback no"; }
  };

  // 数感：数字填写 1-100 找缺失
  const sequence = buildMissingSequence({
    start: Math.floor(Math.random() * 80) + 1,
    length: 20,
    missingIndex: 9,
  });
  const miss = sequence.answer;
  const cells = sequence.values
    .map((num) => num === null
      ? `<button class="num-cell miss" type="button" data-num="${miss}" aria-label="填写缺失数字">?</button>`
      : `<div class="num-cell">${num}</div>`)
    .join("");
  const card2 = $(`
    <div class="card">
      <h3>${icon("brain")} 数感星球 · 数字填写 <span class="pill">1-100</span></h3>
      <div class="desc">点击问号格，说出它应该是哪个数字（按 1 递增顺序）。</div>
      <div class="num-grid">${cells}</div>
      <div class="feedback text-center" id="nf"></div>
    </div>
  `);
  main.appendChild(card2);
  const missCell = card2.querySelector(".num-cell.miss");
  missCell.onclick=()=>{ const nf=el("nf"); const ans=prompt("这个格子应该是数字几？"); if(ans!==null){ if(+ans===miss){ nf.innerHTML=`${icon("checkCircle")} 正确！数列规律是每次 +1`; nf.className="feedback ok"; missCell.classList.add("found"); missCell.innerHTML=`${icon("check")} ${miss}`; missCell.setAttribute("aria-label", `缺失数字为 ${miss}`); missCell.disabled=true; } else { nf.textContent=`不对哦，看看前后数字～`; nf.className="feedback no"; } } };

  // 数独 4x4
  const card3 = $(`
    <div class="card">
      <h3>${icon("grid")} 数独游戏 <span class="pill">数感阶段</span></h3>
      <div class="desc">把 1-4 填入每行每列（4×4 入门版，含比较/分类/形状思维）。</div>
      <div class="sudoku" id="sudoku"></div>
      <div class="feedback text-center" id="sf"></div>
      <div class="spacer-10"></div>
      ${checkinBtn("math-sense","数感")}
    </div>
  `);
  main.appendChild(card3);
  buildSudoku();
}

function buildSudoku(){
  // 固定一个合法解，挖空部分
  const sol = [
    [1,2,3,4],
    [3,4,1,2],
    [2,1,4,3],
    [4,3,2,1]
  ];
  const blanks = new Set([1,4,6,9,11,14]); // 挖空位置(0-indexed)
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
    // 简单校验行/列/宫
    const r=+inp.dataset.r, c=+inp.dataset.c, val=+inp.value;
    let ok=true;
    if(val<1||val>4) ok=false;
    // 检查同行
    for(let cc=0;cc<4;cc++){ const cell=box.children[r*4+cc]; const cv=cell.querySelector? (cell.querySelector("input")?+cell.querySelector("input").value: +cell.textContent):null; if(cc!==c && cv===val){ok=false;} }
    if(ok) sf.textContent="继续加油，把空格都填完吧！"; else sf.textContent="这一格和别处重复啦～";
  });
}

/* =========================================================
   渲染：英语
   ========================================================= */
function renderEnglish(){
  const di = dayIndex();
  const main = el("main"); main.innerHTML="";
  main.appendChild(modTitle("languages","英语学习"));
  // 每日推送 1~2 词
  const w1 = ENGLISH[di%ENGLISH.length];
  const w2 = ENGLISH[(di+1)%ENGLISH.length];
  const card1 = $(`
    <div class="card">
      <h3>${icon("languages")} 今日主题单词 <span class="pill">每日推送</span></h3>
      <div class="desc">拼读并朗读下面的单词，读完点「完成今日打卡」。</div>
      <div class="word-card">
        <div class="word-en">${w1[0]}</div>
        <div class="word-ph">${w1[1]}</div>
        <div class="word-cn">${w1[2]} · ${w1[3]}</div>
        <button class="speak-btn" type="button" data-speak="0" data-label="听发音">${buttonContent("volume", "听发音")}</button>
      </div>
      <div class="word-card">
        <div class="word-en">${w2[0]}</div>
        <div class="word-ph">${w2[1]}</div>
        <div class="word-cn">${w2[2]} · ${w2[3]}</div>
        <button class="speak-btn" type="button" data-speak="1" data-label="听发音">${buttonContent("volume", "听发音")}</button>
      </div>
      <div class="spacer-10"></div>
      ${checkinBtn("english-vocabulary","单词")}
    </div>
  `);
  main.appendChild(card1);
  const spokenWords = [w1[0], w2[0]];
  card1.querySelectorAll("[data-speak]").forEach((button) => {
    button.addEventListener("pointerdown", primeSpeechAudio, { passive: true });
    button.onclick = () => speak(spokenWords[Number(button.dataset.speak)], button);
  });

  // 按月回看往期单词
  const m = new Date().getMonth();
  let chips="";
  for(let d=1; d<=Math.min(28,new Date().getDate()+0); d++){
    const k = (m*31 + d*2)%ENGLISH.length; // 与推送算法一致的近似回看
    const w = ENGLISH[(di - d + ENGLISH.length*10)%ENGLISH.length];
    chips += `<span class="mr-chip">${w[0]}</span>`;
  }
  const card2 = $(`
    <div class="card">
      <h3>${icon("calendar")} 往期单词回看 <span class="pill">本月</span></h3>
      <div class="desc">按月回看之前朗读过的单词（最近 ${Math.min(28,new Date().getDate())} 天）：</div>
      <div class="month-review">${chips}</div>
    </div>
  `);
  main.appendChild(card2);
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

function renderGrow(){
  const main = el("main"); main.innerHTML="";
  main.appendChild(modTitle("sprout","成长记录"));
  const enabled = enabledModuleIds();
  const learningOn = enabled.length > 0;

  if (learningOn) {
    const total = enabled.reduce((sum, module) => sum + totalChecked(module), 0);
    const overview = $(`
      <div class="card">
        <h3>${icon("trophy")} 打卡总览</h3>
        <div class="stat-grid">
          ${enabled.map((module) => `<div class="stat"><div class="n">${totalChecked(module)}</div><div class="t">${contentModuleLabel(module)}累计(天)</div></div>`).join("")}
        </div>
        <div class="desc mt-10">${icon("chart")} 累计模块打卡：${total} 次</div>
        <div class="desc mt-14">${icon("flame")} 连续打卡：${enabled.map((module) => `${contentModuleLabel(module)} ${streak(module)} 天`).join(" · ")}</div>
        <div class="progressbar"><i></i></div>
        <div class="desc mt-6 note-sm">目标：累计 30 次打卡解锁「挖掘机小队长」徽章</div>
      </div>
    `);
    main.appendChild(overview);
    overview.querySelector(".progressbar i").style.width = Math.min(100,total/30*100)+"%";

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
    const cal = $(`
      <div class="card">
        <h3>${icon("calendar")} 近 30 天打卡日历</h3>
        <div class="cal-grid">${cells}</div>
        <div class="cal-helper">颜色表示当天完成的学习模块数，格内比例是已完成/共 ${enabled.length} 个模块，边框表示今天。</div>
        <div class="cal-legend" aria-label="成长日历图例">
          ${legendLevels}
          <span class="cal-legend-item"><i class="cal-swatch selected" aria-hidden="true"></i>今天</span>
        </div>
      </div>
    `);
    main.appendChild(cal);
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

  const balance = getBalance(growthLoopSnapshot);
  const opening = getOpeningBalance(growthLoopSnapshot);
  const legacyImport = getLegacyPointsImport(growthLoopSnapshot);
  const legacyEntries = buildLegacyPointEntries(learningEnvelope?.legacy?.points_readonly || {});
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
          renderGrow();
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
          renderGrow();
        }
      } catch (error) {
        console.error("Growth Loop legacy points import failed:", error);
        alert("旧积分没有导入成功，请稍后重试。");
      } finally {
        legacyImportBtn.disabled = false;
      }
    };
  }

  const rewards = window.growthLoop?.getRewards?.() || [];
  const pendingRedemptions = growthLoopSnapshot.redemptions.filter((item) => item.status === "pending").length;
  const rewardCards = rewards.map((reward) => {
    const cost = Number(reward.cost_points || 0);
    const latest = growthLoopSnapshot.redemptions
      .filter((item) => item.reward_id === reward.id)
      .sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")))[0];
    const status = latest?.status === "pending" ? "待联网确认" : latest?.status === "fulfilled" ? "已兑现" : "";
    return `<div class="reward-card">
      <div class="reward-icon">${icon(reward.icon_key || "gift")}</div>
      <div class="reward-info"><strong>${escapeHtml(reward.name)}</strong><span>${escapeHtml(reward.description || "家长和孩子一起约定")}</span></div>
      <span class="pts-badge">${cost}分</span>
      <button class="checkin reward-redeem" type="button" data-reward-id="${escapeHtml(reward.id)}" ${balance < cost ? "disabled" : ""}>${status || "兑换"}</button>
    </div>`;
  }).join("");
  const rewardCard = $(`<div class="card growth-reward-card">
      <h3>${icon("gift")} 奖励兑换</h3>
      <div class="stat-grid">
        <div class="stat"><div class="n">${balance}</div><div class="t">当前可用积分</div></div>
        <div class="stat"><div class="n">${pendingRedemptions}</div><div class="t">待联网确认</div></div>
      </div>
      <div class="desc">离线兑换会先记为“待联网确认”，联网并完成服务端确认前不代表最终成功。</div>
      <form id="rewardForm" class="growth-form">
        <label>奖励名称<input name="name" maxlength="60" required placeholder="例如：周末去公园"></label>
        <label>所需积分<input name="cost" type="number" min="1" max="100000" step="1" required placeholder="例如：10"></label>
        <button class="checkin" type="submit">${icon("plus")} 添加奖励</button>
      </form>
      <div class="reward-list">${rewardCards || '<div class="desc">还没有奖励，先添加一个约定吧。</div>'}</div>
    </div>`);
  main.appendChild(rewardCard);
  rewardCard.querySelector("#rewardForm").onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const cost = Number(form.get("cost"));
    if (!name || !Number.isInteger(cost) || cost < 1 || cost > 100000) {
      alert("请填写奖励名称，并输入 1 到 100000 的整数积分。");
      return;
    }
    try {
      await window.growthLoop.createReward({
        request_id: clientRequestId("reward"),
        reward: { name, description: "家庭约定奖励", cost_points: cost, category: "family", icon_key: "gift" },
      });
      window.cloudSync?.scheduleGrowthLoop?.();
      renderGrow();
    } catch (error) {
      console.error("Growth Loop reward creation failed:", error);
      alert("奖励没有保存成功，请稍后重试。");
    }
  };
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
      window.cloudSync?.scheduleGrowthLoop?.();
      renderGrow();
    };
  });

  const historyEntries = growthLoopSnapshot.ledger
    .filter((entry) => !["rejected", "conflict"].includes(entry.status))
    .sort((left, right) => String(right.occurred_on || "").localeCompare(String(left.occurred_on || ""))
      || String(right.created_at || "").localeCompare(String(left.created_at || "")))
    .slice(0, 20);
  const historyCard = $(`<div class="card growth-history-card">
      <h3>${icon("list")} 最近积分明细</h3>
      ${historyEntries.length
        ? `<ul class="growth-history-list">
             ${historyEntries.map((entry) => {
               const dateLabel = escapeHtml(entry.occurred_on || "");
               const nameLabel = escapeHtml(entry.item_name_snapshot || "积分调整");
               const entryClass = entry.entry_type === "redemption" ? "neg" : entry.delta > 0 ? "pos" : "neg";
               return `<li><span class="date">${dateLabel}</span><span class="name">${nameLabel}</span><span class="pts ${entryClass}">${entry.delta > 0 ? "+" : ""}${entry.delta}</span></li>`;
             }).join("")}
           </ul>`
        : `<div class="desc">还没有积分记录。完成打卡或导入旧积分后会显示在这里。</div>`}
    </div>`);
  main.appendChild(historyCard);

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
  return `<div class="pts-card ${sub?'sub':''} ${done?'done':''}">
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
  main.appendChild(modTitle("star","积分打卡"));
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

  // 积分日历（圆角 chip，可补打卡）
  let chips="";
  for(let d=1;d<=daysInMonth;d++){
    const state=pointDayState(d);
    const stateText=state.kind==="pos"?"有加分":state.kind==="neg"?"有扣分":state.kind==="mixed"?"有加分和扣分":"无积分";
    const cls=[d===activeDay?"active":"",state.kind].filter(Boolean).join(" ");
    const selectedText=d===activeDay?"，当前选中":"";
    chips+=`<button class="cal-chip ${cls}" type="button" data-d="${d}" aria-pressed="${d===activeDay}" aria-label="${d}日，${stateText}${selectedText}">${d}</button>`;
  }
  const calCard=$(`<div class="card">
      <h3>${icon("calendar")} 积分日历 <span class="pill">${ymLabel}</span></h3>
      <div class="cal-helper">点击日期选择要补打卡的日期；边框表示当前选中日期。</div>
      <div class="cal-legend" aria-label="积分日历图例">
        <span class="cal-legend-item"><i class="cal-swatch neutral" aria-hidden="true"></i>无积分</span>
        <span class="cal-legend-item"><i class="cal-swatch pos" aria-hidden="true"></i>有加分</span>
        <span class="cal-legend-item"><i class="cal-swatch neg" aria-hidden="true"></i>有扣分</span>
        <span class="cal-legend-item"><i class="cal-swatch mixed" aria-hidden="true"></i>加分和扣分</span>
        <span class="cal-legend-item"><i class="cal-swatch selected" aria-hidden="true"></i>当前选中</span>
      </div>
      <div class="cal">${chips}</div>
    </div>`);
  main.appendChild(calCard);
  calCard.querySelectorAll(".cal-chip").forEach(c=>c.onclick=()=>{PT_DAY=+c.dataset.d; renderPoints();});

  // 打卡区（卡片化）
  const isToday = activeDay===today;
  const head = $(`<div class="card">
      <div class="pts-sec">${icon("checkCircle")} 为 ${new Date().getMonth()+1}月${activeDay}日打卡 ${isToday?'<span class="pill">今天</span>':''}</div>
      ${isToday?"":`<button class="checkin danger mb-12" id="backtoday">${icon("rotate")} 回到今天</button>`}
      <div class="pts-sec">${icon("plus")} 加分项</div>
      ${pointItems.filter((it) => Number(it.default_points ?? it.pts) > 0).map((it)=>ptsCardHTML(it,activeDay)).join("")}
      <div class="pts-sec">${icon("minus")} 减分项目</div>
      ${pointItems.filter((it) => Number(it.default_points ?? it.pts) < 0).map((it)=>ptsCardHTML(it,activeDay)).join("")}
    </div>`);
  main.appendChild(head);
  head.querySelectorAll(".pts-toggle").forEach((button)=>{
    button.onclick=()=>{
      togglePoint(button.dataset.itemId, activeDay);
      button.disabled = true;
    };
  });
  const bt = el("backtoday"); if(bt) bt.onclick=()=>{PT_DAY=today; renderPoints();};

  const customCard = $(`<div class="card growth-custom-card">
      <h3>${icon("pencil")} 自定义积分项</h3>
      <div class="desc">把成长任务纳入积分管理：正数是加分，负数是扣分；每个孩子可以有自己的分值。</div>
      <form id="pointItemForm" class="growth-form">
        <label>项目名称<input name="name" maxlength="60" required placeholder="例如：自己刷牙"></label>
        <label>分值<input name="points" type="number" min="-1000" max="1000" step="1" required placeholder="例如：2"></label>
        <button class="checkin" type="submit">${icon("plus")} 添加积分项</button>
      </form>
    </div>`);
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
      renderPoints();
    } catch (error) {
      console.error("Growth Loop custom point item creation failed:", error);
      alert("积分项没有保存成功，请稍后重试。");
    }
  };

  // 结束当前积分周期：保留历史，通过不可变的反向调整归零当前月。
  main.appendChild($(`<div class="card"><button class="checkin danger" id="ptclear">${icon("trash")} 结束本月积分周期</button><div class="desc">不会删除历史记录，会追加反向调整，让本月重新开始。</div></div>`));
  el("ptclear").onclick=async()=>{
    if(confirm("确定结束本月积分周期？历史记录会保留，但本月积分会归零。")){
      try {
        await window.growthLoop.closePeriod({ period_key: currentPeriodKey(), request_id: clientRequestId("period-close") });
        window.cloudSync?.scheduleGrowthLoop?.();
        PT_DAY=today; renderPoints();
      } catch (error) {
        console.error("Growth Loop point period close failed:", error);
        alert("积分周期没有结束成功，请稍后重试。");
      }
    }
  };
  main.appendChild($(`<div class="footer">${icon("star")} 每日按日期记录 · 本机离线保存并可同步云端</div>`));
}

/* =========================================================
   渲染：绘本读物（独立栏目）
   ========================================================= */
function renderBook(){
  const main = el("main"); main.innerHTML="";
  main.appendChild(modTitle("library","绘本读物"));

  const BOOKS = [
    {t:"好饿的毛毛虫",   r:"美国",  a:"艾瑞·卡尔"},
    {t:"棕色的熊，棕色的熊", r:"美国", a:"比尔·马丁"},
    {t:"猜猜我有多爱你", r:"欧盟(英)", a:"山姆·麦克布雷尼"},
    {t:"逃家小兔",       r:"美国",  a:"玛格丽特·怀兹·布朗"},
    {t:"小熊宝宝",       r:"日本",  a:"佐佐木洋子"},
    {t:"点点点",         r:"法国",  a:"埃尔维·杜莱"},
    {t:"是谁嗯嗯在我头上", r:"台湾", a:"维尔纳·霍尔茨瓦特"},
    {t:"爷爷一定有办法", r:"加拿大", a:"菲比·吉尔曼"}
  ];
  const di = dayIndex();
  const b = BOOKS[di % BOOKS.length];

  // 今日绘本 + 打卡
  const card1 = $(`
    <div class="card">
      <h3>${icon("book")} 今日绘本 <span class="pill">${b.r}</span></h3>
      <div class="desc">《${b.t}》— ${b.a}</div>
      <div class="desc">raza 绘本跟读 · 读后完成思考题；26 个字母口语对练、英语句子书写造句每日推送（3-6 岁）。</div>
      <div class="row">
        <span class="pill">跟读</span><span class="pill">读后思考题</span><span class="pill">句子书写</span><span class="pill">每日推送</span>
      </div>
      <div class="spacer-10"></div>
      ${checkinBtn("book-reading","绘本")}
    </div>
  `);
  main.appendChild(card1);

  // 我的小书架（已读标记，永久存档）
  let shelf = BOOKS.map((bk,i)=>{
    const read = !!store.bookShelf[i];
    return `<button class="mini-card shelf-card" type="button" data-bk="${i}" aria-pressed="${read}" aria-label="标记《${bk.t}》已读">
      <div class="big">${read?icon("checkCircle"):icon("book")}</div>
      <div class="py">${bk.t}</div>
      <div class="label">${bk.r}</div>
    </button>`;
  }).join("");
  const readN = Object.keys(store.bookShelf).length;
  const card2 = $(`
    <div class="card">
      <h3>${icon("bookMarked")} 我的小书架 <span class="pill">点击标记已读</span></h3>
      <div class="desc">欧盟、美国、日本、台湾等多地优质绘本，读完并完成思考题后点一下即可标记。</div>
      <div class="grid2">${shelf}</div>
      <div class="desc mt-12">已读 <b>${readN}</b> / ${BOOKS.length} 本</div>
    </div>
  `);
  main.appendChild(card2);
  card2.querySelectorAll("[data-bk]").forEach(c=>{
    c.style.opacity = store.bookShelf[+c.dataset.bk] ? 1 : 0.55;
    c.onclick=()=>{
      if (!canWriteLearningState()) return;
      const i=+c.dataset.bk;
      store = transitionLearningState(store, { type: "SHELF_TOGGLED", bookIndex: i });
      save(); renderBook();
    };
  });

  // 小花生APP读物：热门书单 + 我的阅读记录
  const peanutRead = PEANUT_BOOKS.map((b,i)=>{
    const on = !!store.peanutRead[i];
    return `<button class="mini-card peanut-card" type="button" data-pb="${i}" aria-pressed="${on}" aria-label="标记《${b.t}》已读">
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
    <div class="card">
      <h3>${icon("bookOpenCheck")} 小花生APP读物 <span class="pill">热门书单</span></h3>
      <div class="desc">小花生热门童书与英文分级书单（牛津树 / 红火箭 / 廖彩杏等），点一下标记已读；下方可手记你自己的阅读记录。</div>
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
  `);
  main.appendChild(card3);

  // 绑定：书单已读标记
  card3.querySelectorAll("[data-pb]").forEach(c=>{
    c.style.opacity = store.peanutRead[+c.dataset.pb] ? 1 : 0.6;
    c.onclick=()=>{
    if (!canWriteLearningState()) return;
    const i=+c.dataset.pb;
    store = transitionLearningState(store, { type: "PEANUT_READ_TOGGLED", bookIndex: i });
    save(); renderBook();
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
    const d = new Date();
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    store = transitionLearningState(store, {
      type: "READING_LOG_ADDED",
      record: { title, date: ds, rating },
    });
    save(); renderBook();
  };
  // 绑定：删除记录
  card3.querySelectorAll("[data-del]").forEach(x=>x.onclick=()=>{
    if (!canWriteLearningState()) return;
    const i = +x.dataset.del;
    store = transitionLearningState(store, {
      type: "READING_LOG_REMOVED",
      index: store.peanutLog.length - 1 - i,
    });
    save(); renderBook();
  });

  main.appendChild($(`<div class="footer">${icon("library")} 本机离线保存 · 登录后跨设备同步</div>`));
}

function renderGuide(){
  const main = el("main");
  main.innerHTML = "";
  main.appendChild($(`
    <div class="guide-page">
      <section class="guide-hero">
        <div class="guide-kicker">给家长的快速上手</div>
        <h2>使用指南</h2>
        <p>第一次使用影伴，照着这条路线走一遍：登录、建立家庭、选择孩子，然后开始今天的学习。</p>
        <div class="guide-badges"><span>约 3 分钟开始</span><span>手机 · 平板 · 电脑</span></div>
      </section>

      <section class="guide-card" data-guide-section="quickstart">
        <div class="guide-section-heading"><span>01</span><div><h3>第一次使用怎么做</h3><p>孩子不需要注册账号，家长一个邮箱就能管理多个孩子。</p></div></div>
        <div class="guide-steps">
          <article class="guide-step"><span class="guide-step-no">1</span><div><h4>家长登录</h4><p>点击右上角“登录”，输入家长邮箱。可以使用邮箱验证码或共享密码登录；尚未设置密码时，先用验证码完成登录。</p></div></article>
          <article class="guide-step"><span class="guide-step-no">2</span><div><h4>建立家庭空间</h4><p>填写家庭名称和第一个学习者；之后可以在家庭空间里添加孩子、修改资料和切换当前孩子。</p></div></article>
          <article class="guide-step"><span class="guide-step-no">3</span><div><h4>开始学习和打卡</h4><p>从左侧进入“学习”，再选择语文、数学、英语或绘本。每个任务单独打卡，再次点击同一个按钮即可取消。</p></div></article>
        </div>
      </section>

      <section class="guide-card" data-guide-section="speech">
        <div class="guide-section-heading"><span>02</span><div><h3>听发音与共享语音</h3><p>影伴优先播放发布前生成的共享 AI 语音；共享音频不可用时才尝试同语言系统语音。不会上传录音。</p></div></div>
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
        <div class="guide-section-heading"><span>03</span><div><h3>家庭空间和同步</h3><p>家庭空间是统一入口，学习记录按孩子分别同步和保存。</p></div></div>
        <div class="guide-facts"><div><strong>家庭维度</strong><span>管理家庭名称、孩子档案和当前选择。</span></div><div><strong>孩子维度</strong><span>每个孩子的打卡、积分和绘本记录分别同步。</span></div><div><strong>看同步状态</strong><span>进入家庭空间可查看家庭内最近同步时间。</span></div></div>
      </section>

      <section class="guide-card" data-guide-section="install">
        <div class="guide-section-heading"><span>04</span><div><h3>安装到主屏幕，打开更方便</h3><p>影伴是网页应用，不需要从陌生渠道下载 APK 或安装包。</p></div></div>
        <div class="guide-install-grid"><div><strong>iPhone / iPad</strong><span>Safari 打开影伴 → 分享 → 添加到主屏幕。</span></div><div><strong>Android</strong><span>Chrome 打开影伴 → 菜单 ⋮ → 添加到主屏幕。</span></div><div><strong>电脑</strong><span>Chrome 或 Edge 地址栏右侧点击安装图标，或使用浏览器菜单“安装影伴”。</span></div></div>
      </section>

      <section class="guide-card guide-help-card">
        <h3>遇到问题怎么办？</h3>
        <p>先刷新页面，再确认网络、设备音量和系统语音包。登录、家庭空间或同步异常时，打开右上角账户面板查看具体提示。</p>
      </section>
    </div>
  `));
  mountPiperResourceManager(main.querySelector("[data-piper-resource-manager]"));
}

/* =========================================================
   公共组件
   ========================================================= */
function modTitle(iconName,t){
  return $(`<div class="module-title"><span class="em">${icon(iconName)}</span><h2>${t}</h2></div>`);
}
function checkinBtn(mod,label){
  const done = isChecked(mod);
  return `<button class="checkin ${done?'done':''}" type="button" data-cmod="${mod}" data-clabel="${label}" aria-pressed="${done}">${done?`${icon("checkCircle")} 今日已打卡 · ${label}（点击取消）`:`${icon("check")} 完成今日打卡 · ${label}`}</button>`;
}

/* =========================================================
   导航切换
   ========================================================= */
function switchMod(mod){
  CURRENT_MOD = mod;
  removeWritingPrintRoot();
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
  else if(mod==="points") renderPoints();
  else if(mod==="grow") renderGrow();
  else if(mod==="guide") renderGuide();
  // 绑定打卡按钮
  el("main").querySelectorAll("[data-cmod]").forEach(btn=>{
    btn.onclick=()=>{
      const m=btn.dataset.cmod;
      toggleCheckin(m);
      switchMod(mod);
    };
  });
  el("main").scrollTop=0;
}

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

function persistenceScopeLabel() {
  return getHanziLearnerScope();
}

function compatibilityScopeObject(scope) {
  if (scope === "anonymous") return { household_id: null, profile_id: null };
  const profileId = String(scope).replace(/^profile:/, "");
  return {
    household_id: "compatibility-household",
    profile_id: profileId,
  };
}

window.learningDesk = {
  getState(scope){
    if (scope !== undefined && scope !== persistenceScopeLabel()) {
      return createLearningState();
    }
    return JSON.parse(JSON.stringify(store));
  },
  getPersistenceScope(){
    return persistenceScopeLabel();
  },
  getPersistenceStatus(){
    return { pending: false };
  },
  activateScope(scope, options = {}){
    if (typeof scope !== "string" || scope.trim().length === 0) return false;
    if (!canWriteLearningState({ allowScopeTransition: true })) return false;
    const previousScope = persistenceScopeLabel();
    const nextState = options.state ?? (scope === previousScope ? store : {});
    removeWritingPrintRoot();
    learningEnvelope = {
      ...learningEnvelope,
      scope: compatibilityScopeObject(scope),
    };
    store = createLearningState(nextState);
    if (options.persist !== false) persistLearningState({ allowScopeTransition: true });
    if (options.render !== false) switchMod(CURRENT_MOD);
    return true;
  },
  activateSafeAnonymousScope(){
    removeWritingPrintRoot();
    learningEnvelope = migrateLegacyLearningState({}, {});
    store = createLearningState();
    switchMod(CURRENT_MOD);
    return true;
  },
  flushLocalState(){
    return persistLearningState();
  },
  markCloudConfirmed(scope, state){
    if (scope !== persistenceScopeLabel()) return false;
    store = createLearningState(state);
    learningEnvelope = {
      ...learningEnvelope,
      learning: structuredClone(store),
    };
    return true;
  },
  renderCurrent(){
    switchMod(CURRENT_MOD);
  },
  getEnvelope(){
    return structuredClone({
      ...learningEnvelope,
      schema_version: 2,
      product_id: "shadow-mate",
      learning: store,
    });
  },
  async setScope(scope, options = {}){
    return setLearningScope(scope, options);
  },
  getPendingState(){
    const pending = loadLearningStateEnvelope(localStorage, {});
    return structuredClone(pending);
  },
  replaceState(next, options = {}){
    if (!canWriteLearningState()) return false;
    store = transitionLearningState(store, { type: "STATE_REPLACED", state: learningStateFromEnvelope(next) });
    if(options.persist) persistLearningState();
    switchMod(CURRENT_MOD);
    return true;
  },
  clearLocalData(){
    const { reload = true } = arguments[0] || {};
    clearLearningDeskStorage(localStorage);
    removeWritingPrintRoot();
    if (reload) {
      window.location.reload();
      return;
    }
    learningEnvelope = migrateLegacyLearningState({}, {});
    store = createLearningState();
    switchMod(CURRENT_MOD);
  },
  removePersistenceScope(scope){
    if (scope !== persistenceScopeLabel()) return true;
    return this.activateSafeAnonymousScope();
  },
};

void growthLoopController.hydrate().catch((error) => {
  console.warn("Growth Loop 本地数据库初始化失败，已保持只读推荐项：", error);
});
