#!/usr/bin/env node
/** Advance main to production only after hosted checks pass for the same commit. */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA = /^[a-f0-9]{40}$/;
const { repository, productionBranch } = JSON.parse(readFileSync(new URL('../../config/release-production.json', import.meta.url), 'utf8'));
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || productionBranch !== 'production') {
  throw new Error('推进目标仓库配置无效。');
}
const githubRepository = `github.com/${repository}`;
const CI_WORKFLOW = "CI";
const REQUIRED_CHECK = "verify";
const ENFORCEMENT_STEP = "Enforce selected CI scope";


export function defaultGit(args, options = {}) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
}

export function defaultGh(args, options = {}) {
  return execFileSync('gh', args.includes('--repo') ? args : [...args, '--repo', githubRepository], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
}

export function parseArgs(rawArgs) {
  const options = { dryRun: false, deploy: false, help: false };
  for (const arg of rawArgs.slice(2)) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--deploy') options.deploy = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知参数: ${arg}。运行 --help 查看用法。`);
  }
  return options;
}

export function printHelp() {
  console.log(`用法:
  npm run release:promote [选项]

选项:
  --dry-run  检查工作区、分支与 main 托管 CI，不创建或合并 PR
  --deploy   不再支持从 main 自动部署；须在 production 工作区独立发布
  -h, --help 显示帮助说明

CI 缺失、失败或查询异常时拒绝推进。计费阻断不自动视为本地等价门禁通过。
本命令只推进分支；部署仍需独立授权并通过项目受控发布入口执行。`);
}

export function verifyPreflight({ git = defaultGit }) {
  if ((git(['status', '--porcelain', '--untracked-files=all']) || '').trim()) {
    throw new Error('工作区不干净（存在未提交或未跟踪文件），拒绝推进发布分支。请先提交或清理工作区。');
  }
  const currentBranch = git(['symbolic-ref', '--quiet', '--short', 'HEAD']).trim();
  if (currentBranch !== 'main') {
    throw new Error(`当前处于分支 '${currentBranch}'，推进 production 必须在 'main' 分支上执行。`);
  }
  const origin = git(['remote', 'get-url', 'origin']).trim();
  const match = origin.match(/^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/);
  if (!match || match[1].toLowerCase() !== repository.toLowerCase()) {
    throw new Error('origin 与受信任配置中的 GitHub 仓库不一致，拒绝推进。');
  }
  git(['fetch', 'origin', 'main', 'production']);
  const headSha = git(['rev-parse', 'HEAD']).trim();
  const originMainSha = git(['rev-parse', 'origin/main']).trim();
  const originProdSha = git(['rev-parse', 'origin/production']).trim();
  if (![headSha, originMainSha, originProdSha].every(sha => SHA.test(sha))) {
    throw new Error('分支提交身份无效，拒绝推进。');
  }
  if (headSha !== originMainSha) {
    throw new Error(`本地 main (${headSha.slice(0, 7)}) 与 origin/main (${originMainSha.slice(0, 7)}) 不一致，请先推送本地提交。`);
  }
  return { headSha, originProdSha };
}

export function checkMainCiStatus({ headSha, gh = defaultGh }) {
  if (!SHA.test(headSha)) throw new Error('main 提交身份无效。');
  const runs = JSON.parse(gh([
    'run', 'list', '--branch', 'main', '--event', 'push', '--commit', headSha,
    '--workflow', 'ci.yml', '--json', 'conclusion,status,headSha,event,headBranch,databaseId', '--limit', '1',
  ]));
  const latest = Array.isArray(runs) && runs.length === 1 ? runs[0] : null;
  if (!latest || !Number.isSafeInteger(latest.databaseId) || latest.databaseId < 1 || latest.headSha !== headSha || latest.event !== 'push' || latest.headBranch !== 'main' ||
      latest.status !== 'completed' || latest.conclusion !== 'success') {
    throw new Error('main 分支 CI 未提供同一 SHA 的成功托管证据，拒绝推进；计费阻断须另走经授权的受保护流程。');
  }
  const proof = JSON.parse(gh(['run', 'view', String(latest.databaseId), '--json',
    'databaseId,headSha,headBranch,event,workflowName,status,conclusion,jobs']));
  verifyRunProof(proof, headSha, 'push', latest.databaseId);
  return proof;
}

