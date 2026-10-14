import { normalizeSpokenCourseSelection } from "./spoken-language-courses.js";

// 启蒙学习包 V2 与幼小衔接包 V1 —— 轻量代码注册表。
// 这是唯一的内容包/模块定义来源：稳定 ID、名称、图标、既有内容入口与记录类型。
// 孩子级启停配置保存在学习状态 envelope 的 learning.content_config 中，
// 不新增内容包数据库表；本模块不产生积分流水。

export const CONTENT_CONFIG_SCHEMA_VERSION = 2;
export const CONTENT_LEARNING_BUDGET = Object.freeze({ minimum: 1, maximum: 20, default: 2 });
export const DEFAULT_CONTENT_LEARNING_PACE = Object.freeze({ literacy_new: 2, english_new: 2, poems_new: 2 });

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

export function normalizeContentPackageIds(packageIds, legacyPackageId) {
  const selected = Array.isArray(packageIds)
    ? LEARNING_PACKAGES.filter((pkg) => packageIds.includes(pkg.id)).map((pkg) => pkg.id)
    : [];
  if (selected.length) return selected;
  const legacy = getLearningPackageDefinition(legacyPackageId);
  return [legacy?.id || FOUNDATION_PACKAGE.id];
}

export function getActiveLearningPackages(config) {
  return normalizeContentConfig(config).package_ids.map(getLearningPackageDefinition);
}

export function getActiveLearningPackage(config) {
  return getActiveLearningPackages(config)[0];
}

export function isValidContentLearningBudget(value) {
  return Number.isInteger(value) && value >= CONTENT_LEARNING_BUDGET.minimum && value <= CONTENT_LEARNING_BUDGET.maximum;
}

export function getContentLearningPace(config) {
  const source = isRecord(config?.learning_pace) ? config.learning_pace : {};
  const poemBudget = source.poems_new !== undefined ? source.poems_new : source.poems_per_week;
  const poemValue = isValidContentLearningBudget(poemBudget) ? poemBudget : DEFAULT_CONTENT_LEARNING_PACE.poems_new;
  return {
    literacy_new: isValidContentLearningBudget(source.literacy_new) ? source.literacy_new : DEFAULT_CONTENT_LEARNING_PACE.literacy_new,
    english_new: isValidContentLearningBudget(source.english_new) ? source.english_new : DEFAULT_CONTENT_LEARNING_PACE.english_new,
    poems_new: poemValue,
    poems_per_week: poemValue,
  };
}

export function defaultContentConfig(packageId = FOUNDATION_PACKAGE.id) {
  const packageIds = normalizeContentPackageIds(Array.isArray(packageId) ? packageId : undefined, packageId);
  const pkg = getLearningPackageDefinition(packageIds[0]);
  return {
    schema_version: CONTENT_CONFIG_SCHEMA_VERSION,
    package_ids: packageIds,
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
  const packageIds = normalizeContentPackageIds(source.package_ids, source.package_id);
  const pkg = getLearningPackageDefinition(packageIds[0]);
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
    package_ids: packageIds,
    package_id: pkg.id,
    package_version: pkg.version,
    enabled: source.enabled !== false,
    modules,
  };
  if (Array.isArray(source.spoken_courses)) {
    result.spoken_courses = normalizeSpokenCourseSelection(source.spoken_courses);
  }
  if (isRecord(source.learning_pace)) result.learning_pace = getContentLearningPace(source);
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

export function setContentPackageIds(config, packageIds) {
  const normalized = normalizeContentConfig(config);
  const selected = Array.isArray(packageIds)
    ? LEARNING_PACKAGES.filter((pkg) => packageIds.includes(pkg.id)).map((pkg) => pkg.id)
    : [];
  if (!selected.length) return normalized;
  normalized.package_ids = selected;
  const primary = getLearningPackageDefinition(selected[0]);
  normalized.package_id = primary.id;
  normalized.package_version = primary.version;
  return normalized;
}

export function setContentPackageId(config, packageId) {
  return setContentPackageIds(config, [packageId]);
}

export function setContentModuleEnabled(config, moduleId, enabled) {
  const normalized = normalizeContentConfig(config);
  if (!getContentModuleDefinition(moduleId)) return normalized;
  normalized.modules[moduleId] = Boolean(enabled);
  if (enabled) normalized.enabled = true;
  return normalized;
}
