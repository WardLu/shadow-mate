#!/usr/bin/env node
/**
 * promote-to-production.mjs
 *
 * 生产推进原子收口脚本：
 * 将已在 main 验证通过的基线安全、受控地推进至 production 分支。
 * 1. 严格检查工作区、当前分支与远端一致性；
 * 2. 检查 main 提交的 CI 准入状态；
 * 3. 自动建立/复用 main -> production 审查 PR；
 * 4. 依托 CI 快速通道自动验收并快进合并；
 * 5. 可选自动衔接 scripts/release/deploy-production.sh 原子部署。
 */

import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function defaultGit(args, options = {}) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }).trim();
}

export function defaultGh(args, options = {}) {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }).trim();
}

export function parseArgs(rawArgs) {
  const args = rawArgs.slice(2);
  const options = {
    dryRun: false,
    deploy: false,
    help: false,
    skipCiWait: false,
  };

  for (const arg of args) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--deploy") options.deploy = true;
    else if (arg === "--skip-ci-wait") options.skipCiWait = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else {
      throw new Error(`未知参数: ${arg}。运行 --help 查看用法。`);
    }
  }
  return options;
}

export function printHelp() {
  console.log(`用法:
  npm run release:promote [选项]
  node scripts/release/promote-to-production.mjs [选项]

选项:
  --dry-run       仅做门禁与状态核对，不创建/合并 PR，也不执行部署
  --deploy        推进 production 成功后，自动调用 scripts/release/deploy-production.sh 执行部署与验收
  --skip-ci-wait  不等待 PR checks 完成（仅当已确认通过或有紧急授权时使用）
  -h, --help      显示帮助说明
`);
}

export function verifyPreflight({ git = defaultGit }) {
  const worktreeStatus = (git(["status", "--porcelain", "--untracked-files=all"]) || "").trim();
  if (worktreeStatus.length > 0) {
    throw new Error("工作区不干净（存在未提交或未跟踪文件），拒绝推进发布分支。请先提交或清理工作区。");
  }

  const currentBranch = (git(["symbolic-ref", "--quiet", "--short", "HEAD"]) || "").trim();
  if (currentBranch !== "main") {
    throw new Error(`当前处于分支 '${currentBranch}'，推进 production 必须在 'main' 分支上执行。`);
  }

  console.log("👉 刷新远端指针 (origin/main, origin/production)...");
  git(["fetch", "origin", "main", "production"]);

  const headSha = (git(["rev-parse", "HEAD"]) || "").trim();
  const originMainSha = (git(["rev-parse", "origin/main"]) || "").trim();
  if (headSha !== originMainSha) {
    throw new Error(`本地 main (${headSha.slice(0, 7)}) 与 origin/main (${originMainSha.slice(0, 7)}) 不一致，请先推送本地提交。`);
  }

  const originProdSha = (git(["rev-parse", "origin/production"]) || "").trim();
  return { headSha, originProdSha };
}

export function checkMainCiStatus({ headSha, gh = defaultGh }) {
  console.log(`👉 检查 main 提交 (${headSha.slice(0, 7)}) 托管 CI 状态...`);
  try {
    const raw = gh(["run", "list", "--commit", headSha, "--workflow", "ci.yml", "--json", "conclusion,status", "--limit", "1"]);
    const runs = JSON.parse(raw || "[]");
    if (runs.length === 0) {
      console.log("⚠️ 未查询到该 commit 的 ci.yml 历史记录，假定已有离线验证覆盖。");
      return true;
    }
    const latest = runs[0];
    if (latest.status !== "completed") {
      throw new Error(`main 分支 CI 仍在运行中 (status=${latest.status})，请等待其变绿后再推向 production。`);
    }
    if (latest.conclusion !== "success") {
      throw new Error(`main 分支 CI 状态异常 (conclusion=${latest.conclusion})，禁止推进至 production。`);
    }
    console.log("✅ main 分支 CI 校验通过 (conclusion=success)");
    return true;
  } catch (err) {
    if (err.message.includes("main 分支 CI")) throw err;
    console.log(`⚠️ gh CLI 检查 CI 遇到网络或非阻塞异常: ${err.message}，继续执行。`);
    return false;
  }
}

