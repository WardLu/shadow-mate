import { describe, expect, it } from "vitest";
import {
  CONTENT_CONFIG_SCHEMA_VERSION,
  defaultContentConfig,
  FOUNDATION_PACKAGE,
  BRIDGING_PACKAGE,
  LEARNING_PACKAGES,
  getActiveLearningPackage,
  getContentModuleDefinition,
  getEnabledModuleIds,
  isPackageEnabled,
  normalizeContentConfig,
  setContentModuleEnabled,
  setContentPackageEnabled,
  setContentPackageId,
} from "../../src/learning-content-package.js";

describe("content package registry", () => {
  it("exposes a stable package and module registry", () => {
    expect(FOUNDATION_PACKAGE.id).toBe("foundation-v2");
    expect(FOUNDATION_PACKAGE.version).toBe(2);
    expect(FOUNDATION_PACKAGE.name).toBe("启蒙学习包 V2");
    expect(FOUNDATION_PACKAGE.suggested_age).toBe("4-5");
    expect(FOUNDATION_PACKAGE.modules.map((module) => module.id)).toEqual(["chinese", "math", "english", "book"]);
    for (const module of FOUNDATION_PACKAGE.modules) {
      expect(getContentModuleDefinition(module.id)).toBe(module);
    }
    expect(getContentModuleDefinition("unknown")).toBeNull();

    expect(BRIDGING_PACKAGE.id).toBe("bridging-v1");
    expect(BRIDGING_PACKAGE.version).toBe(1);
    expect(BRIDGING_PACKAGE.name).toBe("幼小衔接学习包 V1");
    expect(BRIDGING_PACKAGE.suggested_age).toBe("5-6");
    expect(LEARNING_PACKAGES).toEqual([FOUNDATION_PACKAGE, BRIDGING_PACKAGE]);
  });

  it("exposes optional spoken language module", () => {
    const speakingModule = getContentModuleDefinition("speaking");
    expect(speakingModule).toMatchObject({
      id: "speaking",
      name: "语言听说",
      optional: true,
      default_enabled: false,
    });
  });

  it("defaults every module and the package to enabled, keeping speaking disabled", () => {
    expect(defaultContentConfig()).toEqual({
      schema_version: CONTENT_CONFIG_SCHEMA_VERSION,
      package_ids: ["foundation-v2"],
      package_id: "foundation-v2",
      package_version: 2,
      enabled: true,
      modules: { chinese: true, math: true, english: true, book: true },
    });
    expect(getEnabledModuleIds(defaultContentConfig())).toEqual(["chinese", "math", "english", "book"]);
  });

  it("normalizes malformed configs to all-enabled defaults", () => {
    expect(getEnabledModuleIds(null)).toEqual(["chinese", "math", "english", "book"]);
    expect(getEnabledModuleIds({ modules: { math: false } })).toEqual(["chinese", "english", "book"]);
    expect(getEnabledModuleIds({ modules: { book: false }, enabled: false })).toEqual([]);
  });

  it("disabling the package hides every module", () => {
    const config = setContentPackageEnabled(defaultContentConfig(), false);
    expect(isPackageEnabled(config)).toBe(false);
    expect(getEnabledModuleIds(config)).toEqual([]);
  });

  it("re-enabling a module also enables the package", () => {
    const config = setContentModuleEnabled(setContentPackageEnabled(defaultContentConfig(), false), "math", true);
    expect(config.enabled).toBe(true);
    expect(getEnabledModuleIds(config)).toEqual(["chinese", "math", "english", "book"]);
  });

  it("disabling one module removes it from the enabled set", () => {
    const config = setContentModuleEnabled(defaultContentConfig(), "math", false);
    expect(config.enabled).toBe(true);
    expect(getEnabledModuleIds(config)).toEqual(["chinese", "english", "book"]);
  });

  it("enabling speaking module includes it in enabled set without affecting core defaults", () => {
    const config = setContentModuleEnabled(defaultContentConfig(), "speaking", true);
    expect(config.modules.speaking).toBe(true);
    expect(getEnabledModuleIds(config)).toEqual(["chinese", "math", "english", "book", "speaking"]);

    const disabledAgain = setContentModuleEnabled(config, "speaking", false);
    expect(disabledAgain.modules.speaking).toBe(false);
    expect(getEnabledModuleIds(disabledAgain)).toEqual(["chinese", "math", "english", "book"]);
  });

  it("switches packages while preserving module settings", () => {
    const initial = setContentModuleEnabled(defaultContentConfig(), "math", false);
    const switched = setContentPackageId(initial, "bridging-v1");

    expect(switched.package_id).toBe("bridging-v1");
    expect(switched.package_version).toBe(1);
    expect(switched.modules.math).toBe(false);
    expect(getActiveLearningPackage(switched)).toBe(BRIDGING_PACKAGE);

    const reverted = setContentPackageId(switched, "foundation-v2");
    expect(reverted.package_id).toBe("foundation-v2");
    expect(reverted.package_version).toBe(2);
    expect(getActiveLearningPackage(reverted)).toBe(FOUNDATION_PACKAGE);
  });

  it("normalizes course selection and preserves it across age packages", () => {
    const config = normalizeContentConfig({ spoken_courses: ["yue-hk-everyday-speaking", "unknown", "yue-hk-everyday-speaking", null] });
    expect(config.spoken_courses).toEqual(["yue-hk-everyday-speaking"]);
    expect(setContentPackageId(config, "bridging-v1").spoken_courses).toEqual(config.spoken_courses);
    expect(config.modules.speaking).toBeUndefined();
  });

  it("preserves bounded learning pace across package changes and normalizes invalid choices", () => {
    const config = normalizeContentConfig({ learning_pace: { literacy_new: 1, english_new: 1, poems_per_week: 1 } });
    expect(setContentPackageId(config, "bridging-v1").learning_pace).toEqual(config.learning_pace);
    expect(normalizeContentConfig({ learning_pace: { literacy_new: 99, english_new: -1, poems_per_week: "1", other: 1 } }).learning_pace)
      .toEqual({ literacy_new: 2, english_new: 2, poems_new: 2, poems_per_week: 2 });
  });

  it("ignores unknown module ids and never leaks unknown config keys", () => {
    const config = setContentModuleEnabled(defaultContentConfig(), "unknown", false);
    expect(getEnabledModuleIds(config)).toEqual(["chinese", "math", "english", "book"]);
    expect(normalizeContentConfig({ modules: { chinese: false, junk: true } })).toEqual({
      schema_version: CONTENT_CONFIG_SCHEMA_VERSION,
      package_ids: ["foundation-v2"],
      package_id: "foundation-v2",
      package_version: 2,
      enabled: true,
      modules: { chinese: false, math: true, english: true, book: true },
    });
  });
});
