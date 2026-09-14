import { findMatchingVoice } from './speech-text-utils.js';

/** Playback protocol without DOM. Every request settles, including cancellation. */
export function createSpeechSession({ publishedPlayer, synthesis, Utterance,
  timers = { setTimeout: (...args) => globalThis.setTimeout(...args), clearTimeout: id => globalThis.clearTimeout(id) } }) {
  let active = null;
  const listeners = new Set();
  function notify(state) { for (const listener of listeners) listener({ state }); }
  function finish(request, result) {
    if (request.done) return;
    request.done = true;
    timers.clearTimeout(request.timer);
    if (active === request) {
      active = null;
      notify(result.status === 'failed' ? 'failed' : 'idle');
    }
    request.resolve(result);
  }
  function stop() {
    const request = active;
    if (request) finish(request, { status: 'cancelled' });
    try { publishedPlayer.stop(); } catch (_) {}
    try { synthesis?.cancel(); } catch (_) {}
  }
  async function perform(request, { text, locale, contentIds, volume }) {
    const current = () => active === request && !request.done;
    let publishedError = { code: 'published-audio-not-found' };
    if (contentIds.length) {
      try {
        for (const id of contentIds) {
          const result = await publishedPlayer.play(id, { volume });
          if (!current()) return;
          if (result?.status === 'cancelled') {
            finish(request, { status: 'cancelled' });
            return;
          }
        }
        finish(request, { status: 'ended' });
        return;
      } catch (error) {
        if (!current()) return;
        publishedError = error;
      }
    }
    const failed = code => {
      if (current()) finish(request, { status: 'failed', code, publishedCode: publishedError?.code });
    };
    try {
      const voices = typeof synthesis?.getVoices === 'function' ? synthesis.getVoices() : null;
      const voice = findMatchingVoice(voices, locale);
      const defaultVoice = !Array.isArray(voices) || voices.length === 0;
      if (!synthesis || typeof Utterance !== 'function' || (!voice && !defaultVoice)) {
        failed('system-unavailable');
        return;
      }
      const utterance = new Utterance(text);
      utterance.lang = locale;
      utterance.rate = 0.9;
      utterance.volume = Math.max(0, Math.min(1, volume));
      if (voice) utterance.voice = voice;
      utterance.onstart = () => { if (current()) timers.clearTimeout(request.timer); };
      utterance.onend = () => { if (current()) finish(request, { status: 'ended' }); };
      utterance.onerror = event => {
        if (!current()) return;
        if (event?.error === 'canceled' || event?.error === 'interrupted') finish(request, { status: 'cancelled' });
        else failed('system-playback');
      };
      if (synthesis.speaking) synthesis.cancel();
      request.timer = timers.setTimeout(() => {
        if (!current()) return;
        // Settle before cancel(), which may synchronously emit an interruption.
        failed('system-start-timeout');
        try { synthesis.cancel(); } catch (_) {}
      }, 4000);
      synthesis.speak(utterance);
    } catch (_) { failed('system-playback'); }
  }
  return {
    play({ text, locale = 'en-US', contentIds = [], volume = 0.6 }) {
      stop();
      const request = { done: false, timer: null };
      const promise = new Promise(resolve => { request.resolve = resolve; });
      active = request;
      notify('playing');
      void perform(request, { text, locale, contentIds, volume }).catch(() => {
        if (active === request) finish(request, { status: 'failed', code: 'system-playback' });
      });
      return promise;
    },
    stop,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
