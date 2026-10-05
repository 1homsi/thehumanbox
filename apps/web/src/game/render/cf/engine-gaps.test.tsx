// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Camera2D, Game, World, useCamera } from 'cubeforge'
import { engineHarness, type EngineHarness } from './engine-harness.test-util'

/**
 * Behaviours of cubeforge 0.11.0 the cf glue has to work around, pinned as
 * tests so a fixed engine shows up as a failing expectation to delete. Each
 * is a minimal repro for the engine owner (see the draft PR description).
 */

let h: EngineHarness | null = null
afterEach(async () => {
  await h?.unmount()
  h = null
})

describe('cubeforge 0.11.0 behaviours the camera work routes around', () => {
  it('Camera2D bounds pin a view bigger than the bounds to the top-left instead of centring it', async () => {
    h = engineHarness()
    let camera: ReturnType<typeof useCamera> | null = null
    function Probe() {
      camera = useCamera()
      return null
    }
    // A 100 x 100 world seen through an 800 x 500 canvas at zoom 1.
    await h.renderRaw(
      <Game width={800} height={500} mode="onDemand">
        <World>
          <Camera2D bounds={{ x: 0, y: 0, width: 100, height: 100 }} x={50} y={50} />
          <Probe />
        </World>
      </Game>,
    )
    await h.frame(3)
    // The middle of the world is (50, 50). The engine clamps to (400, 250): the left/top edge
    // of the bounds plus half the viewport.
    expect(camera!.getPosition()).toEqual({ x: 400, y: 250 })
  })

  it('Camera2D resets the camera whenever an object prop such as bounds changes identity', async () => {
    h = engineHarness()
    let camera: ReturnType<typeof useCamera> | null = null
    function Probe() {
      camera = useCamera()
      return null
    }
    const tree = () => (
      <Game width={800} height={500} mode="onDemand">
        <World>
          {/* A new object every render, as inline JSX props are. */}
          <Camera2D bounds={{ x: 0, y: 0, width: 5000, height: 5000 }} x={2000} y={2000} />
          <Probe />
        </World>
      </Game>
    )
    await h.renderRaw(tree())
    await h.frame(2)
    camera!.setPosition(3000, 3000)
    await h.frame(1)
    expect(camera!.getPosition()).toEqual({ x: 3000, y: 3000 })
    await h.renderRaw(tree())
    await h.frame(2)
    // The player's pan is gone: back to the x/y props.
    expect(camera!.getPosition()).toEqual({ x: 2000, y: 2000 })
  })
})
