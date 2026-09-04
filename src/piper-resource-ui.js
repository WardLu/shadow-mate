import { downloadPiperResource } from "./piper-resource-download.js";
import { acquirePiperDownloadLock } from "./piper-resource-lock.js";
import { formatPiperResourceBytes, listActivePiperCdnVoicePackages } from "./piper-resource-registry.js";
import {
  deletePiperResource,
  getPiperResourceCachedBytes,
  getPiperResourceStatus,
} from "./piper-resource-store.js";

const STATUS_LABELS = Object.freeze({
  unsupported: "unsupported（此浏览器不支持本地下载）",
  gated: "gated（尚未开放下载）",
  "not-downloaded": "not-downloaded（尚未下载）",
  partial: "partial（下载未完成）",
  downloading: "downloading（下载中）",
  completed: "completed（已下载并校验）",
  invalid: "invalid（缓存校验失败）",
});

export function renderPiperResourceStatus(container, status) {
  const value = typeof status === "string" ? status : status?.status;
  container.dataset.piperResourceStatus = value || "invalid";
  container.textContent = STATUS_LABELS[value] || STATUS_LABELS.invalid;
}

function actionsForStatus(status) {
  if (status === "partial") return [{ action: "download", label: "继续下载" }, { action: "delete", label: "删除" }];
  if (status === "invalid") return [{ action: "download", label: "重试" }, { action: "delete", label: "删除" }];
  if (status === "not-downloaded") return [{ action: "download", label: "下载" }];
  if (status === "completed") return [{ action: "delete", label: "删除" }];
  return [];
}

function renderPackage(container, resourcePackage, { status, actualBytes, onAction }) {
  const actions = actionsForStatus(status);
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
      <div><dt>清单大小</dt><dd>${formatPiperResourceBytes(resourcePackage.totalBytes)}</dd></div>
      <div><dt>实际缓存大小</dt><dd>${actualBytes === null ? "暂不可用" : formatPiperResourceBytes(actualBytes)}</dd></div>
    </dl>
    <div class="piper-resource-actions"><span data-piper-resource-status></span>${actions.map(({ action, label }) => `<button type="button" data-piper-resource-action="${action}">${label}</button>`).join("")}</div>
  `;
  renderPiperResourceStatus(container.querySelector("[data-piper-resource-status]"), status);
  for (const button of container.querySelectorAll("button")) button.addEventListener("click", onAction);
}

export function mountPiperResourceManager(container) {
  let disposed = false;
  const activeStatuses = new Map();
  container.className = "piper-resource-manager";
  container.innerHTML = `<p class="piper-resource-scope">下载记录只保存在当前浏览器配置文件和当前域名；切换 Chrome、夸克、小米浏览器、无痕模式或站点域名都需要分别下载。</p><p class="piper-resource-estimate" data-piper-resource-estimate>正在读取本站存储用量…</p><div data-piper-resource-list></div>`;
  const list = container.querySelector("[data-piper-resource-list]");

  async function refreshEstimate() {
    if (typeof globalThis.navigator?.storage?.estimate !== "function") {
      if (!disposed) container.querySelector("[data-piper-resource-estimate]").textContent = "本站存储用量：浏览器未提供估算值";
      return;
    }
    try {
      const estimate = await globalThis.navigator?.storage?.estimate?.();
      if (!disposed && estimate) {
        container.querySelector("[data-piper-resource-estimate]").textContent = `本站存储用量：${formatPiperResourceBytes(estimate.usage)} / ${formatPiperResourceBytes(estimate.quota)}（不是单个语音包大小）`;
      }
    } catch (_) {
      if (!disposed) container.querySelector("[data-piper-resource-estimate]").textContent = "本站存储用量：浏览器未提供估算值";
    }
  }

  async function refresh() {
    const packages = listActivePiperCdnVoicePackages();
    const rows = await Promise.all(packages.map(async (resourcePackage) => ({
      resourcePackage,
      status: activeStatuses.get(resourcePackage.id) || await getPiperResourceStatus(resourcePackage.id),
      actualBytes: await getPiperResourceCachedBytes(resourcePackage.id),
    })));
    if (disposed) return;
    list.innerHTML = "";
    for (const row of rows) {
      const element = document.createElement("article");
      renderPackage(element, row.resourcePackage, {
        status: row.status,
        actualBytes: row.actualBytes,
        onAction: async (event) => {
          const action = event.currentTarget.dataset.piperResourceAction;
          if (action === "delete") {
            await deletePiperResource(row.resourcePackage.id);
            await refresh();
            return;
          }
          if (action !== "download" || !["not-downloaded", "partial", "invalid"].includes(row.status)) return;
          activeStatuses.set(row.resourcePackage.id, "downloading");
          await refresh();
          try {
            await acquirePiperDownloadLock(`${row.resourcePackage.id}@${row.resourcePackage.version}`, async (context = {}) => {
              if ((await getPiperResourceStatus(row.resourcePackage.id)) === "completed") return;
              return downloadPiperResource(row.resourcePackage.id, () => {}, context.signal, {
                canCommit: context.canCommit,
                commitId: context.ownerToken,
                allowSharedCleanup: context.coordination !== "same-tab-only",
              });
            });
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
