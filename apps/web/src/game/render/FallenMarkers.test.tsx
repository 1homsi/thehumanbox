// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { FallenMarkers } from './FallenMarkers'
import { markerScreenPoint } from './fallen-marker-position'
import { useUIStore } from '../../state/store'
import { t } from '../../i18n'
import { calendarAt } from '../model/calendar'
import { causeText } from '../model/tribe-end'
import { TILE } from '../model/palette'
import type { WorldState } from '../../shared/types'
import type { MapCamera } from './camera-controls'

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterAll(() => vi.unstubAllGlobals())
const roots: Root[] = []
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
  useUIStore.setState({ focus: 'all' })
})

describe('markerScreenPoint', () => {
  it('projects a tile to the screen the way the brush ring does: centre of the tile, camera at the middle', () => {
    const camera: MapCamera = { x: 0, y: 0, zoom: 1 }
    const viewport = { w: 200, h: 100 }
    // Tile (0, 0) with its centre at half a tile in, plus the half-viewport offset.
    expect(markerScreenPoint([0, 0], { x: 0, y: 0 }, camera, viewport)).toEqual({
      x: TILE / 2 + 100,
      y: TILE / 2 + 50,
    })
    // Zooming in doubles the distance from the camera; the origin shifts the tile.
    const zoomed = markerScreenPoint([12, 15], { x: 10, y: 10 }, { x: 0, y: 0, zoom: 2 }, viewport)
    expect(zoomed.x).toBeCloseTo(2.5 * TILE * 2 + 100)
    expect(zoomed.y).toBeCloseTo(5.5 * TILE * 2 + 50)
  })
})

describe('FallenMarkers', () => {
  function mount(world: WorldState) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    roots.push(root)
    const cameraRef = { current: { x: 0, y: 0, zoom: 1 } as MapCamera }
    act(() =>
      root.render(<FallenMarkers world={world} cameraRef={cameraRef} viewport={{ w: 400, h: 300 }} />),
    )
    return host
  }

  const world = {
    tick: 9000,
    grid: { width: 64, height: 64, origin_x: 0, origin_y: 0 },
    organisms: [{ alive: true, lineage_id: 'alive' }],
    lineage_names: { gone: 'Hearth' },
    tribe_chronicle: {
      alive: [{ tick: 40, kind: 'extinct', other: null, word: 'war', x: 1, y: 1 }],
      gone: [{ tick: 700, kind: 'extinct', other: null, word: 'starvation', x: 12, y: 15 }],
      unplaced: [{ tick: 800, kind: 'extinct', other: null, word: null, x: null, y: null }],
    },
  } as unknown as WorldState

  it('marks each fallen tribe that has a place, and no living one', () => {
    const host = mount(world)
    const marks = [...host.querySelectorAll('button.fallen-marker')] as HTMLButtonElement[]
    expect(marks).toHaveLength(1)
    expect(marks[0]!.title).toBe(
      t('panels.tribe.fallen.markerCause', {
        name: 'Hearth',
        year: calendarAt(700).year,
        cause: causeText('starvation'),
      }),
    )
  })

  it('opens the tribe card when its mark is clicked', () => {
    const host = mount(world)
    const mark = host.querySelector('button.fallen-marker') as HTMLButtonElement
    act(() => mark.click())
    expect(useUIStore.getState().focus).toBe('fallen:gone')
  })
})
