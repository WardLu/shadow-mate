/* 本地 Piper 英语语音兜底（无 GMS 的国产 Android）
 *
 * 系统语音（speechSynthesis）在无 GMS 的国产 Android 上通常不可用，
 * 影伴提供浏览器本地 Piper 合成作为兜底：运行时托管在本应用内，模型首次从 CDN 下载，
 * 下载完成后缓存到浏览器，不上传录音，可离线使用。
 *
 * 致谢（开源项目详见 README 致谢一节）：
 *  - piper-tts-web（MIT）
 *  - rhasspy/piper 语音模型 en_US-ljspeech-medium（模型卡标注训练数据为 public domain）
 *  - ONNX Runtime Web（MIT）
 */

import { getPiperCapabilities } from "./piper-resource-capabilities.js";

export const VOICE = "https://voice.shadow.wang/piper/en_US-ljspeech-medium";
const VOICE_CACHE = "shadow-mate-voice";
const ENGINE_URL = "/piper-tts-web.js";
export const VOICE_FILES = [VOICE + ".onnx", VOICE + ".onnx.json"];
export const VOICE_HEAD_TIMEOUT_MS = 10_000;
export const VOICE_RESPONSE_TIMEOUT_MS = 20_000;
export const VOICE_READ_TIMEOUT_MS = 30_000;
export const ENGINE_LOAD_TIMEOUT_MS = 60_000;
export const SYNTHESIS_TIMEOUT_MS = 30_000;

export function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => {
      const error = new Error(message);
      error.name = "TimeoutError";
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

export function hasSystemEnglishVoice() {
  const synth = window.speechSynthesis;
  if (!(synth && typeof window.SpeechSynthesisUtterance === "function")) return false;
  const voices = typeof synth.getVoices === "function" ? synth.getVoices() : null;
  return Array.isArray(voices) && voices.some((item) => /^en\b/i.test(item.lang || ""));
}

async function openVoiceCache() {
  return caches.open(VOICE_CACHE);
}

function createRequestController(parentSignal, timeoutMs, timeoutMessage) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    timeoutError() {
      if (!timedOut) return null;
      const error = new Error(timeoutMessage);
      error.name = "TimeoutError";
      return error;
    },
    clear() {
      window.clearTimeout(timer);
      parentSignal?.removeEventListener?.("abort", abortFromParent);
    },
  };
}

async function fetchWithTimeout(url, options, timeoutMs, timeoutMessage) {
  const request = createRequestController(options?.signal, timeoutMs, timeoutMessage);
  try {
    return await fetch(url, { ...options, signal: request.signal });
  } catch (error) {
    throw request.timeoutError() || error;
  } finally {
    request.clear();
  }
}

async function getContentLength(url, signal, timeoutMs = VOICE_HEAD_TIMEOUT_MS) {
  try {
    const res = await fetchWithTimeout(url, { method: "HEAD", signal }, timeoutMs, "语音包请求超时");
    if (!res.ok) return 0;
    return Number(res.headers.get("content-length")) || 0;
  } catch (error) {
    if (error?.name === "AbortError" || error?.name === "TimeoutError") throw error;
    return 0;
  }
}

export async function isVoiceCached() {
  if (!("caches" in window)) return false;
  try {
    return !!(await (await openVoiceCache()).match(VOICE + ".onnx"));
  } catch (_) {
    return false;
  }
}

