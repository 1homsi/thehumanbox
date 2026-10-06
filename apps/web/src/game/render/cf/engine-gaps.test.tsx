// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Camera2D, Game, World, useCamera } from 'cubeforge'
import { engineHarness, type EngineHarness } from './engine-harness.test-util'

/**
 * Camera behaviours that were bugs in cubeforge 0.11.0 and are fixed in 0.12.0 (#27). They stay as
 * tests so the fix cannot quietly go away; the cf camera controller no longer has to work around them.
 */

let h: EngineHarness | null = null
afterEach(async () => {
  await h?.unmount()
  h = null
})

describe('cubeforge camera fixes the map relies on', () => {
  it('Camera2D centres a view bigger than its bounds instead of pinning it to the top-left', async () => {
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
    // The middle of the world is (50, 50).
    expect(camera!.getPosition()).toEqual({ x: 50, y: 50 })
  })

  it('Camera2D keeps the pan when an object prop such as bounds changes identity', async () => {
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
    // The pan survives the re-render.
    expect(camera!.getPosition()).toEqual({ x: 3000, y: 3000 })
  })
})
