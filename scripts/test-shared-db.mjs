#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const shadowMateRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const merchantAdminRoot = path.resolve(shadowMateRoot, '..', 'shadow-size', 'merchant-admin')
const testsDir = path.join(shadowMateRoot, 'supabase', 'tests')

function collectTestFiles() {
  return fs
    .readdirSync(testsDir)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()
    .map((entry) => path.join(testsDir, entry))
}

function validateLocalDatabaseUrl(databaseUrl, source) {
  let parsedUrl
  try {
    parsedUrl = new URL(databaseUrl)
  } catch {
    parsedUrl = null
  }

  if (!parsedUrl || parsedUrl.protocol !== 'postgresql:' || parsedUrl.hostname !== '127.0.0.1') {
    throw new Error(
      `${source} 不是 loopback 本地 PostgreSQL 地址；为避免测试误连生产库，已停止。`,
    )
  }

  return databaseUrl
}

function readDatabaseUrlFromSupabase(root, source) {
  const status = execFileSync(
    'npx',
    ['supabase', 'status', '-o', 'env'],
    {
      cwd: root,
      env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const line = status.split(/\r?\n/).find((entry) => entry.startsWith('DB_URL='))
  const databaseUrl = line
    ?.slice('DB_URL='.length)
    .trim()
    .replace(/^['"]|['"]$/g, '')

  if (!databaseUrl) {
    throw new Error(`${source} 没有返回 DB_URL；请先启动本地 Supabase。`)
  }

  return validateLocalDatabaseUrl(databaseUrl, source)
}

function getDatabaseUrl() {
  if (process.env.SHADOW_MATE_TEST_DB_URL) {
    return validateLocalDatabaseUrl(process.env.SHADOW_MATE_TEST_DB_URL, 'SHADOW_MATE_TEST_DB_URL')
  }

  if (fs.existsSync(path.join(merchantAdminRoot, 'package.json'))) {
    return readDatabaseUrlFromSupabase(merchantAdminRoot, 'shared_test 本地 Supabase')
  }

  throw new Error(
    `找不到 merchant-admin：${merchantAdminRoot}\n本地测试请运行 npm run supabase:local:start；CI 若使用隔离数据库，必须显式设置 SHADOW_MATE_TEST_DB_URL。`,
  )
}

function buildTestDatabaseUrl(databaseUrl) {
  const parsedUrl = new URL(databaseUrl)
  parsedUrl.searchParams.set('sslmode', 'disable')
  return parsedUrl.toString()
}

export { buildTestDatabaseUrl }

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const databaseUrl = getDatabaseUrl()
  const testDatabaseUrl = buildTestDatabaseUrl(databaseUrl)
  const testFiles = collectTestFiles()

  if (testFiles.length === 0) {
    throw new Error(`在 ${testsDir} 中没有找到任何 SQL 测试文件。`)
  }

  console.log(`🧪 运行 ${testFiles.length} 个 pgTAP 测试文件（目标：loopback 本地数据库）`)
  execFileSync(
    'npx',
    [
      'supabase',
      'test',
      'db',
      '--db-url',
      testDatabaseUrl,
      ...testFiles,
    ],
    {
      cwd: shadowMateRoot,
      env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' },
      stdio: 'inherit',
    },
  )
}
