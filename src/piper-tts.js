/* Browser-local Piper fallback for speech synthesis.
 *
 * Download and cache integrity belong to the Piper resource package modules.
 * This module only turns an approved, completed package into local audio.
 */

import { getPiperDownloadError, downloadPiperResource } from "./piper-resource-download.js";
import { acquirePiperDownloadLock } from "./piper-resource-lock.js";
import { createMatchaTtsRuntime, encodeMonoWav } from "./matcha-tts.js";
import {
  formatPiperResourceBytes,
  getPiperResourcePackage,
  isActivePiperCdnVoicePackage,
  resolvePiperResourceFileUrl,
  UNIFIED_OFFLINE_VOICE_PACKAGE_ID,
} from "./piper-resource-registry.js";
import { deletePiperResource, getPiperResourceStatus } from "./piper-resource-store.js";

export { UNIFIED_OFFLINE_VOICE_PACKAGE_ID };
// Compatibility alias for existing callers while the generic resource modules
// retain their historical Piper filenames.
export const ENGLISH_PIPER_PACKAGE_ID = UNIFIED_OFFLINE_VOICE_PACKAGE_ID;
export const ENGINE_LOAD_TIMEOUT_MS = 120_000;
export const SYNTHESIS_TIMEOUT_MS = 30_000;

const englishPackage = getPiperResourcePackage(ENGLISH_PIPER_PACKAGE_ID);
// Compatibility exports for existing callers. New code must use package IDs.
export const VOICE = englishPackage.baseUrl;
export const VOICE_FILES = englishPackage.files.map((file) => resolvePiperResourceFileUrl(englishPackage, file));

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

function fileUrl(resourcePackage, key) {
  const file = resourcePackage.files.find((entry) => entry.key === key);
  if (!file) throw new PiperLocalVoiceError("invalid", `Offline voice package is missing ${key}`);
  return normalizedUrl(resolvePiperResourceFileUrl(resourcePackage, file));
}

function packageCacheName(resourcePackage) {
  return `shadow-mate-piper-${resourcePackage.id}-${resourcePackage.version}`;
}

