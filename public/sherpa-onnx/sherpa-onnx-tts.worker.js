import createModule from "./sherpa-onnx-wasm-main-tts.js";
import { createOfflineTts } from "./sherpa-onnx-tts.js";

let tts = null;

function messageFor(error) {
  return error instanceof Error ? error.message : String(error);
}

self.onmessage = async ({ data: message }) => {
  if (message?.type === "init") {
    try {
      const cache = await caches.open(message.cacheName);
      const [dataResponse, wasmResponse] = await Promise.all([
        cache.match(message.dataUrl),
        cache.match(message.wasmUrl),
      ]);
      if (!dataResponse?.ok || !wasmResponse?.ok) throw new Error("已校验的离线语音资源不完整");
      const [dataBuffer, wasmBuffer] = await Promise.all([
        dataResponse.arrayBuffer(),
        wasmResponse.arrayBuffer(),
      ]);
      const Module = await createModule({
        // The upstream browser bundle defaults to a 512 MiB shared heap. That
        // eager allocation can terminate Android browser workers before the
        // model is initialized. Start smaller and let Emscripten's configured
        // ALLOW_MEMORY_GROWTH expand the heap only when inference needs it.
        INITIAL_MEMORY: 256 * 1024 * 1024,
        getPreloadedPackage: () => dataBuffer,
        wasmBinary: new Uint8Array(wasmBuffer),
        setStatus: () => {},
      });
      tts = createOfflineTts(Module);
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({ type: "error", code: "engine", message: `离线语音引擎初始化失败：${messageFor(error)}` });
    }
    return;
  }
  if (message?.type !== "generate" || !tts) return;
  try {
    const audio = tts.generate({ text: message.text, sid: 0, speed: message.speed || 1.0 });
    const samples = audio.samples;
    self.postMessage({ type: "result", requestId: message.requestId, samples, sampleRate: tts.sampleRate }, [samples.buffer]);
  } catch (error) {
    self.postMessage({ type: "error", requestId: message.requestId, code: "synthesis", message: `离线语音合成失败：${messageFor(error)}` });
  }
};
