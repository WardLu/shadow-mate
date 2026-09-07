import { describe, expect, it, vi } from "vitest";
import { createPublishedSpeechPlayer, SPEECH_GAIN_MULTIPLIER } from "../../src/tencent-tts-player.js";

const entry = {
  contentId: "hz-001:glyph",
  url: "https://voice.shadow.wang/tts/tencent/v1/zh-CN/101030/a.mp3",
};

function response(body = new Uint8Array([0x49, 0x44, 0x33, 1])) {
  return new Response(body, { status: 200, headers: { "content-type": "audio/mpeg" } });
}

function createFakeAudioContext() {
  let sourceNode = null;
  const gainNode = {
    gain: { value: 0, setValueAtTime: vi.fn((val) => { gainNode.gain.value = val; }) },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const presenceNode = {
    type: "",
    frequency: { setValueAtTime: vi.fn() },
    Q: { setValueAtTime: vi.fn() },
    gain: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const limiterNode = {
    threshold: { setValueAtTime: vi.fn() },
    knee: { setValueAtTime: vi.fn() },
    ratio: { setValueAtTime: vi.fn() },
    attack: { setValueAtTime: vi.fn() },
    release: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const fakeBuffer = { duration: 1.2, numberOfChannels: 1, sampleRate: 16000 };
  const ctx = {
    state: "running",
    currentTime: 10,
    destination: { id: "dest" },
    resume: vi.fn(() => Promise.resolve()),
    decodeAudioData: vi.fn((_ab, ok) => {
      if (typeof ok === "function") ok(fakeBuffer);
      return Promise.resolve(fakeBuffer);
    }),
    createBufferSource: () => {
      sourceNode = {
        buffer: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(() => { sourceNode?.onended?.(); }),
      };
      return sourceNode;
    },
    createGain: () => gainNode,
    createBiquadFilter: () => presenceNode,
    createDynamicsCompressor: () => limiterNode,
  };
  return { ctx, getSource: () => sourceNode, gainNode, presenceNode, limiterNode, fakeBuffer };
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

  it("amplifies published speech via Web Audio gain, presence filter and routes through compressor/limiter", async () => {
    const fake = createFakeAudioContext();
    const fetchImpl = vi.fn(async (url) => url.endsWith("manifest.json")
      ? new Response(JSON.stringify({ entries: [entry] }), { headers: { "content-type": "application/json" } })
      : response());

    const player = createPublishedSpeechPlayer({
      fetchImpl,
      getAudioContext: () => fake.ctx,
    });

    const playPromise = player.play(entry.contentId, { volume: 0.6 });
    await vi.waitFor(() => expect(fake.getSource()).not.toBeNull());

    const source = fake.getSource();
    expect(source.buffer).toBe(fake.fakeBuffer);
    expect(source.connect).toHaveBeenCalledWith(fake.gainNode);
    expect(fake.gainNode.gain.setValueAtTime).toHaveBeenCalledWith(3.0, fake.ctx.currentTime);
    expect(fake.gainNode.connect).toHaveBeenCalledWith(fake.presenceNode);
    expect(fake.presenceNode.frequency.setValueAtTime).toHaveBeenCalledWith(3000, fake.ctx.currentTime);
    expect(fake.presenceNode.gain.setValueAtTime).toHaveBeenCalledWith(3.5, fake.ctx.currentTime);
    expect(fake.presenceNode.connect).toHaveBeenCalledWith(fake.limiterNode);
    expect(fake.limiterNode.threshold.setValueAtTime).toHaveBeenCalledWith(-12.0, fake.ctx.currentTime);
    expect(fake.limiterNode.ratio.setValueAtTime).toHaveBeenCalledWith(4.0, fake.ctx.currentTime);
    expect(fake.limiterNode.connect).toHaveBeenCalledWith(fake.ctx.destination);
    expect(source.start).toHaveBeenCalledWith(0);

    source.onended();
    await expect(playPromise).resolves.toEqual({ status: "played", source: "cdn" });
  });

  it("scales gain proportionally with volume option including excess boost up to 200%", async () => {
    const fake = createFakeAudioContext();
    const fetchImpl = vi.fn(async (url) => url.endsWith("manifest.json")
      ? new Response(JSON.stringify({ entries: [entry] }), { headers: { "content-type": "application/json" } })
      : response());

    const player = createPublishedSpeechPlayer({
      fetchImpl,
      getAudioContext: () => fake.ctx,
    });

    // 100% volume -> 5.0x
    const playPromise1 = player.play(entry.contentId, { volume: 1.0 });
    await vi.waitFor(() => expect(fake.getSource()).not.toBeNull());

    expect(fake.gainNode.gain.setValueAtTime).toHaveBeenCalledWith(1.0 * SPEECH_GAIN_MULTIPLIER, fake.ctx.currentTime);
    expect(fake.gainNode.gain.setValueAtTime).toHaveBeenCalledWith(5.0, fake.ctx.currentTime);
    fake.getSource().onended();
    await expect(playPromise1).resolves.toEqual({ status: "played", source: "cdn" });

    // 200% volume -> 10.0x
    const playPromise2 = player.play(entry.contentId, { volume: 2.0 });
    await vi.waitFor(() => expect(fake.getSource()).not.toBeNull());
    expect(fake.gainNode.gain.setValueAtTime).toHaveBeenCalledWith(10.0, fake.ctx.currentTime);
    fake.getSource().onended();
    await expect(playPromise2).resolves.toEqual({ status: "played", source: "cdn" });
  });

  it("caches decoded AudioBuffer to avoid re-fetching and re-decoding on subsequent plays", async () => {
    const fake = createFakeAudioContext();
    const fetchImpl = vi.fn(async (url) => url.endsWith("manifest.json")
      ? new Response(JSON.stringify({ entries: [entry] }), { headers: { "content-type": "application/json" } })
      : response());

    const player = createPublishedSpeechPlayer({
      fetchImpl,
      getAudioContext: () => fake.ctx,
    });

    const first = player.play(entry.contentId);
    await vi.waitFor(() => expect(fake.getSource()).not.toBeNull());
    fake.getSource().onended();
    await first;
    expect(fetchImpl).toHaveBeenCalledTimes(2); // 1 manifest + 1 audio
    expect(fake.ctx.decodeAudioData).toHaveBeenCalledTimes(1);

    // Second play: uses cached AudioBuffer
    const second = player.play(entry.contentId);
    await vi.waitFor(() => expect(fake.getSource()).not.toBeNull());
    fake.getSource().onended();
    await second;
    expect(fetchImpl).toHaveBeenCalledTimes(2); // no extra fetch
    expect(fake.ctx.decodeAudioData).toHaveBeenCalledTimes(1); // no extra decode
  });

  it("stops active playback cleanly via player.stop()", async () => {
    const fake = createFakeAudioContext();
    const fetchImpl = vi.fn(async (url) => url.endsWith("manifest.json")
      ? new Response(JSON.stringify({ entries: [entry] }), { headers: { "content-type": "application/json" } })
      : response());

    const player = createPublishedSpeechPlayer({
      fetchImpl,
      getAudioContext: () => fake.ctx,
    });

    const playPromise = player.play(entry.contentId);
    await vi.waitFor(() => expect(fake.getSource()).not.toBeNull());

    player.stop();
    await expect(playPromise).resolves.toEqual({ status: "played", source: "cdn" });
    expect(fake.getSource().stop).toHaveBeenCalled();
  });

  it("falls back to AudioCtor if AudioContext decode fails", async () => {
    const fake = createFakeAudioContext();
    fake.ctx.decodeAudioData = vi.fn(() => Promise.reject(new Error("decode-error")));
    let finish;
    class AudioMock {
      play() { return new Promise((resolve) => { finish = () => { this.onended?.(); resolve(); }; }); }
      pause() {}
    }
    const fetchImpl = vi.fn(async (url) => url.endsWith("manifest.json")
      ? new Response(JSON.stringify({ entries: [entry] }), { headers: { "content-type": "application/json" } })
      : response());

    const player = createPublishedSpeechPlayer({
      fetchImpl,
      AudioCtor: AudioMock,
      getAudioContext: () => fake.ctx,
      createObjectURL: () => "blob:fallback",
      revokeObjectURL() {},
    });

    const playPromise = player.play(entry.contentId);
    await vi.waitFor(() => expect(typeof finish).toBe("function"));
    finish();
    await expect(playPromise).resolves.toEqual({ status: "played", source: "cdn" });
  });

  it("cancels previous in-flight fetch when interrupted before playback starts", async () => {
    const fake = createFakeAudioContext();
    const entry2 = { contentId: "hz-002:glyph", url: "https://voice.shadow.wang/2.mp3" };
    let finishFirstFetch;
    const fetchImpl = vi.fn(async (url) => {
      if (url.endsWith("manifest.json")) {
        return new Response(JSON.stringify({ entries: [entry, entry2] }), { headers: { "content-type": "application/json" } });
      }
      if (url.includes("101030/a.mp3")) {
        return new Promise((resolve) => {
          finishFirstFetch = () => resolve(response());
        });
      }
      return response();
    });

    const player = createPublishedSpeechPlayer({ fetchImpl, getAudioContext: () => fake.ctx });
    const firstPromise = player.play(entry.contentId);
    await vi.waitFor(() => expect(typeof finishFirstFetch).toBe("function"));

    // Interrupted while first is still fetching
    const secondPromise = player.play(entry2.contentId);
    await vi.waitFor(() => expect(fake.getSource()).not.toBeNull());

    // Complete the first fetch now
    finishFirstFetch();
    await expect(firstPromise).resolves.toEqual({ status: "cancelled", source: "cdn" });

    fake.getSource().onended();
    await expect(secondPromise).resolves.toEqual({ status: "played", source: "cdn" });
  });
});
