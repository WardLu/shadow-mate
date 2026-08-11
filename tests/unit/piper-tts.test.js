import { afterEach, describe, expect, test, vi } from "vitest";
import { askDownloadVoice, downloadVoice, VOICE, VOICE_FILES, withTimeout } from "../../src/piper-tts.js";

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
  test("uses the commercially reviewed replacement voice path", () => {
    expect(VOICE).toBe("/piper/en_US-ljspeech-medium");
    expect(VOICE_FILES).toEqual([
      "/piper/en_US-ljspeech-medium.onnx",
      "/piper/en_US-ljspeech-medium.onnx.json",
    ]);
  });

  test("reports received bytes when the response omits Content-Length", async () => {
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
          url.endsWith(".onnx")
            ? responseWithChunks([Uint8Array.from([1, 2]), Uint8Array.from([3, 4, 5])])
            : responseWithChunks([Uint8Array.from([6])])
        );
      })
    );
    const progress = [];

    await downloadVoice((received, total) => progress.push([received, total]));

    expect(progress).toContainEqual([5, 0]);
    expect(progress.some(([received]) => received > 0)).toBe(true);
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
        const isModel = url.endsWith(".onnx");
        return Promise.resolve(
          responseWithChunks(
            isModel ? [Uint8Array.from([1, 2, 3]), Uint8Array.from([4, 5])] : [Uint8Array.from([6])],
            { "content-length": isModel ? "5" : "1" }
          )
        );
      })
    );
    const progress = [];

    await downloadVoice((received, total) => progress.push([received, total]));

    expect(progress).toContainEqual([3, 6]);
    expect(progress).toContainEqual([5, 6]);
    expect(progress.at(-1)).toEqual([6, 6]);
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
