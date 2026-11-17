// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrganismState, WorldState } from '../../shared/types'
import { useUIStore } from '../../state/store'
import { PEOPLE_PAGE_SIZE, RightPanel } from './RightPanel'

vi.mock('./OrgCard', () => ({
  OrgCard: ({ orgId }: { orgId: string }) => <div className="fake-org-card">{orgId}</div>,
}))
vi.mock('../../shared/observability', () => ({ trackEvent: vi.fn() }))

const lazyLoads = vi.hoisted(() => [] as Promise<unknown>[])
vi.mock('../../shared/lazyWithRetry', async () => {
  const { lazy } = await import('react')
  type Component = import('react').ComponentType<object>
  return {
    lazyWithRetry: (factory: () => Promise<{ default: Component }>) => {
      let loaded: { default: Component } | undefined
      const load = factory().then((m) => (loaded = m))
      lazyLoads.push(load)
      return lazy(() => {
        if (!loaded) throw new Error('lazy chunk was rendered before the test preloaded it')
        const ready = loaded
        return { then: (resolve: (m: { default: Component }) => void) => resolve(ready) } as Promise<{
          default: Component
        }>
      })
    },
  }
})

const observers: Array<{ fire: (visible: boolean) => void }> = []
class FakeObserver {
  constructor(callback: IntersectionObserverCallback) {
    observers.push({
      fire: (visible) => callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as never),
    })
  }
  observe() {}
  disconnect() {}
}

beforeAll(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('IntersectionObserver', FakeObserver)
  await Promise.all(lazyLoads)
})
afterAll(() => vi.unstubAllGlobals())
beforeEach(() => {
  vi.useFakeTimers()
})
let root: Root | null = null
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  vi.useRealTimers()
  observers.length = 0
  document.body.replaceChildren()
  useUIStore.setState({ panelOpen: false, selectedOrgId: null, renamingOrgId: null })
})

const person = (i: number) =>
  ({
    id: `p${i}`,
    name: `Person${i}`,
    alive: true,
    age: 1000,
    max_age: 12000,
    generation: 1,
    thought: '',
    lineage_id: 'L',
    energy: 1,
    hydration: 1,
    health: 1,
    infection: 0,
    carrying: 0,
    traits: {
      curiosity: 0.5,
      aggression: 0.5,
      fear: 0.5,
      memory_strength: 0.5,
      social_tendency: 0.5,
      resilience: 0.5,
    },
  }) as unknown as OrganismState

async function renderPanel(people: OrganismState[]) {
  const world = { organisms: people, lineage_names: {} } as unknown as WorldState
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  const draw = () => {
    const id = useUIStore.getState().selectedOrgId
    const selected = people.find((p) => p.id === id) ?? null
    root?.render(<RightPanel world={world} liveOrgs={people} deadOrgs={[]} selectedOrg={selected} />)
  }
  await act(async () => draw())
  return { host, draw }
}

const cardIds = (host: HTMLElement) => [...host.querySelectorAll('.fake-org-card')].map((c) => c.textContent)

describe('RightPanel', () => {
  it('shows a dead person’s age in years, as the living cards do, not in ticks', () => {
    useUIStore.setState({ panelOpen: true })
    const dead = {
      id: 'd',
      name: 'Dee',
      alive: false,
      age: 6000,
      max_age: 12000,
      generation: 1,
      thought: '',
      lineage_id: 'L',
    } as unknown as OrganismState
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() =>
      root?.render(
        <RightPanel
          world={{ organisms: [dead], lineage_names: {} } as unknown as WorldState}
          liveOrgs={[]}
          deadOrgs={[dead]}
          selectedOrg={null}
        />,
      ),
    )
    const card = document.querySelector('.org-card.dead')?.textContent ?? ''
    expect(card).toContain('Dee')
    expect(card).not.toContain('6000')
    expect(card).toContain('yrs')
  })

  it('draws a short page of cards and adds more as the list scrolls', async () => {
    useUIStore.setState({ panelOpen: true })
    const people = Array.from({ length: 600 }, (_, i) => person(i))
    const { host } = await renderPanel(people)
    expect(cardIds(host)).toHaveLength(PEOPLE_PAGE_SIZE)

    await act(async () => observers.at(-1)!.fire(true))
    expect(cardIds(host)).toHaveLength(PEOPLE_PAGE_SIZE * 2)
    expect(cardIds(host).slice(0, 3)).toEqual(['p0', 'p1', 'p2'])

    await act(async () => observers.at(-1)!.fire(false))
    expect(cardIds(host)).toHaveLength(PEOPLE_PAGE_SIZE * 2)

    await act(async () => host.querySelector<HTMLButtonElement>('.people-load-more')!.click())
    expect(cardIds(host)).toHaveLength(PEOPLE_PAGE_SIZE * 3)
  })

  it('opens a person in their own drawer and keeps the list as it is', async () => {
    useUIStore.setState({ panelOpen: true })
    const people = Array.from({ length: 30 }, (_, i) => person(i))
    const { host, draw } = await renderPanel(people)
    await act(async () => useUIStore.getState().selectOrg('p3'))
    await act(async () => draw())
    expect(host.querySelector('.person-drawer')).not.toBeNull()
    expect(host.querySelector('.person-drawer')?.getAttribute('data-person-id')).toBe('p3')
    expect(host.querySelector('.person-drawer.beside-list')).not.toBeNull()
    expect(cardIds(host)).toHaveLength(PEOPLE_PAGE_SIZE)

    await act(async () =>
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    )
    expect(useUIStore.getState().selectedOrgId).toBeNull()
  })

  it('gives the name tool a focused field in the person drawer, wherever they are in the list', async () => {
    const people = Array.from({ length: 100 }, (_, i) => person(i))
    const { host, draw } = await renderPanel(people)
    await act(async () => useUIStore.getState().startRename('p99'))
    await act(async () => draw())
    expect(host.querySelector('.person-drawer input')).not.toBeNull()
    const input = host.querySelector<HTMLInputElement>('.person-drawer input')!
    expect(input.value).toBe('Person99')
    expect(document.activeElement).toBe(input)
    expect(host.querySelectorAll('input')).toHaveLength(1)

    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(useUIStore.getState().selectedOrgId).toBe('p99')
  })

  it('starts fresh when the name tool is pointed at someone else', async () => {
    const people = Array.from({ length: 10 }, (_, i) => person(i))
    const { host, draw } = await renderPanel(people)
    await act(async () => useUIStore.getState().startRename('p5'))
    await act(async () => draw())
    expect(host.querySelector('.person-drawer input')).not.toBeNull()
    await act(async () => useUIStore.getState().startRename('p6'))
    await act(async () => draw())
    const input = host.querySelector<HTMLInputElement>('.person-drawer input')
    expect(input?.value).toBe('Person6')
    expect(input).toBe(document.activeElement)
  })
})
