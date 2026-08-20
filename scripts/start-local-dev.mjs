#!/usr/bin/env node
// Shadow Mate 的中央本地开发薄入口。
// 缺失的 Growth Loop migration 会由中央 Profile 明确报告为 blocked，
// 不会偷偷回退到另一个项目的 Schema。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const shadowMateRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workspaceRoot = path.resolve(shadowMateRoot, '..')
const runtimeRoot = process.env.SHADOW_LOCAL_DEV_RUNTIME_DIR ?? path.join(workspaceRoot, 'shadow-size', 'merchant-admin')
const cliPath = path.join(runtimeRoot, 'scripts/local-dev/cli.mjs')

if (!fs.existsSync(cliPath)) {
  process.stderr.write(`[MATE-local] 找不到中央本地开发 CLI：${cliPath}\n`)
  process.exit(2)
}

const result = spawnSync(process.execPath, [cliPath, ...process.argv.slice(2)], {
  cwd: runtimeRoot,
  env: { ...process.env, LOCAL_DEV_ENTRY_PROJECT: 'shadow-mate' },
  stdio: 'inherit',
})
if (result.error) throw result.error
process.exit(result.status ?? 1)
