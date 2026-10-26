// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TerritoryHoverCard } from './TerritoryHoverCard'
import { buildTerritoryIndex } from '../../model/territory'
import type { WorldState } from '../../../shared/types'
import type { MapCamera } from '../camera-controls'
import { loadLocale, t } from '../../../i18n'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

const roots: Root[] = []
afterEach(async () => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.replaceChildren()
  await loadLocale('en')
})

/** Renders the hover card for a world and points at tile (10, 10), where the tribe l1 has its land. */
function hoverCardText(world: WorldState): string {
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

  return host.textContent ?? ''
}

function tribeWorld(): WorldState {
  return {
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
}

describe('TerritoryHoverCard', () => {
  it('renders settlement population and building counts on hover', () => {
    expect(hoverCardText(tribeWorld())).toContain('58 people · 44 buildings')
  })

  it('words the card in the active language, including its plural nouns and labels', async () => {
    await loadLocale('de')
    const text = hoverCardText(tribeWorld())
    expect(text).toContain(
      `${t('panels.tribe.people', { count: '58' })} · ${t('model.territory.buildings', { count: '44' })}`,
    )
    expect(text).toContain(t('model.territory.noLeader'))
    expect(text).not.toContain('no leader')
  })

  it('gives the ground under the pointer in the tribe card, on its own line', () => {
    const world = tribeWorld()
    world.grid = {
      ...world.grid,
      tiles: Array.from({ length: 100 }, (_, row) =>
        Array.from({ length: 100 }, (_c, col) => (row === 10 && col === 10 ? 2 : 1)),
      ),
      depth_map: Array.from({ length: 100 }, (_, row) =>
        Array.from({ length: 100 }, (_c, col) => (row === 10 && col === 10 ? 120 : 255)),
      ),
    } as WorldState['grid']
    expect(hoverCardText(world)).toContain('deep water')
  })

  // Polish writes 10,001 with a space and picks its plural from the number, so the card must pass the number.
  it('picks the plural of a large count from the number, not from its grouped text', async () => {
    await loadLocale('pl')
    try {
      const world = tribeWorld()
      world.settlements![0].building_count = 10001
      const text = hoverCardText(world)
      expect(text).toContain(t('model.territory.buildings', { count: '10001' }))
      expect(text).toContain('10001 budynków')
    } finally {
      await loadLocale('en')
    }
  })
})
