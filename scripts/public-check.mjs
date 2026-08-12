import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const runGit = (args) => execFileSync("git", args, { encoding: "utf8" });
const staged = runGit(["diff", "--cached", "--name-only", "--diff-filter=ACMRTUXB", "-z"])
  .split("\0")
  .filter(Boolean);
const candidates = runGit(["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
  .split("\0")
  .filter(Boolean);

const forbiddenPaths = [
  /(^|\/)(?:ROADMAP|TODO)(?:\.[^/]*)?$/i,
  /(^|\/)(?:internal|private|legal|commercial|finance|billing|entitlement|secrets?)(?:[-_][^/]*)?\//i,
  /(^|\/)(?:auth-setup|security-baseline|test-scope|architecture-internal)\.md$/i,
  /(^|\/)(?:child-privacy-and-consent|ip-legal-review|dogfooding-checklist|tts-decision|piper-ljspeech-model-card)\.md$/i,
  /(^|\/)(?:\.env|\.vercel|\.supabase|\.codex|\.agents|\.claude)(?:\/|\.|$)/i,
  /(^|\/)(?:production|prod|customer|user-data|exports?)(?:[-_][^/]*)?\.(?:csv|json|sql|dump|db|sqlite|zip)$/i,
];

const forbiddenTerms = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  /(?:sk-(?:proj-)?|gh[pousr]_)[A-Za-z0-9_-]{12,}/,
  /sb_secret_[A-Za-z0-9_-]{8,}/,
  /postgres(?:ql)?:\/\/[^\s:'"]+:[^\s@'"]+@/i,
];

const findings = [];
for (const file of candidates) {
  if (forbiddenPaths.some((rule) => rule.test(file.replaceAll("\\", "/")))) {
    findings.push(`${file}: path is not allowed in the public repository`);
    continue;
  }
  const data = await readFile(file).catch(() => null);
  if (!data || data.includes(0)) continue;
  const source = data.toString("utf8");
  for (const rule of forbiddenTerms) {
    if (rule.test(source)) findings.push(`${file}: possible secret or credential`);
  }
}

if (findings.length) {
  throw new Error(`Public repository check failed:\n- ${[...new Set(findings)].join("\n- ")}`);
}

console.log(`Public repository check passed (${staged.length} staged paths, ${candidates.length} candidate paths).`);
