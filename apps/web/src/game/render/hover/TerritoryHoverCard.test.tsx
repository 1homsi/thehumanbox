// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TerritoryHoverCard } from './TerritoryHoverCard'
import { buildTerritoryIndex } from '../../model/territory'
import type { WorldState } from '../../../shared/types'
import type { MapCamera } from '../camera-controls'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

const roots: Root[] = []
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
})

describe('TerritoryHoverCard', () => {
  it('renders settlement population and building counts on hover', () => {
    const host = document.createElement('div')
    const container = document.createElement('div')
    // Container size 800x600, positioned at (0, 0)
    container.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
        right: 800,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: () => {},
      }) as DOMRect
    document.body.append(host, container)
    const root = createRoot(host)
    roots.push(root)

    const cameraRef = { current: { x: 80, y: 80, zoom: 1 } as MapCamera }
    const viewport = { w: 800, h: 600 }
    const territoryIndex = buildTerritoryIndex({
      claimed: [{ lid: 'l1', tiles: [[10, 10]] }],
      contested: [],
    })

    const world = {
      tick: 1,
      grid: { width: 100, height: 100, origin_x: 0, origin_y: 0 },
      organisms: [{ id: 'p1', lineage_id: 'l1', alive: true, age: 100 }],
      lineage_names: { l1: 'Jelzobaf Tribe' },
      settlements: [
        {
          lineage_id: 'l1',
          name: 'Jelzobaf',
          population: 58,
          building_count: 44,
          tier: 5,
          tier_name: 'city',
          center: [10, 10],
        },
      ],
    } as unknown as WorldState

    act(() => {
      root.render(
        <TerritoryHoverCard
          world={world}
          cameraRef={cameraRef}
          viewport={viewport}
          container={container}
          enabled={true}
          territoryIndex={territoryIndex}
        />,
      )
    })

    // Pointer move over container at center (400, 300) -> map coords (80, 80) -> tile (10, 10)
    act(() => {
      const event = new MouseEvent('pointermove', { clientX: 400, clientY: 300, bubbles: true })
      container.dispatchEvent(event)
    })

    expect(host.textContent).toContain('58 people · 44 buildings')
  })
})
