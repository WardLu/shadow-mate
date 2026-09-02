const SHA_256_RE = /^[a-f0-9]{64}$/i;
const GIT_COMMIT_RE = /^[a-f0-9]{40}$/i;

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const ENGLISH_PIPER_RESOURCE = {
  id: "en_US-ljspeech-medium",
  locale: "en-US",
  label: "English (LJSpeech, medium)",
  kind: "voice",
  version: "1",
  baseUrl: "https://voice.shadow.wang/piper/en_US-ljspeech-medium",
  source: "cdn",
  cachePolicy: "user-download",
  totalBytes: 63536351,
  releaseApproved: true,
  licenseStatus: "approved",
  license: {
    status: "approved",
    model: "MIT",
    trainingData: "public-domain",
    reference: "https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/medium/MODEL_CARD",
  },
  provenance: {
    status: "verified",
    source: "https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/ljspeech/medium",
    modelCard: "https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/medium/MODEL_CARD",
  },
  distribution: {
    status: "approved",
    channel: "public-cdn",
    notice: "THIRD_PARTY_NOTICES.md#piper-cdn-资源发布门禁",
  },
  files: [
    {
      key: "model",
      suffix: ".onnx",
      contentType: "application/octet-stream",
      bytes: 63531379,
      sha256: "6f52a751e2349abe7a76735eb09dc1875298c77ea2342ffd2fef79ff81b87f22",
    },
    {
      key: "metadata",
      suffix: ".onnx.json",
      contentType: "application/json",
      bytes: 4972,
      sha256: "141d612cc0a95ed7efc1ca936b845c2364967f2e9217c5dbfcf69fc4d6c65860",
    },
  ],
};

const GATED_CHINESE_PIPER_RESOURCE = {
  id: "zh_CN-chaowen-medium",
  locale: "zh-CN",
  label: "Chinese (Chaowen, medium)",
  kind: "voice",
  version: "candidate",
  baseUrl: null,
  source: "gated",
  cachePolicy: "gated",
  totalBytes: null,
  releaseApproved: false,
  licenseStatus: "pending",
  license: { status: "pending" },
  provenance: {
    status: "partial",
    source: "https://huggingface.co/rhasspy/piper-voices/tree/main/zh/zh_CN/chaowen/medium",
  },
  distribution: { status: "blocked", channel: "none" },
  files: [],
};

