import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";

const mocks = vi.hoisted(() => ({
  englishStatus: "not-downloaded",
  getPiperResourceStatus: vi.fn(),
  getPiperResourceCachedBytes: vi.fn(),
  deletePiperResource: vi.fn(),
  downloadPiperResource: vi.fn(),
}));

const packages = [
  {
    id: "en_US-test-medium",
    locale: "en-US",
    label: "English (Test, medium)",
    version: "7",
    baseUrl: "https://voice.example.test/piper/en_US-test-medium",
    source: "cdn",
    cachePolicy: "user-download",
    totalBytes: 1024,
    releaseApproved: true,
    files: [{ suffix: ".onnx" }],
  },
  {
    id: "zh_CN-candidate",
    locale: "zh-CN",
    label: "Chinese (Candidate, medium)",
    version: "candidate",
    baseUrl: null,
    source: "gated",
    cachePolicy: "gated",
    totalBytes: null,
    releaseApproved: false,
    files: [],
  },
];

const getPiperResourceStatus = mocks.getPiperResourceStatus.mockImplementation(async (packageId) => packageId === packages[0].id ? mocks.englishStatus : "gated");
const getPiperResourceCachedBytes = mocks.getPiperResourceCachedBytes.mockResolvedValue(1024);
const deletePiperResource = mocks.deletePiperResource.mockImplementation(async () => {});
const downloadPiperResource = mocks.downloadPiperResource.mockImplementation(async () => {
  mocks.englishStatus = "completed";
  return { status: "completed" };
});

vi.mock("../../src/piper-resource-registry.js", () => ({
  listActivePiperCdnVoicePackages: () => [packages[0]],
  formatPiperResourceBytes: (bytes) => bytes === 1024 ? "1 KB" : `${bytes} B`,
}));
vi.mock("../../src/piper-resource-store.js", () => ({
  getPiperResourceStatus: mocks.getPiperResourceStatus,
  getPiperResourceCachedBytes: mocks.getPiperResourceCachedBytes,
  deletePiperResource: mocks.deletePiperResource,
}));
vi.mock("../../src/piper-resource-download.js", () => ({
  downloadPiperResource: mocks.downloadPiperResource,
}));
vi.mock("../../src/piper-resource-lock.js", () => ({
  acquirePiperDownloadLock: (_key, task) => {
    const controller = new AbortController();
    return task({ signal: controller.signal, canCommit: () => true, ownerToken: "test-owner" });
  },
}));

import { mountPiperResourceManager, renderPiperResourceStatus } from "../../src/piper-resource-ui.js";

