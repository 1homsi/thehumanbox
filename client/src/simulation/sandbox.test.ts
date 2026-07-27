import { describe, expect, it } from 'vitest'
import { canSendSandboxCommand } from './sandbox'

describe('sandbox command permission', () => {
  it('allows commands for a browser-owned world', () => {
    expect(canSendSandboxCommand('wasm', false, false)).toBe(true)
  })

  it('allows commands for a desktop app connected to its local simulation', () => {
    expect(canSendSandboxCommand('native', true, true)).toBe(true)
  })

  it('rejects commands for the shared remote world in every renderer', () => {
    expect(canSendSandboxCommand('native', false, false)).toBe(false)
    expect(canSendSandboxCommand('native', true, false)).toBe(false)
  })
})
