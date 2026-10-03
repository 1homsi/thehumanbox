import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { appBundleFromExe, buildSwapScript } from './mac-unsigned-install'

test('finds the .app bundle from the running executable', () => {
  assert.equal(
    appBundleFromExe('/Applications/The Human Box.app/Contents/MacOS/The Human Box'),
    '/Applications/The Human Box.app',
  )
  assert.equal(appBundleFromExe('/usr/local/bin/electron'), null)
})

test('swap script quotes paths with spaces and quotes', () => {
  const script = buildSwapScript(123, "/Applications/The Human's Box.app", '/tmp/new/The Human Box.app')
  assert.match(script, /kill -0 123/)
  assert.match(script, /mv '\/Applications\/The Human'\\''s Box\.app' '\/Applications\/The Human'\\''s Box\.app\.previous'/)
  assert.match(script, /open '\/Applications\/The Human'\\''s Box\.app'/)
})

test('swap script replaces the bundle and removes the backup', { skip: process.platform === 'win32' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'thb-swap-test-'))
  const installed = join(root, 'Applications', 'The Human Box.app')
  const fresh = join(root, 'staging', 'The Human Box.app')
  mkdirSync(installed, { recursive: true })
  mkdirSync(fresh, { recursive: true })
  writeFileSync(join(installed, 'version'), 'old')
  writeFileSync(join(fresh, 'version'), 'new')

  // A pid that has already exited, and a no-op `open` so the test never
  // launches anything.
  const script = buildSwapScript(999999, installed, fresh).replace(/^open .*$/m, 'true')
  const run = spawnSync('/bin/bash', ['-c', script], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)

  assert.equal(readFileSync(join(installed, 'version'), 'utf8'), 'new')
  assert.equal(existsSync(`${installed}.previous`), false)
  assert.equal(existsSync(fresh), false)
})
