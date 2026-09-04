import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPiperResourceDownloader,
  getPiperDownloadError,
} from "../../src/piper-resource-download.js";
import { createPiperResourceStore } from "../../src/piper-resource-store.js";

const HASHES = {
  model: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  metadata: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
};

function createPackage({
  modelHash = HASHES.model,
  id = "test-voice",
  baseUrl = "https://voice.example.test/test-voice",
  version = "1",
} = {}) {
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
      { key: "model", suffix: ".onnx", contentType: "application/octet-stream", bytes: 3, sha256: modelHash },
      { key: "metadata", suffix: ".onnx.json", contentType: "application/json", bytes: 2, sha256: HASHES.metadata },
    ],
  };
}

function createCacheStorage({ putError, onPut } = {}) {
  const cachesByName = new Map();
  const cacheKey = (key) => typeof key === "string" ? key : key.url;
  const putBodies = [];
  return {
    putBodies,
    async open(name) {
      if (!cachesByName.has(name)) {
        const entries = new Map();
        cachesByName.set(name, {
          async match(key) {
            return entries.get(cacheKey(key))?.clone();
          },
          async put(key, response) {
            putBodies.push(response.body);
            const error = putError?.(cacheKey(key), response);
            if (error) throw error;
            const stored = response.clone();
            await response.arrayBuffer();
            entries.set(cacheKey(key), stored);
            await onPut?.(cacheKey(key), { entries, response: stored.clone() });
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

function bodyFromChunks(chunks, { stall = false, onCancel = vi.fn() } = {}) {
  return {
    body: new ReadableStream({
      start(controller) {
        if (stall) return;
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
      cancel: onCancel,
    }),
    onCancel,
  };
}

function headers(contentLength, contentType = "application/octet-stream") {
  return new Headers({ "content-length": String(contentLength), "content-type": contentType });
}

function createFetch({ package: resourcePackage, streamOptions = {}, getContentLengths = {}, contentTypes = {}, contents = {}, onFetch } = {}) {
  return vi.fn((url, options = {}) => {
    onFetch?.(url, options);
    const file = resourcePackage.files.find((entry) => entry.url ? url === entry.url : url.endsWith(entry.suffix));
    const contentType = contentTypes[file.key] || file.contentType;
    if (options.method === "HEAD") return Promise.resolve(new Response(null, { status: 200, headers: headers(file.bytes, contentType) }));
    const content = contents[file.key] ?? (file.key === "model" ? ["abc"] : ["{}"]);
    const stream = bodyFromChunks(content, streamOptions[file.key]);
    return Promise.resolve(new Response(stream.body, { status: 200, headers: headers(getContentLengths[file.key] ?? file.bytes, contentType) }));
  });
}

function createDownloader({ resourcePackage = createPackage(), fetch = createFetch({ package: resourcePackage }), timeouts, cacheStorage = createCacheStorage() } = {}) {
  const store = createPiperResourceStore({
    packages: [resourcePackage],
    cacheStorage,
    getCapabilities: () => ({ canDownload: true }),
  });
  return {
    cacheStorage,
    fetch,
    resourcePackage,
    store,
    downloader: createPiperResourceDownloader({
      fetch,
      getPackage: store.getPackage,
      isCached: store.isPiperResourceCached,
      store,
      timeouts,
    }),
  };
}

async function packageCache({ store, resourcePackage }) {
  return store.cacheStorage.open(store.getCacheName(resourcePackage));
}

async function completionMarkers(setup) {
  const cache = await packageCache(setup);
  return setup.store.getCompletionMarkers(setup.resourcePackage, cache);
}

describe("Piper resource downloader", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("aborts a timed-out HEAD request and reports timeout", async () => {
    vi.useFakeTimers();
    let headSignal;
    const resourcePackage = createPackage();
    const fetch = vi.fn((_url, options) => {
      headSignal = options.signal;
      return new Promise(() => {});
    });
    const { downloader } = createDownloader({ resourcePackage, fetch, timeouts: { head: 10, response: 20, read: 30 } });

    const downloading = downloader.downloadPiperResource(resourcePackage.id);
    const assertion = downloading.then(
      () => { throw new Error("HEAD timeout unexpectedly completed"); },
      (error) => expect(error).toMatchObject({ code: "timeout", message: "Piper resource HEAD request timed out" }),
    );
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
    expect(headSignal.aborted).toBe(true);
  });

  it("distinguishes a GET response timeout from a stalled stream read", async () => {
    vi.useFakeTimers();
    const resourcePackage = createPackage();
    const responseFetch = vi.fn((_url, options) => options.method === "HEAD"
      ? Promise.resolve(new Response(null, { status: 200, headers: headers(3) }))
      : new Promise(() => {}));
    const responseDownloader = createDownloader({ resourcePackage, fetch: responseFetch, timeouts: { head: 10, response: 20, read: 30 } }).downloader;
    const waitingForResponse = responseDownloader.downloadPiperResource(resourcePackage.id);
    const responseAssertion = waitingForResponse.then(
      () => { throw new Error("GET response timeout unexpectedly completed"); },
      (error) => expect(error).toMatchObject({ code: "timeout", message: "Piper resource GET response timed out" }),
    );
    await vi.advanceTimersByTimeAsync(20);
    await responseAssertion;

    const readFetch = createFetch({ package: resourcePackage, streamOptions: { model: { stall: true } } });
    const { downloader } = createDownloader({ resourcePackage, fetch: readFetch, timeouts: { head: 10, response: 20, read: 30 } });
    const stalledRead = downloader.downloadPiperResource(resourcePackage.id);
    const readAssertion = stalledRead.then(
      () => { throw new Error("stream read timeout unexpectedly completed"); },
      (error) => expect(error).toMatchObject({ code: "timeout", message: "Piper resource stream read timed out" }),
    );
    await vi.advanceTimersByTimeAsync(30);
    await readAssertion;
  });

  it("checks Content-Length and actual stream bytes before marking a resource complete", async () => {
    const resourcePackage = createPackage();
    const fetch = createFetch({ package: resourcePackage, getContentLengths: { model: 4 } });
    const setup = createDownloader({ resourcePackage, fetch });

    await expect(setup.downloader.downloadPiperResource(resourcePackage.id)).rejects.toMatchObject({ code: "integrity" });
    const cache = await packageCache(setup);
    await expect(cache.match(`${resourcePackage.baseUrl}.onnx`)).resolves.toBeUndefined();
    await expect(completionMarkers(setup)).resolves.toHaveLength(0);

    const actualSetup = createDownloader({
      resourcePackage,
      fetch: createFetch({ package: resourcePackage, contents: { model: ["ab"] } }),
    });
    await expect(actualSetup.downloader.downloadPiperResource(resourcePackage.id)).rejects.toMatchObject({
      code: "integrity",
      message: "Piper resource actual bytes do not match the manifest",
    });
    const actualCache = await packageCache(actualSetup);
    await expect(actualCache.match(`${resourcePackage.baseUrl}.onnx`)).resolves.toBeUndefined();
    await expect(completionMarkers(actualSetup)).resolves.toHaveLength(0);
  });

  it("rejects a resource whose response type does not match the manifest", async () => {
    const resourcePackage = createPackage();
    const setup = createDownloader({
      resourcePackage,
      fetch: createFetch({ package: resourcePackage, contentTypes: { model: "text/plain" } }),
    });

    await expect(setup.downloader.downloadPiperResource(resourcePackage.id)).rejects.toMatchObject({
      code: "integrity",
      message: "Piper resource HEAD Content-Type does not match the manifest",
    });
    await expect(completionMarkers(setup)).resolves.toHaveLength(0);
  });

  it("passes Cache.put a streaming Response and completes verified files before the marker", async () => {
    const setup = createDownloader();

    await expect(setup.downloader.downloadPiperResource(setup.resourcePackage.id)).resolves.toMatchObject({ status: "completed" });
    expect(setup.cacheStorage.putBodies[0]).toBeInstanceOf(ReadableStream);
    const cache = await packageCache(setup);
    await expect(completionMarkers(setup)).resolves.toHaveLength(1);
    await expect(setup.store.isPiperResourceCached(setup.resourcePackage.id)).resolves.toBe(true);
  });

  it("does not remove a verified superseded cache when download completion has no active-use snapshot", async () => {
    const current = createPackage({ version: "2" });
    const setup = createDownloader({ resourcePackage: current });
    const old = createPackage({ version: "1" });
    const oldCacheName = setup.store.getCacheName(old);
    const oldCache = await setup.cacheStorage.open(oldCacheName);
    await oldCache.put(`${old.baseUrl}.onnx`, new Response("abc"));
    await oldCache.put(`${old.baseUrl}.onnx.json`, new Response("{}"));
    await setup.store.writeCompletionMarker(old);

    await expect(setup.downloader.downloadPiperResource(current.id)).resolves.toMatchObject({ status: "completed" });
    await expect(setup.cacheStorage.keys()).resolves.toContain(oldCacheName);
  });

  it("requests only a missing metadata file when the verified model is already cached", async () => {
    const setup = createDownloader();
    const cache = await packageCache(setup);
    await cache.put(`${setup.resourcePackage.baseUrl}.onnx`, new Response("abc"));
    await cache.put(`${setup.resourcePackage.baseUrl}.onnx.json`, new Response("{}"));
    const marker = await setup.store.writeCompletionMarker(setup.resourcePackage);
    await cache.delete(`${setup.resourcePackage.baseUrl}.onnx.json`);
    for (const entry of await setup.store.getFileCompletionMarkers(setup.resourcePackage, setup.resourcePackage.files[1], cache)) {
      await cache.delete(entry.key);
    }
    await cache.delete(setup.store.getMarkerKey(setup.resourcePackage, marker.commitId));

    await expect(setup.downloader.downloadPiperResource(setup.resourcePackage.id)).resolves.toMatchObject({ status: "completed" });
    expect(setup.fetch).toHaveBeenCalledTimes(2);
    expect(setup.fetch.mock.calls.every(([url]) => url.endsWith(".onnx.json"))).toBe(true);
    await expect(setup.store.isPiperResourceCached(setup.resourcePackage.id)).resolves.toBe(true);
  });

  it("reuses an unchanged large file and fetches only a replacement file at its immutable URL", async () => {
    const resourcePackage = createPackage();
    resourcePackage.files[1].url = "https://voice.example.test/mobile-v2/test-voice.onnx.json";
    const setup = createDownloader({ resourcePackage });
    const cache = await packageCache(setup);
    await cache.put(`${resourcePackage.baseUrl}.onnx`, new Response("abc"));
    await setup.store.writeFileCompletionMarker(resourcePackage, resourcePackage.files[0], {
      bytes: 3,
      sha256: HASHES.model,
    }, { cache });

    await expect(setup.downloader.downloadPiperResource(resourcePackage.id)).resolves.toMatchObject({ status: "completed" });
    expect(setup.fetch).toHaveBeenCalledTimes(2);
    expect(setup.fetch.mock.calls.every(([url]) => url === resourcePackage.files[1].url)).toBe(true);
    await expect(cache.match(`${resourcePackage.baseUrl}.onnx`)).resolves.toBeTruthy();
    await expect(cache.match(resourcePackage.files[1].url)).resolves.toBeTruthy();
  });

  it("does not write a completion marker when lease ownership is lost after files cache", async () => {
    let ownsLease = true;
    const cacheStorage = createCacheStorage({
      onPut: (key) => {
        if (key.endsWith(".onnx.json")) ownsLease = false;
      },
    });
    const setup = createDownloader({ cacheStorage });
    const controller = new AbortController();
    const canCommit = vi.fn(() => {
      if (!ownsLease) controller.abort(new DOMException("lease lost", "AbortError"));
      return ownsLease;
    });

    await expect(setup.downloader.downloadPiperResource(setup.resourcePackage.id, undefined, controller.signal, { canCommit })).rejects.toMatchObject({ code: "network" });
    const cache = await packageCache(setup);
    await expect(completionMarkers(setup)).resolves.toHaveLength(0);
    await expect(setup.store.isPiperResourceCached(setup.resourcePackage.id)).resolves.toBe(false);
    expect(canCommit).toHaveBeenCalled();
  });

  it("does not remove another owner's marker when the lease is lost during marker put", async () => {
    let ownsLease = true;
    let markerKey;
    const cacheStorage = createCacheStorage({
      onPut: async (key, { entries, response }) => {
        if (!key.includes("/__shadow-mate-piper-package__/")) return;
        const winner = await response.json();
        winner.commitId = "winner-tab";
        markerKey = key.replace("owner=losing-tab", "owner=winner-tab");
        entries.set(markerKey, new Response(JSON.stringify(winner), { headers: { "content-type": "application/json" } }));
        ownsLease = false;
      },
    });
    const setup = createDownloader({ cacheStorage });

    await expect(setup.downloader.downloadPiperResource(
      setup.resourcePackage.id,
      undefined,
      undefined,
      { canCommit: () => ownsLease, commitId: "losing-tab" },
    )).rejects.toMatchObject({ code: "network" });

    const cache = await packageCache(setup);
    await expect((await cache.match(markerKey)).json()).resolves.toMatchObject({ commitId: "winner-tab" });
  });

  it("deletes a file and leaves no marker when its SHA-256 is wrong", async () => {
    const resourcePackage = createPackage({ modelHash: "0".repeat(64) });
    const setup = createDownloader({ resourcePackage });

    await expect(setup.downloader.downloadPiperResource(resourcePackage.id)).rejects.toMatchObject({ code: "integrity" });
    const cache = await packageCache(setup);
    await expect(cache.match(`${resourcePackage.baseUrl}.onnx`)).resolves.toBeUndefined();
    await expect(completionMarkers(setup)).resolves.toHaveLength(0);
  });

  it("does not delete a shared cache response when cross-tab storage coordination is unavailable", async () => {
    const resourcePackage = createPackage();
    const setup = createDownloader({
      resourcePackage,
      fetch: createFetch({ package: resourcePackage, contents: { model: ["ab"] } }),
    });
    const cache = await packageCache(setup);
    await cache.put(`${resourcePackage.baseUrl}.onnx`, new Response("old"));

    await expect(setup.downloader.downloadPiperResource(
      resourcePackage.id,
      undefined,
      undefined,
      { allowSharedCleanup: false, commitId: "storage-unavailable-tab" },
    )).rejects.toMatchObject({ code: "integrity" });

    await expect(cache.match(`${resourcePackage.baseUrl}.onnx`)).resolves.toBeTruthy();
    await expect(completionMarkers(setup)).resolves.toHaveLength(0);
    expect((await cache.keys()).some((request) => request.url.includes("shadow-mate-download="))).toBe(false);
  });

  it("cancels a stalled reader and leaves no completed package when aborted", async () => {
    const resourcePackage = createPackage();
    const modelStream = bodyFromChunks([], { stall: true });
    const fetch = vi.fn((url, options = {}) => {
      const file = resourcePackage.files.find((entry) => url.endsWith(entry.suffix));
      if (options.method === "HEAD") return Promise.resolve(new Response(null, { status: 200, headers: headers(file.bytes) }));
      if (file.key === "model") return Promise.resolve(new Response(modelStream.body, { status: 200, headers: headers(file.bytes) }));
      return Promise.resolve(new Response(bodyFromChunks(["{} "]).body, { status: 200, headers: headers(file.bytes) }));
    });
    const setup = createDownloader({ resourcePackage, fetch });
    const controller = new AbortController();
    const downloading = setup.downloader.downloadPiperResource(resourcePackage.id, undefined, controller.signal);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    controller.abort();

    await expect(downloading).rejects.toMatchObject({ code: "network" });
    expect(modelStream.onCancel).toHaveBeenCalled();
    await expect(setup.store.isPiperResourceCached(resourcePackage.id)).resolves.toBe(false);
  });

  it("cancels the GET body when post-response validation fails", async () => {
    const resourcePackage = createPackage();
    const modelStream = bodyFromChunks([], { stall: true });
    let getSignal;
    const fetch = vi.fn((url, options = {}) => {
      const file = resourcePackage.files.find((entry) => url.endsWith(entry.suffix));
      if (options.method === "HEAD") return Promise.resolve(new Response(null, { status: 200, headers: headers(file.bytes) }));
      getSignal = options.signal;
      return Promise.resolve(new Response(modelStream.body, { status: 200, headers: headers(file.bytes + 1) }));
    });
    const setup = createDownloader({ resourcePackage, fetch });

    await expect(setup.downloader.downloadPiperResource(resourcePackage.id)).rejects.toMatchObject({ code: "integrity" });
    expect(getSignal.aborted).toBe(true);
    expect(modelStream.onCancel).toHaveBeenCalled();
  });

  it("cancels the GET body when Cache.put fails after a response", async () => {
    const resourcePackage = createPackage();
    const modelStream = bodyFromChunks([], { stall: true });
    let getSignal;
    const fetch = vi.fn((url, options = {}) => {
      const file = resourcePackage.files.find((entry) => url.endsWith(entry.suffix));
      if (options.method === "HEAD") return Promise.resolve(new Response(null, { status: 200, headers: headers(file.bytes) }));
      getSignal = options.signal;
      return Promise.resolve(new Response(modelStream.body, { status: 200, headers: headers(file.bytes) }));
    });
    const cacheStorage = createCacheStorage({
      putError: (key) => new URL(key).pathname.endsWith(".onnx") ? new Error("Cache Storage write failed") : null,
    });
    const setup = createDownloader({ resourcePackage, fetch, cacheStorage });

    await expect(setup.downloader.downloadPiperResource(resourcePackage.id)).rejects.toMatchObject({ code: "storage" });
    expect(getSignal.aborted).toBe(true);
    expect(modelStream.onCancel).toHaveBeenCalled();
  });

  it("shares one same-tab download sequence for concurrent callers", async () => {
    const setup = createDownloader();
    const first = setup.downloader.downloadPiperResource(setup.resourcePackage.id);
    const second = setup.downloader.downloadPiperResource(setup.resourcePackage.id);

    expect(second).toBe(first);
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(setup.fetch).toHaveBeenCalledTimes(4);
  });

  it("maps downloader failures to the public error contract", () => {
    expect(getPiperDownloadError({ code: "timeout" })).toMatchObject({ code: "timeout" });
    expect(getPiperDownloadError({ code: "network" })).toMatchObject({ code: "network" });
    expect(getPiperDownloadError({ code: "http" })).toMatchObject({ code: "http" });
    expect(getPiperDownloadError({ code: "integrity" })).toMatchObject({ code: "integrity" });
    expect(getPiperDownloadError({ code: "storage" })).toMatchObject({ code: "storage" });
    expect(getPiperDownloadError(new Error("unsupported"))).toMatchObject({ code: "unsupported" });
  });
});
