/* Browser-local Piper fallback for speech synthesis.
 *
 * Download and cache integrity belong to the Piper resource package modules.
 * This module only turns an approved, completed package into local audio.
 */

import { getPiperDownloadError, downloadPiperResource } from "./piper-resource-download.js";
import { getPiperResourcePackage, listPiperResourcePackages } from "./piper-resource-registry.js";
import { getPiperResourceStatus } from "./piper-resource-store.js";

export const ENGLISH_PIPER_PACKAGE_ID = "en_US-ljspeech-medium";
const ENGINE_URL = "/piper-tts-web.js";
export const ENGINE_LOAD_TIMEOUT_MS = 60_000;
export const SYNTHESIS_TIMEOUT_MS = 30_000;

const englishPackage = getPiperResourcePackage(ENGLISH_PIPER_PACKAGE_ID);
// Compatibility exports for existing callers. New code must use package IDs.
export const VOICE = "https://voice.shadow.wang/piper/en_US-ljspeech-medium";
export const VOICE_FILES = englishPackage.files.map((file) => `${englishPackage.baseUrl}${file.suffix}`);
if (VOICE !== englishPackage.baseUrl) throw new Error("The legacy Piper voice export must match the English package registry");

export class PiperLocalVoiceError extends Error {
  constructor(code, message, cause) {
    super(message, { cause });
    this.name = "PiperLocalVoiceError";
    this.code = code;
  }
}

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

function normalizedUrl(url) {
  return new URL(url, globalThis.location?.href || "https://shadow-mate.invalid/").href;
}

function fileUrl(resourcePackage, suffix) {
  return normalizedUrl(`${resourcePackage.baseUrl}${suffix}`);
}

function packageCacheName(resourcePackage) {
  return `shadow-mate-piper-${resourcePackage.id}-${resourcePackage.version}`;
}

function getApprovedPackage(packageId) {
  const resourcePackage = getPiperResourcePackage(packageId);
  if (!resourcePackage) throw new PiperLocalVoiceError("invalid", "Unknown Piper voice package");
  if (!resourcePackage.releaseApproved || !resourcePackage.baseUrl) {
    throw new PiperLocalVoiceError("gated", "This Piper voice package is not approved for download");
  }
  return resourcePackage;
}

function packageForVoice(voice) {
  for (const resourcePackage of listPiperResourcePackages()) {
    if (resourcePackage?.releaseApproved && normalizedUrl(resourcePackage.baseUrl) === normalizedUrl(voice)) return resourcePackage;
  }
  throw new PiperLocalVoiceError("invalid", "Piper requested an unregistered voice URL");
}

function asLocalVoiceError(error, fallbackCode = "error", fallbackMessage = "本地语音合成失败") {
  if (error instanceof PiperLocalVoiceError) return error;
  const code = error?.name === "TimeoutError" ? "timeout" : fallbackCode;
  return new PiperLocalVoiceError(code, fallbackMessage, error);
}

function normalizeDownloadArguments(packageId, onProgress, options) {
  if (typeof packageId === "function" || packageId == null) {
    return {
      packageId: ENGLISH_PIPER_PACKAGE_ID,
      onProgress: typeof packageId === "function" ? packageId : undefined,
      options: onProgress || {},
    };
  }
  return { packageId, onProgress, options: options || {} };
}

let enginePromise = null;
let activeEngineSession = null;

async function disposeEngineSession(session) {
  if (!session || session.disposed) return;
  session.disposed = true;
  try {
    await session.engine?.destroy?.();
  } catch (_) {
    // A failed engine must never prevent object URL cleanup or a fresh retry.
  }
  for (const url of session.modelObjectUrls) URL.revokeObjectURL(url);
  session.modelObjectUrls.clear();
}

async function readVoiceFile(session, resourcePackage, suffix) {
  if (!("caches" in globalThis) || !globalThis.caches?.open) {
    throw new PiperLocalVoiceError("storage", "Piper package cache is unavailable");
  }
  const cache = await globalThis.caches.open(packageCacheName(resourcePackage));
  const response = await cache.match(fileUrl(resourcePackage, suffix));
  if (!response?.ok) throw new PiperLocalVoiceError("storage", "Piper package file is unavailable in the local cache");
  return response;
}

async function createEngineSession() {
  const session = { engine: null, modelObjectUrls: new Set(), disposed: false };
  const mod = await import(/* @vite-ignore */ ENGINE_URL);
  const voiceProvider = {
    async fetch(voice) {
      const resourcePackage = packageForVoice(voice);
      const [metadata, model] = await Promise.all([
        readVoiceFile(session, resourcePackage, ".onnx.json"),
        readVoiceFile(session, resourcePackage, ".onnx"),
      ]);
      const modelUrl = URL.createObjectURL(await model.blob());
      session.modelObjectUrls.add(modelUrl);
      return [await metadata.json(), modelUrl];
    },
  };
  session.engine = new mod.PiperWebEngine({
    onnxRuntime: new mod.OnnxWebRuntime({ basePath: "/onnx/", numThreads: 1 }),
    phonemizeRuntime: new mod.PhonemizeWebRuntime({ basePath: "/piper/" }),
    voiceProvider,
  });
  return session;
}

