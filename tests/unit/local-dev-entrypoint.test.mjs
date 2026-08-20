import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(new URL('.', import.meta.url).pathname, '../..')

test('Shadow Mate central entrypoint delegates to the runtime CLI', () => {
  const script = fs.readFileSync(path.join(root, 'scripts/start-local-dev.mjs'), 'utf8')
  assert.match(script, /scripts\/local-dev\/cli\.mjs/)
  assert.doesNotMatch(script, /supabase start|functions serve|cloudflared/)
})
test('legacy shared Supabase/function commands remain separate compatibility wrappers', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.equal(packageJson.scripts['local-dev'], 'node scripts/start-local-dev.mjs')
  assert.equal(packageJson.scripts['supabase:local:start'], 'node scripts/start-shared-supabase.mjs')
  assert.equal(packageJson.scripts['supabase:local:functions:serve'], 'node scripts/serve-shared-functions.mjs')
})
