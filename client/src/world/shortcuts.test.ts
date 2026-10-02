import { describe, expect, it } from 'vitest'
import { shortcutFor, SHORTCUT_HELP } from './shortcuts'

describe('game shortcuts', () => {
  it('maps number keys to speeds', () => {
    expect(shortcutFor({ key: '1' })).toEqual({ kind: 'speed', tool: 'normal' })
    expect(shortcutFor({ key: '4' })).toEqual({ kind: 'speed', tool: 'fast10' })
  })

  it('maps P and B to prayers and the brink, either case', () => {
    expect(shortcutFor({ key: 'p' })).toEqual({ kind: 'prayer' })
    expect(shortcutFor({ key: 'B' })).toEqual({ kind: 'brink' })
  })

  it('leaves browser and other keys alone', () => {
    expect(shortcutFor({ key: 'p', ctrlKey: true })).toBeNull()
    expect(shortcutFor({ key: 'x' })).toBeNull()
    expect(shortcutFor({ key: '9' })).toBeNull()
  })

  it('documents every key it uses', () => {
    const help = SHORTCUT_HELP.map(([k]) => k).join(' ')
    for (const k of ['1', 'P', 'B']) expect(help).toContain(k)
  })
})