function getApprovedPackage(packageId) {
  const resourcePackage = getPiperResourcePackage(packageId);
  if (!resourcePackage) throw new PiperLocalVoiceError("invalid", "Unknown Piper voice package");
  if (!isActivePiperCdnVoicePackage(resourcePackage) || !resourcePackage.baseUrl) {
    throw new PiperLocalVoiceError("gated", "This Piper voice package is not approved for download");
  }
  return resourcePackage;
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
let engineGeneration = 0;

async function disposeEngineSession(session) {
  if (!session || session.disposed) return;
  session.disposed = true;
  try {
    session.engine?.reset?.();
  } catch (_) {
    // A failed worker must never prevent a fresh retry.
  }
}

async function createEngineSession() {
  const session = { engine: null, disposed: false };
  const resourcePackage = getApprovedPackage(UNIFIED_OFFLINE_VOICE_PACKAGE_ID);
  session.engine = createMatchaTtsRuntime();
  await session.engine.prepare({
    cacheName: packageCacheName(resourcePackage),
    dataUrl: fileUrl(resourcePackage, "data"),
    wasmUrl: fileUrl(resourcePackage, "wasm"),
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
  engineGeneration += 1;
  enginePromise = null;
  activeEngineSession = null;
  await disposeEngineSession(active);
  if (pending) {
    void pending.then(
      (resolved) => {
        if (resolved !== active) void disposeEngineSession(resolved);
      },
      () => {}
    );
  }
}

export async function speakLocally(text, packageId = ENGLISH_PIPER_PACKAGE_ID) {
  const generation = engineGeneration;
  try {
    getApprovedPackage(packageId);
    const engine = await loadEngine();
    const result = await engine.generate(text);
    const file = encodeMonoWav(result.samples, result.sampleRate);
    return {
      url: URL.createObjectURL(file),
      duration: (result.samples.length / result.sampleRate) * 1000,
    };
  } catch (error) {
    if (engineGeneration === generation) await resetLocalVoiceEngine();
    throw asLocalVoiceError(error);
  }
}

export async function prepareLocalVoice(packageId = ENGLISH_PIPER_PACKAGE_ID) {
  const generation = engineGeneration;
  try {
    getApprovedPackage(packageId);
    await loadEngine();
  } catch (error) {
    if (engineGeneration === generation) await resetLocalVoiceEngine();
    throw asLocalVoiceError(error, "engine", "本地语音引擎加载失败");
  }
}

export async function isPiperVoiceCached(packageId = ENGLISH_PIPER_PACKAGE_ID) {
  return (await getPiperResourceStatus(packageId)) === "completed";
}

export async function isVoiceCached() {
  return isPiperVoiceCached(UNIFIED_OFFLINE_VOICE_PACKAGE_ID);
}

export async function downloadVoice(onProgress, signal) {
  return downloadPiperResource(UNIFIED_OFFLINE_VOICE_PACKAGE_ID, onProgress, signal);
}

function combineAbortSignals(signals) {
  const controller = new AbortController();
  const forward = (signal) => {
    if (controller.signal.aborted) return;
    controller.abort(signal.reason);
  };
  const listeners = [];
  for (const signal of signals.filter(Boolean)) {
    if (signal.aborted) {
      forward(signal);
      break;
    }
    const listener = () => forward(signal);
    signal.addEventListener("abort", listener, { once: true });
    listeners.push([signal, listener]);
  }
  return {
    signal: controller.signal,
    dispose() {
      for (const [signal, listener] of listeners) signal.removeEventListener("abort", listener);
    },
  };
}

function dialogDescription(resourcePackage, resourceStatus) {
  const scope = globalThis.location?.origin || "当前域名";
  const statusHint = resourceStatus === "partial"
    ? "检测到部分已校验文件，可继续下载缺失文件，或先删除现有缓存。"
    : resourceStatus === "invalid"
      ? "现有缓存未通过校验，可重试修复，或先删除现有缓存。"
      : "";
  return `当前设备没有可用的系统发音。可下载 ${resourcePackage.label}（版本 ${resourcePackage.version}，清单大小 ${formatPiperResourceBytes(resourcePackage.totalBytes)}）。下载仅保存在当前浏览器配置文件和 ${scope}，完成后可离线使用；不会上传录音。${statusHint}`;
}

function buildDialog(resourcePackage, resourceStatus) {
  document.getElementById("shadow-voice-dialog")?.remove();
  const language = resourcePackage.locales?.length > 1 ? "中英文" : resourcePackage.locale === "zh-CN" ? "中文" : "英语";
  const dlg = document.createElement("dialog");
  dlg.id = "shadow-voice-dialog";
  dlg.className = "voice-dialog";
  dlg.innerHTML =
    '<div class="voice-dialog-title"></div>' +
    '<div class="voice-dialog-desc"></div>' +
    '<div class="voice-dialog-progress" hidden><div class="voice-dialog-bar"><i></i></div><span class="voice-dialog-pct">0%</span></div>' +
    '<div class="voice-dialog-actions">' +
    '<button type="button" class="voice-dialog-cancel" data-action="cancel">取消</button>' +
    '<button type="button" class="voice-dialog-delete" data-action="delete">删除现有缓存</button>' +
    '<button type="button" class="voice-dialog-ok" data-action="ok">下载</button>' +
    "</div>";
  dlg.querySelector(".voice-dialog-title").textContent = `离线${language}语音 · ${resourcePackage.label}`;
  dlg.querySelector(".voice-dialog-desc").textContent = dialogDescription(resourcePackage, resourceStatus);
  dlg.querySelector('[data-action="delete"]').hidden = !["partial", "invalid"].includes(resourceStatus);
  dlg.querySelector('[data-action="ok"]').textContent = resourceStatus === "partial" ? "继续下载" : "下载";
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

  return new Promise((resolve) => {
    const dlg = buildDialog(resourcePackage, resourceStatus);
    const title = dlg.querySelector(".voice-dialog-title");
    const desc = dlg.querySelector(".voice-dialog-desc");
    const progress = dlg.querySelector(".voice-dialog-progress");
    const bar = dlg.querySelector(".voice-dialog-bar i");
    const pct = dlg.querySelector(".voice-dialog-pct");
    const actions = dlg.querySelector(".voice-dialog-actions");
    const okButton = actions.querySelector('[data-action="ok"]');
    const cancelButton = actions.querySelector('[data-action="cancel"]');
    const deleteButton = actions.querySelector('[data-action="delete"]');
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
      title.textContent = `正在下载离线${resourcePackage.locales?.length > 1 ? "中英文" : resourcePackage.locale === "zh-CN" ? "中文" : "英语"}语音`;
      desc.hidden = true;
      deleteButton.disabled = true;
      progress.hidden = false;
      bar.classList.add("indeterminate");
      bar.style.width = "35%";
      pct.textContent = "下载中…";
      normalized.onProgress?.(0, resourcePackage.totalBytes);
      try {
        await acquirePiperDownloadLock(`${resourcePackage.id}@${resourcePackage.version}`, async (context = {}) => {
          if (controller.signal.aborted) throw controller.signal.reason || new DOMException("Download cancelled", "AbortError");
          const currentStatus = await getPiperResourceStatus(resourcePackage.id);
          if (currentStatus === "completed") return;
          if (currentStatus === "gated" || currentStatus === "unsupported") {
            throw new PiperLocalVoiceError(currentStatus, `Piper package became ${currentStatus}`);
          }
          normalized.options.onDownloadStart?.(resourcePackage.id);
          const combined = combineAbortSignals([controller.signal, context.signal]);
          const canCommit = () => !controller.signal.aborted
            && !combined.signal.aborted
            && (typeof context.canCommit !== "function" || context.canCommit());
          try {
            await downloadPiperResource(resourcePackage.id, (received, total) => {
              if (total > 0) {
                const percent = Math.min(100, Math.round((received / total) * 100));
                bar.classList.remove("indeterminate");
                bar.style.width = `${percent}%`;
                pct.textContent = `${percent}%`;
              }
              normalized.onProgress?.(received, total);
            }, combined.signal, {
              canCommit,
              commitId: context.ownerToken,
              allowSharedCleanup: context.coordination !== "same-tab-only",
            });
          } finally {
            combined.dispose();
          }
        });
        finish("ok");
      } catch (error) {
        if (controller.signal.aborted || error?.name === "AbortError") return;
        finish(error?.code === "gated" || error?.code === "unsupported" ? error.code : getPiperDownloadError(error).code);
      }
    };
    okButton.onclick = () => {
      okButton.disabled = true;
      run();
    };
    cancelButton.onclick = () => finish("cancel");
    deleteButton.onclick = async () => {
      deleteButton.disabled = true;
      try {
        await deletePiperResource(resourcePackage.id);
        desc.hidden = false;
        desc.textContent = dialogDescription(resourcePackage, "not-downloaded");
        deleteButton.hidden = true;
        okButton.textContent = "下载";
      } catch (_) {
        finish("storage");
      } finally {
        deleteButton.disabled = false;
      }
    };
    dlg.oncancel = () => finish("cancel");
    dlg.showModal?.();
  });
}
