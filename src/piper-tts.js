/* 本地 Piper 英语语音兜底（无 GMS 的国产 Android）
 *
 * 系统语音（speechSynthesis）在无 GMS 的国产 Android 上通常不可用，
 * 影伴提供浏览器本地 Piper 合成作为兜底：模型与运行时全部托管在本应用内，
 * 不上传录音，可离线使用。
 *
 * 致谢（开源项目详见 README 致谢一节）：
 *  - piper-tts-web（MIT）
 *  - rhasspy/piper 语音模型 en_US-lessac-medium（MIT）
 *  - ONNX Runtime Web（MIT）
 */

const VOICE = "/piper/en_US-lessac-medium";
const VOICE_CACHE = "shadow-mate-voice";
const ENGINE_URL = "/piper-tts-web.js";

export function hasSystemEnglishVoice() {
  const synth = window.speechSynthesis;
  if (!(synth && typeof window.SpeechSynthesisUtterance === "function")) return false;
  const voices = typeof synth.getVoices === "function" ? synth.getVoices() : null;
  return Array.isArray(voices) && voices.some((item) => /^en\b/i.test(item.lang || ""));
}

async function openVoiceCache() {
  return caches.open(VOICE_CACHE);
}

export async function isVoiceCached() {
  if (!("caches" in window)) return false;
  try {
    return !!(await (await openVoiceCache()).match(VOICE + ".onnx"));
  } catch (_) {
    return false;
  }
}

export async function downloadVoice(onProgress) {
  const cache = await openVoiceCache();
  for (const url of [VOICE + ".onnx", VOICE + ".onnx.json"]) {
    if (await cache.match(url)) continue;
    const res = await fetch(url);
    if (!res.ok) throw new Error("语音包下载失败");
    const total = Number(res.headers.get("content-length")) || 0;
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
      }
      if (onProgress && total) onProgress(received, total);
    }
    await cache.put(
      url,
      new Response(new Blob(chunks), {
        headers: { "Content-Type": res.headers.get("content-type") || "application/octet-stream" },
      })
    );
  }
}

let enginePromise = null;
async function loadEngine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const mod = await import(/* @vite-ignore */ ENGINE_URL);
      const voiceProvider = {
        async fetch(voice) {
          const read = async (url) => {
            let res = null;
            if ("caches" in window) {
              try {
                res = await (await openVoiceCache()).match(url);
              } catch (_) {
                res = null;
              }
            }
            if (!res) res = await fetch(url);
            if (!res.ok) throw new Error("语音模型读取失败");
            return url.endsWith(".json") ? res.json() : URL.createObjectURL(await res.blob());
          };
          return Promise.all([read(voice + ".onnx.json"), read(voice + ".onnx")]);
        },
      };
      return new mod.PiperWebEngine({
        onnxRuntime: new mod.OnnxWebRuntime({ basePath: "/onnx/", numThreads: 1 }),
        phonemizeRuntime: new mod.PhonemizeWebRuntime({ basePath: "/piper/" }),
        voiceProvider,
      });
    })().catch((err) => {
      enginePromise = null;
      throw err;
    });
  }
  return enginePromise;
}

export async function speakLocally(text) {
  const engine = await loadEngine();
  const result = await engine.generate(text, VOICE, 0);
  return { url: URL.createObjectURL(result.file), duration: result.duration };
}

function buildDialog() {
  let dlg = document.getElementById("shadow-voice-dialog");
  if (dlg) return dlg;
  dlg = document.createElement("dialog");
  dlg.id = "shadow-voice-dialog";
  dlg.className = "voice-dialog";
  dlg.innerHTML =
    '<div class="voice-dialog-title">离线英语语音</div>' +
    '<div class="voice-dialog-desc">当前设备没有可用的英语发音。影伴内置了约 90MB 的离线英语语音包（一次性下载，之后可离线使用，不上传录音）。是否现在下载？</div>' +
    '<div class="voice-dialog-progress" hidden><div class="voice-dialog-bar"><i></i></div><span class="voice-dialog-pct">0%</span></div>' +
    '<div class="voice-dialog-actions">' +
    '<button type="button" class="voice-dialog-cancel" data-action="cancel">取消</button>' +
    '<button type="button" class="voice-dialog-ok" data-action="ok">下载</button>' +
    "</div>";
  document.body.appendChild(dlg);
  return dlg;
}

export function askDownloadVoice(onProgress) {
  return new Promise((resolve) => {
    const dlg = buildDialog();
    const title = dlg.querySelector(".voice-dialog-title");
    const desc = dlg.querySelector(".voice-dialog-desc");
    const progress = dlg.querySelector(".voice-dialog-progress");
    const bar = dlg.querySelector(".voice-dialog-bar i");
    const pct = dlg.querySelector(".voice-dialog-pct");
    const actions = dlg.querySelector(".voice-dialog-actions");
    let settled = false;

    const finish = (status) => {
      if (settled) return;
      settled = true;
      dlg.close();
      dlg.remove();
      resolve(status);
    };

    const run = async () => {
      if (await isVoiceCached()) {
        finish("ok");
        return;
      }
      title.textContent = "正在下载离线英语语音";
      desc.hidden = true;
      actions.hidden = true;
      progress.hidden = false;
      try {
        await downloadVoice((received, total) => {
          const percent = Math.min(100, Math.round((received / total) * 100));
          bar.style.width = percent + "%";
          pct.textContent = percent + "%";
          if (onProgress) onProgress(received, total);
        });
        finish("ok");
      } catch (_) {
        if (onProgress) onProgress(0, 0);
        finish("error");
      }
    };

    actions.querySelector('[data-action="ok"]').onclick = () => {
      actions.querySelector('[data-action="ok"]').disabled = true;
      actions.querySelector('[data-action="cancel"]').disabled = true;
      run();
    };
    actions.querySelector('[data-action="cancel"]').onclick = () => finish("cancel");
    dlg.oncancel = () => finish("cancel");
    dlg.showModal();
  });
}
