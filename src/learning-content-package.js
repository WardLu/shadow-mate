import { normalizeSpokenCourseSelection } from "./spoken-language-courses.js";

// 启蒙学习包 V2 与幼小衔接包 V1 —— 轻量代码注册表。
// 这是唯一的内容包/模块定义来源：稳定 ID、名称、图标、既有内容入口与记录类型。
// 孩子级启停配置保存在学习状态 envelope 的 learning.content_config 中，
// 不新增内容包数据库表；本模块不产生积分流水。

export const CONTENT_CONFIG_SCHEMA_VERSION = 1;

export const FOUNDATION_PACKAGE = Object.freeze({
  id: "foundation-v2",
  version: 2,
  name: "启蒙学习包 V2",
  suggested_age: "4-5",
  goals: ["识字与阅读", "数感启蒙", "英语启蒙", "亲子共读"],
  modules: Object.freeze([
    { id: "chinese", name: "语文学习", icon_key: "book", content_entry: "chinese", record_type: "checkin" },
    { id: "math", name: "数学与数感", icon_key: "calculator", content_entry: "math", record_type: "checkin" },
    { id: "english", name: "英语学习", icon_key: "languages", content_entry: "english", record_type: "checkin" },
    { id: "book", name: "绘本读物", icon_key: "library", content_entry: "book", record_type: "checkin" },
  ]),
});

export const BRIDGING_PACKAGE = Object.freeze({
  id: "bridging-v1",
  version: 1,
  name: "幼小衔接学习包 V1",
  suggested_age: "5-6",
  goals: ["自主阅读与书写准备", "20以内与逻辑数感", "日常英语短句", "科学探索与亲子阅读"],
  modules: Object.freeze([
    { id: "chinese", name: "语文学习", icon_key: "book", content_entry: "chinese", record_type: "checkin" },
    { id: "math", name: "数学与数感", icon_key: "calculator", content_entry: "math", record_type: "checkin" },
    { id: "english", name: "英语学习", icon_key: "languages", content_entry: "english", record_type: "checkin" },
    { id: "book", name: "绘本读物", icon_key: "library", content_entry: "book", record_type: "checkin" },
  ]),
});

export const LEARNING_PACKAGES = Object.freeze([
  FOUNDATION_PACKAGE,
  BRIDGING_PACKAGE,
]);

export const OPTIONAL_CONTENT_MODULES = Object.freeze([
  {
    id: "speaking",
    name: "语言听说",
    icon_key: "volume",
    content_entry: "speaking",
    record_type: "checkin",
    optional: true,
    default_enabled: false,
  },
]);

export const ALL_CONTENT_MODULES = Object.freeze([
  ...FOUNDATION_PACKAGE.modules,
  ...OPTIONAL_CONTENT_MODULES,
]);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function getLearningPackageDefinition(packageId) {
  return LEARNING_PACKAGES.find((pkg) => pkg.id === packageId) || null;
}

export function getActiveLearningPackage(config) {
  const normalized = normalizeContentConfig(config);
  return getLearningPackageDefinition(normalized.package_id) || FOUNDATION_PACKAGE;
}

export function defaultContentConfig(packageId = FOUNDATION_PACKAGE.id) {
  const pkg = getLearningPackageDefinition(packageId) || FOUNDATION_PACKAGE;
  return {
    schema_version: CONTENT_CONFIG_SCHEMA_VERSION,
    package_id: pkg.id,
    package_version: pkg.version,
    enabled: true,
    modules: {
      chinese: true,
      math: true,
      english: true,
      book: true,
    },
  };
}

export function normalizeContentConfig(raw = {}) {
  const source = isRecord(raw) ? raw : {};
  const pkg = getLearningPackageDefinition(source.package_id) || FOUNDATION_PACKAGE;
  const modules = {};
  for (const module of FOUNDATION_PACKAGE.modules) {
    modules[module.id] = source.modules?.[module.id] !== false;
  }
  for (const module of OPTIONAL_CONTENT_MODULES) {
    if (typeof source.modules?.[module.id] === "boolean") {
      modules[module.id] = source.modules[module.id];
    }
  }
  const result = {
    schema_version: CONTENT_CONFIG_SCHEMA_VERSION,
    package_id: pkg.id,
    package_version: pkg.version,
    enabled: source.enabled !== false,
    modules,
  };
  if (Array.isArray(source.spoken_courses)) {
    result.spoken_courses = normalizeSpokenCourseSelection(source.spoken_courses);
  }
  if (isRecord(source.learning_pace)) {
    result.learning_pace = {
      literacy_new: source.learning_pace.literacy_new === 1 ? 1 : 2,
      english_new: source.learning_pace.english_new === 1 ? 1 : 2,
      poems_per_week: source.learning_pace.poems_per_week === 1 ? 1 : 2,
    };
  }
  return result;
}

export function isPackageEnabled(config) {
  return normalizeContentConfig(config).enabled;
}

export function getEnabledModuleIds(config) {
  const normalized = normalizeContentConfig(config);
  if (!normalized.enabled) return [];
  return ALL_CONTENT_MODULES
    .filter((module) => {
      if (module.optional) return normalized.modules[module.id] === true;
      return normalized.modules[module.id] !== false;
    })
    .map((module) => module.id);
}

export function getContentModuleDefinition(moduleId) {
  return ALL_CONTENT_MODULES.find((module) => module.id === moduleId) || null;
}

export function setContentPackageEnabled(config, enabled) {
  const normalized = normalizeContentConfig(config);
  normalized.enabled = Boolean(enabled);
  return normalized;
}

export function setContentPackageId(config, packageId) {
  const normalized = normalizeContentConfig(config);
  const target = getLearningPackageDefinition(packageId);
  if (!target) return normalized;
  normalized.package_id = target.id;
  normalized.package_version = target.version;
  return normalized;
}

export function setContentModuleEnabled(config, moduleId, enabled) {
  const normalized = normalizeContentConfig(config);
  if (!getContentModuleDefinition(moduleId)) return normalized;
  normalized.modules[moduleId] = Boolean(enabled);
  if (enabled) normalized.enabled = true;
  return normalized;
}
