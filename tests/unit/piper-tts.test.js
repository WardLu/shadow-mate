import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ENGLISH_PIPER_PACKAGE_ID,
  UNIFIED_OFFLINE_VOICE_PACKAGE_ID,
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
  test("delegates legacy exports to the one active Chinese-English package", () => {
    expect(ENGLISH_PIPER_PACKAGE_ID).toBe(UNIFIED_OFFLINE_VOICE_PACKAGE_ID);
    expect(UNIFIED_OFFLINE_VOICE_PACKAGE_ID).toBe("matcha-icefall-zh-en-1.13.2");
    expect(VOICE).toBe("https://voice.shadow.wang/sherpa-onnx/1.13.2/matcha-icefall-zh-en/sherpa-onnx-wasm-main-tts");
    expect(VOICE_FILES).toEqual([
      `${VOICE}.data`,
      "https://voice.shadow.wang/sherpa-onnx/1.13.2-mobile-256/matcha-icefall-zh-en/sherpa-onnx-wasm-main-tts.wasm",
    ]);
  });

  test("reports a synthesis timeout", async () => {
    await expect(withTimeout(new Promise(() => {}), 5, "发音合成超时")).rejects.toThrow("发音合成超时");
  });

  test("uses registry copy and exposes deletion for an invalid speech-dialog package", async () => {
    vi.resetModules();
    const resourcePackage = {
      id: "test-dialog-voice",
      locale: "en-US",
      label: "English (Dialog Test)",
      kind: "voice",
      version: "7",
      baseUrl: "https://voice.example.test/test-dialog-voice",
      source: "cdn",
      cachePolicy: "user-download",
      releaseApproved: true,
      totalBytes: 1048576,
      files: [],
    };
    const englishPackage = {
      ...resourcePackage,
      id: "matcha-icefall-zh-en-1.13.2",
      locales: ["zh-CN", "en-US"],
      baseUrl: "https://voice.shadow.wang/sherpa-onnx/1.13.2/matcha-icefall-zh-en/sherpa-onnx-wasm-main-tts",
      files: [{ suffix: ".data" }, { suffix: ".wasm" }],
    };
    const deletePackage = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../../src/piper-resource-registry.js", () => ({
      getPiperResourcePackage: (packageId) => packageId === englishPackage.id ? englishPackage : resourcePackage,
      listPiperResourcePackages: () => [englishPackage, resourcePackage],
      isActivePiperCdnVoicePackage: () => true,
      resolvePiperResourceFileUrl: (pkg, file) => file.url || `${pkg.baseUrl}${file.suffix}`,
      formatPiperResourceBytes: () => "1.0 MB",
      UNIFIED_OFFLINE_VOICE_PACKAGE_ID: englishPackage.id,
    }));
    vi.doMock("../../src/piper-resource-store.js", () => ({
      getPiperResourceStatus: vi.fn().mockResolvedValue("invalid"),
      deletePiperResource: deletePackage,
    }));
    vi.doMock("../../src/piper-resource-download.js", () => ({
      downloadPiperResource: vi.fn(),
      getPiperDownloadError: () => ({ code: "network" }),
    }));
    vi.doMock("../../src/piper-resource-lock.js", () => ({ acquirePiperDownloadLock: vi.fn() }));
    const { askDownloadVoice: askWithInvalidPackage } = await import("../../src/piper-tts.js");

    const pending = askWithInvalidPackage(resourcePackage.id);
    await vi.waitFor(() => expect(document.querySelector("#shadow-voice-dialog")).toBeTruthy());
    const dialog = document.querySelector("#shadow-voice-dialog");
    expect(dialog.querySelector(".voice-dialog-title").textContent).toContain(resourcePackage.label);
    expect(dialog.querySelector(".voice-dialog-desc").textContent).toContain("版本 7");
    expect(dialog.querySelector(".voice-dialog-desc").textContent).toContain("1.0 MB");
    expect(dialog.querySelector(".voice-dialog-desc").textContent).toContain(window.location.origin);
    expect(dialog.querySelector('[data-action="delete"]').hidden).toBe(false);
    dialog.querySelector('[data-action="delete"]').click();
    await vi.waitFor(() => expect(deletePackage).toHaveBeenCalledWith(resourcePackage.id));
    dialog.querySelector('[data-action="cancel"]').click();
    await expect(pending).resolves.toBe("cancel");

    vi.doUnmock("../../src/piper-resource-registry.js");
    vi.doUnmock("../../src/piper-resource-store.js");
    vi.doUnmock("../../src/piper-resource-download.js");
    vi.doUnmock("../../src/piper-resource-lock.js");
    vi.resetModules();
  });
});
