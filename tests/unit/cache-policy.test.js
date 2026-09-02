import { describe, expect, it } from "vitest";
import {
  APP_SHELL_CACHE_NAME,
  isAppShellCacheName,
  staleAppShellCacheNames,
} from "../../src/cache-policy.js";

describe("cache policy", () => {
  it("uses the versioned app-shell cache name", () => {
    expect(APP_SHELL_CACHE_NAME).toBe("shadow-mate-app-v4");
  });

  it("recognizes legacy and current app-shell cache names only", () => {
    expect(isAppShellCacheName("shadow-mate-app-v4")).toBe(true);
    expect(isAppShellCacheName("shadow-mate-v3")).toBe(true);
    expect(isAppShellCacheName("shadow-mate-voice")).toBe(false);
    expect(isAppShellCacheName("shadow-mate-piper-zh_CN-chaowen-medium-v1")).toBe(false);
  });

  it("selects only stale app-shell caches", () => {
    expect(
      staleAppShellCacheNames([
        "shadow-mate-app-v3",
        "shadow-mate-app-v4",
        "shadow-mate-v3",
        "shadow-mate-voice",
        "shadow-mate-piper-en_US-ljspeech-medium-v1",
      ])
    ).toEqual(["shadow-mate-app-v3", "shadow-mate-v3"]);
  });
});
