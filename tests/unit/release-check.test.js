import { describe, expect, it } from "vitest";
import {
  collectReleaseFindings,
  scanReleaseEntries,
  verifyThirdPartyNotices,
} from "../../scripts/release-check-lib.mjs";

const validMetadata = {
  packageJson: JSON.stringify({ version: "1.3.4" }),
  packageLock: JSON.stringify({ version: "1.3.4", packages: { "": { version: "1.3.4" } } }),
  readme: "<code>v1.3.4</code>",
  changelog: "## [1.3.4] - 2026-08-10\n",
  releaseNotes: "## v1.3.4 - 2026-08-10\n\n### 部署清单\n",
};

describe("collectReleaseFindings", () => {
  it("accepts consistent release metadata", () => {
    expect(collectReleaseFindings(validMetadata)).toEqual([]);
  });

  it("rejects a tag or document that does not match package version", () => {
    const findings = collectReleaseFindings({ ...validMetadata, tag: "v1.3.5" });
    expect(findings).toEqual(expect.arrayContaining([
      "release tag v1.3.5 must match package version v1.3.4",
    ]));
  });
});

describe("scanReleaseEntries", () => {
  it("rejects internal paths and credentials in a final artifact", () => {
    const findings = scanReleaseEntries([
      { name: "docs/internal/plan.md", data: "private plan" },
      { name: "config.js", data: `const key = '${["sk-proj-", "123456789012345"].join("")}';` },
    ]);
    expect(findings).toEqual(expect.arrayContaining([
      "docs/internal/plan.md: forbidden release path",
      "config.js: possible secret or credential",
    ]));
  });
});

describe("verifyThirdPartyNotices", () => {
  it("requires every vendored asset to have a matching notice and hash", () => {
    const findings = verifyThirdPartyNotices({
      files: [{ name: "public/model.bin", data: "model" }],
      notices: "| public/model.bin | deadbeef |",
      vendoredPaths: ["public/model.bin"],
    });
    expect(findings).toEqual([
      "public/model.bin: THIRD_PARTY_NOTICES.md hash does not match the release asset",
    ]);
  });

  it("passes when the notice contains the asset path and SHA-256", async () => {
    const { createHash } = await import("node:crypto");
    const data = "model";
    const hash = createHash("sha256").update(data).digest("hex");
    expect(verifyThirdPartyNotices({
      files: [{ name: "public/model.bin", data }],
      notices: `| public/model.bin | ${hash} |`,
      vendoredPaths: ["public/model.bin"],
    })).toEqual([]);
  });
});
