import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const runGit = (args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const runGitOptional = (args) => {
  try {
    return runGit(args);
  } catch {
    return "";
  }
};
const candidates = runGit(["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
  .split("\0")
  .filter(Boolean);

const forbiddenPaths = [
  /(^|\/)\.env(?:\.|$)/i,
  /(^|\/)\.vercel\//i,
  /(^|\/)supabase\/\.temp\//i,
  /(^|\/)\.claude\//i,
  /(^|\/)\.codex\//i,
  /(^|\/)\.agents\//i,
];
const secretRules = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["GitHub token", /gh[pousr]_[A-Za-z0-9_]{20,}/],
  ["OpenAI key", /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/],
  ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]{8,}/],
  ["AWS access key", /AKIA[0-9A-Z]{16}/],
  ["credentialed database URL", /postgres(?:ql)?:\/\/[^\s:'"]+:[^\s@'"]+@/i],
];
const allowedEmailDomains = new Set([
  "example.com",
  "example.test",
  "126.com",
  "shadow.wang",
  "users.noreply.github.com",
  "github.com",
]);
const findings = [];

for (const file of candidates) {
  if (forbiddenPaths.some((rule) => rule.test(file.replaceAll("\\", "/")))) {
    findings.push(`${file}: forbidden tracked path`);
    continue;
  }
  const data = await readFile(file).catch(() => null);
  if (!data || data.includes(0)) continue;
  const source = data.toString("utf8");
  for (const [label, rule] of secretRules) {
    if (rule.test(source)) findings.push(`${file}: possible ${label}`);
  }
  for (const match of source.matchAll(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/gi)) {
    if (!allowedEmailDomains.has(match[1].toLowerCase())) {
      findings.push(`${file}: non-example email address`);
    }
  }
}

const localDenylist = await readFile(".security-local-denylist", "utf8").catch(() => "");
for (const term of localDenylist.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
  const needle = term.toLowerCase();
  for (const file of candidates) {
    const data = await readFile(file).catch(() => null);
    if (!data || data.includes(0)) continue;
    if (file.toLowerCase().includes(needle) || data.toString("utf8").toLowerCase().includes(needle)) {
      findings.push(`${file}: matches private local denylist (${createHash("sha256").update(needle).digest("hex").slice(0, 12)})`);
    }
  }
}

const configuredEmail = runGitOptional(["config", "--get", "user.email"]);
if (configuredEmail && !configuredEmail.endsWith("@users.noreply.github.com")) {
  findings.push("git config user.email must use the GitHub noreply address");
}

if (process.env.SECURITY_CHECK_HISTORY === "1") {
  const isGitHubNoreply = (email) =>
    email.endsWith("@users.noreply.github.com") || email === "noreply@github.com";
  const historyEmails = runGit(["log", "HEAD", "--format=%ae%n%ce"])
    .split(/\r?\n/)
    .filter(Boolean);
  for (const email of historyEmails) {
    if (!isGitHubNoreply(email)) {
      findings.push("Git history contains a non-noreply author or committer email");
      break;
    }
  }
}

if (findings.length) {
  throw new Error(`Security checks failed:\n- ${[...new Set(findings)].join("\n- ")}`);
}

console.log("Security checks passed.");
