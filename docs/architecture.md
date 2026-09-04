# Shadow Mate architecture

Shadow Mate is a Vite and vanilla-JavaScript local-first PWA. `src/app.js` owns the UI and local learning state, `src/cloud.js` owns authenticated household synchronization, and Supabase changes in this repository are proposals for the shared Shadow Portal control plane.

## Fixed curriculum speech

`src/tencent-tts-catalog.js` derives stable speech IDs and content-addressed object keys from the tracked writing curriculum. The release-only `scripts/tencent-tts-prewarm.mjs` calls Tencent Cloud TTS with Zhike (`101030`) for `zh-CN` and WeJack (`101050`) for `en-US`, uploads only missing immutable MP3 objects to COS, verifies every object through `voice.shadow.wang`, and atomically writes the public manifest only after all readbacks pass.

At runtime `src/tencent-tts-player.js` reads that manifest and plays CDN audio. Standard HTTP caching provides repeat reuse; there is no public synthesis endpoint and no Tencent credential in the browser or Vercel. A failed CDN clip may fall back only to a verified system voice for the requested locale. The retired Matcha/Piper assets remain in the app shell solely for rollback history and explicit deletion of old browser caches.
