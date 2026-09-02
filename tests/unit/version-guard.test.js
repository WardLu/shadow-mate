import { describe, expect, it } from "vitest";
import {
  extractScriptSources,
  scriptSourcesDiffer,
  createErrorTracker,
  selectCacheNamesToDelete,
} from "../../src/version-guard.js";

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
