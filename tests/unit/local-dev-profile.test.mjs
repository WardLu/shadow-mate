import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(import.meta.dirname, '..', '..')
const profile = JSON.parse(fs.readFileSync(path.join(root, 'local-dev', 'profile.json'), 'utf8'))

test('Shadow Mate profile uses canonical identity and the real Vite process contract', () => {
  assert.equal(profile.profile_schema_version, 1)
  assert.equal(profile.project_id, 'shadow-mate')
  assert.deepEqual(profile.processes, [{
    process_id: 'shadow-mate-vite',
    runner: 'npm-script',
    working_directory: '.',
    port: 5173,
    args: ['run', 'dev', '--', '--host', '127.0.0.1'],
  }])
  assert.equal(profile.ingress_claims[0].route_id, 'shadow-mate-app')
  assert.equal(profile.health_checks[0].target, 'http://127.0.0.1:5173/')
})

test('Shadow Mate profile pins local Growth Loop sources by content hash', () => {
  const foundation = profile.schema_overlays.find((entry) => entry.capability_id === 'shadow-mate-growth-loop-foundation')
  assert.equal(foundation.sha256, 'sha256:60b34d18ebedff6d74fab676c07fca379b0497df59a0c57b0572dd91a72468e5')
  assert.equal(profile.schema_overlays.length, 9)
  for (const entry of profile.schema_overlays) {
    const sourcePath = path.join(root, entry.path)
    assert.equal(fs.existsSync(sourcePath), true, `${entry.path} missing`)
    const digest = createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex')
    assert.equal(entry.sha256, `sha256:${digest}`, `${entry.path} hash drift`)
  }
})

test('Shadow Mate function sources are local and credential-free', () => {
  assert.deepEqual(profile.edge_functions.map((entry) => entry.name), ['check-auth-email', 'delete-account'])
  for (const entry of profile.edge_functions) {
    assert.equal(fs.existsSync(path.join(root, entry.path)), true)
    assert.match(entry.sha256, /^sha256:[0-9a-f]{64}$/)
  }
})
