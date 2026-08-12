import { afterEach, describe, expect, test, vi } from "vitest";
import { askDownloadVoice, downloadVoice, isVoiceCached, VOICE, VOICE_FILES, withTimeout } from "../../src/piper-tts.js";

const originalDialogDescriptors = new Map(
  ["showModal", "close"].map((name) => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)])
);

function responseWithChunks(chunks, headers = {}) {
  let index = 0;
  return {
    ok: true,
    headers: new Headers({ "content-type": "application/octet-stream", ...headers }),
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) return { done: true };
            return { done: false, value: chunks[index++] };
          },
        };
      },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const [name, descriptor] of originalDialogDescriptors) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else delete HTMLDialogElement.prototype[name];
  }
  document.body.innerHTML = "";
});

describe("offline Piper voice download", () => {
  test("uses the high-quality public-domain voice path", () => {
    expect(VOICE).toBe("/piper/en_US-ljspeech-high");
    expect(VOICE_FILES).toEqual([
      "/piper/en_US-ljspeech-high.onnx.part-00",
      "/piper/en_US-ljspeech-high.onnx.part-01",
      "/piper/en_US-ljspeech-high.onnx.json",
    ]);
  });

  test("treats every split model part and config as one cached voice", async () => {
    const cachedFiles = new Set(VOICE_FILES);
    const cache = {
      match: vi.fn((url) => Promise.resolve(cachedFiles.has(url) ? new Response("cached") : undefined)),
    };
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });

    await expect(isVoiceCached()).resolves.toBe(true);
    expect(cache.match.mock.calls.map(([url]) => url)).toEqual(VOICE_FILES);
  });

  test("reports aggregate progress using bundled sizes when the response omits Content-Length", async () => {
    const cache = {
      match: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });
    vi.stubGlobal(
      "fetch",
      vi.fn((url, options) => {
        if (options?.method === "HEAD") return Promise.resolve(responseWithChunks([]));
        return Promise.resolve(
          url.includes(".onnx.part-")
            ? responseWithChunks([Uint8Array.from([1, 2]), Uint8Array.from([3, 4, 5])])
            : responseWithChunks([Uint8Array.from([6])])
        );
      })
    );
    const progress = [];

    await downloadVoice((received, total) => progress.push([received, total]));

    expect(progress.some(([received]) => received > 0)).toBe(true);
    expect(progress.some(([received, total]) => received > 0 && total > 100_000_000)).toBe(true);
  });

  test("shows a percentage in the download dialog when Content-Length is unavailable", async () => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value() {
        this.open = true;
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value() {
        this.open = false;
      },
    });

    const cache = {
      match: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(responseWithChunks([Uint8Array.from([1])]))));

    const result = askDownloadVoice();
    const dialog = document.querySelector("#shadow-voice-dialog");
    dialog.querySelector('[data-action="ok"]').click();

    await vi.waitFor(() => {
      expect(dialog.querySelector(".voice-dialog-pct").textContent).toMatch(/^\d+%$/);
    });
    expect(dialog.querySelector(".voice-dialog-bar i").classList.contains("indeterminate")).toBe(false);
    await expect(result).resolves.toBe("ok");
  });

  test("reports aggregate bytes across the model and config files", async () => {
    const cache = {
      match: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        const isModelPart = url.includes(".onnx.part-");
        return Promise.resolve(
          responseWithChunks(
            isModelPart ? [Uint8Array.from([1, 2, 3]), Uint8Array.from([4, 5])] : [Uint8Array.from([6])],
            { "content-length": isModelPart ? "5" : "1" }
          )
        );
      })
    );
    const progress = [];

    await downloadVoice((received, total) => progress.push([received, total]));

    expect(progress).toContainEqual([3, 11]);
    expect(progress).toContainEqual([5, 11]);
    expect(progress).toContainEqual([8, 11]);
    expect(progress).toContainEqual([10, 11]);
    expect(progress.at(-1)).toEqual([11, 11]);
  });

  test("rejects when speech synthesis never settles", async () => {
    await expect(withTimeout(new Promise(() => {}), 5, "发音合成超时")).rejects.toThrow("发音合成超时");
  });

  test("keeps cancellation available and aborts an in-flight download", async () => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value() {
        this.open = true;
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value() {
        this.open = false;
      },
    });

    const cache = {
      match: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(cache) });
    let resolveFetchStarted;
    const fetchStarted = new Promise((resolve) => {
      resolveFetchStarted = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, options) => {
        resolveFetchStarted(options);
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      })
    );

    const result = askDownloadVoice();
    const dialog = document.querySelector("#shadow-voice-dialog");
    dialog.querySelector('[data-action="ok"]').click();
    const fetchOptions = await fetchStarted;
    const cancel = dialog.querySelector('[data-action="cancel"]');

    expect(dialog.querySelector(".voice-dialog-actions").hidden).toBe(false);
    expect(dialog.querySelector(".voice-dialog-pct").textContent).toBe("下载中…");
    expect(dialog.querySelector(".voice-dialog-bar i").classList.contains("indeterminate")).toBe(true);
    expect(cancel.hidden).toBe(false);
    expect(cancel.disabled).toBe(false);
    cancel.click();

    expect(fetchOptions.signal.aborted).toBe(true);
    await expect(result).resolves.toBe("cancel");
  });
});
