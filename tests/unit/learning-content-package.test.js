import { describe, expect, it } from "vitest";
import {
  CONTENT_CONFIG_SCHEMA_VERSION,
  defaultContentConfig,
  FOUNDATION_PACKAGE,
  getContentModuleDefinition,
  getEnabledModuleIds,
  isPackageEnabled,
  normalizeContentConfig,
  setContentModuleEnabled,
  setContentPackageEnabled,
} from "../../src/learning-content-package.js";

describe("content package registry", () => {
  it("exposes a stable package and module registry", () => {
    expect(FOUNDATION_PACKAGE.id).toBe("foundation-v1");
    expect(FOUNDATION_PACKAGE.version).toBe(1);
    expect(FOUNDATION_PACKAGE.modules.map((module) => module.id)).toEqual(["chinese", "math", "english", "book"]);
    for (const module of FOUNDATION_PACKAGE.modules) {
      expect(getContentModuleDefinition(module.id)).toBe(module);
    }
    expect(getContentModuleDefinition("unknown")).toBeNull();
  });

  it("defaults every module and the package to enabled", () => {
    expect(defaultContentConfig()).toEqual({
      schema_version: CONTENT_CONFIG_SCHEMA_VERSION,
      package_id: "foundation-v1",
      package_version: 1,
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

  it("ignores unknown module ids and never leaks unknown config keys", () => {
    const config = setContentModuleEnabled(defaultContentConfig(), "unknown", false);
    expect(getEnabledModuleIds(config)).toEqual(["chinese", "math", "english", "book"]);
    expect(normalizeContentConfig({ modules: { chinese: false, junk: true } })).toEqual({
      schema_version: CONTENT_CONFIG_SCHEMA_VERSION,
      package_id: "foundation-v1",
      package_version: 1,
      enabled: true,
      modules: { chinese: false, math: true, english: true, book: true },
    });
  });
});
