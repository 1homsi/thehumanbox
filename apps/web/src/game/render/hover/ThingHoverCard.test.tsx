// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ThingHoverCard } from './ThingHoverCard'
import type { WorldState } from '../../../shared/types'
import type { MapCamera } from '../camera-controls'
import { loadLocale } from '../../../i18n'
import { registerPeopleLayer } from '../cf/picking'
import { buildTerritoryIndex } from '../../model/territory'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())

const roots: Root[] = []
afterEach(async () => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.replaceChildren()
  await loadLocale('en')
})

/**
 * Renders the card over a 800x600 map (camera at tile 10, 10) and moves the pointer to the screen
 * centre, which is map tile (10, 10). Returns the card's text after the move.
 */
/** The box element of the last card rendered by `cardTextAt`. */
let lastBox: HTMLElement | null = null

function cardTextAt(
  world: WorldState,
  { enabled = true, buttons = 0, claimed = [] as [number, number][], armedAfter = false } = {},
): string {
  const host = document.createElement('div')
  const container = document.createElement('div')
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
  // Tiles are 8 map pixels: the camera centre at (80, 80) is tile (10, 10).
  const cameraRef = { current: { x: 80, y: 80, zoom: 1 } as MapCamera }

  const renderWith = (on: boolean) =>
    act(() => {
      root.render(
        <ThingHoverCard
          world={world}
          cameraRef={cameraRef}
          viewport={{ w: 800, h: 600 }}
          container={container}
          enabled={on}
          territoryIndex={buildTerritoryIndex({
            claimed: claimed.length > 0 ? [{ lid: 'l1', tiles: claimed }] : [],
            contested: [],
          })}
        />,
      )
    })
  renderWith(enabled)
  act(() => {
    container.dispatchEvent(
      new MouseEvent('pointermove', { clientX: 400, clientY: 300, buttons, bubbles: true }),
    )
  })
  // A tool armed while the card shows takes it down right away.
  if (armedAfter) renderWith(false)
  lastBox = host.firstElementChild as HTMLElement
  return lastBox.textContent ?? ''
}

function townWorld(): WorldState {
  return {
    tick: 1,
    grid: { width: 100, height: 100, origin_x: 0, origin_y: 0 },
    organisms: [{ id: 'p1', name: 'Ada', lineage_id: 'l1', alive: true, age: 100 }],
    lineage_names: { l1: 'The Reds' },
    buildings: [
      {
        id: 1,
        kind: 'granary',
        x: 10,
        y: 10,
        footprint: [1, 1],
        owner_lineage: 'l1',
        condition: 1,
        damage: 0,
        occupants: ['p1'],
      },
    ],
  } as unknown as WorldState
}

/** Open sea-side ground: grass everywhere, and deep water on the tile (10, 10) under the pointer. */
function waterWorld(): WorldState {
  const tiles = Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => 1))
  const depth = Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => 255))
  tiles[10][10] = 2
  depth[10][10] = 100
  return {
    tick: 1,
    grid: { width: 12, height: 12, origin_x: 0, origin_y: 0, tiles, depth_map: depth },
    organisms: [],
    buildings: [],
  } as unknown as WorldState
}

describe('ThingHoverCard', () => {
  it('names the building under the pointer with its tribe and its state', () => {
    expect(cardTextAt(townWorld())).toBe(
      'Granary' + 'held by The Reds' + 'in good repair' + 'works here: Ada',
    )
  })

  it('reads the words in the player language', async () => {
    await loadLocale('de')
    expect(cardTextAt(townWorld())).toContain('Kornspeicher')
  })

  it('names unclaimed ground under the pointer, and nothing while a god tool is armed', () => {
    expect(cardTextAt({ ...townWorld(), buildings: [] } as unknown as WorldState)).toBe('')
    expect(cardTextAt(townWorld(), { enabled: false })).toBe('')
    expect(cardTextAt(waterWorld())).toBe('Deep water')
  })

  it('leaves claimed ground to the tribe card, which names the ground in its own line', () => {
    expect(cardTextAt(waterWorld(), { claimed: [[10, 10]] })).toBe('')
  })

  it('takes a shown card down as soon as a tool is armed, without another pointer move', () => {
    expect(cardTextAt(townWorld(), { armedAfter: true })).toBe('')
    expect(lastBox?.style.display).toBe('none')
  })

  it('shows no box for a thing whose card is empty, such as a planting of an unknown kind', () => {
    const world = { ...waterWorld(), plantings: [10, 10, 99, 1] } as unknown as WorldState
    expect(cardTextAt(world)).toBe('')
    expect(lastBox?.style.display).toBe('none')
  })

  it('shows nothing while the button is held (a drag, not a hover)', () => {
    expect(cardTextAt(townWorld(), { buttons: 1 })).toBe('')
  })

  it('yields to a person under the pointer, who has their own name tag', () => {
    const unregister = registerPeopleLayer(() => 'p1', { ids: [], px: [], py: [], hidden: [] } as never)
    try {
      expect(cardTextAt(townWorld())).toBe('')
    } finally {
      unregister()
    }
  })
})
