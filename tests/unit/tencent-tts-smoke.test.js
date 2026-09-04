import { describe, expect, it } from "vitest";
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

  it.each([
    ["http", response({ status: 404 })],
    ["media", response({ type: "text/plain" })],
    ["cors", response({ origin: "https://example.test" })],
    ["hash", response({ body: Uint8Array.from([0x49, 0x44, 0x33, 2]) })],
  ])("rejects invalid %s responses", async (_name, result) => {
    await expect(verifyTencentTtsEntry(entry, { fetchImpl: async () => result })).rejects.toThrow();
  });
});
