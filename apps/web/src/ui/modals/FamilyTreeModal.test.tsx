// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { select } from 'd3-selection'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { FamilyTreeModal } from './FamilyTreeModal'
import type { OrganismState } from '../../shared/types'

// happy-dom has no 2D canvas; the tree's draw calls only need to be no-ops here.
const ctx = new Proxy({ measureText: () => ({ width: 0 }) }, {
  get: (target, key: string) => target[key as keyof typeof target] ?? (() => undefined),
}) as unknown as CanvasRenderingContext2D

beforeAll(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('Path2D', class {})
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx)
})
afterAll(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
const roots: Array<{ unmount: () => void }> = []
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
})

function org(id: string, parent: string | null, generation: number): OrganismState {
  return {
    id,
    name: id.toUpperCase(),
    alive: true,
    x: 0,
    y: 0,
    sex: 'female',
    age: 900,
    energy: 0.9,
    hydration: 0.9,
    health: 0.9,
    infection: 0,
    thought: '',
    lineage_id: 'L',
    generation,
    parent_id: parent ?? '',
  } as unknown as OrganismState
}

const ORGS = [org('a', null, 0), org('b', 'a', 1)]

function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  roots.push(root)
  act(() =>
    root.render(<FamilyTreeModal organisms={ORGS} currentTick={0} onClose={() => {}} />),
  )
  return document.querySelector<HTMLCanvasElement>('.tree-modal canvas')!
}

describe('FamilyTreeModal', () => {
  it('attaches pan/zoom to the tree canvas', () => {
    const canvas = mount()
    expect(select(canvas).on('wheel.zoom')).not.toBeUndefined()
  })

  it('the + button zooms the tree', async () => {
    const canvas = mount()
    // The open-time fit sets the starting scale; happy-dom has no layout, so it is not 1.
    const zoomed = canvas as HTMLCanvasElement & { __zoom?: { k: number } }
    const before = zoomed.__zoom!.k
    const plus = document.querySelectorAll<HTMLButtonElement>('.tree-zoom-btn')[0]
    act(() => plus.click())
    await act(() => new Promise((r) => setTimeout(r, 400)))
    expect(zoomed.__zoom?.k).toBeCloseTo(before * 1.25, 6)
  })
})
