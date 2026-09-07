import { TENCENT_TTS_MANIFEST_URL } from "./tencent-tts-catalog.js";

export const SPEECH_GAIN_MULTIPLIER = 3.0;

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

function decodeAudio(audioContext, arrayBuffer) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ok = (buf) => {
      if (!settled) {
        settled = true;
        resolve(buf);
      }
    };
    const fail = (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    };
    try {
      const res = audioContext.decodeAudioData(arrayBuffer, ok, fail);
      if (res && typeof res.then === "function") {
        res.then(ok, fail);
      }
    } catch (e) {
      fail(e);
    }
  });
}

export function createPublishedSpeechPlayer({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  AudioCtor = globalThis.Audio,
  getAudioContext = () => (globalThis.AudioContext || globalThis.webkitAudioContext ? new (globalThis.AudioContext || globalThis.webkitAudioContext)() : null),
  manifestUrl = TENCENT_TTS_MANIFEST_URL,
  timeoutMs = 12000,
  playbackTimeoutMs = 20000,
  createObjectURL = globalThis.URL?.createObjectURL?.bind(globalThis.URL),
  revokeObjectURL = globalThis.URL?.revokeObjectURL?.bind(globalThis.URL),
  gainMultiplier = SPEECH_GAIN_MULTIPLIER,
} = {}) {
  let manifestPromise;
  const inFlight = new Map();
  const bufferCache = new Map();
  let currentPlayback = null;
  let activePlaySessionId = 0;

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

  function stop() {
    activePlaySessionId++;
    if (currentPlayback) {
      const active = currentPlayback;
      currentPlayback = null;
      try {
        active.stop();
      } catch (_) {}
    }
  }

  function playViaWebAudio(audioContext, audioBuffer, volume, timeoutMs) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let playbackTimer = null;
      let source = null;
      let gainNode = null;
      let limiter = null;

      const cleanup = () => {
        if (playbackTimer !== null) {
          clearTimeout(playbackTimer);
          playbackTimer = null;
        }
        if (currentPlayback?.source === source) {
          currentPlayback = null;
        }
        if (source) {
          try { source.disconnect(); } catch (_) {}
          source = null;
        }
        if (gainNode) {
          try { gainNode.disconnect(); } catch (_) {}
          gainNode = null;
        }
        if (limiter) {
          try { limiter.disconnect(); } catch (_) {}
          limiter = null;
        }
      };

      const finish = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve({ status: "played", source: "cdn" });
      };

      try {
        source = audioContext.createBufferSource();
        source.buffer = audioBuffer;

        gainNode = audioContext.createGain();
        const normalizedVol = Math.max(0, Math.min(1, typeof volume === "number" && !Number.isNaN(volume) ? volume : 1.0));
        const rawGain = normalizedVol * gainMultiplier;
        const targetGain = Math.round(rawGain * 10000) / 10000;
        if (typeof gainNode.gain?.setValueAtTime === "function") {
          gainNode.gain.setValueAtTime(targetGain, audioContext.currentTime ?? 0);
        } else if (gainNode.gain) {
          gainNode.gain.value = targetGain;
        }

        let lastNode = gainNode;
        if (typeof audioContext.createDynamicsCompressor === "function") {
          limiter = audioContext.createDynamicsCompressor();
          if (typeof limiter.threshold?.setValueAtTime === "function") {
            limiter.threshold.setValueAtTime(-1.5, audioContext.currentTime ?? 0);
            limiter.knee.setValueAtTime(3.0, audioContext.currentTime ?? 0);
            limiter.ratio.setValueAtTime(12.0, audioContext.currentTime ?? 0);
            limiter.attack.setValueAtTime(0.003, audioContext.currentTime ?? 0);
            limiter.release.setValueAtTime(0.05, audioContext.currentTime ?? 0);
          }
          gainNode.connect(limiter);
          lastNode = limiter;
        }
        lastNode.connect(audioContext.destination);
        source.connect(gainNode);

        source.onended = () => finish();

        playbackTimer = setTimeout(() => finish(new PublishedSpeechError("published-audio-playback")), timeoutMs);

        currentPlayback = {
          source,
          stop: () => {
            try { source?.stop(); } catch (_) {}
            finish();
          },
        };

        source.start(0);
      } catch (err) {
        finish(new PublishedSpeechError("published-audio-playback", err));
      }
    });
  }

  function playViaAudioElement(blob, volume, timeoutMs) {
    const objectUrl = createObjectURL(blob);
    const audio = new AudioCtor(objectUrl);
    const normalizedVol = Math.max(0, Math.min(1, typeof volume === "number" && !Number.isNaN(volume) ? volume : 1.0));
    try {
      if (typeof audio.volume === "number") {
        audio.volume = normalizedVol;
      }
    } catch (_) {}

    return new Promise((resolve, reject) => {
      let settled = false;
      let playbackTimer = null;

      const cleanup = () => {
        if (playbackTimer !== null) {
          clearTimeout(playbackTimer);
          playbackTimer = null;
        }
        if (currentPlayback?.audio === audio) {
          currentPlayback = null;
        }
        try { audio.pause?.(); } catch (_) {}
        revokeObjectURL?.(objectUrl);
      };

      const finish = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve({ status: "played", source: "cdn" });
      };

      playbackTimer = setTimeout(() => finish(new PublishedSpeechError("published-audio-playback")), timeoutMs);
      audio.onended = () => finish();
      audio.onerror = () => finish(new PublishedSpeechError("published-audio-playback"));

      currentPlayback = {
        audio,
        stop: () => finish(),
      };

      Promise.resolve(audio.play()).catch((error) => finish(new PublishedSpeechError("published-audio-playback", error)));
    });
  }

  async function playOnce(contentId, { volume = 1 } = {}) {
    const entries = await loadManifest();
    const entry = entries.get(contentId);
    if (!entry) throw new PublishedSpeechError("published-audio-not-found");

    stop();
    const sessionId = activePlaySessionId;

    let audioContext = null;
    try {
      audioContext = typeof getAudioContext === "function" ? getAudioContext() : null;
    } catch (_) {
      audioContext = null;
    }

    if (audioContext && bufferCache.has(contentId)) {
      const cachedBuffer = bufferCache.get(contentId);
      if (sessionId !== activePlaySessionId) {
        return { status: "cancelled", source: "cdn" };
      }
      return playViaWebAudio(audioContext, cachedBuffer, volume, playbackTimeoutMs);
    }

    let response;
    try {
      response = await fetchImpl(entry.url, {
        cache: "default",
        signal: typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(timeoutMs) : undefined,
      });
    } catch (error) {
      throw mapFetchError(error);
    }
    if (sessionId !== activePlaySessionId) {
      return { status: "cancelled", source: "cdn" };
    }
    if (!response.ok) throw new PublishedSpeechError("published-audio-http");
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "audio/mpeg" && contentType !== "audio/mp3") {
      throw new PublishedSpeechError("published-audio-invalid-type");
    }
    const blob = await response.blob();
    if (sessionId !== activePlaySessionId) {
      return { status: "cancelled", source: "cdn" };
    }

    if (audioContext && typeof audioContext.decodeAudioData === "function") {
      try {
        if (audioContext.state === "suspended") {
          await audioContext.resume().catch(() => {});
        }
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await decodeAudio(audioContext, arrayBuffer.slice(0));
        if (sessionId !== activePlaySessionId) {
          return { status: "cancelled", source: "cdn" };
        }
        if (audioBuffer) {
          bufferCache.set(contentId, audioBuffer);
          return await playViaWebAudio(audioContext, audioBuffer, volume, playbackTimeoutMs);
        }
      } catch (_) {
        // Fall back to HTMLAudioElement below
      }
    }

    if (sessionId !== activePlaySessionId) {
      return { status: "cancelled", source: "cdn" };
    }
    return playViaAudioElement(blob, volume, playbackTimeoutMs);
  }

  return {
    loadManifest,
    stop,
    play(contentId, { volume = 1 } = {}) {
      if (inFlight.has(contentId)) return inFlight.get(contentId);
      const promise = playOnce(contentId, { volume }).finally(() => inFlight.delete(contentId));
      inFlight.set(contentId, promise);
      return promise;
    },
  };
}
