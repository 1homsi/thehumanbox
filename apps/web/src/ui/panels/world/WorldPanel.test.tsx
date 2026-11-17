// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUIStore } from '../../../state/store'
import { useWorldStore } from '../../../state/worldStore'
import type { WorldState } from '../../../shared/types'
import { WorldPanel } from './WorldPanel'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

let host: HTMLDivElement
let root: Root

const person = (id: string, lineage: string) => ({
  id,
  name: id,
  alive: true,
  lineage_id: lineage,
  generation: 1,
  energy: 0.8,
  health: 0.8,
  hydration: 0.8,
  infection: 0,
  x: 1,
  y: 1,
})

const world = {
  tick: 4000,
  season: 'abundance',
  is_day: true,
  day_progress: 0.3,
  weather: { kind: 'rain' },
  current_era: 'stone',
  organisms: [person('Ana', 'a'), person('Bo', 'a'), person('Cy', 'b')],
  lineage_sizes: [
    { id: 'a', count: 2 },
    { id: 'b', count: 1 },
  ],
  lineage_names: { a: 'Ama', b: 'Bo' },
  history: { births: 12, deaths_old_age: 0, deaths_starvation: 3 },
  events: [{ tick: 3900, type: 'treaty', actor: 'Ama', detail: 'Ama and Bo made peace', news: true }],
  animals: [],
} as unknown as WorldState

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => useWorldStore.getState().setWorld(world))
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  useWorldStore.setState({ world: null, byId: new Map() })
  useUIStore.setState({ nerdStats: false })
})

function render() {
  act(() => root.render(<WorldPanel world={world} />))
}

describe('the world panel', () => {
  it('tells the story in words, without raw counters', () => {
    useUIStore.setState({ nerdStats: false })
    render()
    const text = host.textContent ?? ''
    expect(text).toContain('Year 1, summer')
    expect(text).toContain('Rain is falling')
    expect(text).toContain('3 people live in 2 tribes.')
    expect(text).toContain('made peace')
    expect(text).toContain('Ama')
    expect(text).not.toContain('WORLD HISTORY')
    expect(text).toContain('Stats for nerds')
    expect(host.querySelector('.event-tick')).toBeNull()
  })

  it('adds the raw counters and the full log with Stats for nerds on, hiding zero rows', () => {
    useUIStore.setState({ nerdStats: true })
    render()
    const text = host.textContent ?? ''
    expect(text).toContain('WORLD HISTORY')
    expect(text).toContain('starvation')
    expect(text).not.toContain('old age')
    expect(host.querySelector('.event-tick')).not.toBeNull()
  })
})
