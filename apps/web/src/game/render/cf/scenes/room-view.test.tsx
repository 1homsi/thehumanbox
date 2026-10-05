// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SceneContext } from '../../../scenes/core/types'
import { CANVAS_H, CANVAS_W, SCALE } from '../../../scenes/shared/room-constants'
import { engineHarness, pointer, type EngineHarness } from '../engine-harness.test-util'
import { CfRoomView } from './CfRoomView'
import type { RoomPainter } from './room-model'

/**
 * A room on cubeforge, with a real engine and no GPU: it paints its backdrop
 * every frame, shows the cursor and ring state of whoever is hovered, and
 * selects on a tap, through the engine's own coordinate conversion and
 * SpriteLayer.pick().
 */

let harness: EngineHarness | null = null
afterEach(async () => {
  await harness?.unmount()
  harness = null
})

function scene(): SceneContext {
  return {
    scene: { kind: 'home', orgId: 'a' },
    world: {},
    title: 'Home',
    subtitle: '',
    isDay: true,
    occupants: [
      {
        org: { id: 'a', name: 'Ada', sex: 'female', age: 30, max_age: 80 },
        role: 'host',
        activity: '',
      },
    ],
    away: [],
    fixtures: [],
  } as unknown as SceneContext
}

async function open(selected: string | null = null) {
  harness = engineHarness()
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(CANVAS_W * SCALE)
  const paintBack = vi.fn()
  const painter: RoomPainter = { slots: [[7, 5]], paintBack, nightLights: [] }
  const onSelectOrg = vi.fn()
  await harness.renderRaw(
    <CfRoomView ctx={scene()} painter={painter} selectedOrgId={selected} onSelectOrg={onSelectOrg} />,
  )
  await harness.frame(4)
  return { h: harness, paintBack, onSelectOrg }
}

/** Where a point of the room lands on the canvas: the camera looks at the middle at SCALE times. */
const onScreen = (x: number, y: number) => ({
  x: (x - CANVAS_W / 2) * SCALE + (CANVAS_W * SCALE) / 2,
  y: (y - CANVAS_H / 2) * SCALE + (CANVAS_H * SCALE) / 2,
})

describe('the room on cubeforge', () => {
  it('is the size of the 2D canvas and paints its backdrop every frame', async () => {
    const { h, paintBack } = await open()
    const canvas = h.canvas()
    expect(canvas.style.width).toBe(CANVAS_W * SCALE + 'px')
    expect(canvas.style.height).toBe(CANVAS_H * SCALE + 'px')
    const painted = paintBack.mock.calls.length
    await h.frame(5)
    expect(paintBack.mock.calls.length).toBeGreaterThanOrEqual(painted + 5)
    // The painter is handed a 2D context and the clock.
    expect(paintBack.mock.calls[0][1]).toEqual(expect.any(Number))
  })

  it('shows a pointer over a person and selects them on a tap', async () => {
    const { h, onSelectOrg } = await open()
    const canvas = h.canvas()
    // Ada stands on slot (7, 5): feet at (112, 80), hit circle centred two pixels above.
    const at = onScreen(112, 78)
    canvas.dispatchEvent(pointer('pointermove', at.x, at.y))
    expect(canvas.style.cursor).toBe('pointer')
    canvas.dispatchEvent(pointer('pointerdown', at.x, at.y))
    canvas.dispatchEvent(pointer('pointerup', at.x, at.y))
    expect(onSelectOrg).toHaveBeenCalledExactlyOnceWith('a')
  })

  it('ignores a tap on the floor and puts the cursor back', async () => {
    const { h, onSelectOrg } = await open()
    const canvas = h.canvas()
    const person = onScreen(112, 78)
    canvas.dispatchEvent(pointer('pointermove', person.x, person.y))
    const floor = onScreen(40, 120)
    canvas.dispatchEvent(pointer('pointermove', floor.x, floor.y))
    expect(canvas.style.cursor).toBe('default')
    canvas.dispatchEvent(pointer('pointerdown', floor.x, floor.y))
    canvas.dispatchEvent(pointer('pointerup', floor.x, floor.y))
    expect(onSelectOrg).not.toHaveBeenCalled()
  })

  it('misses a tap just outside the 14 pixel circle', async () => {
    const { h, onSelectOrg } = await open()
    const canvas = h.canvas()
    const edge = onScreen(112 + 14.5, 78)
    canvas.dispatchEvent(pointer('pointerdown', edge.x, edge.y))
    canvas.dispatchEvent(pointer('pointerup', edge.x, edge.y))
    expect(onSelectOrg).not.toHaveBeenCalled()
    const inside = onScreen(112 + 13.5, 78)
    canvas.dispatchEvent(pointer('pointerdown', inside.x, inside.y))
    canvas.dispatchEvent(pointer('pointerup', inside.x, inside.y))
    expect(onSelectOrg).toHaveBeenCalledWith('a')
  })
})
