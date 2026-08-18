// 启蒙学习包 v1 —— 轻量代码注册表。
// 这是唯一的内容包/模块定义来源：稳定 ID、名称、图标、既有内容入口与记录类型。
// 孩子级启停配置保存在学习状态 envelope 的 learning.content_config 中，
// 不新增内容包数据库表；本模块不产生积分流水。

export const CONTENT_CONFIG_SCHEMA_VERSION = 1;

export const FOUNDATION_PACKAGE = Object.freeze({
  id: "foundation-v1",
  version: 1,
  name: "启蒙学习包 v1",
  suggested_age: "4-5",
  goals: ["识字与阅读", "数感启蒙", "英语启蒙", "亲子共读"],
  modules: Object.freeze([
    { id: "chinese", name: "语文学习", icon_key: "book", content_entry: "chinese", record_type: "checkin" },
    { id: "math", name: "数学与数感", icon_key: "calculator", content_entry: "math", record_type: "checkin" },
    { id: "english", name: "英语学习", icon_key: "languages", content_entry: "english", record_type: "checkin" },
    { id: "book", name: "绘本读物", icon_key: "library", content_entry: "book", record_type: "checkin" },
  ]),
});

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function defaultContentConfig() {
  return {
    schema_version: CONTENT_CONFIG_SCHEMA_VERSION,
    package_id: FOUNDATION_PACKAGE.id,
    package_version: FOUNDATION_PACKAGE.version,
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
  const defaults = defaultContentConfig();
  const modules = {};
  for (const module of FOUNDATION_PACKAGE.modules) {
    modules[module.id] = source.modules?.[module.id] !== false;
  }
  return {
    schema_version: CONTENT_CONFIG_SCHEMA_VERSION,
    package_id: FOUNDATION_PACKAGE.id,
    package_version: FOUNDATION_PACKAGE.version,
    enabled: source.enabled !== false,
    modules,
  };
}

export function isPackageEnabled(config) {
  return normalizeContentConfig(config).enabled;
}

export function getEnabledModuleIds(config) {
  const normalized = normalizeContentConfig(config);
  if (!normalized.enabled) return [];
  return FOUNDATION_PACKAGE.modules
    .filter((module) => normalized.modules[module.id] !== false)
    .map((module) => module.id);
}

export function getContentModuleDefinition(moduleId) {
  return FOUNDATION_PACKAGE.modules.find((module) => module.id === moduleId) || null;
}

export function setContentPackageEnabled(config, enabled) {
  const normalized = normalizeContentConfig(config);
  normalized.enabled = Boolean(enabled);
  return normalized;
}

export function setContentModuleEnabled(config, moduleId, enabled) {
  const normalized = normalizeContentConfig(config);
  if (!getContentModuleDefinition(moduleId)) return normalized;
  normalized.modules[moduleId] = Boolean(enabled);
  if (enabled) normalized.enabled = true;
  return normalized;
}
