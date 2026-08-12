import { createHash } from "node:crypto";

const normalize = (value) => value.replaceAll("\\", "/");
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function collectReleaseFindings(metadata) {
  const findings = [];
  let packageJson;
  let packageLock;

  try {
    packageJson = JSON.parse(metadata.packageJson);
  } catch {
    findings.push("package.json is not valid JSON");
  }
  try {
    packageLock = JSON.parse(metadata.packageLock);
  } catch {
    findings.push("package-lock.json is not valid JSON");
  }

  const version = packageJson?.version;
  if (!version || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    findings.push("package.json must contain a valid semver version");
    return findings;
  }

  const expectedTag = `v${version}`;
  const lockVersions = [packageLock?.version, packageLock?.packages?.[""]?.version].filter(Boolean);
  if (!packageLock?.version || lockVersions.some((lockVersion) => lockVersion !== version)) {
    findings.push("package.json and package-lock.json versions must match");
  }
  if (metadata.tag && metadata.tag !== expectedTag) {
    findings.push(`release tag ${metadata.tag} must match package version ${expectedTag}`);
  }

  if (!new RegExp(`\\bv${escapeRegExp(version)}\\b`).test(metadata.readme || "")) {
    findings.push(`README.md must mention ${expectedTag}`);
  }
  if (!new RegExp(`^## \\[${escapeRegExp(version)}\\]\\s`, "m").test(metadata.changelog || "")) {
    findings.push(`CHANGELOG.md must contain the ${version} release heading`);
  }
  if (!new RegExp(`^## v${escapeRegExp(version)}\\s`, "m").test(metadata.releaseNotes || "")) {
    findings.push(`RELEASE_NOTES.md must contain the ${expectedTag} release heading`);
  }
  if (metadata.requireDeploymentChecklist && !getLatestReleaseSection(metadata.releaseNotes || "").includes("部署清单")) {
    findings.push("RELEASE_NOTES.md latest release section must contain a 部署清单");
  }

  return findings;
}

export function getLatestReleaseSection(text) {
  const start = text.search(/^##\s+(?:v\d|\[\d)/m);
  if (start < 0) return "";
  const next = text.slice(start + 3).search(/^##\s+/m);
  return next < 0 ? text.slice(start) : text.slice(start, start + 3 + next);
}

export function scanReleaseEntries(entries) {
  const findings = [];
  const forbiddenPath = /(^|\/)(?:internal|private|legal|commercial|finance|billing|entitlement|secrets?|customer|user-data|exports?|production|prod|\.git|node_modules)(?:\/|$)|(^|\/)(?:\.env|\.vercel|\.supabase|\.codex|\.agents|\.claude)(?:[/.]|$)|(^|\/)(?:ROADMAP|TODO)(?:\.[^/]*)?$/i;
  const secretRules = [
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
    /(?:sk-(?:proj-)?|gh[pousr]_)[A-Za-z0-9_-]{12,}/,
    /sb_secret_[A-Za-z0-9_-]{8,}/,
    /postgres(?:ql)?:\/\/[^\s:'"]+:[^\s@'"]+@/i,
  ];

  for (const entry of entries) {
    const name = normalize(entry.name);
    if (forbiddenPath.test(name)) {
      findings.push(`${name}: forbidden release path`);
      continue;
    }
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data ?? "");
    if (data.includes(0)) continue;
    const source = data.toString("utf8");
    if (secretRules.some((rule) => rule.test(source))) {
      findings.push(`${name}: possible secret or credential`);
    }
  }

  return [...new Set(findings)];
}

export function verifyThirdPartyNotices({ files, notices, vendoredPaths }) {
  const findings = [];
  const fileMap = new Map(files.map((file) => [normalize(file.name), file]));
  for (const rawPath of vendoredPaths) {
    const path = normalize(rawPath);
    const file = fileMap.get(path);
    if (!file) {
      findings.push(`${path}: vendored release asset is missing`);
      continue;
    }
    const hash = createHash("sha256").update(file.data).digest("hex");
    if (!notices.includes(path) || !notices.toLowerCase().includes(hash)) {
      findings.push(`${path}: THIRD_PARTY_NOTICES.md hash does not match the release asset`);
    }
  }
  return findings;
}
