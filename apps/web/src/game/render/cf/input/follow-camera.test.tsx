// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { useGame } from 'xipjs'
import type { MapCamera, MapCommand } from '../../camera-controls'
import { TILE } from '../../../model/palette'
import type { PeopleLabelSource } from '../people/people-labels'
import { registerPeopleLayer } from '../picking'
import { engineHarness, pointer, type EngineHarness } from '../engine-harness.test-util'
import { CfMapCameraController } from './CfMapCameraController'

/**
 * Following a person: the camera centres on where the people layer draws them this frame, which moves between
 * simulation frames, not on the tile the simulation last gave them.
 */

const WORLD = { w: 4800, h: 2400 }
const VIEW = { w: 800, h: 500 }

/** One person, drawn where the test puts her: the typed arrays are the layer's, so the test moves her by writing them. */
function personLayer(x: number, y: number) {
  const px = Float32Array.of(x)
  const py = Float32Array.of(y)
  const source: PeopleLabelSource = {
    orgs: [],
    ids: ['p1'],
    px,
    py,
    hidden: Uint8Array.of(0),
    phase: Uint16Array.of(0),
    step: { flipped: Uint8Array.of(0), movedAt: Float64Array.of(0) },
  }
  return { source, px, py }
}

interface Rig {
  h: EngineHarness
  camera: () => MapCamera
  /** The player starts following p1, who the simulation has at (x, y). */
  follow: (x: number, y: number) => Promise<void>
  /** A new simulation frame: p1 is at (x, y) in it. */
  simFrame: (x: number, y: number) => Promise<void>
  /** The people layer moved a person: wake the engine the way the sprite clock does, then run frames. */
  drawnMoved: () => Promise<void>
}

let engineHandle: { loop: { markDirty(): void } } | null = null
function Engine() {
  engineHandle = useGame()
  return null
}

const rigs: Rig[] = []
let unregister: (() => void) | null = null
afterEach(async () => {
  unregister?.()
  unregister = null
  while (rigs.length) await rigs.pop()!.h.unmount()
})

async function mount(): Promise<Rig> {
  const h = engineHarness()
  const cameraStateRef = { current: { x: 1000, y: 1000, zoom: 1.5 } }
  const commandRef: { current: MapCommand | null } = { current: null }
  const view = (followOrgId: string | null, x: number, y: number) => (
    <>
      <Engine />
      <CfMapCameraController
        worldW={WORLD.w}
        worldH={WORLD.h}
        containerW={VIEW.w}
        containerH={VIEW.h}
        containerEl={h.container}
        cameraStateRef={cameraStateRef}
        commandRef={commandRef}
        followOrgId={followOrgId}
        followTarget={followOrgId ? { x, y } : null}
      />
    </>
  )
  await h.render(view(null, 0, 0), VIEW)
  await h.frame(6)
  h.container.focus()
  const rig: Rig = {
    h,
    camera: () => ({ ...cameraStateRef.current }),
    follow: async (x, y) => {
      await h.render(view('p1', x, y), VIEW)
      await h.frame(6)
    },
    simFrame: async (x, y) => {
      await h.render(view('p1', x, y), VIEW)
      await h.frame(3)
    },
    drawnMoved: async () => {
      engineHandle?.loop.markDirty()
      await h.frame(3)
    },
  }
  rigs.push(rig)
  return rig
}

describe('following a person on the xipjs map', () => {
  it('keeps the camera on the person where they are drawn between simulation frames', async () => {
    // The simulation has her in the middle of tile (30, 20); the layer draws her there too.
    const person = personLayer(30.5 * TILE, 20.5 * TILE)
    unregister = registerPeopleLayer(() => null, person.source)
    const rig = await mount()
    await rig.follow(30.5 * TILE, 20.5 * TILE)
    expect(rig.camera().x).toBeCloseTo(30.5 * TILE, 3)

    // Between two simulation frames she walks a quarter of a tile right. No new simulation frame arrives.
    person.px[0] = 30.75 * TILE
    await rig.drawnMoved()
    expect(rig.camera().x).toBeCloseTo(30.75 * TILE, 3)
    expect(rig.camera().y).toBeCloseTo(20.5 * TILE, 3)
  })

  it('a new simulation frame does not snap the camera back to the tile the simulation gave', async () => {
    const person = personLayer(30.5 * TILE, 20.5 * TILE)
    unregister = registerPeopleLayer(() => null, person.source)
    const rig = await mount()
    await rig.follow(30.5 * TILE, 20.5 * TILE)
    person.px[0] = 30.75 * TILE
    await rig.drawnMoved()
    // The next simulation frame places her at the tile's start; the layer has drawn her a quarter in.
    await rig.simFrame(30 * TILE, 20 * TILE)
    expect(rig.camera().x).toBeCloseTo(30.75 * TILE, 3)
  })

  it('a drag by the player moves the camera away from the followed person, not back to them', async () => {
    const person = personLayer(30.5 * TILE, 20.5 * TILE)
    unregister = registerPeopleLayer(() => null, person.source)
    const rig = await mount()
    await rig.follow(30.5 * TILE, 20.5 * TILE)
    const before = rig.camera().x
    const canvas = rig.h.canvas()
    canvas.dispatchEvent(pointer('pointerdown', 400, 250))
    canvas.dispatchEvent(pointer('pointermove', 340, 250))
    canvas.dispatchEvent(pointer('pointerup', 340, 250))
    await rig.h.frame(3)
    // The drag pans the map; the follow must not snap the view back onto the person in the frames before the store says it stopped.
    expect(rig.camera().x).not.toBeCloseTo(30.5 * TILE, 1)
    expect(rig.camera().x).not.toBeCloseTo(before, 1)
  })

  it('falls back to the simulation position when the layer does not draw the person', async () => {
    const rig = await mount()
    await rig.follow(30.5 * TILE, 20.5 * TILE)
    expect(rig.camera().x).toBeCloseTo(30.5 * TILE, 3)
    expect(rig.camera().y).toBeCloseTo(20.5 * TILE, 3)
  })
})
