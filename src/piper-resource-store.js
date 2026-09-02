import { getPiperCapabilities } from "./piper-resource-capabilities.js";
import { createPiperResourceSha256 } from "./piper-resource-hash.js";
import {
  isActivePiperCdnVoicePackage,
  listPiperResourcePackages,
} from "./piper-resource-registry.js";

const LEGACY_ENGLISH_CACHE = "shadow-mate-voice";
const ENGLISH_PACKAGE_ID = "en_US-ljspeech-medium";
const SHA_256_RE = /^[a-f0-9]{64}$/;

export class PiperResourceStorageError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = "PiperResourceStorageError";
    this.code = "storage";
  }
}

function ownershipError() {
  const error = new Error("Piper resource download lease was lost before cache completion");
  error.name = "AbortError";
  error.code = "network";
  return error;
}

function ensureCanCommit(canCommit) {
  if (typeof canCommit === "function" && !canCommit()) throw ownershipError();
}

function createCommitId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizedUrl(url) {
  return new URL(url, globalThis.location?.href || "https://shadow-mate.invalid/").href;
}

function cacheName(resourcePackage) {
  return `shadow-mate-piper-${resourcePackage.id}-${resourcePackage.version}`;
}

function markerKey(resourcePackage, commitId = null) {
  const root = `${resourcePackage.baseUrl}/__shadow-mate-piper-package__/${encodeURIComponent(`${resourcePackage.id}@${resourcePackage.version}`)}`;
  return commitId ? `${root}?owner=${encodeURIComponent(commitId)}` : root;
}

function fileMarkerKey(resourcePackage, file, commitId = null) {
  const root = `${resourcePackage.baseUrl}/__shadow-mate-piper-file__/${encodeURIComponent(`${file.key}@${resourcePackage.version}`)}`;
  return commitId ? `${root}?owner=${encodeURIComponent(commitId)}` : root;
}

function fileUrl(resourcePackage, file) {
  return normalizedUrl(`${resourcePackage.baseUrl}${file.suffix}`);
}

async function responseIntegrity(response, { canCommit = null } = {}) {
  if (!response?.body || typeof response.body.getReader !== "function") {
    throw new PiperResourceStorageError("Piper resource response has no readable body");
  }
  const reader = response.body.getReader();
  const hash = createPiperResourceSha256();
  let bytes = 0;
  try {
    for (;;) {
      if (canCommit) ensureCanCommit(canCommit);
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      hash.update(value);
      bytes += value.byteLength;
    }
    if (canCommit) ensureCanCommit(canCommit);
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    reader.releaseLock?.();
  }
  return { bytes, sha256: hash.digestHex() };
}

function verifiedFileMetadata(resourcePackage, file, actual, commitId) {
  return {
    id: resourcePackage.id,
    version: resourcePackage.version,
    manifestVersion: resourcePackage.version,
    key: file.key,
    url: fileUrl(resourcePackage, file),
    expectedBytes: file.bytes,
    actualBytes: actual.bytes,
    expectedSha256: file.sha256.toLowerCase(),
    actualSha256: actual.sha256.toLowerCase(),
    commitId,
  };
}

function fileMetadataMatches(metadata, resourcePackage, file) {
  return metadata?.id === resourcePackage.id
    && metadata.version === resourcePackage.version
    && metadata.manifestVersion === resourcePackage.version
    && metadata.key === file.key
    && metadata.url === fileUrl(resourcePackage, file)
    && metadata.expectedBytes === file.bytes
    && metadata.actualBytes === file.bytes
    && metadata.expectedSha256 === file.sha256.toLowerCase()
    && metadata.actualSha256 === file.sha256.toLowerCase();
}

function packageMarkerMatches(marker, resourcePackage, verifiedFiles) {
  if (marker?.id !== resourcePackage.id
    || marker.version !== resourcePackage.version
    || marker.manifestVersion !== resourcePackage.version
    || !Array.isArray(marker.files)
    || marker.files.length !== resourcePackage.files.length) return false;
  return resourcePackage.files.every((file) => {
    const verified = verifiedFiles.find((entry) => entry.file.key === file.key);
    const marked = marker.files.find((entry) => entry.key === file.key);
    return Boolean(verified?.valid
      && marked
      && marked.url === verified.metadata.url
      && marked.expectedBytes === verified.metadata.expectedBytes
      && marked.actualBytes === verified.metadata.actualBytes
      && marked.expectedSha256 === verified.metadata.expectedSha256
      && marked.actualSha256 === verified.metadata.actualSha256);
  });
}

