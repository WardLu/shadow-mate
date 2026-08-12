import assert from "node:assert/strict";
import test from "node:test";
import { validateReleaseMetadata } from "../scripts/release-check.mjs";

const packageJson = { version: "1.2.3" };
const packageLock = { version: "1.2.3", packages: { "": { version: "1.2.3" } } };
const changelog = "## [1.2.3] - 2026-08-12\n\n### Fixed\n\n- 修复版本发布流程并增加元数据校验，保证 Tag 和发布说明可以追溯。";
const releaseNotes = "## v1.2.3 - 2026-08-12\n\n本版本修复发布流程，并补充部署清单与验证结果，避免发布页面出现日期占位正文，同时让 Tag、源码和最终发布内容保持一致。";

test("校验影伴的双份发布说明", () => {
	assert.equal(validateReleaseMetadata({ packageJson, packageLock, changelog, releaseNotes, releaseTag: "v1.2.3" }).tagName, "v1.2.3");
});

test("拒绝占位 Release Notes", () => {
	assert.throws(
		() => validateReleaseMetadata({ packageJson, packageLock, changelog, releaseNotes: "## v1.2.3\n\nReleased on 2026-08-12" }),
		/日期占位文案/,
	);
});