export async function downloadVoice(onProgress, signal, {
  headTimeoutMs = VOICE_HEAD_TIMEOUT_MS,
  responseTimeoutMs = VOICE_RESPONSE_TIMEOUT_MS,
  readTimeoutMs = VOICE_READ_TIMEOUT_MS,
} = {}) {
  const cache = await openVoiceCache();
  const pendingFiles = [];
  for (const url of VOICE_FILES) {
    if (!(await cache.match(url))) pendingFiles.push(url);
  }

  const lengths = await Promise.all(pendingFiles.map((url) => getContentLength(url, signal, headTimeoutMs)));
  const total = lengths.every((length) => length > 0) ? lengths.reduce((sum, length) => sum + length, 0) : 0;
  let receivedTotal = 0;

  for (let fileIndex = 0; fileIndex < pendingFiles.length; fileIndex += 1) {
    const url = pendingFiles[fileIndex];
    if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    const res = await fetchWithTimeout(url, { signal }, responseTimeoutMs, "语音包下载超时，请检查网络或代理后重试");
    if (!res.ok) throw new Error("语音包下载失败");
    const fileTotal = Number(res.headers.get("content-length")) || lengths[fileIndex] || 0;
    if (!res.body?.getReader) throw new Error("语音包响应无内容");
    const reader = res.body.getReader();
    const chunks = [];
    let receivedFile = 0;
    try {
      for (;;) {
        const { done, value } = await withTimeout(reader.read(), readTimeoutMs, "语音包下载超时，请检查网络或代理后重试");
        if (done) break;
        if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
        if (value) {
          chunks.push(value);
          receivedFile += value.length;
          if (onProgress) {
            const progressTotal = total || fileTotal;
            const progressReceived = total ? receivedTotal + receivedFile : receivedFile;
            onProgress(progressReceived, progressTotal, {
              fileIndex,
              fileCount: pendingFiles.length,
              fileReceived: receivedFile,
              fileTotal,
              totalKnown: total > 0,
            });
          }
        }
      }
    } catch (error) {
      try {
        await reader.cancel?.();
      } catch (_) {
        // The request has already failed; preserve the original timeout/network error.
      }
      throw error;
    }
    await cache.put(
      url,
      new Response(new Blob(chunks), {
        headers: {
          "Content-Type": res.headers.get("content-type") || "application/octet-stream",
          ...(fileTotal > 0 ? { "Content-Length": String(fileTotal) } : {}),
        },
      })
    );
    receivedTotal += receivedFile;
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

export async function prepareLocalVoice() {
  await loadEngine();
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

export function askDownloadVoice(onProgress, { onDownloadStart } = {}) {
  return new Promise((resolve) => {
    const dlg = buildDialog();
    const title = dlg.querySelector(".voice-dialog-title");
    const desc = dlg.querySelector(".voice-dialog-desc");
    const progress = dlg.querySelector(".voice-dialog-progress");
    const bar = dlg.querySelector(".voice-dialog-bar i");
    const pct = dlg.querySelector(".voice-dialog-pct");
    const actions = dlg.querySelector(".voice-dialog-actions");
    const okButton = actions.querySelector('[data-action="ok"]');
    const cancelButton = actions.querySelector('[data-action="cancel"]');
    const controller = new AbortController();
    let settled = false;

    const finish = (status) => {
      if (settled) return;
      settled = true;
      if (status === "cancel") controller.abort();
      dlg.close();
      dlg.remove();
      resolve(status);
    };

    const run = async () => {
      if (!getPiperCapabilities().canDownload) {
        finish("unsupported");
        return;
      }
      if (await isVoiceCached()) {
        finish("ok");
        return;
      }
      title.textContent = "正在下载离线英语语音";
      desc.hidden = true;
      progress.hidden = false;
      bar.classList.add("indeterminate");
      bar.style.width = "35%";
      pct.textContent = "下载中…";
      if (onProgress) onProgress(0, 0);
      onDownloadStart?.();
      try {
        await downloadVoice((received, total) => {
          if (total > 0) {
            const percent = Math.min(100, Math.round((received / total) * 100));
            bar.classList.remove("indeterminate");
            bar.style.width = percent + "%";
            pct.textContent = percent + "%";
          } else {
            bar.classList.add("indeterminate");
            bar.style.width = "35%";
            pct.textContent = "下载中…";
          }
          if (onProgress) onProgress(received, total);
        }, controller.signal);
        finish("ok");
      } catch (error) {
        if (controller.signal.aborted || error?.name === "AbortError") return;
        if (onProgress) onProgress(0, 0);
        finish(error?.name === "TimeoutError" ? "timeout" : error?.name === "TypeError" ? "network" : "error");
      }
    };

    okButton.onclick = () => {
      okButton.disabled = true;
      run();
    };
    cancelButton.onclick = () => finish("cancel");
    dlg.oncancel = () => finish("cancel");
    (async () => {
      if (!getPiperCapabilities().canDownload) {
        finish("unsupported");
        return;
      }
      if (await isVoiceCached()) {
        finish("ok");
        return;
      }
      dlg.showModal();
    })();
  });
}
