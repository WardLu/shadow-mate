const SHA_256_RE = /^[a-f0-9]{64}$/i;
const GIT_COMMIT_RE = /^[a-f0-9]{40}$/i;

const MIT_REDISTRIBUTION_TERMS = "MIT permits use, copy, modify, merge, publish, distribute, sublicense, and sell copies when the copyright and permission notices are retained; the software is provided without warranty.";
const ESPEAK_REDISTRIBUTION_TERMS = "Retain the four tracked eSpeak NG license texts and apply the text attached to each incorporated material: GPL-3.0-or-later material requires the corresponding source and GPL notices when conveying object code; Apache-2.0 material retains its license and required notices; BSD-2-Clause material retains copyright, conditions, and disclaimer; Unicode text retains its copyright, permission notice, and disclaimer.";
const APACHE_2_REDISTRIBUTION_TERMS = "Apache-2.0 permits use, reproduction, and distribution with the license, copyright, attribution, and NOTICE obligations retained; modified files must carry prominent change notices, and the software is provided without warranty.";

const BUNDLED_RUNTIME_AUDIT_COMPONENTS = [
  {
    name: "piper-tts-web",
    version: "1.1.2",
    versionSource: "package.json at this commit; not the separately tagged v1.1.2",
    commit: "950f1f5c8278296a6698cc11e8b976594dad6687",
    source: "https://github.com/Poket-Jony/piper-tts-web/tree/950f1f5c8278296a6698cc11e8b976594dad6687",
    license: { status: "approved", name: "MIT" },
    licenseUrl: "https://github.com/Poket-Jony/piper-tts-web/blob/950f1f5c8278296a6698cc11e8b976594dad6687/LICENSE",
    licenseTextPaths: ["third_party/licenses/piper-tts-web-MIT.txt"],
    redistributionTerms: MIT_REDISTRIBUTION_TERMS,
  },
  {
    name: "ONNX Runtime Web",
    version: "1.20.1",
    versionSource: "upstream release version at this commit",
    commit: "5c1b7ccbff7e5141c1da7a9d963d660e5741c319",
    source: "https://github.com/microsoft/onnxruntime/tree/5c1b7ccbff7e5141c1da7a9d963d660e5741c319/js/web",
    license: { status: "approved", name: "MIT" },
    licenseUrl: "https://github.com/microsoft/onnxruntime/blob/5c1b7ccbff7e5141c1da7a9d963d660e5741c319/LICENSE",
    licenseTextPaths: ["third_party/licenses/onnxruntime-MIT.txt"],
    redistributionTerms: MIT_REDISTRIBUTION_TERMS,
  },
  {
    name: "piper-phonemize",
    version: "1.2.0",
    versionSource: "upstream release version at this commit",
    commit: "cfff8e52ebaea37c7e953ae2d06b174acb827ac4",
    source: "https://github.com/rhasspy/piper-phonemize/tree/cfff8e52ebaea37c7e953ae2d06b174acb827ac4",
    license: { status: "approved", name: "MIT" },
    licenseUrl: "https://github.com/rhasspy/piper-phonemize/blob/cfff8e52ebaea37c7e953ae2d06b174acb827ac4/LICENSE.md",
    licenseTextPaths: ["third_party/licenses/piper-phonemize-MIT.txt"],
    redistributionTerms: MIT_REDISTRIBUTION_TERMS,
    artifactOrigin: {
      package: "piper-tts-web",
      packageVersion: "1.0.0",
      commit: "7cec5cb4861f9322cd094b1b8b41a5b173e314db",
      source: "https://github.com/Poket-Jony/piper-tts-web/tree/7cec5cb4861f9322cd094b1b8b41a5b173e314db/dist/piper",
      licenseUrl: "https://github.com/Poket-Jony/piper-tts-web/blob/7cec5cb4861f9322cd094b1b8b41a5b173e314db/LICENSE",
    },
    dependency: "eSpeak NG",
  },
  {
    name: "eSpeak NG",
    version: "1.52.0.1",
    versionSource: "piper-phonemize CMake build metadata",
    commit: "0f65aa301e0d6bae5e172cc74197d32a6182200f",
    source: "https://github.com/espeak-ng/espeak-ng/tree/0f65aa301e0d6bae5e172cc74197d32a6182200f",
    license: { status: "approved", name: "GPL-3.0-or-later; Apache-2.0; BSD-2-Clause; Unicode-DFS-2016" },
    licenseUrl: "https://github.com/espeak-ng/espeak-ng/blob/0f65aa301e0d6bae5e172cc74197d32a6182200f/COPYING",
    additionalLicenseUrls: [
      "https://github.com/espeak-ng/espeak-ng/blob/0f65aa301e0d6bae5e172cc74197d32a6182200f/COPYING.APACHE",
      "https://github.com/espeak-ng/espeak-ng/blob/0f65aa301e0d6bae5e172cc74197d32a6182200f/COPYING.BSD2",
      "https://github.com/espeak-ng/espeak-ng/blob/0f65aa301e0d6bae5e172cc74197d32a6182200f/COPYING.UCD",
    ],
    licenseTextPaths: [
      "third_party/licenses/espeak-ng-COPYING.txt",
      "third_party/licenses/espeak-ng-COPYING.APACHE.txt",
      "third_party/licenses/espeak-ng-COPYING.BSD2.txt",
      "third_party/licenses/espeak-ng-COPYING.UCD.txt",
    ],
    redistributionTerms: ESPEAK_REDISTRIBUTION_TERMS,
  },
  {
    name: "sherpa-onnx WebAssembly TTS",
    version: "1.13.2",
    versionSource: "signed upstream release tag",
    commit: "13d0ae6c539d2809d32f5eaa3ef1db0c459d0b24",
    source: "https://github.com/k2-fsa/sherpa-onnx/tree/13d0ae6c539d2809d32f5eaa3ef1db0c459d0b24/wasm/tts",
    license: { status: "approved", name: "Apache-2.0" },
    licenseUrl: "https://github.com/k2-fsa/sherpa-onnx/blob/13d0ae6c539d2809d32f5eaa3ef1db0c459d0b24/LICENSE",
    licenseTextPaths: ["third_party/licenses/sherpa-onnx-Apache-2.0.txt"],
    redistributionTerms: APACHE_2_REDISTRIBUTION_TERMS,
  },
];

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
  releaseApproved: false,
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