async function loadEngine() {
  if (!enginePromise) {
    const pending = createEngineSession();
    enginePromise = pending;
    pending.then(
      (session) => {
        if (enginePromise === pending) activeEngineSession = session;
        else void disposeEngineSession(session);
      },
      () => {
        if (enginePromise === pending) enginePromise = null;
      }
    );
  }
  const session = await enginePromise;
  if (session.disposed) throw new PiperLocalVoiceError("engine", "Piper voice engine was reset before it became ready");
  return session.engine;
}

export async function resetLocalVoiceEngine() {
  const pending = enginePromise;
  const active = activeEngineSession;
  enginePromise = null;
  activeEngineSession = null;
  await disposeEngineSession(active);
  if (pending) {
    const resolved = await pending.catch(() => null);
    if (resolved && resolved !== active) await disposeEngineSession(resolved);
  }
}

export async function speakLocally(text, packageId = ENGLISH_PIPER_PACKAGE_ID) {
  try {
    const resourcePackage = getApprovedPackage(packageId);
    const engine = await loadEngine();
    const result = await engine.generate(text, resourcePackage.baseUrl, 0);
    return { url: URL.createObjectURL(result.file), duration: result.duration };
  } catch (error) {
    await resetLocalVoiceEngine();
    throw asLocalVoiceError(error);
  }
}

export async function prepareLocalVoice(packageId = ENGLISH_PIPER_PACKAGE_ID) {
  try {
    getApprovedPackage(packageId);
    await loadEngine();
  } catch (error) {
    await resetLocalVoiceEngine();
    throw asLocalVoiceError(error, "engine", "本地语音引擎加载失败");
  }
}

export async function isVoiceCached() {
  return (await getPiperResourceStatus(ENGLISH_PIPER_PACKAGE_ID)) === "completed";
}

export async function downloadVoice(onProgress, signal) {
  return downloadPiperResource(ENGLISH_PIPER_PACKAGE_ID, onProgress, signal);
}

function buildDialog(resourcePackage) {
  let dlg = document.getElementById("shadow-voice-dialog");
  if (dlg) return dlg;
  const language = resourcePackage.locale === "zh-CN" ? "中文" : "英语";
  dlg = document.createElement("dialog");
  dlg.id = "shadow-voice-dialog";
  dlg.className = "voice-dialog";
  dlg.innerHTML =
    `<div class="voice-dialog-title">离线${language}语音</div>` +
    `<div class="voice-dialog-desc">当前设备没有可用的${language}发音。影伴可下载离线${language}语音包（一次性下载，之后可离线使用，不上传录音）。是否现在下载？</div>` +
    '<div class="voice-dialog-progress" hidden><div class="voice-dialog-bar"><i></i></div><span class="voice-dialog-pct">0%</span></div>' +
    '<div class="voice-dialog-actions">' +
    '<button type="button" class="voice-dialog-cancel" data-action="cancel">取消</button>' +
    '<button type="button" class="voice-dialog-ok" data-action="ok">下载</button>' +
    "</div>";
  document.body.appendChild(dlg);
  return dlg;
}

export async function askDownloadVoice(packageId, onProgress, options) {
  const normalized = normalizeDownloadArguments(packageId, onProgress, options);
  const resourcePackage = getPiperResourcePackage(normalized.packageId);
  if (!resourcePackage) return "error";
  let resourceStatus;
  try {
    resourceStatus = await getPiperResourceStatus(resourcePackage.id);
  } catch (_) {
    return "storage";
  }
  if (resourceStatus === "gated") return "gated";
  if (resourceStatus === "unsupported") return "unsupported";
  if (resourceStatus === "completed") return "ok";
  if (resourceStatus === "invalid") return "storage";

  return new Promise((resolve) => {
    const dlg = buildDialog(resourcePackage);
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
      dlg.close?.();
      dlg.remove();
      resolve(status);
    };
    const run = async () => {
      title.textContent = `正在下载离线${resourcePackage.locale === "zh-CN" ? "中文" : "英语"}语音`;
      desc.hidden = true;
      progress.hidden = false;
      bar.classList.add("indeterminate");
      bar.style.width = "35%";
      pct.textContent = "下载中…";
      normalized.onProgress?.(0, 0);
      normalized.options.onDownloadStart?.(resourcePackage.id);
      try {
        await downloadPiperResource(resourcePackage.id, (received, total) => {
          if (total > 0) {
            const percent = Math.min(100, Math.round((received / total) * 100));
            bar.classList.remove("indeterminate");
            bar.style.width = `${percent}%`;
            pct.textContent = `${percent}%`;
          }
          normalized.onProgress?.(received, total);
        }, controller.signal);
        finish("ok");
      } catch (error) {
        if (controller.signal.aborted || error?.name === "AbortError") return;
        finish(getPiperDownloadError(error).code);
      }
    };
    okButton.onclick = () => {
      okButton.disabled = true;
      run();
    };
    cancelButton.onclick = () => finish("cancel");
    dlg.oncancel = () => finish("cancel");
    dlg.showModal?.();
  });
}
