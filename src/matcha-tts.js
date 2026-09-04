const DEFAULT_WORKER_URL = "/sherpa-onnx/sherpa-onnx-tts.worker.js";

export class MatchaTtsError extends Error {
  constructor(code, message, cause) {
    super(message, { cause });
    this.name = "MatchaTtsError";
    this.code = code;
  }
}

function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
}

export function encodeMonoWav(samples, sampleRate) {
  const pcm = samples instanceof Float32Array ? samples : new Float32Array(samples);
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeAscii(view, 8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, pcm.length * 2, true);
  for (let index = 0; index < pcm.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, pcm[index]));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function createMatchaTtsRuntime({
  WorkerCtor = globalThis.Worker,
  workerUrl = DEFAULT_WORKER_URL,
} = {}) {
  let worker = null;
  let readyPromise = null;
  let nextRequestId = 1;
  const pending = new Map();

  const rejectPending = (error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };

  const reset = (error = new MatchaTtsError("engine", "离线语音引擎已重置")) => {
    worker?.terminate?.();
    worker = null;
    readyPromise = null;
    rejectPending(error);
  };

  const prepare = async ({ cacheName, dataUrl, wasmUrl }) => {
    if (readyPromise) return readyPromise;
    if (typeof WorkerCtor !== "function") throw new MatchaTtsError("unsupported", "当前浏览器不支持离线语音 Worker");
    if (globalThis.crossOriginIsolated === false) {
      throw new MatchaTtsError("isolation", "离线语音需要跨源隔离响应头");
    }
    worker = new WorkerCtor(workerUrl, { type: "module", name: "shadow-mate-matcha-tts" });
    readyPromise = new Promise((resolve, reject) => {
      const fail = (cause) => {
        const error = cause instanceof MatchaTtsError
          ? cause
          : new MatchaTtsError("engine", cause?.message || "离线语音引擎初始化失败", cause);
        reset(error);
        reject(error);
      };
      worker.onmessage = ({ data: message }) => {
        if (message?.type === "ready") {
          resolve();
          return;
        }
        if (message?.type === "result") {
          const request = pending.get(message.requestId);
          if (!request) return;
          pending.delete(message.requestId);
          request.resolve({ samples: new Float32Array(message.samples), sampleRate: message.sampleRate });
          return;
        }
        if (message?.type === "error") {
          const error = new MatchaTtsError(message.code || "engine", message.message || "离线语音引擎失败");
          const request = pending.get(message.requestId);
          if (request) {
            pending.delete(message.requestId);
            request.reject(error);
          } else {
            fail(error);
          }
        }
      };
      worker.onerror = (event) => fail(new MatchaTtsError("engine", event?.message || "离线语音 Worker 失败"));
      worker.postMessage({ type: "init", cacheName, dataUrl, wasmUrl });
    });
    return readyPromise;
  };

  const generate = async (text) => {
    if (!worker || !readyPromise) throw new MatchaTtsError("engine", "离线语音引擎尚未准备完成");
    await readyPromise;
    const requestId = nextRequestId;
    nextRequestId += 1;
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      worker.postMessage({ type: "generate", requestId, text, speed: 1.0 });
    });
  };

  return { prepare, generate, reset };
}