const CHINESE_PIPER_RESOURCE = {
  id: "zh_CN-chaowen-medium",
  locale: "zh-CN",
  label: "Chinese (Chaowen, medium)",
  kind: "voice",
  version: "1",
  baseUrl: "https://voice.shadow.wang/piper/zh_CN-chaowen-medium",
  source: "cdn",
  cachePolicy: "user-download",
  totalBytes: 63224911,
  releaseApproved: false,
  licenseStatus: "approved",
  license: {
    status: "approved",
    model: "CC0 (model card)",
    trainingData: "CC0",
    reference: "https://huggingface.co/rhasspy/piper-voices/blob/main/zh/zh_CN/chaowen/medium/MODEL_CARD",
  },
  provenance: {
    status: "verified",
    source: "https://huggingface.co/rhasspy/piper-voices/tree/main/zh/zh_CN/chaowen/medium",
    modelCard: "https://huggingface.co/rhasspy/piper-voices/blob/main/zh/zh_CN/chaowen/medium/MODEL_CARD",
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
      bytes: 63221984,
      sha256: "820d64ac16048fbcf38dd0823d37fab5f5e0c2bd71b01ca5a50f553fac19e746",
    },
    {
      key: "metadata",
      suffix: ".onnx.json",
      contentType: "application/json",
      bytes: 2927,
      sha256: "a6bb2caafa0645642f13cbf7e2f6fbbb16fded66e51109fc26d622f6472fa16f",
    },
  ],
};

export const UNIFIED_OFFLINE_VOICE_PACKAGE_ID = "matcha-icefall-zh-en-1.13.2";

const UNIFIED_MATCHA_RESOURCE = {
  id: UNIFIED_OFFLINE_VOICE_PACKAGE_ID,
  locale: "zh-CN + en-US",
  locales: ["zh-CN", "en-US"],
  label: "中英双语（Matcha）",
  kind: "voice",
  engine: "sherpa-onnx-matcha",
  version: "1",
  baseUrl: "https://voice.shadow.wang/sherpa-onnx/1.13.2/matcha-icefall-zh-en/sherpa-onnx-wasm-main-tts",
  source: "cdn",
  cachePolicy: "user-download",
  totalBytes: 162111773,
  releaseApproved: true,
  licenseStatus: "approved",
  license: {
    status: "approved",
    model: "Apache-2.0",
    trainingData: "See pinned upstream model package documentation",
    reference: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/v1.13.2",
  },
  provenance: {
    status: "verified",
    source: "https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.2/sherpa-onnx-wasm-simd-1.13.2-matcha-icefall-zh-en.tar.bz2",
    modelCard: "https://k2-fsa.github.io/sherpa/onnx/tts/all/Chinese-English/matcha-icefall-zh-en.html",
  },
  distribution: {
    status: "approved",
    channel: "public-cdn",
    notice: "THIRD_PARTY_NOTICES.md#统一中英双语-matcha-cdn-资源",
  },
  redistributionTerms: APACHE_2_REDISTRIBUTION_TERMS,
  files: [
    {
      key: "data",
      suffix: ".data",
      contentType: "application/octet-stream",
      bytes: 149228019,
      sha256: "3a00cfc82ddf39a2e798e63fad038e2c56f10aa4b7b952a0c98db758d119c14c",
    },
    {
      key: "wasm",
      suffix: ".wasm",
      url: "https://voice.shadow.wang/sherpa-onnx/1.13.2-mobile-256/matcha-icefall-zh-en/sherpa-onnx-wasm-main-tts.wasm",
      contentType: "application/wasm",
      bytes: 12883754,
      sha256: "ff161b9927ca92164930fe564476ee32edaf8ec460b94df2353af7333754119e",
    },
  ],
};

