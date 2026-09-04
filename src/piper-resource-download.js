import { createPiperResourceSha256 } from "./piper-resource-hash.js";
import { getPiperResourcePackage, isActivePiperCdnVoicePackage } from "./piper-resource-registry.js";
import { createPiperResourceStore, isPiperResourceCached } from "./piper-resource-store.js";

const DEFAULT_TIMEOUTS = Object.freeze({ head: 10_000, response: 20_000, read: 30_000 });

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
  if (/lease|another tab|already active/i.test(error?.message || "")) {
    return downloadError("network", "Piper resource download is already active in another tab", error);
  }
  if (/unsupported/i.test(error?.message || "")) return downloadError("unsupported", "Piper resource download is unsupported", error);
  return downloadError(fallbackCode, fallbackMessage, error);
}

function absoluteUrl(url) {
  return new URL(url, globalThis.location?.href || "https://shadow-mate.invalid/").href;
}

function fileUrl(resourcePackage, file) {
  return absoluteUrl(`${resourcePackage.baseUrl}${file.suffix}`);
}

function stagingUrl(url, commitId) {
  const staged = new URL(url);
  staged.searchParams.set("shadow-mate-download", commitId);
  return staged.href;
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

function requireContentType(response, expectedType, phase) {
  const value = response.headers.get("content-type") || "";
  if (!value.toLowerCase().startsWith(expectedType.toLowerCase())) {
    throw downloadError("integrity", `Piper resource ${phase} Content-Type does not match the manifest`);
  }
}

function requireSuccess(response, phase) {
  if (!response?.ok) throw downloadError("http", `Piper resource ${phase} request failed with HTTP ${response?.status ?? "unknown"}`);
}

function errorFromAbort(signal) {
  return asDownloadError(signal.reason, "network", "Piper resource download was cancelled");
}

function ensureCanCommit(signal, canCommit) {
  if (signal?.aborted) throw errorFromAbort(signal);
  if (typeof canCommit === "function" && !canCommit()) {
    throw downloadError("network", "Piper resource download lease was lost before cache completion");
  }
}

function createCommitId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
      (error) => finish(reject, signal?.aborted ? errorFromAbort(signal) : asDownloadError(error)),
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

export function createPiperResourceDownloader({
  fetch = globalThis.fetch?.bind(globalThis),
  getPackage = getPiperResourcePackage,
  isCached = isPiperResourceCached,
  store = createPiperResourceStore(),
  timeouts = DEFAULT_TIMEOUTS,
} = {}) {
  const resolvedTimeouts = { ...DEFAULT_TIMEOUTS, ...timeouts };
  const activeDownloads = new Map();

  async function removeIncomplete(cache, resourcePackage, failedFile, commitId, canCommit, stagedKey, allowSharedCleanup) {
    try {
      if (stagedKey) await cache.delete(stagedKey);
      await store.removeOwnedCompletionMarker(resourcePackage, commitId, cache);
      if (failedFile) await store.removeOwnedFileMarker(resourcePackage, failedFile, commitId, cache);
      if (failedFile && allowSharedCleanup && canCommit()) {
        await store.removeInvalidFile(resourcePackage, failedFile, { cache, canCommit });
      }
    } catch (error) {
      throw asDownloadError(error, "storage", "Piper resource cleanup failed");
    }
  }

  async function download(resourcePackage, onProgress, signal, {
    canCommit = () => true,
    commitId = createCommitId(),
    allowSharedCleanup = true,
  } = {}) {
    if (!fetch || !store?.cacheStorage?.open || typeof TransformStream !== "function" || typeof ReadableStream !== "function" || typeof AbortController !== "function") {
      throw downloadError("unsupported", "Piper resource downloads are unsupported in this browser");
    }
    ensureCanCommit(signal, canCommit);
    if (await isCached(resourcePackage.id)) {
      return { status: "completed", packageId: resourcePackage.id, version: resourcePackage.version, cached: true };
    }

    let cache;
    let failedFile;
    let stagedKey;
    let received = 0;
    const verifiedFiles = [];
    try {
      try {
        cache = await store.cacheStorage.open(store.getCacheName(resourcePackage));
      } catch (error) {
        throw asDownloadError(error, "storage", "Piper resource cache could not be opened");
      }
      const inspection = await store.inspectPackageFiles(resourcePackage, {
        cache,
        rehashUnknown: true,
        persistMetadata: true,
        canCommit,
        commitId,
      });
      for (const entry of inspection.results) {
        if (!entry.valid) continue;
        verifiedFiles.push(entry);
        received += entry.metadata.actualBytes;
      }
      if (received > 0) {
        onProgress?.(received, resourcePackage.totalBytes, {
          packageId: resourcePackage.id,
          version: resourcePackage.version,
          reusedBytes: received,
        });
      }

      for (const entry of inspection.results) {
        if (entry.valid) continue;
        const file = entry.file;
        ensureCanCommit(signal, canCommit);
        failedFile = file;
        if (entry.present && allowSharedCleanup) await store.removeInvalidFile(resourcePackage, file, { cache, canCommit });
        const url = fileUrl(resourcePackage, file);
        // Stream directly into the canonical cache key. Completion remains
        // fail-closed because no file/package marker is written until the
        // streamed bytes and SHA-256 are verified; failures delete this key.
        stagedKey = allowSharedCleanup ? url : stagingUrl(url, commitId);
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
        requireContentType(head, file.contentType, "HEAD");

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
          requireContentType(response, file.contentType, "GET");
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
          ensureCanCommit(signal, canCommit);
          await cache.put(stagedKey, new Response(deadlineBody.pipeThrough(hashingStream), responseInit(response)));
          const actualSha256 = hasher.digestHex();
          if (actualBytes !== file.bytes) throw downloadError("integrity", "Piper resource actual bytes do not match the manifest");
          if (actualSha256 !== file.sha256.toLowerCase()) throw downloadError("integrity", "Piper resource SHA-256 does not match the manifest");
          ensureCanCommit(signal, canCommit);
          if (stagedKey !== url) {
            const stagedResponse = await cache.match(stagedKey);
            if (!stagedResponse) throw downloadError("storage", "Piper resource staging response is unavailable");
            await cache.put(url, stagedResponse);
            await cache.delete(stagedKey);
          }
          stagedKey = null;
          ensureCanCommit(signal, canCommit);
          const metadata = await store.writeFileCompletionMarker(resourcePackage, file, {
            bytes: actualBytes,
            sha256: actualSha256,
          }, { cache, canCommit, commitId });
          verifiedFiles.push({ file, valid: true, metadata });
          failedFile = null;
        } catch (error) {
          await cancelGetResponse(getRequest.controller, response, deadlineBody, error);
          throw asDownloadError(error, "storage", "Piper resource cache write failed");
        } finally {
          getRequest.dispose();
        }
      }
      ensureCanCommit(signal, canCommit);
      let marker;
      try {
        marker = await store.writeCompletionMarker(resourcePackage, verifiedFiles, { cache, canCommit, commitId });
      } catch (error) {
        throw asDownloadError(error, "storage", "Piper resource completion marker could not be stored");
      }
      await store.cleanupSupersededPiperResourceCaches(resourcePackage.id, { skipCurrentValidation: true }).catch(() => {});
      return { status: "completed", packageId: resourcePackage.id, version: resourcePackage.version, files: marker.files };
    } catch (error) {
      const mapped = asDownloadError(error, "network", "Piper resource download failed");
      if (cache) {
        await removeIncomplete(
          cache,
          resourcePackage,
          failedFile,
          commitId,
          canCommit,
          stagedKey,
          allowSharedCleanup,
        ).catch(() => {});
      }
      throw mapped;
    }
  }

  function downloadPiperResource(packageId, onProgress, signal, options) {
    const resourcePackage = getPackage(packageId);
    if (!isActivePiperCdnVoicePackage(resourcePackage)) {
      return Promise.reject(downloadError("unsupported", "Piper resource downloads are unsupported for this package"));
    }
    const key = `${resourcePackage.id}@${resourcePackage.version}`;
    if (activeDownloads.has(key)) return activeDownloads.get(key);
    const task = download(resourcePackage, onProgress, signal, options).finally(() => activeDownloads.delete(key));
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
