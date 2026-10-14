import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs, verifyPreflight, getOrCreatePromotionPr, runPromote } from "../../scripts/release/promote-to-production.mjs";

const shaMain = "1".repeat(40);
const shaProd = "2".repeat(40);

test("parseArgs parses flags cleanly", () => {
  const options = parseArgs(["node", "promote.mjs", "--dry-run", "--deploy"]);
  assert.equal(options.dryRun, true);
  assert.equal(options.deploy, true);
  assert.equal(options.skipCiWait, false);
  assert.equal(options.help, false);

  assert.throws(() => parseArgs(["node", "promote.mjs", "--unknown"]), /未知参数/);
});

test("verifyPreflight rejects dirty worktree", () => {
  const git = (args) => {
    if (args[0] === "status") return "M src/app.js\n";
    throw new Error(`unexpected: ${args[0]}`);
  };
  assert.throws(() => verifyPreflight({ git }), /工作区不干净/);
});

test("verifyPreflight rejects non-main branch", () => {
  const git = (args) => {
    if (args[0] === "status") return "";
    if (args[0] === "symbolic-ref") return "feature/cool-stuff\n";
    throw new Error(`unexpected: ${args[0]}`);
  };
  assert.throws(() => verifyPreflight({ git }), /必须在 'main' 分支上执行/);
});

test("verifyPreflight rejects unpushed main commits", () => {
  const git = (args) => {
    if (args[0] === "status") return "";
    if (args[0] === "symbolic-ref") return "main\n";
    if (args[0] === "fetch") return "";
    if (args[0] === "rev-parse" && args[1] === "HEAD") return `${shaMain}\n`;
    if (args[0] === "rev-parse" && args[1] === "origin/main") return `${"3".repeat(40)}\n`;
    throw new Error(`unexpected: ${args[0]}`);
  };
  assert.throws(() => verifyPreflight({ git }), /与 origin\/main .* 不一致/);
});

test("verifyPreflight passes on clean, up-to-date main", () => {
  const git = (args) => {
    if (args[0] === "status") return "";
    if (args[0] === "symbolic-ref") return "main\n";
    if (args[0] === "fetch") return "";
    if (args[0] === "rev-parse" && args[1] === "HEAD") return `${shaMain}\n`;
    if (args[0] === "rev-parse" && args[1] === "origin/main") return `${shaMain}\n`;
    if (args[0] === "rev-parse" && args[1] === "origin/production") return `${shaProd}\n`;
    throw new Error(`unexpected: ${args[0]}`);
  };
  const { headSha, originProdSha } = verifyPreflight({ git });
  assert.equal(headSha, shaMain);
  assert.equal(originProdSha, shaProd);
});

test("runPromote early returns when production is already up to date", async () => {
  const git = (args) => {
    if (args[0] === "status") return "";
    if (args[0] === "symbolic-ref") return "main\n";
    if (args[0] === "fetch") return "";
    if (args[0] === "rev-parse") return `${shaMain}\n`;
    throw new Error(`unexpected: ${args[0]}`);
  };
  const exitCode = await runPromote({}, { git });
  assert.equal(exitCode, 0);
});

test("getOrCreatePromotionPr reuses existing PR if open", () => {
  const gh = (args) => {
    if (args[0] === "pr" && args[1] === "list") {
      return JSON.stringify([{ number: 180, url: "https://github.com/example/pr/180" }]);
    }
    throw new Error(`unexpected: ${args[0]}`);
  };
  const pr = getOrCreatePromotionPr({ headSha: shaMain, originProdSha: shaProd, gh });
  assert.equal(pr.number, 180);
});
