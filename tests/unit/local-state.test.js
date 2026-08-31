import { describe, expect, it } from "vitest";
import { createScopedStateStorage } from "../../src/local-state.js";

const LEGACY_KEY = "shadow_mate_workbench_v1";
const SCOPED_KEY = "shadow_mate_workbench_scoped_v1";

class MemoryStorage {
  constructor(entries = {}) {
    this.entries = new Map(Object.entries(entries));
    this.setCalls = 0;
    this.failWrites = false;
  }

  getItem(key) {
    return this.entries.has(key) ? this.entries.get(key) : null;
  }

  setItem(key, value) {
    this.setCalls += 1;
    if (this.failWrites) throw new Error("storage write failed");
    this.entries.set(key, String(value));
  }

  removeItem(key) {
    this.entries.delete(key);
  }
}

function createAdapter(storage) {
  return createScopedStateStorage({
    storage,
    legacyKey: LEGACY_KEY,
    scopedKey: SCOPED_KEY,
    normalize: (state) => structuredClone(state && typeof state === "object" ? state : {}),
  });
}

function stateWith(marker) {
  return {
    checkins: { "2026-09-01": { [marker]: true } },
    extra: { hanziWorksheetRotationV1: { marker } },
    points: {},
    bookShelf: {},
    peanutLog: [],
    peanutRead: {},
  };
}

describe("scoped local state storage", () => {
  it("copies the legacy state to anonymous once and does not overwrite it", () => {
    const legacyState = stateWith("legacy");
    const storage = new MemoryStorage({ [LEGACY_KEY]: JSON.stringify(legacyState) });
    const scoped = createAdapter(storage);

    scoped.migrateLegacyToAnonymous();

    expect(scoped.load("anonymous")).toEqual(legacyState);
    expect(JSON.parse(storage.getItem(SCOPED_KEY))).toEqual({
      schemaVersion: 1,
      scopes: { anonymous: legacyState },
    });
    expect(storage.getItem(LEGACY_KEY)).toBeNull();

    const writesAfterMigration = storage.setCalls;
    storage.entries.set(LEGACY_KEY, JSON.stringify(stateWith("should-not-win")));
    scoped.migrateLegacyToAnonymous();

    expect(storage.setCalls).toBe(writesAfterMigration);
    expect(scoped.load("anonymous")).toEqual(legacyState);
  });

  it("keeps the legacy key when copying fails", () => {
    const legacyState = stateWith("preserved");
    const storage = new MemoryStorage({ [LEGACY_KEY]: JSON.stringify(legacyState) });
    storage.failWrites = true;
    const scoped = createAdapter(storage);

    expect(() => scoped.migrateLegacyToAnonymous()).not.toThrow();
    expect(storage.getItem(LEGACY_KEY)).toBe(JSON.stringify(legacyState));
    expect(storage.getItem(SCOPED_KEY)).toBeNull();
    expect(scoped.load("anonymous")).toEqual(legacyState);
  });

  it("degrades corrupt legacy JSON to an empty anonymous state", () => {
    const storage = new MemoryStorage({ [LEGACY_KEY]: "{not-json" });
    const scoped = createAdapter(storage);

    scoped.migrateLegacyToAnonymous();

    expect(scoped.load("anonymous")).toEqual({});
    expect(JSON.parse(storage.getItem(SCOPED_KEY))).toEqual({
      schemaVersion: 1,
      scopes: { anonymous: {} },
    });
  });

  it("keeps profile scopes isolated and removes only the requested scope", () => {
    const storage = new MemoryStorage();
    const scoped = createAdapter(storage);
    const profileA = stateWith("profile-a");
    const profileB = stateWith("profile-b");

    scoped.save("profile:a", profileA);
    scoped.save("profile:b", profileB);

    expect(scoped.listScopes()).toEqual(["profile:a", "profile:b"]);
    expect(scoped.load("profile:a")).toEqual(profileA);
    expect(scoped.load("profile:b")).toEqual(profileB);

    scoped.remove("profile:a");

    expect(scoped.load("profile:a")).toEqual({});
    expect(scoped.load("profile:b")).toEqual(profileB);
    expect(scoped.listScopes()).toEqual(["profile:b"]);
  });

  it("normalizes every state read and write without mutating the envelope", () => {
    const storage = new MemoryStorage();
    let normalizeCalls = 0;
    const normalize = (state) => {
      normalizeCalls += 1;
      return { value: state?.value || 0, normalized: true };
    };
    const scoped = createScopedStateStorage({ storage, normalize });
    const input = { value: 7, ignored: "input-only" };

    scoped.save("profile:a", input);
    input.value = 99;
    const storedBeforeRead = JSON.parse(storage.getItem("shadow_mate_workbench_scoped_v1"));
    const loaded = scoped.load("profile:a");
    loaded.value = 42;

    expect(storedBeforeRead.scopes["profile:a"]).toEqual({ value: 7, normalized: true });
    expect(loaded).toEqual({ value: 42, normalized: true });
    expect(JSON.parse(storage.getItem("shadow_mate_workbench_scoped_v1"))).toEqual(storedBeforeRead);
    expect(normalizeCalls).toBeGreaterThanOrEqual(2);
  });

  it("clears the legacy key and every scoped state", () => {
    const storage = new MemoryStorage({ [LEGACY_KEY]: JSON.stringify(stateWith("legacy")) });
    const scoped = createAdapter(storage);
    scoped.save("anonymous", stateWith("anonymous"));
    scoped.save("profile:a", stateWith("profile-a"));

    scoped.clear();

    expect(storage.getItem(LEGACY_KEY)).toBeNull();
    expect(storage.getItem(SCOPED_KEY)).toBeNull();
    expect(scoped.listScopes()).toEqual([]);
  });
});
