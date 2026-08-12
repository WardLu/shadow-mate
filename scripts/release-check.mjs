import { readFile } from "node:fs/promises";

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSection(version, text, { tagged = false } = {}) {
	const versionPattern = tagged ? `v${escapeRegExp(version)}` : `\\[?${escapeRegExp(version)}\\]?`;
	const heading = new RegExp(`^##\\s+${versionPattern}(?:\\s|$)[^\\n]*$`, "m");
	const match = heading.exec(text);
	if (!match) return null;
	const contentStart = match.index + match[0].length;
	const rest = text.slice(contentStart);
	const nextHeading = rest.search(/^##\s+/m);
	const end = nextHeading === -1 ? text.length : contentStart + nextHeading;
	return text.slice(match.index, end).trim();
}

export function validateReleaseMetadata({ packageJson, packageLock, changelog, releaseNotes, releaseTag = "" }) {
	const version = packageJson.version;
	const lockVersions = [packageLock.version, packageLock.packages?.[""]?.version];
	if (lockVersions.some((lockVersion) => lockVersion !== version)) {
		throw new Error("package.json 与 package-lock.json 的版本号不一致");
	}
	if (releaseTag && releaseTag !== `v${version}`) throw new Error(`Release Tag ${releaseTag} 必须匹配 v${version}`);

	const changelogSection = extractSection(version, changelog);
	if (!changelogSection) throw new Error(`CHANGELOG.md 缺少版本 ${version} 的发布说明`);
	const notesSection = extractSection(version, releaseNotes, { tagged: true });
	if (!notesSection) throw new Error(`RELEASE_NOTES.md 缺少 v${version} 的发布说明`);
	const body = notesSection.replace(/^##[^\n]+\n?/, "").trim();
	if (!body) throw new Error(`v${version} 的 RELEASE_NOTES 为空`);
	if (/^Released on \d{4}-\d{2}-\d{2}$/i.test(body)) throw new Error("发布说明不能使用日期占位文案");
	if (body.length < 40) throw new Error(`v${version} 的发布说明过短`);
	return { version, tagName: `v${version}`, notes: notesSection };
}

export async function readReleaseMetadata(rootDir = process.cwd()) {
	const [packageJson, packageLock, changelog, releaseNotes] = await Promise.all([
		readFile(`${rootDir}/package.json`, "utf8").then(JSON.parse),
		readFile(`${rootDir}/package-lock.json`, "utf8").then(JSON.parse),
		readFile(`${rootDir}/CHANGELOG.md`, "utf8"),
		readFile(`${rootDir}/RELEASE_NOTES.md`, "utf8"),
	]);
	return validateReleaseMetadata({ packageJson, packageLock, changelog, releaseNotes, releaseTag: process.env.RELEASE_TAG || "" });
}

if (import.meta.url === `file://${process.argv[1]}`) {
	try {
		const metadata = await readReleaseMetadata();
		console.log(`Release metadata validated for ${metadata.tagName}`);
	} catch (error) {
		console.error(`Release metadata validation failed: ${error.message}`);
		process.exitCode = 1;
	}
}
