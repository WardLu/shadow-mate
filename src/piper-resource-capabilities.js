export function getPiperCapabilities() {
  const cacheStorageRead = typeof globalThis.caches?.open === "function";
  const cacheStorageWrite = cacheStorageRead && typeof globalThis.caches?.delete === "function";
  const cacheStorage = cacheStorageRead && cacheStorageWrite;
  const readableStream = typeof globalThis.ReadableStream === "function";
  const transformStream = typeof globalThis.TransformStream === "function";
  const abortController = typeof globalThis.AbortController === "function";
  const webAssembly = typeof globalThis.WebAssembly === "object";
  const userGestureAudio = typeof globalThis.HTMLAudioElement?.prototype?.play === "function";
  const storageEstimate = typeof globalThis.navigator?.storage?.estimate === "function";
  return {
    cacheStorageRead,
    cacheStorageWrite,
    cacheStorage,
    readableStream,
    transformStream,
    abortController,
    webAssembly,
    userGestureAudio,
    storageEstimate,
    canDownload: cacheStorage && readableStream && transformStream && abortController && webAssembly && userGestureAudio,
  };
}
