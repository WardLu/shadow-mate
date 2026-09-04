import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import {
  createPiperResourceStore,
  getPiperResourceStatus,
  isPiperResourceCached,
  PiperResourceStorageError,
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
  const cacheKey = (key) => typeof key === "string" ? key : key.url;
  return {
    async open(name) {
      if (!cachesByName.has(name)) {
        const entries = new Map();
        cachesByName.set(name, {
          async match(key) {
            return entries.get(cacheKey(key))?.clone();
          },
          async put(key, response) {
            entries.set(cacheKey(key), response.clone());
          },
          async delete(key) {
            return entries.delete(cacheKey(key));
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
    licenseStatus: "approved",
    license: { status: "approved", model: "MIT", trainingData: "public-domain", reference: "https://example.test/model-card" },
    provenance: { status: "verified", source: "https://example.test/source", modelCard: "https://example.test/model-card" },
    distribution: { status: "approved", channel: "public-cdn", notice: "THIRD_PARTY_NOTICES.md" },
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
  return store.writeCompletionMarker(resourcePackage);
}

describe("Piper resource registry", () => {
  it("exposes one approved bilingual package and retains deprecated Piper metadata", () => {
    expect(getPiperResourcePackage("en_US-ljspeech-medium")).toMatchObject({
      id: "en_US-ljspeech-medium",
      locale: "en-US",
      releaseApproved: false,
      source: "cdn",
      cachePolicy: "user-download",
    });
    expect(listPiperResourcePackages().find((entry) => entry.id === "zh_CN-chaowen-medium")).toMatchObject({
      id: "zh_CN-chaowen-medium",
      releaseApproved: false,
      source: "cdn",
      cachePolicy: "user-download",
      totalBytes: 63224911,
    });
    expect(getPiperResourcePackage("matcha-icefall-zh-en-1.13.2")).toMatchObject({
      locales: ["zh-CN", "en-US"],
      releaseApproved: true,
      source: "cdn",
      cachePolicy: "user-download",
      totalBytes: 162111773,
    });
    expect(listPiperResourcePackages().find((entry) => entry.id === "piper-browser-runtime")).toMatchObject({
      source: "bundled",
      cachePolicy: "app-shell",
      totalBytes: 76786515,
      files: expect.arrayContaining([
        expect.objectContaining({ url: "/piper-tts-web.js", bytes: 46656168, license: expect.any(String) }),
        expect.objectContaining({ url: "/onnx/ort-wasm-simd-threaded.wasm", bytes: 11246032 }),
        expect.objectContaining({ url: "/piper/piper_phonemize.wasm", bytes: 629166 }),
        expect.objectContaining({ url: "/piper/piper_phonemize.data", bytes: 18077249 }),
      ]),
    });
  });

  it("rejects invalid active manifests at validation time", () => {
    expect(() => validatePiperResourcePackages([{ ...createPackage(), files: [] }])).toThrow(/files/i);
    expect(() => validatePiperResourcePackages([{ ...createPackage(), files: [{ ...createPackage().files[0], sha256: "" }] }])).toThrow(/sha-256/i);
    expect(() => validatePiperResourcePackages([{ ...createPackage(), licenseStatus: "pending" }])).toThrow(/license/i);
    expect(() => validatePiperResourcePackages([{ ...createPackage(), provenance: { status: "partial" } }])).toThrow(/provenance/i);
    expect(() => validatePiperResourcePackages([{ ...createPackage(), distribution: { status: "blocked" } }])).toThrow(/distribution/i);
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

  it("uses an HTTP(S) completion marker key accepted by browser Cache Storage", () => {
    const resourcePackage = createPackage();
    const store = createStore([resourcePackage]);

    expect(store.getMarkerKey(resourcePackage)).toBe("https://voice.example.test/test-voice/__shadow-mate-piper-package__/test-voice%401");
  });

  it("requires both complete files and an exact completion marker", async () => {
    const resourcePackage = createPackage();
    const store = createStore([resourcePackage]);
    await seedCompletePackage(store, resourcePackage);

    await expect(store.isPiperResourceCached(resourcePackage.id)).resolves.toBe(true);
    await (await cacheStorage.open(store.getCacheName(resourcePackage))).delete(`${resourcePackage.baseUrl}.onnx.json`);
    await expect(store.isPiperResourceCached(resourcePackage.id)).resolves.toBe(false);
    await expect(store.getPiperResourceStatus(resourcePackage.id)).resolves.toBe("partial");
  });

  it("invalidates a package marker without deleting independently verified files", async () => {
    const resourcePackage = createPackage();
    const store = createStore([resourcePackage]);
    const seeded = await seedCompletePackage(store, resourcePackage);
    const cache = await cacheStorage.open(store.getCacheName(resourcePackage));
    const markerKey = store.getMarkerKey(resourcePackage, seeded.commitId);
    const marker = await (await cache.match(markerKey)).json();
    marker.files[0].actualSha256 = "0".repeat(64);
    await cache.put(markerKey, new Response(JSON.stringify(marker)));

    await expect(store.isPiperResourceCached(resourcePackage.id)).resolves.toBe(false);
    await expect(cache.match(`${resourcePackage.baseUrl}.onnx`)).resolves.toBeTruthy();
    await expect(store.getFileCompletionMarkers(resourcePackage, resourcePackage.files[0], cache)).resolves.toHaveLength(1);
    await expect(cache.match(markerKey)).resolves.toBeUndefined();
    await expect(store.getPiperResourceStatus(resourcePackage.id)).resolves.toBe("partial");

    const v2 = createPackage({ version: "2" });
    const v2Store = createStore([v2]);
    await expect(v2Store.isPiperResourceCached(v2.id)).resolves.toBe(false);
  });

  it("removes malformed or untrusted marker data while preserving verified manifest files", async () => {
    const resourcePackage = createPackage();
    const store = createStore([resourcePackage]);
    const seeded = await seedCompletePackage(store, resourcePackage);
    const cache = await cacheStorage.open(store.getCacheName(resourcePackage));
    const markerKey = store.getMarkerKey(resourcePackage, seeded.commitId);
    const marker = await (await cache.match(markerKey)).json();
    const untrustedUrl = "https://untrusted.example.test/model.onnx";
    marker.files[0].url = untrustedUrl;
    await cache.put(untrustedUrl, new Response("untrusted"));
    await cache.put(markerKey, new Response(JSON.stringify(marker)));

    await expect(store.isPiperResourceCached(resourcePackage.id)).resolves.toBe(false);
    await expect(cache.match(untrustedUrl)).resolves.toBeUndefined();
    await expect(cache.match(`${resourcePackage.baseUrl}.onnx`)).resolves.toBeTruthy();
    await expect(cache.match(`${resourcePackage.baseUrl}.onnx.json`)).resolves.toBeTruthy();
    await expect(cache.match(markerKey)).resolves.toBeUndefined();

    const secondSeeded = await seedCompletePackage(store, resourcePackage);
    const secondMarkerKey = store.getMarkerKey(resourcePackage, secondSeeded.commitId);
    await cache.put(secondMarkerKey, new Response("not json"));
    await expect(store.isPiperResourceCached(resourcePackage.id)).resolves.toBe(false);
    await expect(cache.match(`${resourcePackage.baseUrl}.onnx`)).resolves.toBeTruthy();
    await expect(cache.match(secondMarkerKey)).resolves.toBeUndefined();
  });

  it("keeps cache and status queries stable when invalid-marker cleanup fails", async () => {
    const resourcePackage = createPackage();
    const store = createStore([resourcePackage]);
    const seeded = await seedCompletePackage(store, resourcePackage);
    const cache = await cacheStorage.open(store.getCacheName(resourcePackage));
    const cleanupFailure = new Error("Cache Storage delete failed");
    const ownedMarkerKey = store.getMarkerKey(resourcePackage, seeded.commitId);
    const originalDelete = cache.delete.bind(cache);
    cache.delete = vi.fn((key) => {
      const normalized = typeof key === "string" ? key : key.url;
      if (normalized === ownedMarkerKey) return Promise.reject(cleanupFailure);
      return originalDelete(key);
    });
    await cache.put(ownedMarkerKey, new Response("not json"));

    await expect(store.cleanupInvalidPackageMarker(cache, resourcePackage, null, ownedMarkerKey)).rejects.toMatchObject({
      name: "PiperResourceStorageError",
      code: "storage",
      cause: cleanupFailure,
    });
    await expect(store.isPiperResourceCached(resourcePackage.id)).resolves.toBe(false);
    expect(store.lastStorageError).toBeInstanceOf(PiperResourceStorageError);
    expect(store.lastStorageError.cause).toBe(cleanupFailure);
    await expect(store.getPiperResourceStatus(resourcePackage.id)).resolves.toBe("invalid");
  });

  it("automatically migrates verified legacy files and preserves a valid partial model", async () => {
    const english = {
      ...createPackage({ id: "en_US-ljspeech-medium", baseUrl: "https://voice.shadow.wang/piper/en_US-ljspeech-medium" }),
    };
    const store = createStore([english]);
    const legacy = await cacheStorage.open("shadow-mate-voice");
    await legacy.put(`${english.baseUrl}.onnx`, new Response("abc"));
    await legacy.put(`${english.baseUrl}.onnx.json`, new Response("{}"));

    await expect(store.getPiperResourceStatus(english.id)).resolves.toBe("completed");
    await expect(store.isPiperResourceCached(english.id)).resolves.toBe(true);

    const partialStore = createStore([english]);
    await (await cacheStorage.open("shadow-mate-voice")).put(`${english.baseUrl}.onnx`, new Response("abc"));
    await expect(partialStore.getPiperResourceStatus(english.id)).resolves.toBe("partial");
    const target = await cacheStorage.open(partialStore.getCacheName(english));
    await expect(target.match(`${english.baseUrl}.onnx`)).resolves.toBeTruthy();
    await expect(partialStore.getFileCompletionMarkers(english, english.files[0], target)).resolves.toHaveLength(1);
    await expect(partialStore.getPiperResourceCachedBytes(english.id)).resolves.toBe(3);
  });

  it("keeps superseded caches during automatic checks, but cleans only with an explicit unused snapshot", async () => {
    const current = createPackage({ id: "voice-a", version: "2" });
    const other = createPackage({ id: "voice-b" });
    const store = createStore([current, other]);
    await seedCompletePackage(store, current);
    await seedCompletePackage(store, other);
    const old = createPackage({ id: "voice-a", version: "1" });
    await seedCompletePackage(store, old);
    const oldCacheName = store.getCacheName(old);

    await store.cleanupSupersededPiperResourceCaches(current.id, { inUseCacheNames: [oldCacheName] });
    await expect(cacheStorage.keys()).resolves.toContain(oldCacheName);
    await expect(store.getPiperResourceStatus(current.id)).resolves.toBe("completed");
    await expect(cacheStorage.keys()).resolves.toContain(oldCacheName);
    await expect(store.isPiperResourceCached(current.id)).resolves.toBe(true);
    await expect(cacheStorage.keys()).resolves.toContain(oldCacheName);
    await expect(store.cleanupSupersededPiperResourceCaches(current.id, { skipCurrentValidation: true })).resolves.toEqual({
      status: "skipped",
      reason: "active-use-unknown",
      deleted: [],
    });
    await expect(store.cleanupSupersededPiperResourceCaches(current.id, { inUseCacheNames: [] })).resolves.toMatchObject({
      status: "cleaned",
      deleted: [oldCacheName],
    });
    await expect(cacheStorage.keys()).resolves.not.toContain(oldCacheName);
    await store.deletePiperResource(current.id);
    await expect(cacheStorage.keys()).resolves.not.toContain(store.getCacheName(current));
    await expect(cacheStorage.keys()).resolves.toContain(store.getCacheName(other));
  });

  it("keeps a verified current package usable when superseded cleanup is unavailable", async () => {
    const resourcePackage = createPackage();
    const store = createStore([resourcePackage]);
    await seedCompletePackage(store, resourcePackage);
    cacheStorage.keys = vi.fn().mockRejectedValue(new Error("cache listing failed"));

    await expect(store.getPiperResourceStatus(resourcePackage.id)).resolves.toBe("completed");
    await expect(store.isPiperResourceCached(resourcePackage.id)).resolves.toBe(true);
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

  it("never materializes a cached model with Response.arrayBuffer", async () => {
    const source = await readFile(`${process.cwd()}/src/piper-resource-store.js`, "utf8");
    expect(source).not.toMatch(/\.arrayBuffer\s*\(/);
  });
});