function verifyRunProof(proof, headSha, event, runId) {
  if (!proof || proof.databaseId !== runId || proof.headSha !== headSha || proof.headBranch !== 'main' ||
      proof.event !== event || proof.workflowName !== CI_WORKFLOW || proof.status !== 'completed' || proof.conclusion !== 'success' ||
      !Array.isArray(proof.jobs) || !proof.jobs.some(job => job.name === REQUIRED_CHECK && job.status === 'completed' &&
        job.conclusion === 'success' && Array.isArray(job.steps) && job.steps.some(step =>
          step.name === ENFORCEMENT_STEP && step.status === 'completed' && step.conclusion === 'success'))) {
    throw new Error('CI 聚合门禁缺少同一提交的实际成功执行证据，停止推进。');
  }
}

export function getOrCreatePromotionPr({ headSha, gh = defaultGh }) {
  const listArgs = ['pr', 'list', '--base', 'production', '--head', 'main', '--state', 'open', '--json', 'number,url', '--limit', '1'];
  const prs = JSON.parse(gh(listArgs));
  if (!Array.isArray(prs)) throw new Error('推进 PR 列表无效。');
  if (prs.length) return prs[0];
  gh([
    'pr', 'create', '--base', 'production', '--head', 'main',
    '--title', `release: promote main (${headSha.slice(0, 7)}) to production`,
    '--body', `将 main 提交 ${headSha} 推进至 production。\n\n该 SHA 为请求核验的候选；main 是可变引用，创建后必须回读实际 head 并核验 CI。PR 创建不代表准入通过、合并授权或生产部署。`,
    '--label', 'production-impact',
  ]);
  const created = JSON.parse(gh(listArgs));
  if (!Array.isArray(created) || created.length !== 1) throw new Error('未能确认推进 PR，停止推进。');
  return created[0];
}

function readPromotionPr(number, headSha, gh, state = 'OPEN') {
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('推进 PR 编号无效。');
  const pr = JSON.parse(gh([
    'pr', 'view', String(number), '--json',
    'number,headRefOid,headRefName,baseRefName,isCrossRepository,state,isDraft,mergeCommit',
  ]));
  if (!pr || pr.number !== number || pr.headRefOid !== headSha || pr.headRefName !== 'main' ||
      pr.baseRefName !== 'production' || pr.isCrossRepository !== false || pr.isDraft !== false || pr.state !== state) {
    throw new Error('推进 PR 的提交、来源、目标或状态发生变化，停止推进。');
  }
  return pr;
}

export function verifyPromotionTree(headSha, baseSha, git) {
  const mergedTree = git(['merge-tree', '--write-tree', baseSha, headSha]).trim();
  if (!SHA.test(mergedTree) || mergedTree !== git(['rev-parse', `${headSha}^{tree}`]).trim()) {
    throw new Error('候选合并树与已验证 main 不一致，拒绝创建或合并推进 PR。');
  }
}

