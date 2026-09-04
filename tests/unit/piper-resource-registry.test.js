import { describe, expect, it } from "vitest";
import {
  getPiperResourcePackage,
  isActivePiperCdnVoicePackage,
  listActivePiperCdnVoicePackages,
  listRetiredPiperCdnVoicePackages,
  resolvePiperResourceFileUrl,
  validatePiperResourcePackages,
} from "../../src/piper-resource-registry.js";

const RUNTIME_FILES = [
  ["/piper-tts-web.js", 46656168, "c35588fad691ed023215f0194e0fb0e816b9a9766d3d2669dd49d4ea2fffd712"],
  ["/onnx/ort-wasm-simd-threaded.wasm", 11246032, "207d02be4591c156b0a98f024f3d58005b5b04c92274d759fb390338c63559ea"],
  ["/piper/piper_phonemize.wasm", 629166, "2189e43490744c95445e251c38a47063f2ca266bcc30bbb18f692c47ff2bfd23"],
  ["/piper/piper_phonemize.data", 18077249, "a9879123581336fc36ae3706ae81c9e67becc388b80b8a4943cef2a78542e6aa"],
  ["/sherpa-onnx/sherpa-onnx-wasm-main-tts.js", 143833, "2f7d50fe6991982a4bcc8dd938d63de6edbb3f2b971e383e8986331ca5fcb311"],
  ["/sherpa-onnx/sherpa-onnx-tts.js", 32010, "d0febb99e78c8322eb7dbda12e90a1b473de8a7d65f016a146576fbdadbf266a"],
  ["/sherpa-onnx/sherpa-onnx-tts.worker.js", 2057, "e6274d02b08ca502ae910cdbd3084cda557ee52a12bc020a96187af43a0dd4ca"],
];

function bundledRuntimeFixture() {
  return structuredClone(getPiperResourcePackage("piper-browser-runtime"));
}

