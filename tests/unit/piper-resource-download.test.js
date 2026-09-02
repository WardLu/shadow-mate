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

function createPackage({ modelHash = HASHES.model } = {}) {
  return {
    id: "test-voice",
    locale: "en-US",
    label: "Test voice",
    kind: "voice",
    version: "1",
    baseUrl: "https://voice.example.test/test-voice",
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

function createCacheStorage({ putError } = {}) {
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

function headers(contentLength) {
  return new Headers({ "content-length": String(contentLength), "content-type": "application/octet-stream" });
}

function createFetch({ package: resourcePackage, streamOptions = {}, getContentLengths = {}, contents = {}, onFetch } = {}) {
  return vi.fn((url, options = {}) => {
    onFetch?.(url, options);
    const file = resourcePackage.files.find((entry) => url.endsWith(entry.suffix));
    if (options.method === "HEAD") return Promise.resolve(new Response(null, { status: 200, headers: headers(file.bytes) }));
    const content = contents[file.key] ?? (file.key === "model" ? ["abc"] : ["{}"]);
    const stream = bodyFromChunks(content, streamOptions[file.key]);
    return Promise.resolve(new Response(stream.body, { status: 200, headers: headers(getContentLengths[file.key] ?? file.bytes) }));
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
    await expect(cache.match(setup.store.getMarkerKey(resourcePackage))).resolves.toBeUndefined();

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
    await expect(actualCache.match(actualSetup.store.getMarkerKey(resourcePackage))).resolves.toBeUndefined();
  });

  it("passes Cache.put a streaming Response and completes verified files before the marker", async () => {
    const setup = createDownloader();

    await expect(setup.downloader.downloadPiperResource(setup.resourcePackage.id)).resolves.toMatchObject({ status: "completed" });
    expect(setup.cacheStorage.putBodies[0]).toBeInstanceOf(ReadableStream);
    const cache = await packageCache(setup);
    await expect(cache.match(setup.store.getMarkerKey(setup.resourcePackage))).resolves.toBeTruthy();
    await expect(setup.store.isPiperResourceCached(setup.resourcePackage.id)).resolves.toBe(true);
  });

  it("deletes a file and leaves no marker when its SHA-256 is wrong", async () => {
    const resourcePackage = createPackage({ modelHash: "0".repeat(64) });
    const setup = createDownloader({ resourcePackage });

    await expect(setup.downloader.downloadPiperResource(resourcePackage.id)).rejects.toMatchObject({ code: "integrity" });
    const cache = await packageCache(setup);
    await expect(cache.match(`${resourcePackage.baseUrl}.onnx`)).resolves.toBeUndefined();
    await expect(cache.match(setup.store.getMarkerKey(resourcePackage))).resolves.toBeUndefined();
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
      putError: (key) => key.endsWith(".onnx") ? new Error("Cache Storage write failed") : null,
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
