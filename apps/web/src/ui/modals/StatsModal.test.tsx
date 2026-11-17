// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { WorldState } from '../../shared/types'
import { formatNumber, t } from '../../i18n'
import { StatsModal } from './StatsModal'
import { useWorldStore } from '../../state/worldStore'
import { useUIStore } from '../../state/store'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

let root: Root | null = null
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
  useUIStore.setState({ nerdStats: false })
})

function openTab(id: string) {
  act(() => document.getElementById(`stats-tab-${id}`)?.click())
}

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

describe('StatsModal calendar', () => {
  it('dates the header by the day of the season the time tag shows', () => {
    // Tick 3600: year 1, the second day of the second season. The header said day 7 of the year before.
    const world = {
      ...emptyWorld({}),
      tick: 3600,
      cosmos: { year: 0, day_of_year: 6, moon_phase: 'new', moon_illum: 0 },
    }
    renderStats(world as unknown as WorldState)

    const header = document.querySelector('.tree-modal-sub')?.textContent ?? ''
    expect(header).toContain(t('dialogs.stats.yearDay', { year: formatNumber(1), day: formatNumber(2) }))
    expect(header).not.toContain(t('dialogs.stats.yearDay', { year: formatNumber(1), day: formatNumber(7) }))
  })
})

describe('StatsModal story', () => {
  const person = (id: string, curiosity: number) => ({
    id,
    name: id,
    alive: true,
    lineage_id: 'a',
    sex: 'female',
    age: 100,
    max_age: 1000,
    energy: 0.8,
    hydration: 0.8,
    infection: 0,
    generation: 1,
    discoveries: ['fire'],
    traits: {
      curiosity,
      fear: 0.5,
      social_tendency: 0.5,
      resilience: 0.5,
      aggression: 0.5,
      memory_strength: 0.5,
    },
  })

  it('leads with headlines and hides charts that have no data yet', () => {
    renderStats({ ...emptyWorld({}), organisms: [person('Ana', 0.81)] } as unknown as WorldState)
    expect(document.querySelectorAll('.stats-headline')).toHaveLength(4)
    expect(document.body.textContent).toContain('The story has only just begun.')
    expect(document.body.textContent).not.toContain(t('dialogs.stats.accumulating'))
    expect(document.body.textContent).not.toContain(t('dialogs.stats.firstYear'))
  })

  it('shows traits as words, and the numbers only with Stats for nerds', () => {
    renderStats({ ...emptyWorld({}), organisms: [person('Ana', 0.81)] } as unknown as WorldState)
    expect(document.body.textContent).toContain('very high')
    expect(document.body.textContent).not.toContain(formatNumber(0.81, { minimumFractionDigits: 2 }))
    act(() => root?.unmount())
    useUIStore.setState({ nerdStats: true })
    renderStats({ ...emptyWorld({}), organisms: [person('Ana', 0.81)] } as unknown as WorldState)
    expect(document.body.textContent).toContain(formatNumber(0.81, { minimumFractionDigits: 2 }))
  })
})

describe('StatsModal counts', () => {
  it('writes the births count with the same grouping as every other count', () => {
    useUIStore.setState({ nerdStats: true })
    renderStats(emptyWorld({ births: 12345 }))
    openTab('world')
    const values = [...document.querySelectorAll('.hist-val')].map((el) => el.textContent)
    expect(values).toContain(formatNumber(12345))
    expect(values).not.toContain('12345')
  })

  it('writes each cause of death with the same grouping', () => {
    useUIStore.setState({ nerdStats: true })
    renderStats(emptyWorld({ deaths_starvation: 2345, deaths_old_age: 1000, droughts: 1200 }))
    openTab('world')
    const values = [...document.querySelectorAll('.stats-bar-value, .hist-val')].map((el) => el.textContent)
    expect(values).toContain(formatNumber(2345))
    expect(values).toContain(formatNumber(1000))
    expect(values).toContain(formatNumber(1200))
    expect(values).not.toContain('2345')
  })

  it('names the tribe of the longest life by the name it had, once that tribe has died out', () => {
    // A snapshot from while the tribe still lived, then one where its name is gone.
    useWorldStore.getState().setWorld({
      tick: 10,
      organisms: [],
      lineage_names: { 'gone-line': 'Gonefolk' },
    } as unknown as WorldState)
    const oldAge = {
      id: 'ada',
      name: 'Ada',
      alive: false,
      death_cause: 'old age',
      age: 9000,
      lineage_id: 'gone-line',
      sex: 'female',
    }
    renderStats({ ...emptyWorld({}), organisms: [oldAge] } as unknown as WorldState)
    openTab('records')

    expect(document.body.textContent).toContain('Gonefolk')
    expect(document.body.textContent).not.toContain('gone-l')
  })
})
