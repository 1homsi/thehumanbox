// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrganismState, OrgLife, WorldState } from '../shared/types'
import { SimulationDataContext } from '../simulation/simulationData'
import { useUIStore } from '../state/store'
import { useWorldStore } from '../state/worldStore'
import { AllLineagesModal } from './modals/AllLineagesModal'
import { LifeModal } from './modals/LifeModal'
import { NotableOrgsModal } from './modals/NotableOrgsModal'
import { GenerationBars } from './modals/stats/GenerationBars'
import { NotableOrgs } from './modals/stats/NotableOrgs'
import { FamilyTreeModal } from './modals/FamilyTreeModal'
import { LineagesList } from './panels/LineagesList'
import { RightPanel } from './panels/RightPanel'

// The stored generation counts from 0 (the founders); people see the founders as generation 1.
// Every place a person's or a tribe's generation is written must add one.

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

let root: Root | null = null
let host: HTMLElement | null = null
function mount(el: React.ReactElement): HTMLElement {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(el))
  return host
}
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  host?.remove()
  host = null
  document.body.replaceChildren()
})

function founder(id: string, extra: Partial<OrganismState> = {}): OrganismState {
  return {
    id,
    name: id.toUpperCase(),
    alive: true,
    age: 900,
    max_age: 12000,
    generation: 0,
    lineage_id: 'L',
    sex: 'female',
    x: 0,
    y: 0,
    parent_id: '',
    energy: 1,
    hydration: 1,
    health: 1,
    infection: 0,
    thought: '',
    discoveries: [],
    traits: { aggression: 0.5, curiosity: 0.5, social_tendency: 0.5, memory_strength: 0.5, resilience: 0.5 },
    ...extra,
  } as unknown as OrganismState
}

describe('generation numbers', () => {
  beforeEach(() => {
    useUIStore.setState({ panelOpen: true, focus: 'all' })
  })

  it('the right panel names a dead founder as generation 1', () => {
    const dead = founder('d', { alive: false, generation: 0 })
    mount(
      <RightPanel
        world={{ organisms: [dead] } as unknown as WorldState}
        liveOrgs={[]}
        deadOrgs={[dead]}
        selectedOrg={null}
      />,
    )
    const text = document.querySelector('.org-card.dead')?.textContent ?? ''
    expect(text).toContain('g1')
    expect(text).not.toContain('g0')
  })

  it('the tribe list names the founding generation as g1', () => {
    useWorldStore.setState({
      world: { tick: 0, organisms: [founder('a')], lineage_names: { L: 'Lions' } } as unknown as WorldState,
    })
    mount(<LineagesList />)
    const gen = document.querySelector('.lineage-gen')?.textContent ?? ''
    expect(gen).toContain('g1')
    expect(gen).not.toContain('g0')
  })

  it('the all-tribes dialog names the founding generation as g1', () => {
    mount(
      <AllLineagesModal
        lineages={{ L: { count: 1, minGen: 0, maxGen: 0, orgs: [] } }}
        lineageWords={{}}
        lineageNames={{ L: 'Lions' }}
        peril={[]}
        facts={[] as never}
        onClose={() => {}}
      />,
    )
    const gen = document.querySelector('.lineage-gen')?.textContent ?? ''
    expect(gen).toContain('g1')
    expect(gen).not.toContain('g0')
  })

  it('the notable people dialog names a founder as gen 1', () => {
    mount(<NotableOrgsModal organisms={[founder('a'), founder('b', { generation: 2 })]} onClose={() => {}} />)
    const text = document.body.textContent ?? ''
    expect(text).toContain('gen 1')
    expect(text).not.toContain('gen 0')
  })

  it('the stats notable list names a founder as gen 1', () => {
    const text = mount(<NotableOrgs organisms={[founder('a')]} />).textContent ?? ''
    expect(text).toContain('g1')
    expect(text).not.toContain('g0')
  })

  it('the living-by-generation bars label the founders as gen 1', () => {
    const host2 = mount(<GenerationBars organisms={[founder('a')]} />)
    const text = host2.textContent ?? ''
    expect(text).toContain('gen 1')
    expect(text).not.toContain('gen 0')
  })

  it('the life story names a founder as generation 1', async () => {
    const life = {
      id: 'a',
      name: 'A',
      age_ticks: 900,
      generation: 0,
      lineage_id: 'L',
      sex: 'female',
      alive: true,
      is_elder: false,
      children_count: 0,
      friends: [],
      discoveries: [],
      emotional_state: '',
      events: [],
    } as unknown as OrgLife
    const access = {
      apiEnabled: false,
      playerWorldKind: 'local',
      loadLocalOrgDetail: async () => null,
      loadLocalOrgLife: async () => life,
    } as never
    mount(
      <SimulationDataContext.Provider value={access}>
        <LifeModal orgId="a" orgName="A" onClose={() => {}} />
      </SimulationDataContext.Provider>,
    )
    await vi.waitFor(() => expect(document.querySelector('.life-modal')?.textContent).toContain('gen'))
    const text = document.querySelector('.life-modal')?.textContent ?? ''
    expect(text).toContain('gen 1')
    expect(text).not.toContain('gen 0')
  })

  it('the family tree labels its first generation as generation 1', () => {
    const drawn: string[] = []
    const ctx = new Proxy(
      { measureText: () => ({ width: 0 }), fillText: (text: string) => drawn.push(String(text)) },
      { get: (target, key: string) => (target as Record<string, unknown>)[key] ?? (() => undefined) },
    ) as unknown as CanvasRenderingContext2D
    vi.stubGlobal('Path2D', class {})
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx)
    mount(<FamilyTreeModal organisms={[founder('a')]} currentTick={0} onClose={() => {}} />)
    const labels = drawn.filter((text) => text.toLowerCase().includes('generation'))
    expect(labels.join(' | ')).toContain('1')
    expect(labels.join(' | ')).not.toMatch(/generation\s+0\b/)
  })
})
