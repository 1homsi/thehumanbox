// @vitest-environment happy-dom
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorldState } from '../../../../shared/types'
import { useUIStore } from '../../../../state/store'
import { TILE } from '../../../model/palette'
import { WorldView } from '../../WorldView'
import { setWorldGPUForTests } from '../../world-view/gpu'
import { engineHarness, pointer, wheel, type EngineHarness } from '../engine-harness.test-util'

/**
 * The whole map on cubeforge, and the 2D fallback: a tap or click on a person selects them,
 * a drag pans and selects nobody. Runs the real WorldView with the real engine
 * (no GPU), so it covers the hook-up in WorldView as well as the controller.
 */

const WIDTH = 16
const HEIGHT = 10

function world(): WorldState {
  const matrix = (value: number) => Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(value))
  return {
    grid: {
      width: WIDTH,
      height: HEIGHT,
      tiles: matrix(1),
      fertility: matrix(0.7),
      structure: matrix(0),
      fire_intensity: matrix(0),
      food_trail: matrix(0),
      water_trail: matrix(0),
      path_trail: matrix(0),
      hazard: matrix(0),
    },
    tick: 100,
    frame_id: 1,
    organisms: [
      {
        id: 'p1',
        name: 'Ada',
        alive: true,
        x: 12.5,
        y: 6.5,
        home_x: 0,
        home_y: 0,
        age: 20,
        max_age: 80,
        sex: 'female',
        lineage_id: 'L0',
        parent_id: '',
        thought: '',
        action: '',
        generation: 1,
        energy: 80,
        hydration: 80,
        health: 100,
        infection: 0,
        carrying: 0,
        carrying_type: 0,
        discoveries: [],
        traits: {},
      },
    ],
    animals: [],
    buildings: [],
    settlements: [],
    is_day: true,
    day_progress: 0.4,
    season: 'abundance',
    season_progress: 0.5,
    lineage_names: {},
    weather: { kind: 'clear', intensity: 0 },
  } as unknown as WorldState
}

let harness: EngineHarness | null = null
afterEach(async () => {
  await harness?.unmount()
  harness = null
  useUIStore.setState({ selectedOrgId: null })
  setWorldGPUForTests(null)
})

async function open(props: Partial<ComponentProps<typeof WorldView>> = {}) {
  harness = engineHarness()
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500)
  vi.stubGlobal(
    'ImageData',
    class {
      data: Uint8ClampedArray
      constructor(data: Uint8ClampedArray) {
        this.data = data
      }
    },
  )
  await harness.renderRaw(<WorldView world={world()} {...props} />)
  await harness.frame(8)
  return harness
}

/** The camera the map is showing: the engine's own Camera2D, which the controller keeps clamped. */
function probeCamera() {
  const { engine } = (
    window as unknown as {
      __thbCf: {
        engine: {
          ecs: {
            query(type: string): number[]
            getComponent(id: number, type: string): { x: number; y: number; zoom: number }
          }
        }
      }
    }
  ).__thbCf
  const camera = engine.ecs.getComponent(engine.ecs.query('Camera2D')[0], 'Camera2D')
  return { x: camera.x, y: camera.y, zoom: camera.zoom }
}

/** Where the first person is on screen, from the camera the map is showing. */
function personOnScreen(camera: { x: number; y: number; zoom: number }) {
  return {
    x: (12.5 * TILE - camera.x) * camera.zoom + 400,
    y: (6.5 * TILE - camera.y) * camera.zoom + 250,
  }
}

