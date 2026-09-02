import { describe, expect, it, vi } from "vitest";
import {
  extractScriptSources,
  scriptSourcesDiffer,
  createErrorTracker,
  reloadToLatest,
  selectCacheNamesToDelete,
} from "../../src/version-guard.js";
import { getPiperResourcePackage } from "../../src/piper-resource-registry.js";

describe("extractScriptSources", () => {
  it("extracts module script src from HTML", () => {
    const html = `<html><head>
      <script type="module" src="/src/app.js"></script>
      <script type="module" src="/src/cloud.js"></script>
    </head></html>`;
    expect(extractScriptSources(html).sort()).toEqual(["/src/app.js", "/src/cloud.js"]);
  });

  it("extracts hashed asset paths from production HTML", () => {
    const html = `<script type="module" crossorigin src="/assets/index-a1b2c3.js"></script>`;
    expect(extractScriptSources(html)).toEqual(["/assets/index-a1b2c3.js"]);
  });

  it("ignores inline scripts and non-module scripts", () => {
    const html = `<head>
      <script>console.log("inline")</script>
      <script src="/lib.js"></script>
      <script type="module" src="/src/app.js"></script>
    </head>`;
    expect(extractScriptSources(html)).toEqual(["/src/app.js"]);
  });

  it("returns empty array for HTML without module scripts", () => {
    expect(extractScriptSources("<html></html>")).toEqual([]);
  });
});

describe("scriptSourcesDiffer", () => {
  it("returns false when sources are identical", () => {
    expect(scriptSourcesDiffer(["/a.js", "/b.js"], ["/a.js", "/b.js"])).toBe(false);
  });

  it("returns true when a src hash changed", () => {
    expect(scriptSourcesDiffer(["/assets/index-aaa.js"], ["/assets/index-bbb.js"])).toBe(true);
  });

  it("returns true when script count changed", () => {
    expect(scriptSourcesDiffer(["/a.js"], ["/a.js", "/b.js"])).toBe(true);
  });

  it("returns false for empty arrays", () => {
    expect(scriptSourcesDiffer([], [])).toBe(false);
  });
});

describe("createErrorTracker", () => {
  it("does not trigger reload below threshold", () => {
    const tracker = createErrorTracker({ maxErrors: 3, windowMs: 10_000 });
    tracker.record();
    tracker.record();
    expect(tracker.shouldReload()).toBe(false);
  });

  it("triggers reload when errors exceed threshold within window", () => {
    const tracker = createErrorTracker({ maxErrors: 3, windowMs: 10_000 });
    tracker.record();
    tracker.record();
    tracker.record();
    expect(tracker.shouldReload()).toBe(true);
  });

  it("resets after the time window passes", async () => {
    const tracker = createErrorTracker({ maxErrors: 2, windowMs: 50 });
    tracker.record();
    tracker.record();
    expect(tracker.shouldReload()).toBe(true);
    await new Promise((r) => setTimeout(r, 60));
    expect(tracker.shouldReload()).toBe(false);
  });
});

describe("selectCacheNamesToDelete", () => {
  it("preserves voice and Piper caches during app-shell cleanup", () => {
    expect(
      selectCacheNamesToDelete([
        "shadow-mate-app-v3",
        "shadow-mate-app-v4",
        "shadow-mate-v3",
        "shadow-mate-voice",
        "shadow-mate-piper-en_US-ljspeech-medium-v1",
      ])
    ).toEqual(["shadow-mate-app-v3", "shadow-mate-v3"]);
  });
});

describe("reloadToLatest", () => {
  it("deletes only stale app-shell caches, preserves a completed Piper cache, and reloads", async () => {
    const resourcePackage = getPiperResourcePackage("en_US-ljspeech-medium");
    const piperCacheName = `shadow-mate-piper-${resourcePackage.id}-${resourcePackage.version}`;
    const completedPiperCache = {
      marker: {
        id: resourcePackage.id,
        version: resourcePackage.version,
        manifestVersion: resourcePackage.version,
        files: resourcePackage.files.map((file) => ({
          key: file.key,
          expectedBytes: file.bytes,
          actualBytes: file.bytes,
          expectedSha256: file.sha256,
          actualSha256: file.sha256,
        })),
      },
    };
    const cachesByName = new Map([
      ["shadow-mate-app-v3", {}],
      ["shadow-mate-app-v4", {}],
      ["shadow-mate-v3", {}],
      [piperCacheName, completedPiperCache],
    ]);
    const cacheStorage = {
      keys: vi.fn(async () => [...cachesByName.keys()]),
      delete: vi.fn(async (name) => cachesByName.delete(name)),
    };
    const markReload = vi.fn();
    const reload = vi.fn();

    await reloadToLatest({ cacheStorage, markReload, reload });

    expect(cacheStorage.delete).toHaveBeenCalledTimes(2);
    expect(new Set(cachesByName.keys())).toEqual(new Set([
      "shadow-mate-app-v4",
      piperCacheName,
    ]));
    expect(cachesByName.get(piperCacheName)).toBe(completedPiperCache);
    expect(markReload).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not mask a reload error after app-shell cleanup", async () => {
    const expected = new Error("reload failed");
    const cacheStorage = { keys: vi.fn(async () => ["shadow-mate-app-v3"]), delete: vi.fn(async () => true) };

    await expect(reloadToLatest({ cacheStorage, markReload: vi.fn(), reload: () => { throw expected; } })).rejects.toBe(expected);
    expect(cacheStorage.delete).toHaveBeenCalledWith("shadow-mate-app-v3");
  });
});
