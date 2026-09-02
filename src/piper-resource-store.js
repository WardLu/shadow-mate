import { getPiperCapabilities } from "./piper-resource-capabilities.js";
import { createPiperResourceSha256 } from "./piper-resource-hash.js";
import { getPiperResourcePackage, listPiperResourcePackages } from "./piper-resource-registry.js";

const LEGACY_ENGLISH_CACHE = "shadow-mate-voice";

function normalizedUrl(url) {
  return new URL(url, globalThis.location?.href || "https://shadow-mate.invalid/").href;
}

function cacheName(resourcePackage) {
  return `shadow-mate-piper-${resourcePackage.id}-${resourcePackage.version}`;
}

function markerKey(resourcePackage) {
  return `package:${resourcePackage.id}@${resourcePackage.version}`;
}

function fileUrl(resourcePackage, file) {
  return normalizedUrl(`${resourcePackage.baseUrl}${file.suffix}`);
}

async function responseIntegrity(response) {
  const bytes = new Uint8Array(await response.clone().arrayBuffer());
  const hash = createPiperResourceSha256();
  hash.update(bytes);
  return { bytes: bytes.byteLength, sha256: hash.digestHex() };
}

export function createPiperResourceStore({
  packages = listPiperResourcePackages(),
  cacheStorage = globalThis.caches,
  getCapabilities = getPiperCapabilities,
} = {}) {
  const packageById = new Map(packages.map((resourcePackage) => [resourcePackage.id, resourcePackage]));
  const store = {
    cacheStorage,
    getCapabilities,
    getCacheName: cacheName,
    getMarkerKey: markerKey,
    getPackage(packageId) {
      return packageById.get(packageId) || null;
    },
    async writeCompletionMarker(resourcePackage) {
      const cache = await cacheStorage.open(cacheName(resourcePackage));
      const files = [];
      for (const file of resourcePackage.files) {
        const url = fileUrl(resourcePackage, file);
        const response = await cache.match(url);
        if (!response) throw new Error(`Cannot mark missing Piper resource ${file.key}`);
        const actual = await responseIntegrity(response);
        if (actual.bytes !== file.bytes || actual.sha256 !== file.sha256.toLowerCase()) {
          throw new Error(`Cannot mark unverified Piper resource ${file.key}`);
        }
        files.push({
          key: file.key,
          url,
          expectedBytes: file.bytes,
          actualBytes: actual.bytes,
          expectedSha256: file.sha256.toLowerCase(),
          actualSha256: actual.sha256,
        });
      }
      const marker = { id: resourcePackage.id, version: resourcePackage.version, manifestVersion: resourcePackage.version, files };
      await cache.put(markerKey(resourcePackage), new Response(JSON.stringify(marker), { headers: { "content-type": "application/json" } }));
      return marker;
    },
    async invalidate(cache) {
      const keys = await cache.keys();
      await Promise.all(keys.map((key) => cache.delete(key)));
    },
    async isPiperResourceCached(packageId) {
      const resourcePackage = store.getPackage(packageId);
      if (!resourcePackage?.releaseApproved || !cacheStorage?.open) return false;
      let cache;
      try {
        cache = await cacheStorage.open(cacheName(resourcePackage));
        const markerResponse = await cache.match(markerKey(resourcePackage));
        if (!markerResponse) return false;
        const marker = await markerResponse.json();
        if (marker.id !== resourcePackage.id || marker.version !== resourcePackage.version || marker.manifestVersion !== resourcePackage.version || !Array.isArray(marker.files) || marker.files.length !== resourcePackage.files.length) {
          await store.invalidate(cache);
          return false;
        }
        for (const file of resourcePackage.files) {
          const expectedUrl = fileUrl(resourcePackage, file);
          const markerFile = marker.files.find((entry) => entry.key === file.key);
          if (!markerFile || markerFile.url !== expectedUrl || markerFile.expectedBytes !== file.bytes || markerFile.expectedSha256 !== file.sha256.toLowerCase()) {
            await store.invalidate(cache);
            return false;
          }
          const response = await cache.match(expectedUrl);
          if (!response) {
            await cache.delete(markerKey(resourcePackage));
            return false;
          }
          const actual = await responseIntegrity(response);
          if (actual.bytes !== file.bytes || actual.sha256 !== file.sha256.toLowerCase() || markerFile.actualBytes !== actual.bytes || markerFile.actualSha256 !== actual.sha256) {
            await store.invalidate(cache);
            return false;
          }
        }
        return true;
      } catch (_) {
        if (cache) await store.invalidate(cache);
        return false;
      }
    },
    async getPiperResourceStatus(packageId) {
      const resourcePackage = store.getPackage(packageId);
      if (!resourcePackage) return "invalid";
      if (!resourcePackage.releaseApproved) return "gated";
      if (!store.getCapabilities().canDownload) return "unsupported";
      if (await store.isPiperResourceCached(packageId)) return "completed";
      if (!cacheStorage?.open) return "unsupported";
      try {
        const cache = await cacheStorage.open(cacheName(resourcePackage));
        const anyFile = await Promise.all(resourcePackage.files.map((file) => cache.match(fileUrl(resourcePackage, file))));
        return anyFile.some(Boolean) ? "partial" : "not-downloaded";
      } catch (_) {
        return "unsupported";
      }
    },
    async deletePiperResource(packageId) {
      const resourcePackage = store.getPackage(packageId);
      if (!resourcePackage?.releaseApproved || !cacheStorage?.delete) return;
      await cacheStorage.delete(cacheName(resourcePackage));
    },
    async migrateLegacyEnglishVoice() {
      const resourcePackage = store.getPackage("en_US-ljspeech-medium");
      if (!resourcePackage || !cacheStorage?.open) return { status: "not-downloaded" };
      const legacy = await cacheStorage.open(LEGACY_ENGLISH_CACHE);
      const legacyResponses = await Promise.all(resourcePackage.files.map((file) => legacy.match(fileUrl(resourcePackage, file))));
      if (legacyResponses.some((response) => !response)) return { status: "not-downloaded" };
      for (let index = 0; index < resourcePackage.files.length; index += 1) {
        const actual = await responseIntegrity(legacyResponses[index]);
        const file = resourcePackage.files[index];
        if (actual.bytes !== file.bytes || actual.sha256 !== file.sha256.toLowerCase()) return { status: "not-downloaded" };
      }
      const target = await cacheStorage.open(cacheName(resourcePackage));
      for (let index = 0; index < resourcePackage.files.length; index += 1) {
        await target.put(fileUrl(resourcePackage, resourcePackage.files[index]), legacyResponses[index]);
      }
      await store.writeCompletionMarker(resourcePackage);
      return { status: "migrated" };
    },
    async cleanupSupersededPiperResourceCaches(packageId, { inUseCacheNames = [] } = {}) {
      const resourcePackage = store.getPackage(packageId);
      if (!resourcePackage || !(await store.isPiperResourceCached(packageId))) return;
      const protectedNames = new Set(inUseCacheNames);
      const prefix = `shadow-mate-piper-${resourcePackage.id}-`;
      for (const name of await cacheStorage.keys()) {
        if (!name.startsWith(prefix) || name === cacheName(resourcePackage) || protectedNames.has(name)) continue;
        const oldCache = await cacheStorage.open(name);
        const oldMarker = await oldCache.match(`package:${resourcePackage.id}@${name.slice(prefix.length)}`);
        if (!oldMarker) continue;
        try {
          const marker = await oldMarker.json();
          if (marker.id === resourcePackage.id && marker.version === name.slice(prefix.length) && Array.isArray(marker.files) && marker.files.length > 0) {
            const responses = await Promise.all(marker.files.map((file) => oldCache.match(file.url)));
            if (responses.every(Boolean)) await cacheStorage.delete(name);
          }
        } catch (_) {
          // A malformed old marker is retained rather than deleting a potentially in-use cache.
        }
      }
    },
  };
  return store;
}

const defaultStore = createPiperResourceStore();

export const getPiperResourceStatus = (packageId) => defaultStore.getPiperResourceStatus(packageId);
export const isPiperResourceCached = (packageId) => defaultStore.isPiperResourceCached(packageId);
export const deletePiperResource = (packageId) => defaultStore.deletePiperResource(packageId);
export const migrateLegacyEnglishVoice = () => defaultStore.migrateLegacyEnglishVoice();
export const cleanupSupersededPiperResourceCaches = (packageId, options) =>
  defaultStore.cleanupSupersededPiperResourceCaches(packageId, options);
