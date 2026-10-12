import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyTencentTtsEntry } from "../../scripts/tencent-tts-smoke.mjs";

const audio = Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 1]);
const entry = {
  contentId: "hz-001:glyph",
  url: "https://voice.shadow.wang/tts/tencent/v1/zh-CN/101030/a.mp3",
  bytes: audio.byteLength,
  audioSha256: "193ce0c019630f9d7ed5ed40969cd8e0a9b8e74bf30474cac4cd635df0718a37",
};

function response({ status = 200, type = "audio/mpeg", body = audio, origin = "*", methods = "GET, HEAD", expose = "Content-Length" } = {}) {
  return new Response(body, { status, headers: {
    "content-type": type,
    "content-length": String(body.byteLength ?? body.length),
    "access-control-allow-origin": origin,
    "access-control-allow-methods": methods,
    "access-control-expose-headers": expose,
  } });
}

describe("Tencent TTS CDN smoke", () => {
  it("accepts a verified immutable MP3", async () => {
    await expect(verifyTencentTtsEntry(entry, { fetchImpl: async () => response() })).resolves.toMatchObject({ contentId: entry.contentId, bytes: audio.byteLength });
  });

  it("identifies request timeouts without exposing the underlying message", async () => {
    const cause = new DOMException("https://example.test/?token=private\nraw-error", "TimeoutError");
    const failure = await verifyTencentTtsEntry(entry, { fetchImpl: async () => { throw cause; } }).catch(error => error);
    expect(failure.message).toBe("cdn-timeout:content=hz-001:glyph:stage=request");
    expect(failure.cause).toBe(cause);
    expect(failure.message).not.toMatch(/token|private|raw-error|example\.test/);
  });

  it("distinguishes body timeouts from request timeouts", async () => {
    const cause = new DOMException("body timed out", "TimeoutError");
    const result = response();
    result.arrayBuffer = async () => { throw cause; };
    const failure = await verifyTencentTtsEntry(entry, { fetchImpl: async () => result }).catch(error => error);
    expect(failure.message).toBe("cdn-timeout:content=hz-001:glyph:stage=body");
    expect(failure.cause).toBe(cause);
  });

  it("uses the request deadline when body cancellation is reported as AbortError", async () => {
    const failure = await verifyTencentTtsEntry(entry, {
      timeoutMs: 1,
      fetchImpl: async (_url, { signal }) => {
        const result = response();
        result.arrayBuffer = () => new Promise((_resolve, reject) => {
          const abort = () => reject(new DOMException("raw body cancellation", "AbortError"));
          if (signal.aborted) abort();
          else signal.addEventListener("abort", abort, { once: true });
        });
        return result;
      },
    }).catch(error => error);
    expect(failure.message).toBe("cdn-timeout:content=hz-001:glyph:stage=body");
    expect(failure.cause.name).toBe("AbortError");
  });

  it("identifies decode failures with a fixed reason", async () => {
    const cause = new Error("decoder stderr with private data");
    const failure = await verifyTencentTtsEntry(entry, {
      fetchImpl: async () => response(),
      decodeAudio: async () => { throw cause; },
    }).catch(error => error);
    expect(failure.message).toBe("cdn-audio-decode-failed:content=hz-001:glyph:stage=decode");
    expect(failure.cause).toBe(cause);
  });

  it("rejects unsafe content labels in diagnostic output", async () => {
    const failure = await verifyTencentTtsEntry({ ...entry, contentId: "https://example.test/?token=private\nraw-error" }, {
      fetchImpl: async () => { throw new TypeError("private network details"); },
    }).catch(error => error);
    expect(failure.message).toBe("cdn-network-failed:content=unknown:stage=request");
  });

  it("keeps an unrelated body abort distinct from a timeout", async () => {
    const result = response();
    result.arrayBuffer = async () => { throw new DOMException("cancelled", "AbortError"); };
    await expect(verifyTencentTtsEntry(entry, { fetchImpl: async () => result }))
      .rejects.toThrow("cdn-network-failed:content=hz-001:glyph:stage=body");
  });

  it("does not attribute a decode failure to an expired download signal", async () => {
    let signal;
    const cause = new Error("decode rejected after download deadline");
    const failure = await verifyTencentTtsEntry(entry, {
      timeoutMs: 1,
      fetchImpl: async (_url, options) => { signal = options.signal; return response(); },
      decodeAudio: async () => {
        await new Promise(resolve => {
          if (signal.aborted) resolve();
          else signal.addEventListener("abort", resolve, { once: true });
        });
        throw cause;
      },
    }).catch(error => error);
    expect(failure.message).toBe("cdn-audio-decode-failed:content=hz-001:glyph:stage=decode");
    expect(failure.cause).toBe(cause);
  });

  it("prints fixed output for CLI argument failures", () => {
    const result = spawnSync(process.execPath, ["scripts/tencent-tts-smoke.mjs", "--synthetic-token=FAKE_TEST_VALUE"], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim()).toBe("tencent-tts-smoke-failed");
  });

  it("prints only safe context for a CLI entry failure", async () => {
    const directory = await mkdtemp(join(tmpdir(), "shadow-mate-smoke-test-"));
    try {
      const manifest = join(directory, "manifest.json");
      await writeFile(manifest, JSON.stringify({ entries: [{ contentId: "hz-001:glyph", url: "https://example.test/?token=FAKE_TEST_VALUE" }] }));
      const result = spawnSync(process.execPath, ["scripts/tencent-tts-smoke.mjs", "--manifest", manifest], { encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr.trim()).toBe("invalid-audio-url:content=hz-001:glyph:stage=entry");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects overlong content labels in diagnostic output", async () => {
    await expect(verifyTencentTtsEntry({ ...entry, contentId: "x".repeat(97) }, {
      fetchImpl: async () => { throw new Error("cdn-invalid-hash"); },
    })).rejects.toThrow("cdn-network-failed:content=unknown:stage=request");
  });

  it.each([
    ["headers", response({ status: 404 }), "cdn-http:404"],
    ["headers", response({ type: "text/plain" }), "cdn-invalid-media"],
    ["headers", response({ origin: "https://example.test" }), "cdn-invalid-cors-origin"],
    ["verify", response({ body: Uint8Array.from([0x49, 0x44, 0x33, 2]) }), "cdn-invalid-length"],
    ["verify", response({ body: Uint8Array.from([0x49, 0x44, 0x33, 5, 0, 0, 0, 0, 0, 1]) }), "cdn-invalid-hash"],
  ])("keeps the validation reason at stage %s", async (stage, result, reason) => {
    await expect(verifyTencentTtsEntry(entry, { fetchImpl: async () => result }))
      .rejects.toThrow(`${reason}:content=hz-001:glyph:stage=${stage}`);
  });
});
