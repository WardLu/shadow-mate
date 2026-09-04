import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  getPiperResourcePackage,
  isActivePiperCdnVoicePackage,
  listActivePiperCdnVoicePackages,
} from "../src/piper-resource-registry.js";

const REQUIRED_CORS_METHODS = ["GET", "HEAD", "OPTIONS"];
const REQUIRED_CORS_EXPOSE_HEADERS = ["CONTENT-LENGTH", "CONTENT-RANGE", "ACCEPT-RANGES", "ETAG"];
const ALLOWED_CORS_ORIGINS = new Set(["*", "https://preview-sm.shadow.wang", "https://sm.shadow.wang"]);

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!flag.startsWith("--")) fail(`Unexpected argument: ${flag}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`Missing value for ${flag}`);
    if (values.has(flag)) fail(`Duplicate argument: ${flag}`);
    values.set(flag, value);
    index += 1;
  }
  const unknown = [...values.keys()].filter((flag) => !["--base-url", "--package"].includes(flag));
  if (unknown.length) fail(`Unsupported argument: ${unknown[0]}`);
  const baseUrl = values.get("--base-url");
  const packageId = values.get("--package") || null;
  if (!baseUrl) fail("Usage: node scripts/piper-resource-smoke.mjs --base-url <url> [--package <package-id>]");
  return { baseUrl: baseUrl.replace(/\/+$/, ""), packageId };
}

function assertSuccess(response, phase, url) {
  if (!response.ok) fail(`${phase} ${url} returned HTTP ${response.status}`);
}

function assertContentLength(response, expectedBytes, phase, url) {
  const actual = Number(response.headers.get("content-length"));
  if (!Number.isSafeInteger(actual) || actual !== expectedBytes) {
    fail(`${phase} ${url} Content-Length ${response.headers.get("content-length") ?? "missing"} does not match ${expectedBytes}`);
  }
  return actual;
}

function assertContentType(response, expected, phase, url) {
  const actual = response.headers.get("content-type") || "";
  if (!actual.toLowerCase().startsWith(expected.toLowerCase())) {
    fail(`${phase} ${url} Content-Type ${actual || "missing"} does not match ${expected}`);
  }
  return actual;
}

export function assertCors(response, phase, url) {
  const allowedOrigin = (response.headers.get("access-control-allow-origin") || "").trim();
  if (!ALLOWED_CORS_ORIGINS.has(allowedOrigin)) {
    fail(`${phase} ${url} Access-Control-Allow-Origin ${allowedOrigin || "missing"} is not an allowed Preview/product origin`);
  }
  const methods = (response.headers.get("access-control-allow-methods") || "")
    .split(",")
    .map((method) => method.trim().toUpperCase())
    .filter(Boolean);
  const missing = REQUIRED_CORS_METHODS.filter((method) => !methods.includes(method));
  if (missing.length) {
    fail(`${phase} ${url} Access-Control-Allow-Methods is missing ${missing.join(", ")}`);
  }
  const exposedHeaders = (response.headers.get("access-control-expose-headers") || "")
    .split(",")
    .map((header) => header.trim().toUpperCase())
    .filter(Boolean);
  const missingExposedHeaders = REQUIRED_CORS_EXPOSE_HEADERS.filter((header) => !exposedHeaders.includes(header));
  if (missingExposedHeaders.length) {
    fail(`${phase} ${url} Access-Control-Expose-Headers is missing ${missingExposedHeaders.join(", ")}`);
  }
  return { allowedOrigin, allowedMethods: methods, exposedHeaders };
}

async function inspectFile(resourcePackage, file) {
  const url = `${resourcePackage.baseUrl}${file.suffix}`;
  const requestOptions = { headers: { Origin: "https://preview-sm.shadow.wang" } };
  const head = await fetch(url, { ...requestOptions, method: "HEAD" });
  assertSuccess(head, "HEAD", url);
  const headContentLength = assertContentLength(head, file.bytes, "HEAD", url);
  const headContentType = assertContentType(head, file.contentType, "HEAD", url);
  const headCors = assertCors(head, "HEAD", url);

  const get = await fetch(url, requestOptions);
  assertSuccess(get, "GET", url);
  const getContentLength = assertContentLength(get, file.bytes, "GET", url);
  const getContentType = assertContentType(get, file.contentType, "GET", url);
  const getCors = assertCors(get, "GET", url);
  if (!get.body || typeof get.body.getReader !== "function") fail(`GET ${url} did not expose a readable response stream`);
  const hash = createHash("sha256");
  const reader = get.body.getReader();
  let actualBytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    hash.update(value);
    actualBytes += value.byteLength;
  }
  const sha256 = hash.digest("hex");
  if (actualBytes !== file.bytes) fail(`GET ${url} returned ${actualBytes} bytes, expected ${file.bytes}`);
  if (sha256 !== file.sha256.toLowerCase()) fail(`GET ${url} SHA-256 ${sha256} does not match registry`);

  return {
    key: file.key,
    url,
    expectedBytes: file.bytes,
    actualBytes,
    sha256,
    head: { contentLength: headContentLength, contentType: headContentType, cors: headCors },
    get: { contentLength: getContentLength, contentType: getContentType, cors: getCors },
  };
}

export function assertApprovedCdnPackage(resourcePackage) {
  if (!isActivePiperCdnVoicePackage(resourcePackage)) {
    fail(`Piper package ${resourcePackage?.id || "unknown"} is not an approved CDN user-download package`);
  }
  if (resourcePackage.licenseStatus !== "approved"
    || resourcePackage.license?.status !== "approved"
    || resourcePackage.provenance?.status !== "verified"
    || resourcePackage.distribution?.status !== "approved") {
    fail(`Piper package ${resourcePackage.id} has no approved license, provenance, or distribution metadata`);
  }
}

async function inspectPackage(baseUrl, resourcePackage) {
  assertApprovedCdnPackage(resourcePackage);
  if (resourcePackage.baseUrl !== baseUrl) {
    fail(`Registry URL ${resourcePackage.baseUrl ?? "missing"} does not match --base-url ${baseUrl}`);
  }
  if (!resourcePackage.files.length) fail(`Piper package ${resourcePackage.id} has no registered files`);

  const files = [];
  for (const file of resourcePackage.files) files.push(await inspectFile(resourcePackage, file));
  const totalBytes = files.reduce((total, file) => total + file.actualBytes, 0);
  if (totalBytes !== resourcePackage.totalBytes) {
    fail(`Package ${resourcePackage.id} returned ${totalBytes} bytes, expected registry total ${resourcePackage.totalBytes}`);
  }
  return { package: resourcePackage.id, baseUrl, totalBytes, files };
}

async function main() {
  const { baseUrl, packageId } = parseArgs(process.argv.slice(2));
  const packages = packageId
    ? [getPiperResourcePackage(packageId)]
    : listActivePiperCdnVoicePackages();
  if (packages.some((resourcePackage) => !resourcePackage)) fail(`Unknown Piper resource package: ${packageId}`);
  if (packages.length === 0) fail("Registry has no active Piper CDN voice packages to inspect");
  const results = [];
  for (const resourcePackage of packages) results.push(await inspectPackage(baseUrl, resourcePackage));
  console.log(JSON.stringify(packageId ? results[0] : { packages: results }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Piper resource smoke failed: ${error.message}`);
    process.exitCode = 1;
  });
}