const BUNDLED_PIPER_RUNTIME = {
  id: "piper-browser-runtime",
  locale: "und",
  label: "Piper browser runtime",
  kind: "runtime",
  version: "1",
  baseUrl: null,
  source: "bundled",
  cachePolicy: "app-shell",
  totalBytes: 76608615,
  releaseApproved: true,
  licenseStatus: "reviewed",
  license: {
    status: "reviewed",
    reference: "THIRD_PARTY_NOTICES.md#vendored-浏览器语音资源",
  },
  provenance: {
    status: "verified",
    source: "THIRD_PARTY_NOTICES.md#vendored-浏览器语音资源",
  },
  audit: {
    status: "approved",
    components: [
      {
        name: "piper-tts-web",
        version: "1.1.2",
        commit: "950f1f5c8278296a6698cc11e8b976594dad6687",
        source: "https://github.com/Poket-Jony/piper-tts-web/tree/950f1f5c8278296a6698cc11e8b976594dad6687",
        license: "MIT",
        licenseUrl: "https://github.com/Poket-Jony/piper-tts-web/blob/950f1f5c8278296a6698cc11e8b976594dad6687/LICENSE",
        redistributionTerms: "MIT permits use, copy, modify, merge, publish, distribute, sublicense, and sell copies when the copyright and permission notices are retained; the software is provided without warranty.",
      },
      {
        name: "ONNX Runtime Web",
        version: "1.20.1",
        commit: "5c1b7ccbff7e5141c1da7a9d963d660e5741c319",
        source: "https://github.com/microsoft/onnxruntime/tree/5c1b7ccbff7e5141c1da7a9d963d660e5741c319/js/web",
        license: "MIT",
        licenseUrl: "https://github.com/microsoft/onnxruntime/blob/5c1b7ccbff7e5141c1da7a9d963d660e5741c319/LICENSE",
        redistributionTerms: "MIT permits use, copy, modify, merge, publish, distribute, sublicense, and sell copies when the copyright and permission notices are retained; the software is provided without warranty.",
      },
      {
        name: "piper-tts-web phonemize artifacts",
        version: "1.0.0",
        commit: "7cec5cb4861f9322cd094b1b8b41a5b173e314db",
        source: "https://github.com/Poket-Jony/piper-tts-web/tree/7cec5cb4861f9322cd094b1b8b41a5b173e314db/dist/piper",
        license: "piper-tts-web MIT wrapper; retain applicable piper-phonemize and eSpeak NG notices for the WASM and data artifacts",
        licenseUrl: "https://github.com/Poket-Jony/piper-tts-web/blob/7cec5cb4861f9322cd094b1b8b41a5b173e314db/LICENSE",
        notices: [
          "https://github.com/rhasspy/piper-phonemize",
          "https://github.com/espeak-ng/espeak-ng/blob/master/COPYING",
        ],
        redistributionTerms: "For the piper-tts-web MIT-covered wrapper, use, copy, modify, merge, publish, distribute, sublicense, and sell are permitted when copyright and permission notices are retained; the software is provided without warranty. Retain all applicable piper-phonemize and eSpeak NG notices and license texts with these artifacts before redistribution.",
      },
    ],
  },
  distribution: {
    status: "bundled",
    channel: "app-shell",
    notice: "THIRD_PARTY_NOTICES.md#vendored-浏览器语音资源",
  },
  files: [
    {
      key: "engine",
      url: "/piper-tts-web.js",
      contentType: "application/javascript",
      bytes: 46656168,
      sha256: "c35588fad691ed023215f0194e0fb0e816b9a9766d3d2669dd49d4ea2fffd712",
      license: "piper-tts-web and embedded ONNX Runtime notices",
      provenance: "THIRD_PARTY_NOTICES.md#vendored-浏览器语音资源",
    },
    {
      key: "onnx-runtime",
      url: "/onnx/ort-wasm-simd-threaded.wasm",
      contentType: "application/wasm",
      bytes: 11246032,
      sha256: "207d02be4591c156b0a98f024f3d58005b5b04c92274d759fb390338c63559ea",
      license: "MIT",
      provenance: "https://github.com/microsoft/onnxruntime",
    },
    {
      key: "phonemize-wasm",
      url: "/piper/piper_phonemize.wasm",
      contentType: "application/wasm",
      bytes: 629166,
      sha256: "2189e43490744c95445e251c38a47063f2ca266bcc30bbb18f692c47ff2bfd23",
      license: "piper-phonemize and eSpeak NG applicable upstream licenses",
      provenance: "THIRD_PARTY_NOTICES.md#vendored-浏览器语音资源",
    },
    {
      key: "phonemize-data",
      url: "/piper/piper_phonemize.data",
      contentType: "application/octet-stream",
      bytes: 18077249,
      sha256: "a9879123581336fc36ae3706ae81c9e67becc388b80b8a4943cef2a78542e6aa",
      license: "piper-phonemize and eSpeak NG applicable upstream licenses",
      provenance: "THIRD_PARTY_NOTICES.md#vendored-浏览器语音资源",
    },
  ],
};

export const PIPER_RESOURCE_PACKAGES = deepFreeze([
  ENGLISH_PIPER_RESOURCE,
  GATED_CHINESE_PIPER_RESOURCE,
  BUNDLED_PIPER_RUNTIME,
]);

export function isActivePiperCdnVoicePackage(resourcePackage) {
  return resourcePackage?.releaseApproved === true
    && resourcePackage.kind === "voice"
    && resourcePackage.source === "cdn"
    && resourcePackage.cachePolicy === "user-download";
}

function validateApprovedCdnMetadata(resourcePackage) {
  if (resourcePackage.licenseStatus !== "approved"
    || resourcePackage.license?.status !== "approved"
    || !resourcePackage.license?.model
    || !resourcePackage.license?.trainingData
    || !resourcePackage.license?.reference) {
    throw new Error(`Active Piper package ${resourcePackage.id} has no approved license metadata`);
  }
  if (resourcePackage.provenance?.status !== "verified"
    || !resourcePackage.provenance?.source
    || !resourcePackage.provenance?.modelCard) {
    throw new Error(`Active Piper package ${resourcePackage.id} has no verified provenance metadata`);
  }
  if (resourcePackage.distribution?.status !== "approved"
    || !resourcePackage.distribution?.channel
    || !resourcePackage.distribution?.notice) {
    throw new Error(`Active Piper package ${resourcePackage.id} has no approved distribution metadata`);
  }
}

