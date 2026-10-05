// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { MapCameraController } from '../../MapCameraController'
import type { MapCamera, MapCommand } from '../../camera-controls'
import { engineHarness, pointer, wheel, type EngineHarness } from '../engine-harness.test-util'
import { CfMapCameraController } from './CfMapCameraController'

/**
 * Display and window conditions: device pixel ratio, resizing, a hidden tab,
 * and focus. Each runs the map camera and the cubeforge camera side by side
 * where they are meant to agree, and says so where they are not.
 */

const WORLD = { w: 4800, h: 2400 }
const VIEW = { w: 800, h: 500 }

type Kind = 'own' | 'cf'
interface Rig {
  h: EngineHarness
  camera: () => MapCamera
  command: (c: MapCommand) => Promise<void>
  resize: (w: number, h: number) => Promise<void>
}

async function mount(kind: Kind, dpr = 1): Promise<Rig> {
  const h = engineHarness({ dpr })
  let size = VIEW
  const cameraStateRef = { current: { x: WORLD.w / 2, y: WORLD.h / 2, zoom: 1.5 } }
  const commandRef: { current: MapCommand | null } = { current: null }
  const view = () => {
    const props = {
      worldW: WORLD.w,
      worldH: WORLD.h,
      containerW: size.w,
      containerH: size.h,
      containerEl: h.container,
      cameraStateRef,
      commandRef,
      followTarget: null,
    }
    return kind === 'cf' ? <CfMapCameraController {...props} /> : <MapCameraController {...props} />
  }
  await h.render(view(), size)
  await h.frame(6)
  h.container.focus()
  return {
    h,
    camera: () => ({ ...cameraStateRef.current }),
    command: async (c) => {
      commandRef.current = c
      await h.frame(3)
    },
    resize: async (w, hh) => {
      size = { w, h: hh }
      await h.render(view(), size)
      await h.frame(3)
    },
  }
}

const rigs: Rig[] = []
afterEach(async () => {
  while (rigs.length) await rigs.pop()!.h.unmount()
})

async function send(rig: Rig, ...events: Event[]) {
  for (const e of events) {
    rig.h.canvas().dispatchEvent(e)
    await rig.h.frame(1)
  }
  await rig.h.frame(3)
}

function expectSame(a: MapCamera, b: MapCamera) {
  expect(a.x).toBeCloseTo(b.x, 9)
  expect(a.y).toBeCloseTo(b.y, 9)
  expect(a.zoom).toBeCloseTo(b.zoom, 9)
}

async function gesture(rig: Rig) {
  await rig.command({ kind: 'focus', x: 2400, y: 1200 })
  await send(rig, wheel(300, 200, -80))
  await send(
    rig,
    pointer('pointerdown', 500, 300),
    pointer('pointermove', 420, 260),
    pointer('pointerup', 420, 260),
  )
  return rig.camera()
}

describe('display and window conditions', () => {
  it('gives the same camera at a device pixel ratio of 1, 2 and 3: input is in CSS pixels', async () => {
    const cameras: MapCamera[] = []
    for (const dpr of [1, 2, 3]) {
      const rig = await mount('cf', dpr)
      // The engine backs the canvas with device pixels but lays it out in CSS pixels.
      expect(rig.h.canvas().width).toBe(VIEW.w * dpr)
      expect(rig.h.canvas().style.width).toBe(VIEW.w + 'px')
      cameras.push(await gesture(rig))
      await rig.h.unmount()
    }
    expectSame(cameras[0], cameras[1])
    expectSame(cameras[0], cameras[2])
    const own = await mount('own')
    const reference = await gesture(own)
    await own.h.unmount()
    expectSame(cameras[0], reference)
  })

  it('clamps to a new window size the way the map camera does on its next input', async () => {
    const after = async (kind: Kind) => {
      const rig = await mount(kind)
      await rig.command({ kind: 'focus', x: 4790, y: 2390 })
      const seen: MapCamera[] = []
      for (const [w, h] of [
        [600, 400],
        [1000, 700],
        [320, 240],
      ]) {
        await rig.resize(w, h)
        // Any input brings the old camera's clamp; the cf camera has applied it already.
        await send(rig, wheel(10, 10, 0))
        seen.push(rig.camera())
      }
      await rig.h.unmount()
      return seen
    }
    const own = await after('own')
    const cf = await after('cf')
    for (let i = 0; i < own.length; i++) expectSame(own[i], cf[i])
  })

  it('cf re-clamps after a resize without waiting for input', async () => {
    const rig = await mount('cf')
    rigs.push(rig)
    await rig.command({ kind: 'focus', x: 4790, y: 2390 })
    await rig.resize(400, 300)
    const small = rig.camera()
    expect(small.x).toBeLessThanOrEqual(WORLD.w - 400 / (2 * small.zoom) + 1e-9)
    await rig.resize(1200, 800)
    const big = rig.camera()
    expect(big.x).toBeLessThanOrEqual(WORLD.w - 1200 / (2 * big.zoom) + 1e-9)
  })

  it('cf lets go of held keys when the tab is hidden; the map camera relies on the browser pausing its frames', async () => {
    const rig = await mount('cf')
    rigs.push(rig)
    await rig.command({ kind: 'focus', x: 2400, y: 1200 })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true, cancelable: true }))
    await rig.h.frame(4)
    expect(rig.camera().x).toBeGreaterThan(2400)
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await rig.h.frame(4)
    const stopped = rig.camera().x
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange'))
    await rig.h.frame(6)
    expect(rig.camera().x).toBe(stopped)
  })

  it('keyboard panning works after the map is clicked (the canvas holds focus); in the map camera it silently does not', async () => {
    const travel = async (kind: Kind) => {
      const rig = await mount(kind)
      await rig.command({ kind: 'focus', x: 2400, y: 1200 })
      // A click on the map leaves the canvas focused, not the map container.
      rig.h.canvas().focus()
      expect(document.activeElement).toBe(rig.h.canvas())
      const before = rig.camera().x
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true, cancelable: true }))
      await rig.h.frame(10)
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd', bubbles: true }))
      const moved = rig.camera().x - before
      await rig.h.unmount()
      return moved
    }
    expect(await travel('own')).toBe(0)
    expect(await travel('cf')).toBeGreaterThan(10)
  })
})
