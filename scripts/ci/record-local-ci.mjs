#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function recordLocalCiPass({ gitFn = git } = {}) {
  const headSha = gitFn(['rev-parse', 'HEAD']);
  const treeSha = gitFn(['rev-parse', 'HEAD^{tree}']);
  const commonDir = gitFn(['rev-parse', '--git-common-dir']);

  const targetDir = join(commonDir, 'local-ci');
  mkdirSync(targetDir, { recursive: true, mode: 0o700 });

  const record = {
    schemaVersion: 1,
    headSha,
    treeSha,
    status: 'passed',
    command: 'npm run ci',
    completedAt: new Date().toISOString(),
  };

  const recordPath = join(targetDir, `${headSha}.json`);
  writeFileSync(recordPath, JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
  console.log(`[local-ci] ✅ 本地等价门禁凭据已就绪: ${headSha.slice(0, 7)}`);
  return { recordPath, record };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  try {
    recordLocalCiPass();
  } catch (error) {
    console.error(`[local-ci] 记录写入失败: ${error.message}`);
    process.exit(1);
  }
}