describe("bundled Piper runtime registry", () => {
  it("accepts the audited runtime and retains all bundled file fingerprints", () => {
    const runtime = bundledRuntimeFixture();

    expect(() => validatePiperResourcePackages([runtime])).not.toThrow();
    expect(runtime.files.map(({ url, bytes, sha256 }) => [url, bytes, sha256])).toEqual(RUNTIME_FILES);
  });

  it("rejects a bundled app-shell runtime without audit when release approval is false", () => {
    const runtime = bundledRuntimeFixture();
    runtime.releaseApproved = false;
    delete runtime.audit;

    expect(() => validatePiperResourcePackages([runtime])).toThrow(/audit/i);
  });

  it("retains the retired Chinese-English Matcha package for explicit cache cleanup", () => {
    const voice = structuredClone(getPiperResourcePackage("matcha-icefall-zh-en-1.13.2"));

    expect(() => validatePiperResourcePackages([voice])).not.toThrow();
    expect(isActivePiperCdnVoicePackage(voice)).toBe(false);
    expect(voice).toMatchObject({
      id: "matcha-icefall-zh-en-1.13.2",
      locale: "zh-CN + en-US",
      locales: ["zh-CN", "en-US"],
      engine: "sherpa-onnx-matcha",
      version: "1",
      baseUrl: "https://voice.shadow.wang/sherpa-onnx/1.13.2/matcha-icefall-zh-en/sherpa-onnx-wasm-main-tts",
      totalBytes: 162111773,
      releaseApproved: false,
      lifecycle: "retired",
      licenseStatus: "approved",
      provenance: { status: "verified" },
      distribution: { status: "approved", channel: "public-cdn" },
    });
    expect(voice.files.map(({ suffix, url, bytes, sha256 }) => [suffix, url, bytes, sha256])).toEqual([
      [".data", undefined, 149228019, "3a00cfc82ddf39a2e798e63fad038e2c56f10aa4b7b952a0c98db758d119c14c"],
      [".wasm", "https://voice.shadow.wang/sherpa-onnx/1.13.2-mobile-256/matcha-icefall-zh-en/sherpa-onnx-wasm-main-tts.wasm", 12883754, "ff161b9927ca92164930fe564476ee32edaf8ec460b94df2353af7333754119e"],
    ]);
    expect(isActivePiperCdnVoicePackage(getPiperResourcePackage("zh_CN-chaowen-medium"))).toBe(false);
    expect(isActivePiperCdnVoicePackage(getPiperResourcePackage("en_US-ljspeech-medium"))).toBe(false);
    expect(listActivePiperCdnVoicePackages()).toEqual([]);
    expect(listRetiredPiperCdnVoicePackages().map(({ id }) => id)).toContain("matcha-icefall-zh-en-1.13.2");
  });

  it("resolves an immutable per-file URL without moving unchanged package files", () => {
    const voice = structuredClone(getPiperResourcePackage("matcha-icefall-zh-en-1.13.2"));
    const [data, wasm] = voice.files;
    wasm.url = "https://voice.shadow.wang/sherpa-onnx/1.13.2-mobile-256/matcha-icefall-zh-en/sherpa-onnx-wasm-main-tts.wasm";

    expect(resolvePiperResourceFileUrl(voice, data)).toBe(`${voice.baseUrl}.data`);
    expect(resolvePiperResourceFileUrl(voice, wasm)).toBe(wasm.url);
  });

  it("rejects a bundled runtime component without a fixed source commit", () => {
    const runtime = bundledRuntimeFixture();
    delete runtime.audit?.components?.[0]?.commit;

    expect(() => validatePiperResourcePackages([runtime])).toThrow(/commit/i);
  });

  it("rejects a bundled runtime component without a commit-pinned source reference", () => {
    const runtime = bundledRuntimeFixture();
    if (runtime.audit?.components?.[0]) {
      runtime.audit.components[0].source = "https://github.com/Poket-Jony/piper-tts-web";
    }

    expect(() => validatePiperResourcePackages([runtime])).toThrow(/reference/i);
  });

  it("rejects a bundled runtime component without concrete redistribution terms", () => {
    const runtime = bundledRuntimeFixture();
    delete runtime.audit?.components?.[0]?.redistributionTerms;

    expect(() => validatePiperResourcePackages([runtime])).toThrow(/redistribution/i);
  });

  it("rejects an audit that omits or adds a required component", () => {
    const missing = bundledRuntimeFixture();
    missing.audit.components = missing.audit.components.slice(0, 1);
    expect(() => validatePiperResourcePackages([missing])).toThrow(/component set/i);

    const extra = bundledRuntimeFixture();
    extra.audit.components.push({ ...extra.audit.components[0], name: "unreviewed-runtime" });
    expect(() => validatePiperResourcePackages([extra])).toThrow(/component set/i);
  });

  it("rejects mutable versions and arbitrary commits instead of accepting their shape", () => {
    const latest = bundledRuntimeFixture();
    latest.audit.components[0].version = "latest";
    expect(() => validatePiperResourcePackages([latest])).toThrow(/version/i);

    const wrongCommit = bundledRuntimeFixture();
    wrongCommit.audit.components[0].commit = "a".repeat(40);
    expect(() => validatePiperResourcePackages([wrongCommit])).toThrow(/commit/i);
  });

  it("rejects unexpected source and license URLs even when they contain a commit", () => {
    const runtime = bundledRuntimeFixture();
    const component = runtime.audit.components[0];
    component.source = `https://example.test/${component.commit}`;
    component.licenseUrl = `https://example.test/${component.commit}/LICENSE`;

    expect(() => validatePiperResourcePackages([runtime])).toThrow(/reference/i);
  });

  it("rejects an unapproved license, missing local license text, and trivial terms", () => {
    const unapproved = bundledRuntimeFixture();
    unapproved.audit.components[0].license = { status: "pending", name: "MIT" };
    expect(() => validatePiperResourcePackages([unapproved])).toThrow(/license/i);

    const missingText = bundledRuntimeFixture();
    missingText.audit.components[0].licenseTextPaths = [];
    expect(() => validatePiperResourcePackages([missingText])).toThrow(/license text/i);

    const trivialTerms = bundledRuntimeFixture();
    trivialTerms.audit.components[0].redistributionTerms = "x";
    expect(() => validatePiperResourcePackages([trivialTerms])).toThrow(/redistribution/i);
  });
});