function checkPrResults(number, gh, mainCi) {
  const checks = JSON.parse(gh(['pr', 'checks', String(number), '--json', 'name,bucket,state,workflow,event,link']));
  if (!Array.isArray(checks) || !checks.length || checks.some(check => !check || !['pass', 'skipping'].includes(check.bucket))) {
    throw new Error('推进 PR 检查缺失、失败或未完成，停止推进。');
  }
  const required = checks.filter(check => check.name === REQUIRED_CHECK && check.workflow === CI_WORKFLOW && check.bucket === 'pass');
  if (!required.length) throw new Error('推进 PR 缺少必需聚合门禁。');
  for (const check of required) {
    const prefix = `https://github.com/${repository}/actions/runs/`;
    if (typeof check.link !== 'string' || !check.link.startsWith(prefix)) continue;
    const match = check.link.slice(prefix.length).match(/^(\d+)\/(?:job\/\d+|jobs\/\d+)(?:[/?#].*)?$/);
    const id = match ? Number(match[1]) : NaN;
    if (!Number.isSafeInteger(id) || id < 1) continue;
    if (check.event === 'push' && id === mainCi.databaseId) return;
    if (check.event === 'pull_request') {
      const proof = JSON.parse(gh(['run', 'view', String(id), '--json',
        'databaseId,headSha,headBranch,event,workflowName,status,conclusion,jobs']));
      verifyRunProof(proof, mainCi.headSha, 'pull_request', id);
      return;
    }
  }
  throw new Error('推进 PR 聚合门禁来源或执行证据不匹配。');
}

export async function runPromote(options = {}, dependencies = {}) {
  const git = dependencies.git || defaultGit;
  const runGh = dependencies.gh || defaultGh;
  const gh = args => runGh([...args, '--repo', githubRepository]);
  if (options.skipCiWait) throw new Error('禁止跳过 PR 检查。');
  if (options.deploy && !options.dryRun) throw new Error('--deploy 不能从 main 自动部署；请在经验证的 production 工作区独立执行受控发布。');
  if (options.help) { printHelp(); return 0; }

  const { headSha, originProdSha } = verifyPreflight({ git });
  if (headSha === originProdSha) {
    console.log('production 已与 main 一致，无需推进；此结果不代表生产部署完成。');
    return 0;
  }
  checkMainCiStatus({ headSha, gh });
  if (options.dryRun) {
    console.log('[DRY-RUN] 前置检查通过，未创建或合并 PR。');
    return 0;
  }

  verifyPromotionTree(headSha, originProdSha, git);
  const pr = getOrCreatePromotionPr({ headSha, gh });
  readPromotionPr(pr?.number, headSha, gh);
  gh(['pr', 'checks', String(pr.number), '--watch', '--fail-fast']);
  const current = verifyPreflight({ git });
  if (current.headSha !== headSha || current.originProdSha !== originProdSha) {
    throw new Error('等待检查期间分支身份变化，停止推进。');
  }
  const mainCi = checkMainCiStatus({ headSha, gh });
  verifyPromotionTree(headSha, originProdSha, git);
  checkPrResults(pr.number, gh, mainCi);
  readPromotionPr(pr.number, headSha, gh);
  gh([
    'pr', 'merge', String(pr.number), '--merge', '--match-head-commit', headSha,
    '--subject', `release: promote main (${headSha.slice(0, 7)}) to production`,
  ]);

  // gh may enqueue a protected merge without completing it. Confirm remote state and tree.
  const merged = readPromotionPr(pr.number, headSha, gh, 'MERGED');
  const mergeSha = merged.mergeCommit?.oid;
  if (!SHA.test(mergeSha ?? '')) throw new Error('合并尚无可验证提交，未确认推进完成。');
  git(['fetch', 'origin', 'production']);
  const newProdSha = git(['rev-parse', 'origin/production']).trim();
  if (newProdSha !== mergeSha) throw new Error('production 未指向本次 PR 的合并提交，未确认推进完成。');
  git(['merge-base', '--is-ancestor', headSha, newProdSha]);
  if (git(['rev-parse', `${newProdSha}^{tree}`]).trim() !== git(['rev-parse', `${headSha}^{tree}`]).trim()) {
    throw new Error('production 内容与已验证 main 不一致，停止发布后续步骤。');
  }
  console.log(`分支推进已验证：origin/production = ${newProdSha}。生产部署尚未执行。`);
  console.log('获得部署授权后，在注册 Controller 检出中执行项目受控准备与发布流程。');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await runPromote(parseArgs(process.argv)); }
  catch (err) { console.error(`错误: ${err.message}`); process.exit(1); }
}