describe('the map on cubeforge', () => {
  it('opens on the whole world, on both cameras', async () => {
    const h = await open()
    expect(document.querySelector('.map2d-world canvas')).not.toBeNull()
    const camera = probeCamera()
    expect(camera.x).toBe((WIDTH * TILE) / 2)
    expect(camera.y).toBe((HEIGHT * TILE) / 2)
    expect(camera.zoom).toBeCloseTo(Math.min(800 / (WIDTH * TILE), 500 / (HEIGHT * TILE)) * 0.95, 9)
    void h
  })

  it('a tap on a person selects them', async () => {
    const h = await open()
    const camera = probeCamera()
    const at = personOnScreen(camera)
    const canvas = h.canvas()
    canvas.dispatchEvent(pointer('pointerdown', at.x, at.y))
    canvas.dispatchEvent(pointer('pointerup', at.x, at.y))
    await h.frame(2)
    expect(useUIStore.getState().selectedOrgId).toBe('p1')
  })

  it('a tap on empty ground clears the selection', async () => {
    const h = await open()
    useUIStore.setState({ selectedOrgId: 'p1' })
    const canvas = h.canvas()
    canvas.dispatchEvent(pointer('pointerdown', 120, 120))
    canvas.dispatchEvent(pointer('pointerup', 120, 120))
    await h.frame(2)
    expect(useUIStore.getState().selectedOrgId).toBeNull()
  })

  it('a drag over a person pans and does not select them', async () => {
    const h = await open()
    const camera = probeCamera()
    const at = personOnScreen(camera)
    const canvas = h.canvas()
    // Zoomed in, so there is somewhere to pan to.
    canvas.dispatchEvent(wheel(at.x, at.y, -400))
    await h.frame(3)
    const closer = probeCamera()
    const grabbed = personOnScreen(closer)
    canvas.dispatchEvent(pointer('pointerdown', grabbed.x, grabbed.y))
    canvas.dispatchEvent(pointer('pointermove', grabbed.x + 30, grabbed.y + 5))
    canvas.dispatchEvent(pointer('pointerup', grabbed.x + 30, grabbed.y + 5))
    await h.frame(3)
    expect(useUIStore.getState().selectedOrgId).toBeNull()
    expect(probeCamera().x).toBeLessThan(closer.x)
  })
})

describe('placing a tool on the cubeforge map', () => {
  it('a tap applies the armed tool where it landed; a drag pans and applies nothing', async () => {
    const onSandboxApply = vi.fn()
    const h = await open({ sandboxArmed: true, onSandboxApply, sandboxToolId: null })
    const camera = probeCamera()
    const canvas = h.canvas()
    // A point of open ground: tile (3, 2) of the 16 x 10 map.
    const at = {
      x: (3.5 * TILE - camera.x) * camera.zoom + 400,
      y: (2.5 * TILE - camera.y) * camera.zoom + 250,
    }
    canvas.dispatchEvent(pointer('pointerdown', at.x, at.y))
    canvas.dispatchEvent(pointer('pointerup', at.x, at.y))
    await h.frame(2)
    expect(onSandboxApply).toHaveBeenCalledOnce()
    const [x, y] = onSandboxApply.mock.calls[0]
    expect(x).toBeCloseTo(3.5, 6)
    expect(y).toBeCloseTo(2.5, 6)
    onSandboxApply.mockClear()
    canvas.dispatchEvent(wheel(at.x, at.y, -400))
    await h.frame(3)
    const closer = probeCamera()
    canvas.dispatchEvent(pointer('pointerdown', 300, 200))
    canvas.dispatchEvent(pointer('pointermove', 340, 220))
    canvas.dispatchEvent(pointer('pointerup', 340, 220))
    await h.frame(3)
    expect(onSandboxApply).not.toHaveBeenCalled()
    expect(probeCamera().x).not.toBe(closer.x)
  })
})

describe('the 2D fallback map (no WebGL2)', () => {
  it('a click on a person selects them', async () => {
    setWorldGPUForTests(false)
    const h = await open()
    // The own camera does not publish itself; the opening view is the fit of the world.
    const zoom = Math.min(800 / (WIDTH * TILE), 500 / (HEIGHT * TILE)) * 0.95
    const at = personOnScreen({ x: (WIDTH * TILE) / 2, y: (HEIGHT * TILE) / 2, zoom })
    const container = document.querySelector('.map2d-world') as HTMLElement
    container.dispatchEvent(pointer('pointerdown', at.x, at.y))
    container.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: at.x, clientY: at.y }))
    await h.frame(2)
    expect(useUIStore.getState().selectedOrgId).toBe('p1')
  })
})
