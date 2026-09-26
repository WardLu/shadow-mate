import { appendFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SHA = /^[0-9a-f]{40}$/;
const documentationFiles = new Set([
  "README.md",
  "README.zh-CN.md",
  "CHANGELOG.md",
  "RELEASE_NOTES.md",
  "PRIVACY.md",
]);
const releaseFiles = new Set([
  "config/release-production.json",
  "release-gate.config.json",
  "vercel.json",
]);

export function isReleaseFile(path) {
  return releaseFiles.has(path)
    || path.startsWith("scripts/release/")
    || path.startsWith("tests/release/contracts/");
}

function isDocumentationFile(path) {
  return documentationFiles.has(path) || (path.startsWith("docs/") && path.endsWith(".md"));
}

function full(reason, checkedSha = "") {
  return { mode: "full", releaseContracts: true, checkedSha, reason };
}

export function classifyPaths(paths, checkedSha) {
  if (paths.length === 0) return full("empty_diff", checkedSha);
  const releaseContracts = paths.some(isReleaseFile);
  if (paths.every(isDocumentationFile)) {
    return { mode: "docs", releaseContracts: false, checkedSha, reason: "documentation_only" };
  }
  if (paths.every((path) => isDocumentationFile(path) || isReleaseFile(path))) {
    return { mode: "release", releaseContracts, checkedSha, reason: "release_only" };
  }
  return { mode: "full", releaseContracts, checkedSha, reason: "application_or_unknown_path" };
}

function defaultGit(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

export function selectScope({ eventName, event, expectedSha, repository, git = defaultGit }) {
  let checkedSha = "";
  try {
    checkedSha = git(["rev-parse", "HEAD"]).trim();
    if (!SHA.test(checkedSha) || checkedSha !== expectedSha) {
      return full("checkout_sha_mismatch", checkedSha);
    }

    let baseSha;
    if (eventName === "pull_request") {
      const pr = event?.pull_request;
      if (pr?.head?.repo?.full_name !== repository) return full("fork_or_unknown_pr", checkedSha);
      const parents = git(["rev-list", "--parents", "-n", "1", checkedSha]).trim().split(/\s+/);
      if (parents.length !== 3 || parents[0] !== checkedSha
        || parents[1] !== pr?.base?.sha || parents[2] !== pr?.head?.sha) {
        return full("pr_merge_parent_mismatch", checkedSha);
      }
      baseSha = parents[1];
    } else if (eventName === "push") {
      baseSha = event?.before;
      if (event?.after !== checkedSha || !SHA.test(baseSha || "") || /^0+$/.test(baseSha)) {
        return full("push_range_unavailable", checkedSha);
      }
      git(["merge-base", "--is-ancestor", baseSha, checkedSha]);
    } else {
      return full("unsupported_event", checkedSha);
    }

    // A rename from application code into docs must report both paths.
    const changed = git(["diff", "--no-renames", "--name-only", "-z", baseSha, checkedSha, "--"])
      .split("\0").filter(Boolean);
    return classifyPaths(changed, checkedSha);
  } catch {
    return full("git_or_event_query_failed", checkedSha);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let event;
  try {
    event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  } catch {
    event = null;
  }
  const scope = selectScope({
    eventName: process.env.GITHUB_EVENT_NAME,
    event,
    expectedSha: process.env.GITHUB_SHA,
    repository: process.env.GITHUB_REPOSITORY,
  });
  appendFileSync(process.env.GITHUB_OUTPUT,
    `mode=${scope.mode}\nrelease_contracts=${scope.releaseContracts}\nchecked_sha=${scope.checkedSha}\n`);
  console.log(`CI scope: ${scope.mode}; checked SHA: ${scope.checkedSha}; reason: ${scope.reason}`);
}
