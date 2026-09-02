import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPiperResourceStore,
  getPiperResourceStatus,
  isPiperResourceCached,
} from "../../src/piper-resource-store.js";
import {
  getPiperResourcePackage,
  listPiperResourcePackages,
  validatePiperResourcePackages,
} from "../../src/piper-resource-registry.js";
import { getPiperCapabilities } from "../../src/piper-resource-capabilities.js";

const HASHES = {
  model: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  metadata: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
};

function createCacheStorage() {
  const cachesByName = new Map();
  return {
    async open(name) {
      if (!cachesByName.has(name)) {
        const entries = new Map();
        cachesByName.set(name, {
          async match(key) {
            return entries.get(String(key))?.clone();
          },
          async put(key, response) {
            entries.set(String(key), response.clone());
          },
          async delete(key) {
            return entries.delete(String(key));
          },
          async keys() {
            return [...entries.keys()].map((url) => new Request(url));
          },
        });
      }
      return cachesByName.get(name);
    },
    async keys() {
      return [...cachesByName.keys()];
    },
    async delete(name) {
      return cachesByName.delete(name);
    },
  };
}

function createPackage({ version = "1", id = "test-voice", baseUrl = "https://voice.example.test/test-voice" } = {}) {
  return {
    id,
    locale: "en-US",
    label: "Test voice",
    kind: "voice",
    version,
    baseUrl,
    source: "cdn",
    cachePolicy: "user-download",
    releaseApproved: true,
    totalBytes: 5,
    files: [
      { key: "model", suffix: ".onnx", contentType: "application/octet-stream", bytes: 3, sha256: HASHES.model },
      { key: "metadata", suffix: ".onnx.json", contentType: "application/json", bytes: 2, sha256: HASHES.metadata },
    ],
  };
}

async function seedCompletePackage(store, resourcePackage) {
  const cache = await store.cacheStorage.open(store.getCacheName(resourcePackage));
  await cache.put(`${resourcePackage.baseUrl}.onnx`, new Response("abc"));
  await cache.put(`${resourcePackage.baseUrl}.onnx.json`, new Response("{}"));
  await store.writeCompletionMarker(resourcePackage);
}

describe("Piper resource registry", () => {
  it("exposes the approved English package and keeps Chinese gated", () => {
    expect(getPiperResourcePackage("en_US-ljspeech-medium")).toMatchObject({
      id: "en_US-ljspeech-medium",
      locale: "en-US",
      source: "cdn",
      cachePolicy: "user-download",
    });
    expect(listPiperResourcePackages().find((entry) => entry.id === "zh_CN-chaowen-medium")).toMatchObject({
      id: "zh_CN-chaowen-medium",
      releaseApproved: false,
    });
  });

  it("rejects invalid active manifests at validation time", () => {
    expect(() => validatePiperResourcePackages([{ ...createPackage(), files: [] }])).toThrow(/files/i);
    expect(() => validatePiperResourcePackages([{ ...createPackage(), files: [{ ...createPackage().files[0], sha256: "" }] }])).toThrow(/sha-256/i);
  });

  it("reports each local-download capability independently", () => {
    const capabilities = getPiperCapabilities();
    expect(capabilities).toEqual(expect.objectContaining({
      cacheStorageRead: expect.any(Boolean),
      cacheStorageWrite: expect.any(Boolean),
      readableStream: expect.any(Boolean),
      transformStream: expect.any(Boolean),
      abortController: expect.any(Boolean),
      webAssembly: expect.any(Boolean),
      userGestureAudio: expect.any(Boolean),
    }));
  });
});

