const SHA_256_RE = /^[a-f0-9]{64}$/i;

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
  files: [],
};

export const PIPER_RESOURCE_PACKAGES = deepFreeze([ENGLISH_PIPER_RESOURCE, GATED_CHINESE_PIPER_RESOURCE]);

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
    if (resourcePackage.source !== "cdn" || resourcePackage.cachePolicy !== "user-download") {
      throw new Error(`Active Piper package ${resourcePackage.id} must be a user-download CDN package`);
    }
    if (!resourcePackage.baseUrl || !Number.isSafeInteger(resourcePackage.totalBytes) || resourcePackage.totalBytes <= 0) {
      throw new Error(`Active Piper package ${resourcePackage.id} has invalid location or total bytes`);
    }
    if (!Array.isArray(resourcePackage.files) || resourcePackage.files.length === 0) {
      throw new Error(`Active Piper package ${resourcePackage.id} must declare files`);
    }
    let totalBytes = 0;
    const fileKeys = new Set();
    for (const file of resourcePackage.files) {
      if (!file?.key || fileKeys.has(file.key) || !file.suffix || !file.contentType) {
        throw new Error(`Active Piper package ${resourcePackage.id} has an invalid file entry`);
      }
      fileKeys.add(file.key);
      if (!Number.isSafeInteger(file.bytes) || file.bytes <= 0) {
        throw new Error(`Active Piper package ${resourcePackage.id} has invalid file bytes`);
      }
      if (!SHA_256_RE.test(file.sha256 || "")) {
        throw new Error(`Active Piper package ${resourcePackage.id} has an invalid SHA-256`);
      }
      totalBytes += file.bytes;
    }
    if (totalBytes !== resourcePackage.totalBytes) {
      throw new Error(`Active Piper package ${resourcePackage.id} total bytes do not match files`);
    }
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
