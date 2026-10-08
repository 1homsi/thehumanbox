import { describe, expect, it } from 'vitest'
import { isUndoableCommand } from './undo'

describe('undo snapshots', () => {
  it('takes a snapshot before a world action', () => {
    expect(isUndoableCommand(JSON.stringify({ cmd: 'gift', x: 3, y: 4, what: 'food' }))).toBe(true)
    expect(isUndoableCommand(JSON.stringify({ cmd: 'heal_one', x: 3, y: 4 }))).toBe(true)
  })

  it('never snapshots a time control, so undo does not chase the calendar', () => {
    expect(isUndoableCommand(JSON.stringify({ cmd: 'advance', to: 'season', max_ticks: 150 }))).toBe(false)
  })

  it('ignores anything that is not a command', () => {
    expect(isUndoableCommand('not json')).toBe(false)
    expect(isUndoableCommand(JSON.stringify({ x: 1 }))).toBe(false)
  })
})
