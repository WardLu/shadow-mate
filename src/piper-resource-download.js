import { createPiperResourceSha256 } from "./piper-resource-hash.js";
import { getPiperResourcePackage } from "./piper-resource-registry.js";
import { createPiperResourceStore, isPiperResourceCached } from "./piper-resource-store.js";

const DEFAULT_TIMEOUTS = Object.freeze({ head: 10_000, response: 20_000, read: 30_000 });
const activeDownloads = new Map();

class PiperResourceDownloadError extends Error {
  constructor(code, message, cause) {
    super(message, { cause });
    this.name = "PiperResourceDownloadError";
    this.code = code;
  }
}

function downloadError(code, message, cause) {
  return new PiperResourceDownloadError(code, message, cause);
}

function asDownloadError(error, fallbackCode = "network", fallbackMessage = "Piper resource download failed") {
  if (error?.code && ["timeout", "network", "http", "integrity", "storage", "unsupported"].includes(error.code)) return error;
  if (error?.name === "AbortError") return downloadError("network", "Piper resource download was cancelled", error);
  if (/unsupported/i.test(error?.message || "")) return downloadError("unsupported", "Piper resource download is unsupported", error);
  return downloadError(fallbackCode, fallbackMessage, error);
}

function absoluteUrl(url) {
  return new URL(url, globalThis.location?.href || "https://shadow-mate.invalid/").href;
}

function fileUrl(resourcePackage, file) {
  return absoluteUrl(`${resourcePackage.baseUrl}${file.suffix}`);
}

function responseInit(response) {
  return { headers: response.headers, status: response.status, statusText: response.statusText };
}

function requireContentLength(response, expectedBytes, phase) {
  const value = response.headers.get("content-length");
  const contentLength = Number(value);
  if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
    throw downloadError("integrity", `Piper resource ${phase} response is missing a readable Content-Length`);
  }
  if (contentLength !== expectedBytes) {
    throw downloadError("integrity", `Piper resource ${phase} Content-Length does not match the manifest`);
  }
}

function requireSuccess(response, phase) {
  if (!response?.ok) throw downloadError("http", `Piper resource ${phase} request failed with HTTP ${response?.status ?? "unknown"}`);
}

function errorFromAbort(signal) {
  return asDownloadError(signal.reason, "network", "Piper resource download was cancelled");
}

function waitFor(promise, { timeout, signal, onTimeout, timeoutMessage }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      callback(value);
    };
    const onAbort = () => finish(reject, errorFromAbort(signal));
    const timer = setTimeout(() => {
      const error = downloadError("timeout", timeoutMessage);
      onTimeout?.(error);
      finish(reject, error);
    }, timeout);
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, errorFromAbort(signal) || asDownloadError(error)),
    );
  });
}

function createRequestController(signal) {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", forwardAbort, { once: true });
  return {
    controller,
    dispose() {
      signal?.removeEventListener("abort", forwardAbort);
    },
  };
}

async function fetchWithTimeout(fetcher, url, options, { controller, timeout, timeoutMessage }) {
  try {
    return await waitFor(fetcher(url, { ...options, signal: controller.signal }), {
      timeout,
      signal: controller.signal,
      onTimeout: (error) => controller.abort(error),
      timeoutMessage,
    });
  } catch (error) {
    throw asDownloadError(error);
  }
}

function streamWithReadTimeout(body, { controller: requestController, timeout }) {
  const { signal } = requestController;
  const reader = body.getReader();
  let cancelled = false;
  const cancelReader = (reason) => {
    if (cancelled) return;
    cancelled = true;
    reader.cancel(reason).catch(() => {});
  };
  const abortReader = () => cancelReader(errorFromAbort(signal));
  signal.addEventListener("abort", abortReader, { once: true });

  return new ReadableStream({
    async pull(controller) {
      try {
        const result = await waitFor(reader.read(), {
          timeout,
          signal,
          onTimeout: (error) => {
            requestController.abort(error);
            cancelReader(error);
          },
          timeoutMessage: "Piper resource stream read timed out",
        });
        if (result.done) {
          signal.removeEventListener("abort", abortReader);
          controller.close();
          return;
        }
        controller.enqueue(result.value);
      } catch (error) {
        signal.removeEventListener("abort", abortReader);
        cancelReader(error);
        controller.error(asDownloadError(error));
      }
    },
    cancel(reason) {
      signal.removeEventListener("abort", abortReader);
      cancelReader(reason);
    },
  });
}

async function cancelGetResponse(controller, response, deadlineBody, reason) {
  controller.abort(reason);
  await Promise.allSettled([
    response?.body?.cancel(reason),
    deadlineBody?.cancel(reason),
  ]);
}

function completionMarker(resourcePackage, verifiedFiles) {
  return {
    id: resourcePackage.id,
    version: resourcePackage.version,
    manifestVersion: resourcePackage.version,
    files: verifiedFiles.map(({ file, actualBytes, actualSha256 }) => ({
      key: file.key,
      url: fileUrl(resourcePackage, file),
      expectedBytes: file.bytes,
      actualBytes,
      expectedSha256: file.sha256.toLowerCase(),
      actualSha256,
    })),
  };
}

