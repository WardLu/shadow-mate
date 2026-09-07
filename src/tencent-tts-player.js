import { TENCENT_TTS_MANIFEST_URL } from "./tencent-tts-catalog.js";

export const SPEECH_GAIN_MULTIPLIER = 2.5;

let sharedSoftClipperCurve = null;
export function getSoftClipperCurve() {
  if (!sharedSoftClipperCurve) {
    const n = 4096;
    const curve = new Float32Array(n);
    const k = 1.0;
    const norm = Math.tanh(k);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1;
      curve[i] = Math.tanh(x * k) / norm;
    }
    sharedSoftClipperCurve = curve;
  }
  return sharedSoftClipperCurve;
}

export function calculatePerceptualSpeechGain(volume, baselineGain = 1.0, baselineVol = 0.6) {
  const normalizedVol = Math.max(0, Math.min(2, typeof volume === "number" && !Number.isNaN(volume) ? volume : baselineVol));
  if (normalizedVol <= 0) return 0;
  const rawGain = Math.pow(normalizedVol / baselineVol, 1.35) * baselineGain;
  return Math.round(rawGain * 10000) / 10000;
}

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
      let preComp = null;
      let gainNode = null;
      let shaper = null;
      let limiter = null;
      let warmFilter = null;

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
        if (preComp) {
          try { preComp.disconnect(); } catch (_) {}
          preComp = null;
        }
        if (gainNode) {
          try { gainNode.disconnect(); } catch (_) {}
          gainNode = null;
        }
        if (shaper) {
          try { shaper.disconnect(); } catch (_) {}
          shaper = null;
        }
        if (limiter) {
          try { limiter.disconnect(); } catch (_) {}
          limiter = null;
        }
        if (warmFilter) {
          try { warmFilter.disconnect(); } catch (_) {}
          warmFilter = null;
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

        let chain = source;

        // 1. Pre-leveling Compressor: levels vocal dynamics at fixed input before user gain
        if (typeof audioContext.createDynamicsCompressor === "function") {
          preComp = audioContext.createDynamicsCompressor();
          if (typeof preComp.threshold?.setValueAtTime === "function") {
            preComp.threshold.setValueAtTime(-20.0, audioContext.currentTime ?? 0);
            preComp.knee.setValueAtTime(6.0, audioContext.currentTime ?? 0);
            preComp.ratio.setValueAtTime(2.5, audioContext.currentTime ?? 0);
            preComp.attack.setValueAtTime(0.005, audioContext.currentTime ?? 0);
            preComp.release.setValueAtTime(0.10, audioContext.currentTime ?? 0);
          } else {
            if (preComp.threshold) preComp.threshold.value = -20.0;
            if (preComp.knee) preComp.knee.value = 6.0;
            if (preComp.ratio) preComp.ratio.value = 2.5;
            if (preComp.attack) preComp.attack.value = 0.005;
            if (preComp.release) preComp.release.value = 0.10;
          }
          chain.connect(preComp);
          chain = preComp;
        }

        // 2. Post-Leveler User Volume Gain with psychoacoustic power scaling (60% baseline = 1.5x)
        gainNode = audioContext.createGain();
        const targetGain = calculatePerceptualSpeechGain(volume, (gainMultiplier / 2.5) * 1.0, 0.6);
        if (typeof gainNode.gain?.setValueAtTime === "function") {
          gainNode.gain.setValueAtTime(targetGain, audioContext.currentTime ?? 0);
        } else if (gainNode.gain) {
          gainNode.gain.value = targetGain;
        }
        chain.connect(gainNode);
        chain = gainNode;

        // 3. Soft-Clipper WaveShaper: prevents DAC clipping while preserving dynamic range and clear loudness growth
        if (typeof audioContext.createWaveShaper === "function") {
          shaper = audioContext.createWaveShaper();
          shaper.curve = getSoftClipperCurve();
          if ("oversample" in shaper) shaper.oversample = "2x";
          chain.connect(shaper);
          chain = shaper;
        } else if (typeof audioContext.createDynamicsCompressor === "function") {
          limiter = audioContext.createDynamicsCompressor();
          if (typeof limiter.threshold?.setValueAtTime === "function") {
            limiter.threshold.setValueAtTime(-1.0, audioContext.currentTime ?? 0);
            limiter.knee.setValueAtTime(6.0, audioContext.currentTime ?? 0);
            limiter.ratio.setValueAtTime(4.0, audioContext.currentTime ?? 0);
            limiter.attack.setValueAtTime(0.001, audioContext.currentTime ?? 0);
            limiter.release.setValueAtTime(0.05, audioContext.currentTime ?? 0);
          } else {
            if (limiter.threshold) limiter.threshold.value = -1.0;
            if (limiter.knee) limiter.knee.value = 6.0;
            if (limiter.ratio) limiter.ratio.value = 4.0;
            if (limiter.attack) limiter.attack.value = 0.001;
            if (limiter.release) limiter.release.value = 0.05;
          }
          chain.connect(limiter);
          chain = limiter;
        }

        // 4. Warm smoothing filter: gently tames high-frequency sibilance/fizz above 7.5kHz for a natural, round vocal tone
        if (typeof audioContext.createBiquadFilter === "function") {
          warmFilter = audioContext.createBiquadFilter();
          warmFilter.type = "lowpass";
          if (typeof warmFilter.frequency?.setValueAtTime === "function") {
            warmFilter.frequency.setValueAtTime(7500, audioContext.currentTime ?? 0);
            warmFilter.Q.setValueAtTime(0.707, audioContext.currentTime ?? 0);
          } else {
            if (warmFilter.frequency) warmFilter.frequency.value = 7500;
            if (warmFilter.Q) warmFilter.Q.value = 0.707;
          }
          chain.connect(warmFilter);
          chain = warmFilter;
        }

        chain.connect(audioContext.destination);

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
      try {
        const ctx = typeof getAudioContext === "function" ? getAudioContext() : null;
        if (ctx && ctx.state === "suspended") {
          void ctx.resume().catch(() => {});
        }
      } catch (_) {}
      if (inFlight.has(contentId)) return inFlight.get(contentId);
      const promise = playOnce(contentId, { volume }).finally(() => inFlight.delete(contentId));
      inFlight.set(contentId, promise);
      return promise;
    },
  };
}