function validateBundledRuntimeAuditMetadata(resourcePackage) {
  if (resourcePackage.audit?.status !== "approved" || !Array.isArray(resourcePackage.audit?.components) || resourcePackage.audit.components.length === 0) {
    throw new Error(`Bundled Piper package ${resourcePackage.id} has no approved audit metadata`);
  }
  for (const component of resourcePackage.audit.components) {
    if (!component?.name || !component.version || !GIT_COMMIT_RE.test(component.commit || "")) {
      throw new Error(`Bundled Piper package ${resourcePackage.id} has a component without a fixed version or commit`);
    }
    if (typeof component.source !== "string" || !component.source.includes(component.commit)
      || typeof component.licenseUrl !== "string" || !component.licenseUrl.includes(component.commit)) {
      throw new Error(`Bundled Piper package ${resourcePackage.id} has a component without commit-pinned source or license reference`);
    }
    if (!component.license || typeof component.redistributionTerms !== "string" || !component.redistributionTerms.trim()) {
      throw new Error(`Bundled Piper package ${resourcePackage.id} has a component without license or redistribution terms`);
    }
  }
}

export function validatePiperResourcePackages(packages) {
  if (!Array.isArray(packages)) throw new Error("Piper resource registry must be an array");
  const ids = new Set();
  for (const resourcePackage of packages) {
    if (!resourcePackage?.id || ids.has(resourcePackage.id)) throw new Error("Piper package ids must be unique and non-empty");
    ids.add(resourcePackage.id);
    for (const key of ["locale", "label", "kind", "version", "source", "cachePolicy"]) {
      if (!resourcePackage[key]) throw new Error(`Piper package ${resourcePackage.id} is missing ${key}`);
    }
    if (resourcePackage.releaseApproved !== true) continue;
    const isBundled = resourcePackage.source === "bundled" && resourcePackage.cachePolicy === "app-shell";
    if (!isBundled && !isActivePiperCdnVoicePackage(resourcePackage)) {
      throw new Error(`Active Piper package ${resourcePackage.id} must be a CDN voice or bundled runtime package`);
    }
    if ((!isBundled && !resourcePackage.baseUrl) || !Number.isSafeInteger(resourcePackage.totalBytes) || resourcePackage.totalBytes <= 0) {
      throw new Error(`Active Piper package ${resourcePackage.id} has invalid location or total bytes`);
    }
    if (!Array.isArray(resourcePackage.files) || resourcePackage.files.length === 0) {
      throw new Error(`Active Piper package ${resourcePackage.id} must declare files`);
    }
    let totalBytes = 0;
    const fileKeys = new Set();
    for (const file of resourcePackage.files) {
      const hasLocation = isBundled ? /^\/.+/.test(file?.url || "") : Boolean(file?.suffix);
      if (!file?.key || fileKeys.has(file.key) || !hasLocation || !file.contentType) {
        throw new Error(`Active Piper package ${resourcePackage.id} has an invalid file entry`);
      }
      fileKeys.add(file.key);
      if (!Number.isSafeInteger(file.bytes) || file.bytes <= 0) {
        throw new Error(`Active Piper package ${resourcePackage.id} has invalid file bytes`);
      }
      if (!SHA_256_RE.test(file.sha256 || "")) {
        throw new Error(`Active Piper package ${resourcePackage.id} has an invalid SHA-256`);
      }
      if (isBundled && (!file.license || !file.provenance)) {
        throw new Error(`Bundled Piper package ${resourcePackage.id} has incomplete license or provenance metadata`);
      }
      totalBytes += file.bytes;
    }
    if (totalBytes !== resourcePackage.totalBytes) {
      throw new Error(`Active Piper package ${resourcePackage.id} total bytes do not match files`);
    }
    if (isBundled) validateBundledRuntimeAuditMetadata(resourcePackage);
    if (isActivePiperCdnVoicePackage(resourcePackage)) validateApprovedCdnMetadata(resourcePackage);
  }
  return true;
}

validatePiperResourcePackages(PIPER_RESOURCE_PACKAGES);

export function getPiperResourcePackage(packageId) {
  return PIPER_RESOURCE_PACKAGES.find((resourcePackage) => resourcePackage.id === packageId) || null;
}

export function listPiperResourcePackages() {
  return [...PIPER_RESOURCE_PACKAGES];
}

export function listActivePiperCdnVoicePackages() {
  return PIPER_RESOURCE_PACKAGES.filter(isActivePiperCdnVoicePackage);
}

export function listBundledPiperRuntimePackages() {
  return PIPER_RESOURCE_PACKAGES.filter((resourcePackage) =>
    resourcePackage.source === "bundled" && resourcePackage.cachePolicy === "app-shell");
}

export function formatPiperResourceBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "未提供";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