async function readJsonResponse(response) {
  if (!response) return null;
  try {
    return await response.json();
  } catch (_) {
    return null;
  }
}

export function createPiperResourceStore({
  packages = listPiperResourcePackages(),
  cacheStorage = globalThis.caches,
  getCapabilities = getPiperCapabilities,
} = {}) {
  const packageById = new Map(packages.map((resourcePackage) => [resourcePackage.id, resourcePackage]));
  let legacyMigrationPromise = null;

  const store = {
    cacheStorage,
    getCapabilities,
    lastStorageError: null,
    lastInspection: null,
    getCacheName: cacheName,
    getMarkerKey: markerKey,
    getFileMarkerKey: fileMarkerKey,
    getFileUrl: fileUrl,
    getPackage(packageId) {
      return packageById.get(packageId) || null;
    },
    async writeFileCompletionMarker(resourcePackage, file, actual, {
      cache = null,
      canCommit = () => true,
      commitId = createCommitId(),
    } = {}) {
      const target = cache || await cacheStorage.open(cacheName(resourcePackage));
      const metadata = verifiedFileMetadata(resourcePackage, file, actual, commitId);
      ensureCanCommit(canCommit);
      const ownedMarkerKey = fileMarkerKey(resourcePackage, file, commitId);
      await target.put(ownedMarkerKey, new Response(JSON.stringify(metadata), {
        headers: { "content-type": "application/json" },
      }));
      try {
        ensureCanCommit(canCommit);
      } catch (error) {
        await target.delete(ownedMarkerKey).catch(() => {});
        throw error;
      }
      return metadata;
    },
    async inspectFile(resourcePackage, file, {
      cache = null,
      rehashUnknown = true,
      persistMetadata = true,
      canCommit = () => true,
      commitId = createCommitId(),
    } = {}) {
      const target = cache || await cacheStorage.open(cacheName(resourcePackage));
      const response = await target.match(fileUrl(resourcePackage, file));
      const markerEntries = await store.getFileCompletionMarkers(resourcePackage, file, target);
      const metadata = markerEntries.find((entry) => fileMetadataMatches(entry.marker, resourcePackage, file))?.marker || null;
      if (!response) return { file, present: false, valid: false, reason: "missing" };
      if (fileMetadataMatches(metadata, resourcePackage, file)) {
        return { file, present: true, valid: true, metadata, source: "marker" };
      }
      if (!rehashUnknown) {
        return { file, present: true, valid: false, reason: markerEntries.length ? "invalid-marker" : "unverified" };
      }
      let actual;
      try {
        actual = await responseIntegrity(response, { canCommit });
      } catch (error) {
        return { file, present: true, valid: false, reason: "unreadable", error };
      }
      if (actual.bytes !== file.bytes || actual.sha256 !== file.sha256.toLowerCase()) {
        return { file, present: true, valid: false, reason: "integrity", actual };
      }
      const verified = verifiedFileMetadata(resourcePackage, file, actual, commitId);
      if (persistMetadata) {
        await store.writeFileCompletionMarker(resourcePackage, file, actual, {
          cache: target,
          canCommit,
          commitId,
        });
      }
      return { file, present: true, valid: true, metadata: verified, source: "stream" };
    },
    async inspectPackageFiles(resourcePackage, options = {}) {
      const cache = options.cache || await cacheStorage.open(cacheName(resourcePackage));
      const results = [];
      for (const file of resourcePackage.files) {
        results.push(await store.inspectFile(resourcePackage, file, { ...options, cache }));
      }
      return { cache, results };
    },
    async writeCompletionMarker(resourcePackage, verifiedFiles = null, {
      cache = null,
      canCommit = () => true,
      commitId = createCommitId(),
    } = {}) {
      const target = cache || await cacheStorage.open(cacheName(resourcePackage));
      let results = verifiedFiles;
      if (!results) {
        ({ results } = await store.inspectPackageFiles(resourcePackage, {
          cache: target,
          rehashUnknown: true,
          persistMetadata: true,
          canCommit,
          commitId,
        }));
      }
      const normalized = results.map((entry) => {
        if (entry.valid && entry.metadata) return entry;
        if (entry.file && Number.isSafeInteger(entry.actualBytes) && entry.actualSha256) {
          return {
            file: entry.file,
            valid: true,
            metadata: verifiedFileMetadata(resourcePackage, entry.file, {
              bytes: entry.actualBytes,
              sha256: entry.actualSha256,
            }, commitId),
          };
        }
        return entry;
      });
      if (normalized.length !== resourcePackage.files.length || normalized.some((entry) => !entry.valid || !entry.metadata)) {
        throw new Error("Cannot mark an incomplete Piper resource package");
      }
      const marker = {
        id: resourcePackage.id,
        version: resourcePackage.version,
        manifestVersion: resourcePackage.version,
        commitId,
        files: normalized.map(({ metadata }) => ({
          key: metadata.key,
          url: metadata.url,
          expectedBytes: metadata.expectedBytes,
          actualBytes: metadata.actualBytes,
          expectedSha256: metadata.expectedSha256,
          actualSha256: metadata.actualSha256,
        })),
      };
      ensureCanCommit(canCommit);
      const ownedMarkerKey = markerKey(resourcePackage, commitId);
      await target.put(ownedMarkerKey, new Response(JSON.stringify(marker), {
        headers: { "content-type": "application/json" },
      }));
      try {
        ensureCanCommit(canCommit);
      } catch (error) {
        await target.delete(ownedMarkerKey).catch(() => {});
        throw error;
      }
      return marker;
    },
    async removeOwnedCompletionMarker(resourcePackage, commitId, cache = null) {
      const target = cache || await cacheStorage.open(cacheName(resourcePackage));
      if (!commitId) return false;
      return target.delete(markerKey(resourcePackage, commitId));
    },
    async removeOwnedFileMarker(resourcePackage, file, commitId, cache = null) {
      const target = cache || await cacheStorage.open(cacheName(resourcePackage));
      if (!commitId) return false;
      return target.delete(fileMarkerKey(resourcePackage, file, commitId));
    },
    async removeInvalidFile(resourcePackage, file, { cache = null, canCommit = () => true } = {}) {
      ensureCanCommit(canCommit);
      const target = cache || await cacheStorage.open(cacheName(resourcePackage));
      await target.delete(fileUrl(resourcePackage, file));
      for (const entry of await store.getFileCompletionMarkers(resourcePackage, file, target)) await target.delete(entry.key);
      ensureCanCommit(canCommit);
    },
    async getFileCompletionMarkers(resourcePackage, file, cache = null) {
      const target = cache || await cacheStorage.open(cacheName(resourcePackage));
      const root = fileMarkerKey(resourcePackage, file);
      const entries = [];
      for (const request of await target.keys()) {
        const key = request.url;
        if (key !== root && !key.startsWith(`${root}?owner=`)) continue;
        entries.push({ key, marker: await readJsonResponse(await target.match(key)) });
      }
      return entries;
    },
    async getCompletionMarkers(resourcePackage, cache = null) {
      const target = cache || await cacheStorage.open(cacheName(resourcePackage));
      const root = markerKey(resourcePackage);
      const entries = [];
      for (const request of await target.keys()) {
        const key = request.url;
        if (key !== root && !key.startsWith(`${root}?owner=`)) continue;
        entries.push({ key, marker: await readJsonResponse(await target.match(key)) });
      }
      return entries;
    },
    async cleanupInvalidPackageMarker(cache, resourcePackage, marker, key = markerKey(resourcePackage)) {
      try {
        const expectedUrls = new Set(resourcePackage.files.map((file) => fileUrl(resourcePackage, file)));
        for (const entry of Array.isArray(marker?.files) ? marker.files : []) {
          if (typeof entry?.url === "string" && !expectedUrls.has(entry.url)) await cache.delete(entry.url);
        }
        await cache.delete(key);
      } catch (cause) {
        throw new PiperResourceStorageError("Piper resource marker cleanup failed", cause);
      }
    },
    async checkCurrentPackage(resourcePackage) {
      store.lastStorageError = null;
      store.lastInspection = null;
      try {
        const { cache, results } = await store.inspectPackageFiles(resourcePackage, {
          rehashUnknown: true,
          persistMetadata: true,
        });
        const markers = await store.getCompletionMarkers(resourcePackage, cache);
        const validMarker = markers.find(({ marker }) => packageMarkerMatches(marker, resourcePackage, results));
        const markerState = validMarker ? "valid" : markers.length ? "invalid" : "missing";
        store.lastInspection = { cache, results, markerState, marker: validMarker?.marker || null };
        for (const entry of markers) {
          if (entry === validMarker || packageMarkerMatches(entry.marker, resourcePackage, results)) continue;
          try {
            await store.cleanupInvalidPackageMarker(cache, resourcePackage, entry.marker, entry.key);
          } catch (error) {
            store.lastStorageError = error;
          }
        }
        return markerState === "valid";
      } catch (cause) {
        store.lastStorageError = cause instanceof PiperResourceStorageError
          ? cause
          : new PiperResourceStorageError("Piper resource cache inspection failed", cause);
        return false;
      }
    },
    async ensureLegacyEnglishMigration(packageId) {
      if (packageId !== ENGLISH_PACKAGE_ID) return;
      if (!legacyMigrationPromise) {
        legacyMigrationPromise = store.migrateLegacyEnglishVoice().catch((error) => ({ status: "error", error }));
      }
      await legacyMigrationPromise;
    },
    async isPiperResourceCached(packageId) {
      const resourcePackage = store.getPackage(packageId);
      if (!isActivePiperCdnVoicePackage(resourcePackage) || !cacheStorage?.open) return false;
      await store.ensureLegacyEnglishMigration(packageId);
      const completed = await store.checkCurrentPackage(resourcePackage);
      if (completed) {
        await store.cleanupSupersededPiperResourceCaches(packageId, { skipCurrentValidation: true }).catch(() => {});
      }
      return completed;
    },
    async getPiperResourceStatus(packageId) {
      const resourcePackage = store.getPackage(packageId);
      if (!resourcePackage) return "invalid";
      if (!resourcePackage.releaseApproved) return "gated";
      if (!isActivePiperCdnVoicePackage(resourcePackage)) return "invalid";
      if (!store.getCapabilities().canDownload) return "unsupported";
      await store.ensureLegacyEnglishMigration(packageId);
      if (await store.checkCurrentPackage(resourcePackage)) {
        await store.cleanupSupersededPiperResourceCaches(packageId, { skipCurrentValidation: true }).catch(() => {});
        return "completed";
      }
      if (store.lastStorageError) return "invalid";
      const inspection = store.lastInspection;
      if (inspection?.markerState === "invalid" || inspection?.results.some((entry) => entry.present && !entry.valid)) return "invalid";
      if (inspection?.results.some((entry) => entry.present)) return "partial";
      return "not-downloaded";
    },
    async getPiperResourceCachedBytes(packageId) {
      const resourcePackage = store.getPackage(packageId);
      if (!isActivePiperCdnVoicePackage(resourcePackage) || !cacheStorage?.open) return null;
      try {
        const { results } = await store.inspectPackageFiles(resourcePackage, {
          rehashUnknown: false,
          persistMetadata: false,
        });
        const bytes = results.reduce((total, entry) => total + (entry.valid ? entry.metadata.actualBytes : 0), 0);
        return bytes || null;
      } catch (_) {
        return null;
      }
    },
    async deletePiperResource(packageId) {
      const resourcePackage = store.getPackage(packageId);
      if (!isActivePiperCdnVoicePackage(resourcePackage) || !cacheStorage?.delete) return;
      await cacheStorage.delete(cacheName(resourcePackage));
    },
    async migrateLegacyEnglishVoice() {
      const resourcePackage = store.getPackage(ENGLISH_PACKAGE_ID);
      if (!isActivePiperCdnVoicePackage(resourcePackage) || !cacheStorage?.open) return { status: "not-downloaded", files: [] };
      if (await store.checkCurrentPackage(resourcePackage)) return { status: "already-current", files: [] };
      const legacy = await cacheStorage.open(LEGACY_ENGLISH_CACHE);
      const target = await cacheStorage.open(cacheName(resourcePackage));
      const commitId = `legacy-${createCommitId()}`;
      const migratedFiles = [];

      for (const file of resourcePackage.files) {
        const existing = await store.inspectFile(resourcePackage, file, {
          cache: target,
          rehashUnknown: true,
          persistMetadata: true,
          commitId,
        });
        if (existing.valid) continue;
        const legacyResponse = await legacy.match(fileUrl(resourcePackage, file));
        if (!legacyResponse) continue;
        let actual;
        try {
          actual = await responseIntegrity(legacyResponse);
        } catch (_) {
          continue;
        }
        if (actual.bytes !== file.bytes || actual.sha256 !== file.sha256.toLowerCase()) continue;
        const freshLegacyResponse = await legacy.match(fileUrl(resourcePackage, file));
        if (!freshLegacyResponse) continue;
        await target.put(fileUrl(resourcePackage, file), freshLegacyResponse);
        await store.writeFileCompletionMarker(resourcePackage, file, actual, { cache: target, commitId });
        migratedFiles.push(file.key);
      }

      const { results } = await store.inspectPackageFiles(resourcePackage, {
        cache: target,
        rehashUnknown: false,
        persistMetadata: false,
      });
      if (results.every((entry) => entry.valid)) {
        await store.writeCompletionMarker(resourcePackage, results, { cache: target, commitId });
        return { status: "migrated", files: migratedFiles };
      }
      return { status: migratedFiles.length ? "partial" : "not-downloaded", files: migratedFiles };
    },
    async cleanupSupersededPiperResourceCaches(packageId, {
      inUseCacheNames = [],
      skipCurrentValidation = false,
    } = {}) {
      const resourcePackage = store.getPackage(packageId);
      if (!isActivePiperCdnVoicePackage(resourcePackage) || !cacheStorage?.keys) return;
      if (!skipCurrentValidation && !(await store.checkCurrentPackage(resourcePackage))) return;
      const protectedNames = new Set(inUseCacheNames);
      const prefix = `shadow-mate-piper-${resourcePackage.id}-`;
      for (const name of await cacheStorage.keys()) {
        if (!name.startsWith(prefix) || name === cacheName(resourcePackage) || protectedNames.has(name)) continue;
        const oldCache = await cacheStorage.open(name);
        const oldVersion = name.slice(prefix.length);
        const oldPackage = { ...resourcePackage, version: oldVersion };
        const oldMarkers = await store.getCompletionMarkers(oldPackage, oldCache);
        let verified = false;
        for (const { marker: oldMarker } of oldMarkers) {
          if (oldMarker?.id !== resourcePackage.id
            || oldMarker.version !== oldVersion
            || oldMarker.manifestVersion !== oldVersion
            || !Array.isArray(oldMarker.files)
            || oldMarker.files.length === 0) continue;
          verified = true;
          for (const entry of oldMarker.files) {
            if (!entry?.url
              || entry.expectedBytes !== entry.actualBytes
              || entry.expectedSha256 !== entry.actualSha256
              || !SHA_256_RE.test(entry.actualSha256 || "")) {
              verified = false;
              break;
            }
            const response = await oldCache.match(entry.url);
            if (!response) {
              verified = false;
              break;
            }
            try {
              const actual = await responseIntegrity(response);
              if (actual.bytes !== entry.actualBytes || actual.sha256 !== entry.actualSha256) verified = false;
            } catch (_) {
              verified = false;
            }
            if (!verified) break;
          }
          if (verified) break;
        }
        if (verified) await cacheStorage.delete(name);
      }
    },
  };
  return store;
}

const defaultStore = createPiperResourceStore();

export const getPiperResourceStatus = (packageId) => defaultStore.getPiperResourceStatus(packageId);
export const getPiperResourceCachedBytes = (packageId) => defaultStore.getPiperResourceCachedBytes(packageId);
export const isPiperResourceCached = (packageId) => defaultStore.isPiperResourceCached(packageId);
export const deletePiperResource = (packageId) => defaultStore.deletePiperResource(packageId);
export const migrateLegacyEnglishVoice = () => defaultStore.migrateLegacyEnglishVoice();
export const cleanupSupersededPiperResourceCaches = (packageId, options) =>
  defaultStore.cleanupSupersededPiperResourceCaches(packageId, options);
