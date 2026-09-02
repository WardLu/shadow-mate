import { downloadPiperResource } from "./piper-resource-download.js";
import { acquirePiperDownloadLock } from "./piper-resource-lock.js";
import { listPiperResourcePackages } from "./piper-resource-registry.js";
import { deletePiperResource, getPiperResourceStatus } from "./piper-resource-store.js";

const STATUS_LABELS = Object.freeze({
  unsupported: "unsupported（此浏览器不支持本地下载）",
  gated: "gated（尚未开放下载）",
  "not-downloaded": "not-downloaded（尚未下载）",
  partial: "partial（下载未完成）",
  downloading: "downloading（下载中）",
  completed: "completed（已下载并校验）",
  invalid: "invalid（缓存校验失败）",
});

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "未提供";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getCacheName(resourcePackage) {
  return `shadow-mate-piper-${resourcePackage.id}-${resourcePackage.version}`;
}

async function getActualCachedBytes(resourcePackage) {
  if (!resourcePackage.releaseApproved || typeof globalThis.caches?.open !== "function") return null;
  try {
    const cache = await globalThis.caches.open(getCacheName(resourcePackage));
    let bytes = 0;
    for (const file of resourcePackage.files) {
      const response = await cache.match(`${resourcePackage.baseUrl}${file.suffix}`);
      if (!response) continue;
      bytes += (await response.clone().arrayBuffer()).byteLength;
    }
    return bytes || null;
  } catch (_) {
    return null;
  }
}

export function renderPiperResourceStatus(container, status) {
  const value = typeof status === "string" ? status : status?.status;
  container.dataset.piperResourceStatus = value || "invalid";
  container.textContent = STATUS_LABELS[value] || STATUS_LABELS.invalid;
}

function actionLabel(status) {
  if (status === "partial") return "继续下载";
  if (status === "not-downloaded" || status === "invalid") return "下载";
  if (status === "completed") return "删除";
  return null;
}

function renderPackage(container, resourcePackage, { status, actualBytes, onAction }) {
  const action = actionLabel(status);
  container.className = "piper-resource-row";
  container.dataset.piperResource = resourcePackage.id;
  container.innerHTML = `
    <div class="piper-resource-summary">
      <strong>${resourcePackage.label}</strong>
      <span>${resourcePackage.locale} · 版本 ${resourcePackage.version}</span>
    </div>
    <dl class="piper-resource-details">
      <div><dt>当前 Origin</dt><dd>${globalThis.location?.origin || "未知"}</dd></div>
      <div><dt>当前浏览器范围</dt><dd>当前浏览器配置文件</dd></div>
      <div><dt>清单大小</dt><dd>${formatBytes(resourcePackage.totalBytes)}</dd></div>
      <div><dt>实际缓存大小</dt><dd>${actualBytes === null ? "暂不可用" : formatBytes(actualBytes)}</dd></div>
    </dl>
    <div class="piper-resource-actions"><span data-piper-resource-status></span>${action ? `<button type="button" data-piper-resource-action="${status === "completed" ? "delete" : "download"}">${action}</button>` : ""}</div>
  `;
  renderPiperResourceStatus(container.querySelector("[data-piper-resource-status]"), status);
  container.querySelector("button")?.addEventListener("click", onAction);
}

export function mountPiperResourceManager(container) {
  let disposed = false;
  const activeStatuses = new Map();
  container.className = "piper-resource-manager";
  container.innerHTML = `<p class="piper-resource-scope">下载记录只保存在当前浏览器、当前浏览器配置文件和当前域名；切换环境不会共享缓存。</p><p class="piper-resource-estimate" data-piper-resource-estimate>正在读取本站存储用量…</p><div data-piper-resource-list></div>`;
  const list = container.querySelector("[data-piper-resource-list]");

  async function refreshEstimate() {
    try {
      const estimate = await globalThis.navigator?.storage?.estimate?.();
      if (!disposed && estimate) {
        container.querySelector("[data-piper-resource-estimate]").textContent = `本站存储用量：${formatBytes(estimate.usage)} / ${formatBytes(estimate.quota)}（不是单个语音包大小）`;
      }
    } catch (_) {
      if (!disposed) container.querySelector("[data-piper-resource-estimate]").textContent = "本站存储用量：浏览器未提供估算值";
    }
  }

  async function refresh() {
    const packages = listPiperResourcePackages();
    const rows = await Promise.all(packages.map(async (resourcePackage) => ({
      resourcePackage,
      status: activeStatuses.get(resourcePackage.id) || await getPiperResourceStatus(resourcePackage.id),
      actualBytes: await getActualCachedBytes(resourcePackage),
    })));
    if (disposed) return;
    list.innerHTML = "";
    for (const row of rows) {
      const element = document.createElement("article");
      renderPackage(element, row.resourcePackage, {
        status: row.status,
        actualBytes: row.actualBytes,
        onAction: async () => {
          if (row.status === "completed") {
            await deletePiperResource(row.resourcePackage.id);
            await refresh();
            return;
          }
          if (!["not-downloaded", "partial", "invalid"].includes(row.status) || !row.resourcePackage.releaseApproved) return;
          activeStatuses.set(row.resourcePackage.id, "downloading");
          await refresh();
          try {
            await acquirePiperDownloadLock(`${row.resourcePackage.id}@${row.resourcePackage.version}`, () =>
              downloadPiperResource(row.resourcePackage.id, () => {}));
          } catch (_) {
            // The downloader owns error details. The manager only restores its local state;
            // cancelled dialogs and unavailable cross-tab locks must not create a toast loop.
          } finally {
            activeStatuses.delete(row.resourcePackage.id);
            await refresh();
          }
        },
      });
      list.appendChild(element);
    }
  }

  void refreshEstimate();
  void refresh();
  return () => { disposed = true; };
}
