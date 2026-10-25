// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { WorldState } from '../../shared/types'
import { t } from '../../i18n'
import { CivStatsModal } from './CivStatsModal'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
let root: Root | null = null
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
})

/** A world with two people, one of them renamed by the player, and a government led by her. */
function worldWithRenamedLeader(): WorldState {
  const organisms = [
    { id: 'p1', name: 'Ada-GEN', custom_name: 'Ada', alive: true, lineage_id: 'L', age: 900, generation: 0 },
    { id: 'p2', name: 'Bo-GEN', custom_name: 'Bo', alive: true, lineage_id: 'L', age: 900, generation: 0 },
  ]
  return {
    tick: 0,
    organisms,
    animals: [],
    events: [],
    pop_history: [],
    lineage_names: { L: 'Lions' },
    lineage_sizes: [],
    governments: [{ lineage_id: 'L', kind: 'chiefdom', leader_id: 'p1' }],
    trades: [{ tick: 10, buyer_id: 'p1', seller_id: 'p2', good: 'fish', amount: 1, price: 1 }],
    history: {
      births: 0,
      deaths_old_age: 0,
      deaths_starvation: 0,
      deaths_dehydration: 0,
      deaths_sickness: 0,
      deaths_combat: 0,
      droughts: 0,
      outbreaks: 0,
    },
  } as unknown as WorldState
}

describe('CivStatsModal calendar', () => {
  it('gives the day of the season the time tag shows, out of five, not a day of the year', () => {
    // Tick 3600 is the second day of the second season of year 1: the tag reads "Day 2 of 5".
    const world = {
      ...worldWithRenamedLeader(),
      tick: 3600,
      cosmos: { year: 0, day_of_year: 6, moon_phase: 'new', moon_illum: 0 },
    }
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root?.render(<CivStatsModal world={world as unknown as WorldState} onClose={() => {}} />))

    const day = document.querySelector('.civ-cal-sub')?.textContent
    expect(day).toBe(t('dialogs.civ.calendar.day', { day: 2 }))
    expect(day).not.toContain('84')
    expect(day).not.toContain('7')
  })
})

describe('CivStatsModal names people as the player named them', () => {
  it('shows the leader of a government by the name they were given', () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root?.render(<CivStatsModal world={worldWithRenamedLeader()} onClose={() => {}} />))
    const leaderTags = [...document.querySelectorAll('.civ-row-tag')].map((el) => el.textContent ?? '')
    expect(leaderTags.some((text) => text.includes('Ada'))).toBe(true)
    expect(leaderTags.some((text) => text.includes('Ada-GEN'))).toBe(false)
  })

  it('shows the trade log by the names people were given', () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root?.render(<CivStatsModal world={worldWithRenamedLeader()} onClose={() => {}} />))
    const rows = [...document.querySelectorAll('.civ-row-head')].map((el) => el.textContent ?? '')
    const trade = rows.find((text) => text.includes('→'))
    expect(trade).toBeDefined()
    expect(trade).toContain('Bo')
    expect(trade).toContain('Ada')
    expect(trade).not.toContain('Ada-GEN')
    expect(trade).not.toContain('Bo-GEN')
  })
})
