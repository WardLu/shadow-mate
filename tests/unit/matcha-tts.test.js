import { describe, expect, test, vi } from "vitest";
import { createMatchaTtsRuntime, encodeMonoWav } from "../../src/matcha-tts.js";

class FakeWorker {
  constructor(url, options) {
    this.url = url;
    this.options = options;
    FakeWorker.instances.push(this);
  }

  postMessage(message) {
    if (message.type === "init") {
      queueMicrotask(() => this.onmessage({ data: { type: "ready" } }));
      return;
    }
    if (message.type === "generate") {
      const samples = new Float32Array([0, 0.5, -0.5]);
      queueMicrotask(() => this.onmessage({
        data: { type: "result", requestId: message.requestId, samples: samples.buffer, sampleRate: 16000 },
      }));
    }
  }

  terminate() {
    this.terminated = true;
  }
}
FakeWorker.instances = [];

describe("Matcha browser TTS adapter", () => {
  test("initializes one module worker and generates Chinese and English through it", async () => {
    const runtime = createMatchaTtsRuntime({ WorkerCtor: FakeWorker });
    await runtime.prepare({ cacheName: "voice-v1", dataUrl: "https://voice.test/model.data", wasmUrl: "https://voice.test/model.wasm" });
    const chinese = await runtime.generate("雨。");
    const english = await runtime.generate("rain.");

    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.instances[0].options).toMatchObject({ type: "module" });
    expect(chinese.sampleRate).toBe(16000);
    expect([...english.samples]).toEqual([0, 0.5, -0.5]);
  });

  test("encodes generated mono samples as a valid PCM WAV", async () => {
    const blob = encodeMonoWav(new Float32Array([0, 1, -1]), 16000);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe("WAVE");
    expect(blob.type).toBe("audio/wav");
  });

  test("fails closed when cross-origin isolation is explicitly unavailable", async () => {
    vi.stubGlobal("crossOriginIsolated", false);
    const runtime = createMatchaTtsRuntime({ WorkerCtor: FakeWorker });
    await expect(runtime.prepare({ cacheName: "voice-v1", dataUrl: "data", wasmUrl: "wasm" }))
      .rejects.toMatchObject({ code: "isolation" });
    vi.unstubAllGlobals();
  });
});
