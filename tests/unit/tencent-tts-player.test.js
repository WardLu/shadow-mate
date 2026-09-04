import { describe, expect, it, vi } from "vitest";
import { createPublishedSpeechPlayer } from "../../src/tencent-tts-player.js";

const entry = {
  contentId: "hz-001:glyph",
  url: "https://voice.shadow.wang/tts/tencent/v1/zh-CN/101030/a.mp3",
};

function response(body = new Uint8Array([0x49, 0x44, 0x33, 1])) {
  return new Response(body, { status: 200, headers: { "content-type": "audio/mpeg" } });
}

describe("published speech player", () => {
  it("deduplicates concurrent playback for one content id", async () => {
    let finish;
    const fetchImpl = vi.fn(async (url) => url.endsWith("manifest.json")
      ? new Response(JSON.stringify({ entries: [entry] }), { headers: { "content-type": "application/json" } })
      : response());
    class AudioMock {
      play() { return new Promise((resolve) => { finish = () => { this.onended?.(); resolve(); }; }); }
      pause() {}
    }
    const player = createPublishedSpeechPlayer({ fetchImpl, AudioCtor: AudioMock, createObjectURL: () => "blob:test", revokeObjectURL() {} });
    const first = player.play(entry.contentId);
    const second = player.play(entry.contentId);
    expect(first).toBe(second);
    await vi.waitFor(() => expect(typeof finish).toBe("function"));
    finish();
    await expect(first).resolves.toEqual({ status: "played", source: "cdn" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("memoizes the manifest but reports missing content distinctly", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ entries: [entry] }), { headers: { "content-type": "application/json" } }));
    const player = createPublishedSpeechPlayer({ fetchImpl });
    await expect(player.play("missing:glyph")).rejects.toMatchObject({ code: "published-audio-not-found" });
    await expect(player.play("missing:meaning")).rejects.toMatchObject({ code: "published-audio-not-found" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("uses stable codes for timeout, HTTP, media type and playback failures", async () => {
    const cases = [
      [async (url) => url.endsWith("manifest.json") ? new Response(JSON.stringify({ entries: [entry] })) : Promise.reject(Object.assign(new Error("timeout"), { name: "TimeoutError" })), "published-audio-timeout"],
      [async (url) => url.endsWith("manifest.json") ? new Response(JSON.stringify({ entries: [entry] })) : new Response("no", { status: 503 }), "published-audio-http"],
      [async (url) => url.endsWith("manifest.json") ? new Response(JSON.stringify({ entries: [entry] })) : new Response("no", { headers: { "content-type": "text/plain" } }), "published-audio-invalid-type"],
    ];
    for (const [fetchImpl, code] of cases) {
      const player = createPublishedSpeechPlayer({ fetchImpl, AudioCtor: class {} });
      await expect(player.play(entry.contentId)).rejects.toMatchObject({ code });
    }
    const player = createPublishedSpeechPlayer({
      fetchImpl: async (url) => url.endsWith("manifest.json") ? new Response(JSON.stringify({ entries: [entry] })) : response(),
      AudioCtor: class { play() { return Promise.reject(new Error("denied")); } pause() {} },
      createObjectURL: () => "blob:test",
      revokeObjectURL() {},
    });
    await expect(player.play(entry.contentId)).rejects.toMatchObject({ code: "published-audio-playback" });
  });
});
