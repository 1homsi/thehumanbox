import assert from 'node:assert/strict'
import test from 'node:test'
import { remoteApiHost } from './sim-mode'

test('remoteApiHost strips only transport syntax and trailing slashes', () => {
  assert.equal(remoteApiHost('https://api.thehumanbox.com/'), 'api.thehumanbox.com')
  assert.equal(remoteApiHost(' http://localhost:8000/// '), 'localhost:8000')
  assert.equal(remoteApiHost('wss://example.test/ws'), 'wss://example.test/ws')
})
