import { afterEach, expect, it, vi } from 'vitest';
import { createSpeechSession } from '../../src/speech-session.js';

const request = { text: '花', locale: 'zh-CN', contentIds: ['flower'], volume: 0.6 };
function fixture(voices = []) {
  const utterances = [];
  const synthesis = { cancel: vi.fn(), getVoices: () => voices, speak: u => utterances.push(u) };
  const publishedPlayer = { play: vi.fn().mockRejectedValue({ code: 'published-audio-http' }), stop: vi.fn() };
  const speech = createSpeechSession({ publishedPlayer, synthesis, Utterance: function(text) { this.text = text; } });
  return { speech, synthesis, publishedPlayer, utterances };
}
afterEach(() => vi.useRealTimers());

it('settles cancellation even if the CDN never finishes', async () => {
  const { speech, publishedPlayer } = fixture();
  publishedPlayer.play.mockImplementation(() => new Promise(() => {}));
  const playing = speech.play(request);
  speech.stop();
  await expect(playing).resolves.toEqual({ status: 'cancelled' });
});
it('does not let a late CDN failure start fallback or finish the replacement', async () => {
  const { speech, publishedPlayer, utterances } = fixture();
  let rejectFirst;
  let finishSecond;
  publishedPlayer.play.mockImplementationOnce(() => new Promise((_, reject) => { rejectFirst = reject; }))
    .mockImplementationOnce(() => new Promise(resolve => { finishSecond = resolve; }));
  const changed = vi.fn();
  speech.subscribe(changed);
  const first = speech.play(request);
  const second = speech.play({ ...request, contentIds: ['rain'] });
  await expect(first).resolves.toMatchObject({ status: 'cancelled' });
  rejectFirst({ code: 'published-audio-timeout' });
  await Promise.resolve();
  expect(utterances).toHaveLength(0);
  expect(changed).toHaveBeenLastCalledWith({ state: 'playing' });
  finishSecond({ status: 'played' });
  await expect(second).resolves.toMatchObject({ status: 'ended' });
});
it('reads fragments in order and falls back once when a later fragment fails', async () => {
  const { speech, publishedPlayer, utterances } = fixture([{ lang: 'zh-CN' }, { lang: 'en-US' }]);
  publishedPlayer.play.mockResolvedValueOnce({ status: 'played' });
  const playing = speech.play({ ...request, contentIds: ['one', 'two', 'three'] });
  await vi.waitFor(() => expect(utterances).toHaveLength(1));
  expect(publishedPlayer.play.mock.calls.map(([id]) => id)).toEqual(['one', 'two']);
  expect(utterances[0]).toMatchObject({ lang: 'zh-CN', volume: 0.6, voice: { lang: 'zh-CN' } });
  utterances[0].onend();
  await expect(playing).resolves.toEqual({ status: 'ended' });
});
it('allows browser default voices but rejects a listed wrong-language voice', async () => {
  const { speech, utterances } = fixture([]);
  const playing = speech.play(request);
  await vi.waitFor(() => expect(utterances).toHaveLength(1));
  expect(utterances[0].voice).toBeUndefined();
  utterances[0].onend();
  await playing;
  const wrong = fixture([{ lang: 'en-US' }]);
  await expect(wrong.speech.play(request)).resolves.toMatchObject({ status: 'failed', code: 'system-unavailable' });
  expect(wrong.utterances).toHaveLength(0);
});
it('ignores old system callbacks after a newer request starts', async () => {
  const { speech, utterances } = fixture();
  const first = speech.play(request);
  await vi.waitFor(() => expect(utterances).toHaveLength(1));
  const old = utterances[0];
  const second = speech.play(request);
  await vi.waitFor(() => expect(utterances).toHaveLength(2));
  const settled = vi.fn();
  second.then(settled);
  old.onend(); old.onerror({ error: 'synthesis-failed' });
  await Promise.resolve();
  expect(settled).not.toHaveBeenCalled();
  utterances[1].onend();
  await expect(first).resolves.toEqual({ status: 'cancelled' });
  await expect(second).resolves.toEqual({ status: 'ended' });
});
it('times out only before system playback starts, including synchronous onstart', async () => {
  vi.useFakeTimers();
  const { speech, synthesis } = fixture();
  const timeout = speech.play(request);
  await vi.advanceTimersByTimeAsync(4000);
  await expect(timeout).resolves.toMatchObject({ status: 'failed', code: 'system-start-timeout' });
  synthesis.speak = u => u.onstart();
  const playing = speech.play(request);
  const settled = vi.fn(); playing.then(settled);
  await vi.advanceTimersByTimeAsync(5000);
  expect(settled).not.toHaveBeenCalled();
  speech.stop();
  await expect(playing).resolves.toMatchObject({ status: 'cancelled' });
});
it('reports system errors and supports retry after failure', async () => {
  const { speech, synthesis } = fixture();
  synthesis.speak = u => u.onerror({ error: 'synthesis-failed' });
  await expect(speech.play(request)).resolves.toMatchObject({ status: 'failed', code: 'system-playback' });
  synthesis.speak = u => u.onend();
  await expect(speech.play(request)).resolves.toEqual({ status: 'ended' });
});