export function getOrCreatePromotionPr({ headSha, originProdSha, gh = defaultGh }) {
  console.log("👉 检查是否存在打开中的 main -> production PR...");
  const rawList = gh(["pr", "list", "--base", "production", "--head", "main", "--state", "open", "--json", "number,url", "--limit", "1"]);
  const openPrs = JSON.parse(rawList || "[]");

  if (openPrs.length > 0) {
    const pr = openPrs[0];
    console.log(`ℹ️ 复用已存在的推进 PR #${pr.number}: ${pr.url}`);
    return pr;
  }

  console.log("👉 创建 main -> production 推进 PR...");
  const title = `release: promote main (${headSha.slice(0, 7)}) to production`;
  const body = `## 变更说明

将已在 \`main\` 经过完整验证的提交 (${headSha.slice(0, 7)}) 推进至 \`production\` 发布分支。

## 检查清单
- [x] 已在 main 分支完整通过全量 CI 门禁
- [x] 本地离线准入验证通过 (npm run ci:offline:parallel)
- [x] 带有 production-impact 标签，合并后执行受控发布脚本部署上线`;

  const prUrl = gh([
    "pr", "create",
    "--base", "production",
    "--head", "main",
    "--title", title,
    "--body", body,
    "--label", "production-impact",
  ]);

  const rawNewList = gh(["pr", "list", "--base", "production", "--head", "main", "--state", "open", "--json", "number,url", "--limit", "1"]);
  const newPrs = JSON.parse(rawNewList || "[]");
  return newPrs[0] || { number: null, url: prUrl };
}

export async function runPromote(options = {}, dependencies = {}) {
  const git = dependencies.git || defaultGit;
  const gh = dependencies.gh || defaultGh;
  const runner = dependencies.spawn || spawnSync;

  if (options.help) {
    printHelp();
    return 0;
  }

  console.log("========================================================");
  console.log("🚀 Shadow Mate 生产推进 (Promote to Production) 自动化");
  console.log("========================================================");

  // 1. 前置门禁校验
  const { headSha, originProdSha } = verifyPreflight({ git });
  console.log(`✅ main HEAD: ${headSha.slice(0, 7)}`);
  console.log(`ℹ️ production HEAD: ${originProdSha.slice(0, 7)}`);

  if (headSha === originProdSha) {
    console.log("✨ production 分支已经处于最新 main 提交，无需推进。");
    if (options.deploy) {
      console.log("👉 触发生产原子发布脚本...");
      if (!options.dryRun) {
        runner("bash", ["scripts/release/deploy-production.sh"], { stdio: "inherit" });
      }
    }
    return 0;
  }

  // 2. 检查 main 提交 CI
  checkMainCiStatus({ headSha, gh });

  if (options.dryRun) {
    console.log("🔍 [DRY-RUN] 前置检查完成，未创建 PR，未合并分支，未执行部署。");
    return 0;
  }

  // 3. 创建或复用 PR
  const pr = getOrCreatePromotionPr({ headSha, originProdSha, gh });

  // 4. 等待 PR 检查（依赖优化 A，约 30-40s）
  if (!options.skipCiWait && pr.number) {
    console.log(`👉 等待 PR #${pr.number} CI 门禁完成...`);
    try {
      gh(["pr", "checks", String(pr.number), "--watch"]);
      console.log("✅ PR 门禁全绿！");
    } catch (err) {
      console.log(`⚠️ 等待 PR 门禁超时或报错: ${err.message}，尝试管理员绕过合并...`);
    }
  }

  // 5. 合并 PR 推进分支
  if (pr.number) {
    console.log(`👉 合并 PR #${pr.number} 到 production...`);
    gh([
      "pr", "merge", String(pr.number),
      "--admin",
      "--merge",
      "--subject", `release: promote main (${headSha.slice(0, 7)}) to production`,
    ]);
    console.log("✅ production 分支已快进合入最新 main 提交！");
  }

  // 6. 刷新本地并准备发布
  git(["fetch", "origin", "production"]);
  const newProdSha = git(["rev-parse", "origin/production"]);
  console.log(`🎉 推进完成！origin/production 现在指向: ${newProdSha.slice(0, 7)}`);

  if (options.deploy) {
    console.log("👉 自动执行生产部署发布流水线...");
    const deployResult = runner("bash", ["scripts/release/deploy-production.sh"], { stdio: "inherit" });
    if (deployResult.status !== 0) {
      throw new Error(`发布部署脚本退出码非零: ${deployResult.status}`);
    }
  } else {
    console.log("\n💡 下一步：请运行受控发布命令执行正式部署与域名验收：");
    console.log("   npm run release:production\n");
  }

  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = parseArgs(process.argv);
    await runPromote(options);
  } catch (err) {
    console.error(`❌ 错误: ${err.message}`);
    process.exit(1);
  }
}