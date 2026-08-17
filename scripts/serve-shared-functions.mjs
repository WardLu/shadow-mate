#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const shadowMateRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const merchantAdminRoot = path.resolve(shadowMateRoot, '..', 'shadow-size', 'merchant-admin')

if (!fs.existsSync(path.join(merchantAdminRoot, 'package.json'))) {
  throw new Error(
    `找不到共享本地 Supabase 控制仓库：${merchantAdminRoot}\n请确认 shadow-mate、shadow-size 位于同一个 VibeCoding 目录。`,
  )
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
execFileSync(npmCommand, ['run', 'supabase:local:functions:serve'], {
  cwd: merchantAdminRoot,
  stdio: 'inherit',
})
