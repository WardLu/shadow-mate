import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyPaths, selectScope } from "../../scripts/ci-scope.mjs";
import { validateGate } from "../../scripts/ci-scope-gate.mjs";

const base = "a".repeat(40);
const head = "b".repeat(40);
const merge = "c".repeat(40);
const repository = "WardLu/shadow-mate";

function gitFor(paths, { checkedSha = merge, parents = `${merge} ${base} ${head}`, fail = "" } = {}) {
  return (args) => {
    if (args[0] === fail) throw new Error("git query unavailable");
    if (args[0] === "rev-parse") return `${checkedSha}\n`;
    if (args[0] === "rev-list") return `${parents}\n`;
    if (args[0] === "merge-base") return "";
    if (args[0] === "diff") return `${paths.join("\0")}\0`;
    throw new Error(`unexpected git command: ${args[0]}`);
  };
}

const prEvent = {
  pull_request: {
    base: { sha: base },
    head: { sha: head, repo: { full_name: repository } },
  },
};

test("PR classification uses the checked merge SHA and its exact parents", () => {
  const scope = selectScope({
    eventName: "pull_request", event: prEvent, expectedSha: merge, repository,
    git: gitFor(["README.md"]),
  });
  assert.equal(scope.mode, "docs");
  assert.equal(scope.checkedSha, merge);
  assert.equal(scope.releaseContracts, false);
});

test("PR head, unexpected merge parents, and fork evidence run the full route", () => {
  const input = { eventName: "pull_request", event: prEvent, repository };
  assert.equal(selectScope({ ...input, expectedSha: head, git: gitFor(["README.md"]) }).mode, "full");
  assert.equal(selectScope({ ...input, expectedSha: merge,
    git: gitFor(["README.md"], { parents: `${merge} ${head} ${base}` }) }).mode, "full");
  assert.equal(selectScope({ ...input, expectedSha: merge,
    event: { pull_request: { ...prEvent.pull_request,
      head: { ...prEvent.pull_request.head, repo: { full_name: "someone/else" } } } },
    git: gitFor(["README.md"]) }).mode, "full");
});

test("direct push remains checked and new application SHA gets the full route", () => {
  const scope = selectScope({
    eventName: "push", event: { before: base, after: merge }, expectedSha: merge, repository,
    git: gitFor(["src/app.js"]),
  });
  assert.equal(scope.mode, "full");
  assert.equal(scope.checkedSha, merge);
  const docs = selectScope({
    eventName: "push", event: { before: base, after: merge }, expectedSha: merge, repository,
    git: gitFor(["README.md"]),
  });
  assert.equal(docs.mode, "docs");
});

test("release-only files run release contracts; mixed application edits run full checks", () => {
  assert.deepEqual(classifyPaths(["README.md", "scripts/release/deploy-production.sh", "vercel.json"], merge), {
    mode: "release", releaseContracts: true, checkedSha: merge, reason: "release_only",
  });
  const mixed = classifyPaths(["scripts/release/deploy-production.sh", "src/app.js"], merge);
  assert.equal(mixed.mode, "full");
  assert.equal(mixed.releaseContracts, true);
});

test("unknown paths, empty ranges, missing event data, and Git failures fail closed", () => {
  assert.equal(classifyPaths(["package-lock.json"], merge).mode, "full");
  assert.equal(classifyPaths(["docs/helper.js"], merge).mode, "full");
  assert.equal(classifyPaths([], merge).mode, "full");
  const push = { eventName: "push", event: { before: base, after: merge }, expectedSha: merge, repository };
  assert.equal(selectScope({ ...push, event: { before: "0".repeat(40), after: merge }, git: gitFor(["README.md"]) }).mode, "full");
  const failed = selectScope({ ...push, git: gitFor(["README.md"], { fail: "diff" }) });
  assert.equal(failed.mode, "full");
  assert.equal(failed.releaseContracts, true);
  assert.equal(selectScope({ ...push, git: gitFor(["README.md"], { fail: "merge-base" }) }).mode, "full");
});

test("required check fails when a selected step is skipped, missing, or failed", () => {
  const ids = [
    "checkout", "scope", "lockfile", "node", "install", "ci_scope_tests",
    "source", "release_metadata", "audit",
    "release_contracts", "supabase_start", "supabase_config", "db_tests", "db_lint",
    "function_serve", "function_tests", "browsers", "desktop_e2e", "mobile_e2e",
  ];
  const steps = Object.fromEntries(ids.map((id) => [id, { outcome: "success" }]));
  assert.doesNotThrow(() => validateGate({ mode: "full", releaseContracts: "true", steps }));
  assert.throws(() => validateGate({ mode: "full", releaseContracts: "true",
    steps: { ...steps, db_tests: { outcome: "skipped" } } }), /db_tests/);
  assert.throws(() => validateGate({ mode: "release", releaseContracts: "true",
    steps: { ...steps, release_contracts: { outcome: "failure" } } }), /release_contracts/);
  assert.throws(() => validateGate({ mode: "docs", releaseContracts: "false",
    steps: { ...steps, audit: undefined } }), /audit/);
  assert.throws(() => validateGate({ mode: "", releaseContracts: "false", steps }), /Invalid/);
});

test("renaming application code into docs cannot take the docs route", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "mate-ci-scope-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (args) => execFileSync("git", ["-C", directory, ...args], { encoding: "utf8" });
  git(["init", "-q"]);
  git(["config", "user.name", "CI Fixture"]);
  git(["config", "user.email", "ci@example.test"]);
  mkdirSync(join(directory, "src"));
  writeFileSync(join(directory, "src", "app.js"), "same content\n");
  git(["add", "."]);
  git(["commit", "-qm", "add application file"]);
  const before = git(["rev-parse", "HEAD"]).trim();
  mkdirSync(join(directory, "docs"));
  git(["mv", "src/app.js", "docs/app.md"]);
  git(["commit", "-qm", "rename application file"]);
  const after = git(["rev-parse", "HEAD"]).trim();

  const scope = selectScope({
    eventName: "push", event: { before, after }, expectedSha: after, repository, git,
  });
  assert.equal(scope.mode, "full");
});
