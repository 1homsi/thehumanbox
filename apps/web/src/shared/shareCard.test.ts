// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import type { WorldState } from './types'
import { chronicleLine, shareBlurb, shareCopyText, SHARE_CARD_URL, SHARE_URL } from './shareCard'

function world(over: Partial<WorldState> = {}): WorldState {
  return {
    tick: 24_000,
    lineage_sizes: [
      { id: 'a', count: 83 },
      { id: 'b', count: 60 },
    ],
    headlines: [],
    organisms: [],
    ...over,
  } as unknown as WorldState
}

describe('the share link', () => {
  it('carries the share campaign marks', () => {
    expect(SHARE_URL).toBe(
      'https://thehumanbox.com/?utm_source=share&utm_medium=share_card&utm_campaign=share_world',
    )
  })

  it('is offered as text in a copy, and as a readable address on the card', () => {
    expect(shareCopyText(world())).toContain(SHARE_URL)
    expect(SHARE_URL).toContain(SHARE_CARD_URL)
    expect(SHARE_CARD_URL).not.toContain('utm_')
  })
})

describe('the chronicle line', () => {
  it('uses the newest real headline, with the year', () => {
    const line = chronicleLine(
      world({ headlines: [{ tick: 24_000, text: '🔥 A meteor stunned the people.' }] }),
    )
    expect(line).toBe('Year 3 — A meteor stunned the people.')
  })

  it('does not repeat a year a headline already names', () => {
    expect(chronicleLine(world({ headlines: [{ tick: 1, text: '📅 Year 3 begins.' }] }))).toBe(
      'Year 3 · 143 people · 2 tribes',
    )
  })

  it('falls back to the world’s real year, people and tribes', () => {
    expect(chronicleLine(world())).toBe('Year 3 · 143 people · 2 tribes')
  })

  it('counts living people and tribes from the frame when the sizes are absent', () => {
    const line = chronicleLine(
      world({
        lineage_sizes: undefined,
        organisms: [
          { id: '1', lineage_id: 'a', alive: true },
          { id: '2', lineage_id: 'a', alive: true },
          { id: '3', lineage_id: 'b', alive: false },
        ] as unknown as WorldState['organisms'],
      }),
    )
    expect(line).toBe('Year 3 · 2 people · 1 tribe')
  })
})

describe('the share words', () => {
  it('name the game and the world line', () => {
    const blurb = shareBlurb(
      world({ headlines: [{ tick: 24_000, text: '🔥 A meteor stunned the people.' }] }),
    )
    expect(blurb).toContain('The Human Box')
    expect(blurb).toContain('A meteor stunned the people.')
  })
})
