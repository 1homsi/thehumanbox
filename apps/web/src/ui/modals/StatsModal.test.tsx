// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { WorldState } from '../../shared/types'
import { formatNumber } from '../../i18n'
import { StatsModal } from './StatsModal'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

let root: Root | null = null
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
})

/** A world with nobody alive, just enough history to open the stats modal. */
function emptyWorld(history: Partial<WorldState['history']>): WorldState {
  return {
    tick: 0,
    organisms: [],
    animals: [],
    events: [],
    pop_history: [],
    lineage_names: {},
    history: {
      births: 0,
      deaths_old_age: 0,
      deaths_starvation: 0,
      deaths_dehydration: 0,
      deaths_sickness: 0,
      deaths_combat: 0,
      sickness_events: 0,
      alliances_formed: 0,
      challenges_total: 0,
      gifts_total: 0,
      droughts: 0,
      outbreaks: 0,
      ...history,
    },
  } as unknown as WorldState
}

function renderStats(world: WorldState): HTMLElement {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(<StatsModal world={world} onClose={() => undefined} />))
  return host
}

describe('StatsModal counts', () => {
  it('writes the births count with the same grouping as every other count', () => {
    renderStats(emptyWorld({ births: 12345 }))
    const cards = [...document.querySelectorAll('.stats-num')].map((el) => el.textContent)
    expect(cards).toContain(formatNumber(12345))
    expect(cards).not.toContain('12345')
  })

  it('writes each cause of death with the same grouping', () => {
    renderStats(emptyWorld({ deaths_starvation: 2345, deaths_old_age: 1000, droughts: 1200 }))
    const values = [...document.querySelectorAll('.hist-val')].map((el) => el.textContent)
    expect(values).toContain(formatNumber(2345))
    expect(values).toContain(formatNumber(1000))
    expect(values).toContain(formatNumber(1200))
    expect(values).not.toContain('2345')
  })
})