const BUNDLED_PIPER_RUNTIME = {
  id: "piper-browser-runtime",
  locale: "und",
  label: "Browser offline TTS runtimes",
  kind: "runtime",
  version: "1",
  baseUrl: null,
  source: "bundled",
  cachePolicy: "app-shell",
  totalBytes: 76786515,
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
    components: BUNDLED_RUNTIME_AUDIT_COMPONENTS,
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
    {
      key: "sherpa-onnx-engine",
      url: "/sherpa-onnx/sherpa-onnx-wasm-main-tts.js",
      contentType: "application/javascript",
      bytes: 143833,
      sha256: "2f7d50fe6991982a4bcc8dd938d63de6edbb3f2b971e383e8986331ca5fcb311",
      license: "Apache-2.0",
      provenance: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/v1.13.2",
    },
    {
      key: "sherpa-onnx-adapter",
      url: "/sherpa-onnx/sherpa-onnx-tts.js",
      contentType: "application/javascript",
      bytes: 32010,
      sha256: "d0febb99e78c8322eb7dbda12e90a1b473de8a7d65f016a146576fbdadbf266a",
      license: "Apache-2.0",
      provenance: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/v1.13.2",
    },
    {
      key: "sherpa-onnx-worker",
      url: "/sherpa-onnx/sherpa-onnx-tts.worker.js",
      contentType: "application/javascript",
      bytes: 2057,
      sha256: "e6274d02b08ca502ae910cdbd3084cda557ee52a12bc020a96187af43a0dd4ca",
      license: "Apache-2.0 with Shadow Mate integration changes",
      provenance: "docs/superpowers/specs/2026-09-04-unified-offline-voice-design.md",
    },
  ],
};

export const PIPER_RESOURCE_PACKAGES = deepFreeze([
  ENGLISH_PIPER_RESOURCE,
  CHINESE_PIPER_RESOURCE,
  UNIFIED_MATCHA_RESOURCE,
  BUNDLED_PIPER_RUNTIME,
]);

export function isActivePiperCdnVoicePackage(resourcePackage) {
  return resourcePackage?.releaseApproved === true
    && resourcePackage.kind === "voice"
    && resourcePackage.source === "cdn"
    && resourcePackage.cachePolicy === "user-download";
}

export function resolvePiperResourceFileUrl(resourcePackage, file) {
  return new URL(
    file?.url || `${resourcePackage?.baseUrl || ""}${file?.suffix || ""}`,
    globalThis.location?.href || "https://shadow-mate.invalid/",
  ).href;
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
  const componentsByName = new Map(resourcePackage.audit.components.map((component) => [component?.name, component]));
  const expectedNames = new Set(BUNDLED_RUNTIME_AUDIT_COMPONENTS.map((component) => component.name));
  if (componentsByName.size !== expectedNames.size || resourcePackage.audit.components.length !== expectedNames.size
    || [...componentsByName.keys()].some((name) => !expectedNames.has(name))) {
    throw new Error(`Bundled Piper package ${resourcePackage.id} has an unexpected audit component set`);
  }
  for (const expected of BUNDLED_RUNTIME_AUDIT_COMPONENTS) {
    const component = componentsByName.get(expected.name);
    if (component.version !== expected.version || component.versionSource !== expected.versionSource) {
      throw new Error(`Bundled Piper package ${resourcePackage.id} has a component with an unexpected version`);
    }
    if (!GIT_COMMIT_RE.test(component.commit || "") || component.commit !== expected.commit) {
      throw new Error(`Bundled Piper package ${resourcePackage.id} has a component with an unexpected commit`);
    }
    if (component.source !== expected.source || component.licenseUrl !== expected.licenseUrl
      || JSON.stringify(component.additionalLicenseUrls || []) !== JSON.stringify(expected.additionalLicenseUrls || [])) {
      throw new Error(`Bundled Piper package ${resourcePackage.id} has a component with an unexpected source or license reference`);
    }
    if (component.license?.status !== "approved" || component.license?.name !== expected.license.name) {
      throw new Error(`Bundled Piper package ${resourcePackage.id} has a component with an unapproved license`);
    }
    if (JSON.stringify(component.licenseTextPaths) !== JSON.stringify(expected.licenseTextPaths)) {
      throw new Error(`Bundled Piper package ${resourcePackage.id} has a component with missing or unexpected local license text`);
    }
    if (component.redistributionTerms !== expected.redistributionTerms) {
      throw new Error(`Bundled Piper package ${resourcePackage.id} has a component with unexpected redistribution terms`);
    }
    if (JSON.stringify(component) !== JSON.stringify(expected)) {
      throw new Error(`Bundled Piper package ${resourcePackage.id} has unexpected component audit metadata`);
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
    const isBundled = resourcePackage.source === "bundled" && resourcePackage.cachePolicy === "app-shell";
    if (isBundled) validateBundledRuntimeAuditMetadata(resourcePackage);
    if (resourcePackage.releaseApproved !== true) continue;
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
      const hasLocation = isBundled
        ? /^\/.+/.test(file?.url || "")
        : Boolean(file?.suffix) && (!file.url || /^https:\/\//.test(file.url));
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
