// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import type { OrganismState, WorldState } from '../../shared/types'
import { useUIStore } from '../../state/store'
import { useWorldStore } from '../../state/worldStore'
import { OrgCard } from './OrgCard'

vi.mock('../../shared/observability', () => ({ trackEvent: vi.fn() }))

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
let root: Root | null = null
afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
  useUIStore.setState({ selectedOrgId: null, followOrgId: null, renamingOrgId: null, nerdStats: false })
})

const ada = {
  id: 'ada',
  name: 'Ada',
  surname: 'Kel',
  alive: true,
  age: 100,
  max_age: 12000,
  generation: 0,
  thought: 'walk_to_overlook',
  lineage_id: 'f1e5861d',
  energy: 0.15,
  hydration: 0.8,
  health: 0.9,
  infection: 0,
  carrying: 0,
  memory_count: { food: 14, water: 9, danger: 0 },
  traits: {
    curiosity: 0.92,
    aggression: 0.5,
    fear: 0.5,
    memory_strength: 0.5,
    social_tendency: 0.5,
    resilience: 0.5,
  },
} as unknown as OrganismState

function mount() {
  useWorldStore
    .getState()
    .setWorld({ tick: 1, organisms: [ada], lineage_names: { f1e5861d: 'Riznuk' } } as unknown as WorldState)
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(<OrgCard orgId="ada" />))
  return host
}

it('reads without a legend: tribe name, age, what they are doing, a standout trait and how they are', () => {
  const host = mount()
  const text = host.textContent ?? ''
  expect(text).toContain('Ada')
  expect(text).toContain('Riznuk')
  expect(text).toContain('first year')
  expect(text).toContain('Walk to overlook')
  expect(host.querySelector('.person-trait')?.textContent).toBe('curious')
  expect(host.querySelector('.person-cond.bad')?.textContent).toBe('hungry')
  expect(text).not.toMatch(/f1e5861d|\bcur\b|\bagg\b|%|f14/)
  expect(host.querySelector('.org-tree-btn')).toBeNull()
  expect(host.querySelector('svg')).not.toBeNull()
})

it('shows the raw numbers only with Stats for nerds on', () => {
  const host = mount()
  act(() => useUIStore.getState().setNerdStats(true))
  const nerd = host.querySelector('.person-card-nerd')?.textContent ?? ''
  expect(nerd).toContain('15%')
  expect(nerd).toContain('cur 92')
  expect(nerd).toContain('f1e5861d')
  expect(nerd).toContain('f14')
})

it('every action does something visible', () => {
  const host = mount()
  act(() => host.querySelector<HTMLButtonElement>('.org-info-btn')!.click())
  expect(useUIStore.getState().selectedOrgId).toBe('ada')
  act(() => host.querySelector<HTMLButtonElement>('.org-track-btn')!.click())
  expect(useUIStore.getState().followOrgId).toBe('ada')
  expect(host.querySelector('.org-track-btn')?.getAttribute('aria-pressed')).toBe('true')
  act(() => host.querySelector<HTMLButtonElement>('.org-rename-btn')!.click())
  expect(useUIStore.getState().renamingOrgId).toBe('ada')
})
