import { afterEach, describe, expect, test, vi } from "vitest";
import {
  askDownloadVoice,
  ENGLISH_PIPER_PACKAGE_ID,
  VOICE,
  VOICE_FILES,
  withTimeout,
} from "../../src/piper-tts.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("offline Piper voice packages", () => {
  test("keeps the legacy English exports delegated to the active English package", () => {
    expect(ENGLISH_PIPER_PACKAGE_ID).toBe("en_US-ljspeech-medium");
    expect(VOICE).toBe("https://voice.shadow.wang/piper/en_US-ljspeech-medium");
    expect(VOICE_FILES).toEqual([
      "https://voice.shadow.wang/piper/en_US-ljspeech-medium.onnx",
      "https://voice.shadow.wang/piper/en_US-ljspeech-medium.onnx.json",
    ]);
  });

  test("returns the explicit registry gate for an unavailable Chinese package", async () => {
    await expect(askDownloadVoice("zh_CN-chaowen-medium")).resolves.toBe("gated");
    expect(document.querySelector("#shadow-voice-dialog")).toBeNull();
  });

  test("reports a synthesis timeout", async () => {
    await expect(withTimeout(new Promise(() => {}), 5, "发音合成超时")).rejects.toThrow("发音合成超时");
  });
});