describe("versioned Piper resource store", () => {
  let cacheStorage;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function createStore(packages = [createPackage()]) {
    cacheStorage = createCacheStorage();
    return createPiperResourceStore({
      packages,
      cacheStorage,
      getCapabilities: () => ({ canDownload: true }),
    });
  }

  it("requires both complete files and an exact completion marker", async () => {
    const resourcePackage = createPackage();
    const store = createStore([resourcePackage]);
    await seedCompletePackage(store, resourcePackage);

    await expect(store.isPiperResourceCached(resourcePackage.id)).resolves.toBe(true);
    await (await cacheStorage.open(store.getCacheName(resourcePackage))).delete(`${resourcePackage.baseUrl}.onnx.json`);
    await expect(store.isPiperResourceCached(resourcePackage.id)).resolves.toBe(false);
    await expect(store.getPiperResourceStatus(resourcePackage.id)).resolves.toBe("partial");
  });

  it("invalidates URL, version, and hash marker mismatches instead of trusting cached responses", async () => {
    const resourcePackage = createPackage();
    const store = createStore([resourcePackage]);
    await seedCompletePackage(store, resourcePackage);
    const cache = await cacheStorage.open(store.getCacheName(resourcePackage));
    const markerKey = store.getMarkerKey(resourcePackage);
    const marker = await (await cache.match(markerKey)).json();
    marker.files[0].actualSha256 = "0".repeat(64);
    await cache.put(markerKey, new Response(JSON.stringify(marker)));

    await expect(store.isPiperResourceCached(resourcePackage.id)).resolves.toBe(false);
    await expect(cache.match(`${resourcePackage.baseUrl}.onnx`)).resolves.toBeUndefined();
    await expect(cache.match(markerKey)).resolves.toBeUndefined();

    const v2 = createPackage({ version: "2" });
    const v2Store = createStore([v2]);
    await expect(v2Store.isPiperResourceCached(v2.id)).resolves.toBe(false);
  });

  it("migrates only a complete, verified legacy English voice cache", async () => {
    const english = {
      ...createPackage({ id: "en_US-ljspeech-medium", baseUrl: "https://voice.shadow.wang/piper/en_US-ljspeech-medium" }),
    };
    const store = createStore([english]);
    const legacy = await cacheStorage.open("shadow-mate-voice");
    await legacy.put(`${english.baseUrl}.onnx`, new Response("abc"));
    await legacy.put(`${english.baseUrl}.onnx.json`, new Response("{}"));

    await expect(store.migrateLegacyEnglishVoice()).resolves.toMatchObject({ status: "migrated" });
    await expect(store.isPiperResourceCached(english.id)).resolves.toBe(true);

    const partialStore = createStore([english]);
    await (await cacheStorage.open("shadow-mate-voice")).put(`${english.baseUrl}.onnx`, new Response("abc"));
    await expect(partialStore.migrateLegacyEnglishVoice()).resolves.toMatchObject({ status: "not-downloaded" });
  });

  it("deletes only the selected package and removes only usable superseded versions", async () => {
    const current = createPackage({ id: "voice-a", version: "2" });
    const other = createPackage({ id: "voice-b" });
    const store = createStore([current, other]);
    await seedCompletePackage(store, current);
    await seedCompletePackage(store, other);
    const old = createPackage({ id: "voice-a", version: "1" });
    await seedCompletePackage(store, old);

    await store.cleanupSupersededPiperResourceCaches(current.id, { inUseCacheNames: [store.getCacheName(old)] });
    await expect(cacheStorage.keys()).resolves.toContain(store.getCacheName(old));
    await store.cleanupSupersededPiperResourceCaches(current.id);
    await expect(cacheStorage.keys()).resolves.not.toContain(store.getCacheName(old));
    await store.deletePiperResource(current.id);
    await expect(cacheStorage.keys()).resolves.not.toContain(store.getCacheName(current));
    await expect(cacheStorage.keys()).resolves.toContain(store.getCacheName(other));
  });

  it("reports unsupported cache APIs and browser eviction without claiming a completed download", async () => {
    const resourcePackage = createPackage();
    const store = createStore([resourcePackage]);
    store.getCapabilities = () => ({ canDownload: false });
    await expect(store.getPiperResourceStatus(resourcePackage.id)).resolves.toBe("unsupported");
    expect(await getPiperResourceStatus("missing-package")).toBe("invalid");
    expect(await isPiperResourceCached("missing-package")).toBe(false);

    const evictedStore = createStore([resourcePackage]);
    await seedCompletePackage(evictedStore, resourcePackage);
    await cacheStorage.delete(evictedStore.getCacheName(resourcePackage));
    await expect(evictedStore.getPiperResourceStatus(resourcePackage.id)).resolves.toBe("not-downloaded");
  });
});
