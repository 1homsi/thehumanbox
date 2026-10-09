import { describe, expect, it } from 'vitest'
import type { SandboxTool } from '../../simulation/sandbox'
import { TOOL_HOTKEYS, hotkeysFor, toolForHotkey } from './tool-hotkeys'

const tool = (id: string): SandboxTool => ({ id, label: id, icon: '🖱️', mode: 'instant' })
const tabTools = Array.from({ length: 12 }, (_, i) => tool(`t${i}`))

describe('tool hotkeys', () => {
  it('assigns the first ten tools of a tab, in order', () => {
    const keys = hotkeysFor(tabTools)
    expect(keys.size).toBe(10)
    expect(keys.get('t0')).toBe('Q')
    expect(keys.get('t9')).toBe('G')
    expect(keys.has('t10')).toBe(false)
  })

  it('picks the tool behind a key, ignoring case, and nothing for other keys', () => {
    expect(toolForHotkey(tabTools, 'Q')?.id).toBe('t0')
    expect(toolForHotkey(tabTools, 'o')?.id).toBe('t7')
    expect(toolForHotkey(tabTools.slice(0, 3), 'g')).toBeNull()
    expect(toolForHotkey(tabTools, 'w')).toBeNull()
  })

  it('never takes a key the game already uses', () => {
    const reserved = [
      'w',
      'a',
      's',
      'd',
      'p',
      'b',
      'h',
      'z',
      ' ',
      '[',
      ']',
      '0',
      '1',
      '2',
      '3',
      '4',
      '+',
      '-',
    ]
    for (const key of TOOL_HOTKEYS) expect(reserved, key).not.toContain(key)
    expect(new Set(TOOL_HOTKEYS).size).toBe(TOOL_HOTKEYS.length)
  })
})
