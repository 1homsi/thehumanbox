import { describe, expect, it } from 'vitest'
import {
  EMPTY_TOOL_MEMORY,
  PINNED_LIMIT,
  RECENT_LIMIT,
  memoryToolIds,
  parseToolMemory,
  rememberRecent,
  togglePinned,
} from './tool-memory'

describe('recent tools', () => {
  it('puts the latest tool first, keeps each once, and stays short', () => {
    let memory = EMPTY_TOOL_MEMORY
    for (const id of ['heal', 'bless', 'heal', 'cure', 'ward', 'arm', 'bounty', 'douse', 'peace']) {
      memory = rememberRecent(memory, id)
    }
    expect(memory.recent).toHaveLength(RECENT_LIMIT)
    expect(memory.recent[0]).toBe('peace')
    expect(new Set(memory.recent).size).toBe(memory.recent.length)
    // 'heal' was used first and has been pushed out by the newer tools.
    expect(memory.recent).toEqual(['peace', 'douse', 'bounty', 'arm', 'ward', 'cure'])
  })

  it('leaves memory alone when the same tool is used again in a row', () => {
    const once = rememberRecent(EMPTY_TOOL_MEMORY, 'heal')
    expect(rememberRecent(once, 'heal')).toBe(once)
  })
})

describe('pinned tools', () => {
  it('pins and unpins, and refuses pins past the limit', () => {
    let memory = togglePinned(EMPTY_TOOL_MEMORY, 'family')
    expect(memory.pinned).toEqual(['family'])
    memory = togglePinned(memory, 'family')
    expect(memory.pinned).toEqual([])

    for (let i = 0; i < PINNED_LIMIT + 3; i++) memory = togglePinned(memory, `tool-${i}`)
    expect(memory.pinned).toHaveLength(PINNED_LIMIT)
  })
})

describe('memory group', () => {
  it('lists pinned tools first, then recent ones, without repeats or unknown ids', () => {
    const memory = { pinned: ['family', 'gone'], recent: ['heal', 'family', 'teleport'] }
    const known = new Set(['family', 'heal', 'teleport'])
    expect(memoryToolIds(memory, known)).toEqual(['family', 'heal', 'teleport'])
  })
})

describe('stored memory', () => {
  it('reads what was stored', () => {
    expect(parseToolMemory('{"pinned":["family"],"recent":["heal"]}')).toEqual({
      pinned: ['family'],
      recent: ['heal'],
    })
  })

  it('falls back to empty for anything malformed', () => {
    expect(parseToolMemory(null)).toEqual(EMPTY_TOOL_MEMORY)
    expect(parseToolMemory('not json')).toEqual(EMPTY_TOOL_MEMORY)
    expect(parseToolMemory('[1,2]')).toEqual(EMPTY_TOOL_MEMORY)
    expect(parseToolMemory('{"pinned":"family","recent":[1]}')).toEqual(EMPTY_TOOL_MEMORY)
  })

  it('caps stored lists, so an edited value cannot grow the dock', () => {
    const big = JSON.stringify({
      pinned: Array.from({ length: 40 }, (_, i) => `p${i}`),
      recent: Array.from({ length: 40 }, (_, i) => `r${i}`),
    })
    const memory = parseToolMemory(big)
    expect(memory.pinned).toHaveLength(PINNED_LIMIT)
    expect(memory.recent).toHaveLength(RECENT_LIMIT)
  })
})
