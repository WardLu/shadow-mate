import { TENCENT_TTS_MANIFEST_URL } from "./tencent-tts-catalog.js";

export class PublishedSpeechError extends Error {
  constructor(code, cause) {
    super(code, cause ? { cause } : undefined);
    this.name = "PublishedSpeechError";
    this.code = code;
  }
}

function mapFetchError(error) {
  if (error?.name === "AbortError" || error?.name === "TimeoutError") {
    return new PublishedSpeechError("published-audio-timeout", error);
  }
  return error instanceof PublishedSpeechError
    ? error
    : new PublishedSpeechError("published-audio-http", error);
}

export function createPublishedSpeechPlayer({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  AudioCtor = globalThis.Audio,
  manifestUrl = TENCENT_TTS_MANIFEST_URL,
  timeoutMs = 12000,
  playbackTimeoutMs = 20000,
  createObjectURL = globalThis.URL?.createObjectURL?.bind(globalThis.URL),
  revokeObjectURL = globalThis.URL?.revokeObjectURL?.bind(globalThis.URL),
} = {}) {
  let manifestPromise;
  const inFlight = new Map();

  function loadManifest() {
    if (!manifestPromise) {
      manifestPromise = Promise.resolve(fetchImpl(manifestUrl, { cache: "no-cache" }))
        .then((response) => {
          if (!response.ok) throw new PublishedSpeechError("published-audio-http");
          return response.json();
        })
        .then((manifest) => new Map((manifest?.entries || []).map((entry) => [entry.contentId, entry])))
        .catch((error) => {
          manifestPromise = undefined;
          throw mapFetchError(error);
        });
    }
    return manifestPromise;
  }

  async function playOnce(contentId) {
    const entries = await loadManifest();
    const entry = entries.get(contentId);
    if (!entry) throw new PublishedSpeechError("published-audio-not-found");
    let response;
    try {
      response = await fetchImpl(entry.url, {
        cache: "default",
        signal: typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(timeoutMs) : undefined,
      });
    } catch (error) {
      throw mapFetchError(error);
    }
    if (!response.ok) throw new PublishedSpeechError("published-audio-http");
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "audio/mpeg" && contentType !== "audio/mp3") {
      throw new PublishedSpeechError("published-audio-invalid-type");
    }
    const blob = await response.blob();
    const objectUrl = createObjectURL(blob);
    const audio = new AudioCtor(objectUrl);
    try {
      await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(playbackTimer);
          error ? reject(error) : resolve();
        };
        const playbackTimer = setTimeout(() => finish(new PublishedSpeechError("published-audio-playback")), playbackTimeoutMs);
        audio.onended = () => finish();
        audio.onerror = () => finish(new PublishedSpeechError("published-audio-playback"));
        Promise.resolve(audio.play()).catch((error) => finish(new PublishedSpeechError("published-audio-playback", error)));
      });
      return { status: "played", source: "cdn" };
    } finally {
      audio.pause?.();
      revokeObjectURL?.(objectUrl);
    }
  }

  return {
    loadManifest,
    play(contentId) {
      if (inFlight.has(contentId)) return inFlight.get(contentId);
      const promise = playOnce(contentId).finally(() => inFlight.delete(contentId));
      inFlight.set(contentId, promise);
      return promise;
    },
  };
}