export function createPiperResourceDownloader({
  fetch = globalThis.fetch?.bind(globalThis),
  getPackage = getPiperResourcePackage,
  isCached = isPiperResourceCached,
  store = createPiperResourceStore(),
  timeouts = DEFAULT_TIMEOUTS,
} = {}) {
  const resolvedTimeouts = { ...DEFAULT_TIMEOUTS, ...timeouts };

  async function removeIncomplete(cache, resourcePackage, failedFile) {
    try {
      if (failedFile) await cache.delete(fileUrl(resourcePackage, failedFile));
      await cache.delete(store.getMarkerKey(resourcePackage));
    } catch (error) {
      throw asDownloadError(error, "storage", "Piper resource cleanup failed");
    }
  }

  async function download(resourcePackage, onProgress, signal) {
    if (!fetch || !store?.cacheStorage?.open || typeof TransformStream !== "function" || typeof ReadableStream !== "function" || typeof AbortController !== "function") {
      throw downloadError("unsupported", "Piper resource downloads are unsupported in this browser");
    }
    if (signal?.aborted) throw errorFromAbort(signal);
    if (await isCached(resourcePackage.id)) {
      return { status: "completed", packageId: resourcePackage.id, version: resourcePackage.version, cached: true };
    }

    let cache;
    let failedFile;
    let received = 0;
    const verifiedFiles = [];
    try {
      try {
        cache = await store.cacheStorage.open(store.getCacheName(resourcePackage));
      } catch (error) {
        throw asDownloadError(error, "storage", "Piper resource cache could not be opened");
      }
      for (const file of resourcePackage.files) {
        failedFile = file;
        const url = fileUrl(resourcePackage, file);
        const headRequest = createRequestController(signal);
        let head;
        try {
          head = await fetchWithTimeout(fetch, url, { method: "HEAD" }, {
            controller: headRequest.controller,
            timeout: resolvedTimeouts.head,
            timeoutMessage: "Piper resource HEAD request timed out",
          });
        } finally {
          headRequest.dispose();
        }
        requireSuccess(head, "HEAD");
        requireContentLength(head, file.bytes, "HEAD");

        const getRequest = createRequestController(signal);
        let response;
        let deadlineBody;
        try {
          response = await fetchWithTimeout(fetch, url, { method: "GET" }, {
            controller: getRequest.controller,
            timeout: resolvedTimeouts.response,
            timeoutMessage: "Piper resource GET response timed out",
          });
          requireSuccess(response, "GET");
          requireContentLength(response, file.bytes, "GET");
          if (!response.body) throw downloadError("unsupported", "Piper resource GET response does not expose a readable stream");

          const hasher = createPiperResourceSha256();
          let actualBytes = 0;
          const hashingStream = new TransformStream({
            transform(chunk, controller) {
              hasher.update(chunk);
              actualBytes += chunk.byteLength;
              received += chunk.byteLength;
              onProgress?.(received, resourcePackage.totalBytes, {
                packageId: resourcePackage.id,
                version: resourcePackage.version,
                fileKey: file.key,
                fileReceived: actualBytes,
                fileTotal: file.bytes,
              });
              controller.enqueue(chunk);
            },
          });
          deadlineBody = streamWithReadTimeout(response.body, { controller: getRequest.controller, timeout: resolvedTimeouts.read });
          await cache.put(url, new Response(deadlineBody.pipeThrough(hashingStream), responseInit(response)));
          const actualSha256 = hasher.digestHex();
          if (actualBytes !== file.bytes) throw downloadError("integrity", "Piper resource actual bytes do not match the manifest");
          if (actualSha256 !== file.sha256.toLowerCase()) throw downloadError("integrity", "Piper resource SHA-256 does not match the manifest");
          verifiedFiles.push({ file, actualBytes, actualSha256 });
          failedFile = null;
        } catch (error) {
          await cancelGetResponse(getRequest.controller, response, deadlineBody, error);
          throw asDownloadError(error, "storage", "Piper resource cache write failed");
        } finally {
          getRequest.dispose();
        }
      }
      const marker = completionMarker(resourcePackage, verifiedFiles);
      await cache.put(store.getMarkerKey(resourcePackage), new Response(JSON.stringify(marker), { headers: { "content-type": "application/json" } }));
      return { status: "completed", packageId: resourcePackage.id, version: resourcePackage.version, files: marker.files };
    } catch (error) {
      const mapped = asDownloadError(error, "network", "Piper resource download failed");
      if (cache) await removeIncomplete(cache, resourcePackage, failedFile);
      throw mapped;
    }
  }

  function downloadPiperResource(packageId, onProgress, signal) {
    const resourcePackage = getPackage(packageId);
    if (!resourcePackage?.releaseApproved || resourcePackage.source !== "cdn" || resourcePackage.cachePolicy !== "user-download") {
      return Promise.reject(downloadError("unsupported", "Piper resource downloads are unsupported for this package"));
    }
    const key = `${resourcePackage.id}@${resourcePackage.version}`;
    if (activeDownloads.has(key)) return activeDownloads.get(key);
    const task = download(resourcePackage, onProgress, signal).finally(() => activeDownloads.delete(key));
    activeDownloads.set(key, task);
    return task;
  }

  return { downloadPiperResource };
}

const defaultDownloader = createPiperResourceDownloader();

export const downloadPiperResource = (...args) => defaultDownloader.downloadPiperResource(...args);

export function getPiperDownloadError(error) {
  const mapped = asDownloadError(error, "unsupported", "Piper resource downloads are unsupported in this browser");
  return { code: mapped.code, message: mapped.message };
}
