#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  buildIntegrationReport,
  formatIntegrationReport,
  parseAheadBehind,
  strictExitCode,
} from "./integration-check-lib.mjs";

function printHelp() {
  process.stdout.write([
    "用法:",
    "  node scripts/check-integration.mjs [--base <ref>] [--strict] [--json]",
    "",
    "默认比较当前 HEAD 与 origin/main。命令只读 Git refs，不会 fetch、切换分支、merge、rebase 或写文件。",
    "",
  ].join("\n"));
}

function parseArgs(argv) {
  const options = { base: "origin/main", json: false, strict: false };
  const args = [...argv];
  while (args.length > 0) {
    const token = args.shift();
    if (token === "--base") {
      options.base = args.shift();
      if (!options.base) throw new Error("--base requires a ref or SHA");
    } else if (token === "--json") {
      options.json = true;
    } else if (token === "--strict") {
      options.strict = true;
    } else if (token === "--help" || token === "-h") {
      options.help = true;
    } else {
      throw new Error(`未知参数: ${token}`);
    }
  }
  return options;
}

function runGit(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function tryGit(args) {
  try {
    return { value: runGit(args), error: null };
  } catch (error) {
    return { value: "", error };
  }
}

function readPathList(range) {
  const output = runGit(["diff", "--name-only", "-z", "--diff-filter=ACDMRTUXB", range]);
  return output.split("\0").filter(Boolean);
}

function buildReport(options) {
  const head = runGit(["rev-parse", "--verify", "HEAD^{commit}"]);
  const baseResult = tryGit(["rev-parse", "--verify", `${options.base}^{commit}`]);
  if (baseResult.error) {
    return buildIntegrationReport({
      head,
      base: options.base,
      baseResolved: false,
    });
  }

  const base = baseResult.value;
  const mergeBaseResult = tryGit(["merge-base", head, base]);
  if (mergeBaseResult.error || !mergeBaseResult.value) {
    return buildIntegrationReport({
      head,
      base: options.base,
      mergeBase: null,
      baseResolved: true,
    });
  }

  const mergeBase = mergeBaseResult.value;
  const counts = parseAheadBehind(runGit(["rev-list", "--left-right", "--count", `${head}...${base}`]));
  return buildIntegrationReport({
    head,
    base: options.base,
    mergeBase,
    ahead: counts.ahead,
    behind: counts.behind,
    featurePaths: readPathList(`${mergeBase}..${head}`),
    basePaths: readPathList(`${mergeBase}..${base}`),
  });
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    process.exit(0);
  }
  const report = buildReport(options);
  process.stdout.write(`${options.json ? JSON.stringify(report, null, 2) : formatIntegrationReport(report)}\n`);
  process.exitCode = strictExitCode(report, options);
} catch (error) {
  process.stderr.write(`integration-check failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}
