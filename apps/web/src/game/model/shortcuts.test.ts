import { describe, expect, it } from 'vitest'
import { shortcutFor, SHORTCUT_HELP, typingTarget } from './shortcuts'

/** A stand-in element: `closest` matches the tags it was given, the way the DOM does for a tag selector. */
function element(tags: string[], editable = false): EventTarget {
  return {
    closest: (selector: string) => {
      const wanted = selector.split(',').map((s) => s.trim())
      return tags.some((t) => wanted.includes(t)) ? {} : null
    },
    isContentEditable: editable,
  } as unknown as EventTarget
}

describe('typingTarget', () => {
  it('keeps the game keys for a button, which keeps focus after a click', () => {
    expect(typingTarget(element(['button']))).toBe(false)
  })

  it('leaves typed keys to fields, dialogs and editable text', () => {
    expect(typingTarget(element(['input']))).toBe(true)
    expect(typingTarget(element(['textarea']))).toBe(true)
    expect(typingTarget(element(['select']))).toBe(true)
    expect(typingTarget(element(['div'], true))).toBe(true)
    expect(typingTarget(element(['[role="dialog"]']))).toBe(true)
  })

  it('treats the map and no target as a game target', () => {
    expect(typingTarget(element(['canvas']))).toBe(false)
    expect(typingTarget(null)).toBe(false)
  })
})

describe('game shortcuts', () => {
  it('maps number keys to speeds', () => {
    expect(shortcutFor({ key: '1' })).toEqual({ kind: 'speed', tool: 'normal' })
    expect(shortcutFor({ key: '4' })).toEqual({ kind: 'speed', tool: 'fast10' })
  })

  it('maps P and B to prayers and the brink, either case', () => {
    expect(shortcutFor({ key: 'p' })).toEqual({ kind: 'prayer' })
    expect(shortcutFor({ key: 'B' })).toEqual({ kind: 'brink' })
  })

  it('maps - and = to the brush, and ? to this list', () => {
    expect(shortcutFor({ key: '-' })).toEqual({ kind: 'brush', delta: -1 })
    expect(shortcutFor({ key: '=' })).toEqual({ kind: 'brush', delta: 1 })
    expect(shortcutFor({ key: '?' })).toEqual({ kind: 'help' })
  })

  it('leaves browser and other keys alone', () => {
    expect(shortcutFor({ key: 'p', ctrlKey: true })).toBeNull()
    expect(shortcutFor({ key: 'x' })).toBeNull()
    expect(shortcutFor({ key: '9' })).toBeNull()
  })

  it('documents every key it uses', () => {
    const help = SHORTCUT_HELP.map(([k]) => k).join(' ')
    for (const k of ['1', 'P', 'B', '- =', '?']) expect(help).toContain(k)
  })
})