describe("Piper resource manager", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    mocks.englishStatus = "not-downloaded";
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders only active CDN voice packages with scoped storage details", async () => {
    const container = document.body.appendChild(document.createElement("div"));
    const unmount = mountPiperResourceManager(container);
    await vi.waitFor(() => expect(container.querySelectorAll("[data-piper-resource]")).toHaveLength(1));

    const english = container.querySelector('[data-piper-resource="en_US-test-medium"]');
    expect(english.textContent).toContain("en-US");
    expect(english.textContent).toContain("English (Test, medium)");
    expect(english.textContent).toContain("版本 7");
    expect(english.textContent).toContain(window.location.origin);
    expect(english.textContent).toContain("当前浏览器范围");
    expect(english.textContent).toContain("1 KB");
    expect(english.querySelector('[data-piper-resource-action="download"]')).toBeTruthy();

    expect(container.querySelector('[data-piper-resource="zh_CN-candidate"]')).toBeNull();
    expect(container.textContent).toContain("下载记录只保存在当前浏览器、当前浏览器配置文件和当前域名；切换环境不会共享缓存。");
    unmount();
  });

  it("does not start gated or unsupported downloads and keeps deletion package-specific", async () => {
    const container = document.body.appendChild(document.createElement("div"));
    const unmount = mountPiperResourceManager(container);
    await vi.waitFor(() => expect(container.querySelector('[data-piper-resource="en_US-test-medium"] button')).toBeTruthy());

    await container.querySelector('[data-piper-resource-action="download"]').click();
    await vi.waitFor(() => expect(downloadPiperResource).toHaveBeenCalledWith(
      "en_US-test-medium",
      expect.any(Function),
      expect.any(AbortSignal),
      expect.objectContaining({ canCommit: expect.any(Function), commitId: "test-owner" }),
    ));

    await vi.waitFor(() => expect(container.querySelector('[data-piper-resource-action="delete"]')).toBeTruthy());
    renderPiperResourceStatus(container.querySelector('[data-piper-resource="en_US-test-medium"] [data-piper-resource-status]'), "completed");
    expect(container.textContent).toContain("completed（已下载并校验）");

    await container.querySelector('[data-piper-resource-action="delete"]').click();
    await vi.waitFor(() => expect(deletePiperResource).toHaveBeenCalledWith("en_US-test-medium"));
    expect(deletePiperResource).not.toHaveBeenCalledWith("zh_CN-candidate");
    expect(downloadPiperResource).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("offers both retry/continue and explicit deletion for partial or invalid packages", async () => {
    for (const status of ["partial", "invalid"]) {
      document.body.innerHTML = "";
      mocks.englishStatus = status;
      const container = document.body.appendChild(document.createElement("div"));
      const unmount = mountPiperResourceManager(container);
      await vi.waitFor(() => expect(container.querySelectorAll('[data-piper-resource-action="delete"]')).toHaveLength(1));
      expect(container.querySelector('[data-piper-resource-action="download"]')).toBeTruthy();
      await container.querySelector('[data-piper-resource-action="delete"]').click();
      await vi.waitFor(() => expect(deletePiperResource).toHaveBeenCalledWith("en_US-test-medium"));
      unmount();
      vi.clearAllMocks();
    }
  });

  it("renders every resource state distinctly and keeps same-tab downloads single-flight", async () => {
    const status = document.body.appendChild(document.createElement("span"));
    for (const value of ["unsupported", "gated", "not-downloaded", "partial", "downloading", "completed", "invalid"]) {
      renderPiperResourceStatus(status, value);
      expect(status.dataset.piperResourceStatus).toBe(value);
      expect(status.textContent).toContain(value);
    }

    const { acquirePiperDownloadLock } = await vi.importActual("../../src/piper-resource-lock.js");
    let finish;
    const task = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const first = acquirePiperDownloadLock("test-package@7", task);
    const second = acquirePiperDownloadLock("test-package@7", task);
    expect(second).toBe(first);
    await vi.waitFor(() => expect(task).toHaveBeenCalledTimes(1));
    finish("completed");
    await expect(first).resolves.toBe("completed");
  });

  it("aborts and refuses marker ownership after another tab takes over the localStorage lease", async () => {
    const entries = new Map();
    const storage = {
      getItem: (key) => entries.get(key) || null,
      setItem: (key, value) => entries.set(key, value),
      removeItem: (key) => entries.delete(key),
    };
    vi.stubGlobal("localStorage", storage);
    const descriptor = Object.getOwnPropertyDescriptor(globalThis.navigator, "locks");
    Object.defineProperty(globalThis.navigator, "locks", { configurable: true, value: undefined });
    const { acquirePiperDownloadLock } = await vi.importActual("../../src/piper-resource-lock.js");
    let releaseTask;
    let observed;
    const task = vi.fn(async ({ signal, canCommit }) => {
      await new Promise((resolve) => { releaseTask = resolve; });
      const allowed = canCommit();
      observed = { aborted: signal.aborted, canCommit: allowed };
    });

    const downloading = acquirePiperDownloadLock("lease-takeover@1", task);
    await vi.waitFor(() => expect(task).toHaveBeenCalledTimes(1));
    entries.set("shadow-mate-piper-lock:lease-takeover@1", JSON.stringify({ owner: "another-tab", expiresAt: Date.now() + 15_000 }));
    globalThis.dispatchEvent(new StorageEvent("storage", { key: "shadow-mate-piper-lock:lease-takeover@1" }));
    await vi.waitFor(() => expect(task.mock.calls[0][0].signal.aborted).toBe(true));
    releaseTask();

    await expect(downloading).rejects.toThrow(/lease was lost/i);
    expect(observed).toEqual({ aborted: true, canCommit: false });
    if (descriptor) Object.defineProperty(globalThis.navigator, "locks", descriptor);
    else delete globalThis.navigator.locks;
  });

  it("marks blocked localStorage coordination as same-tab-only without claiming a lease", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => { throw new Error("storage blocked"); },
      removeItem: vi.fn(),
    });
    const descriptor = Object.getOwnPropertyDescriptor(globalThis.navigator, "locks");
    Object.defineProperty(globalThis.navigator, "locks", { configurable: true, value: undefined });
    const { acquirePiperDownloadLock } = await vi.importActual("../../src/piper-resource-lock.js");
    const observed = await acquirePiperDownloadLock("storage-blocked@1", async (context) => ({
      coordination: context.coordination,
      ownerToken: context.ownerToken,
      canCommit: context.canCommit(),
    }));

    expect(observed).toEqual({
      coordination: "same-tab-only",
      ownerToken: expect.any(String),
      canCommit: true,
    });
    if (descriptor) Object.defineProperty(globalThis.navigator, "locks", descriptor);
    else delete globalThis.navigator.locks;
  });

  it("derives cached size from store metadata without reading whole cached responses", async () => {
    const source = await readFile(`${process.cwd()}/src/piper-resource-ui.js`, "utf8");
    expect(source).toContain("getPiperResourceCachedBytes");
    expect(source).not.toMatch(/\.arrayBuffer\s*\(/);
  });
});
