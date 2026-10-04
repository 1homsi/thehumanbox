// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { MapCameraController } from '../../MapCameraController'
import { MAX_MAP_ZOOM, minMapZoom, screenToMap, type MapCamera, type MapCommand } from '../../camera-controls'
import { useUIStore } from '../../../../state/store'
import { engineHarness, pointer, wheel, type EngineHarness } from '../engine-harness.test-util'
import { CfMapCameraController } from './CfMapCameraController'

/**
 * The map camera has two implementations: its own (MapCameraController) and
 * the cubeforge one (CfMapCameraController, behind ?cf=camera). Both are
 * mounted on a real engine here and fed the same input; where the cf version
 * is meant to behave like the old one the camera must come out the same, and
 * where it deliberately differs the difference is pinned down below.
 */

const WORLD = { w: 4800, h: 2400 }
const VIEW = { w: 800, h: 500 }
const MIN_ZOOM = minMapZoom(WORLD, VIEW)

type Kind = 'own' | 'cf'
interface Rig {
  kind: Kind
  h: EngineHarness
  camera: () => MapCamera
  command: (c: MapCommand) => Promise<void>
  taps: Array<{ worldX: number; worldY: number; screenX: number; screenY: number }>
  setFollow: (target: { x: number; y: number } | null) => Promise<void>
  resize: (w: number, h: number) => Promise<void>
}

async function mount(kind: Kind, { dpr = 1 }: { dpr?: number } = {}): Promise<Rig> {
  const h = engineHarness({ dpr })
  let size = VIEW
  let follow: { x: number; y: number } | null = null
  const cameraStateRef = { current: { x: WORLD.w / 2, y: WORLD.h / 2, zoom: 1.5 } }
  const commandRef: { current: MapCommand | null } = { current: null }
  const taps: Rig['taps'] = []
  const view = (followTarget: { x: number; y: number } | null) => {
    const props = {
      worldW: WORLD.w,
      worldH: WORLD.h,
      containerW: size.w,
      containerH: size.h,
      containerEl: h.container,
      cameraStateRef,
      commandRef,
      followTarget,
    }
    return kind === 'cf' ? (
      <CfMapCameraController {...props} onTap={(t) => taps.push(t)} />
    ) : (
      <MapCameraController {...props} />
    )
  }
  await h.render(view(null), VIEW)
  await h.frame(6)
  h.container.focus()
  return {
    kind,
    h,
    camera: () => ({ ...cameraStateRef.current }),
    taps,
    command: async (c) => {
      commandRef.current = c
      // The loop sleeps between inputs; a real request comes with a render.
      await h.frame(3)
    },
    setFollow: async (target) => {
      follow = target
      await h.render(view(follow), size)
      await h.frame(3)
    },
    resize: async (w, hh) => {
      size = { w, h: hh }
      await h.render(view(follow), size)
      await h.frame(3)
    },
  }
}

const rigs: Rig[] = []

/** Close in on the middle of the world: the opening view shows all of it, where nothing can pan. */
async function closeIn(rig: Rig) {
  await rig.command({ kind: 'focus', x: 2400, y: 1200 })
}

afterEach(async () => {
  while (rigs.length) await rigs.pop()!.h.unmount()
  useUIStore.setState({ followOrgId: null })
})

async function press(rig: Rig, ...events: Event[]) {
  for (const e of events) {
    rig.h.canvas().dispatchEvent(e)
    await rig.h.frame(1)
  }
  await rig.h.frame(3)
}
const close = (a: MapCamera, b: MapCamera, digits = 6) => {
  expect(a.x).toBeCloseTo(b.x, digits)
  expect(a.y).toBeCloseTo(b.y, digits)
  expect(a.zoom).toBeCloseTo(b.zoom, digits)
}

/** A tiny deterministic generator: the same scenarios on every run. */
function lcg(seed: number) {
  let s = seed >>> 0
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32
}

type Step =
  | { t: 'wheel'; x: number; y: number; dy: number }
  | { t: 'drag'; x: number; y: number; dx: number; dy: number }
  | { t: 'cmd'; c: MapCommand }
  | { t: 'key'; key: string; frames: number }

function scenario(seed: number): Step[] {
  const r = lcg(seed)
  const steps: Step[] = []
  // Most scenarios start by closing in: the opening view shows the whole world, where nothing can pan.
  if (r() < 0.8)
    steps.push({ t: 'cmd', c: { kind: 'focus', x: Math.floor(r() * WORLD.w), y: Math.floor(r() * WORLD.h) } })
  const n = 2 + Math.floor(r() * 5)
  for (let i = 0; i < n; i++) {
    const pick = r()
    const x = Math.floor(r() * VIEW.w)
    const y = Math.floor(r() * VIEW.h)
    if (pick < 0.35) steps.push({ t: 'wheel', x, y, dy: Math.round((r() - 0.5) * 320) })
    else if (pick < 0.7)
      steps.push({ t: 'drag', x, y, dx: Math.round((r() - 0.5) * 500), dy: Math.round((r() - 0.5) * 400) })
    else if (pick < 0.8) steps.push({ t: 'cmd', c: { kind: 'fit' } })
    else if (pick < 0.88) steps.push({ t: 'cmd', c: { kind: 'zoom', factor: r() < 0.5 ? 1.5 : 0.6 } })
    else if (pick < 0.93)
      steps.push({
        t: 'cmd',
        c: { kind: 'focus', x: Math.floor(r() * WORLD.w), y: Math.floor(r() * WORLD.h) },
      })
    else
      steps.push({
        t: 'key',
        key: ['w', 'a', 's', 'd', 'arrowup', 'arrowleft'][Math.floor(r() * 6)],
        frames: 2 + Math.floor(r() * 10),
      })
  }
  return steps
}

async function run(rig: Rig, step: Step) {
  if (step.t === 'wheel') await press(rig, wheel(step.x, step.y, step.dy))
  else if (step.t === 'drag')
    await press(
      rig,
      pointer('pointerdown', step.x, step.y),
      // One move per gesture: the cf pan counts the travel before the drag
      // threshold only when it is split over several moves (see below).
      pointer('pointermove', step.x + step.dx, step.y + step.dy),
      pointer('pointerup', step.x + step.dx, step.y + step.dy),
    )
  else if (step.t === 'cmd') await rig.command(step.c)
  else {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: step.key, bubbles: true, cancelable: true }))
    await rig.h.frame(step.frames)
    window.dispatchEvent(new KeyboardEvent('keyup', { key: step.key, bubbles: true }))
    await rig.h.frame(3)
  }
}

const SCENARIOS = 3000

describe('cubeforge camera against the map camera', () => {
  // Each engine patches the global clock and animation frames, so the two
  // controllers run one after the other on the same scenarios and the camera
  // after every step is recorded and compared.
  it('ends every step of 3000 random wheel, drag, command and key scenarios in the same place', async () => {
    const record = async (kind: Kind) => {
      const rig = await mount(kind)
      const out: MapCamera[][] = []
      for (let seed = 1; seed <= SCENARIOS; seed++) {
        await rig.command({ kind: 'fit' })
        const seen: MapCamera[] = []
        for (const step of scenario(seed)) {
          await run(rig, step)
          seen.push(rig.camera())
        }
        out.push(seen)
      }
      await rig.h.unmount()
      return out
    }
    const own = await record('own')
    const cf = await record('cf')
    let compared = 0
    let moved = 0
    let maxPlain = 0
    let maxKeyed = 0
    for (let i = 0; i < own.length; i++) {
      const keyed = scenario(i + 1).some((s) => s.t === 'key')
      for (let j = 0; j < own[i].length; j++) {
        const a = own[i][j]
        const b = cf[i][j]
        const diff = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.zoom - b.zoom))
        if (keyed) maxKeyed = Math.max(maxKeyed, diff)
        else maxPlain = Math.max(maxPlain, diff)
        if (a.zoom > 0.2) moved++ // closer in than the opening view
        compared++
      }
    }
    expect(maxPlain).toBeLessThan(1e-9)
    expect(maxKeyed).toBeLessThan(1e-9)
    expect(moved).toBeGreaterThan(compared / 2)
    expect(compared).toBeGreaterThan(9000)
  }, 120_000)
})

describe('deliberate differences', () => {
  it('cf ignores the 160-pixel wheel clamp the map camera applies (a hard flick zooms further)', async () => {
    const flick = async (kind: Kind) => {
      const rig = await mount(kind)
      const before = rig.camera().zoom
      await press(rig, wheel(400, 250, -1000))
      const after = rig.camera().zoom
      await rig.h.unmount()
      return after / before
    }
    // exp(160 * 0.0025) for the old camera; the engine takes the whole 1000 pixels (exp(2.5)).
    expect(await flick('own')).toBeCloseTo(Math.exp(0.4), 6)
    expect(await flick('cf')).toBeCloseTo(Math.exp(2.5), 6)
  })

  it('cf pans from where the drag crossed the threshold, so it trails the cursor by up to 6 px', async () => {
    const run1 = async (kind: Kind) => {
      const rig = await mount(kind)
      await closeIn(rig)
      const start = rig.camera()
      const events = [pointer('pointerdown', 400, 250)]
      for (let i = 1; i <= 20; i++) events.push(pointer('pointermove', 400 - i * 2, 250))
      events.push(pointer('pointerup', 360, 250))
      await press(rig, ...events)
      const moved = rig.camera().x - start.x
      await rig.h.unmount()
      return { moved, zoom: start.zoom }
    }
    const own = await run1('own')
    const cf = await run1('cf')
    // The pointer travelled 40 px; the grabbed point follows it exactly in the old camera.
    expect(own.moved).toBeCloseTo(40 / own.zoom, 6)
    // The 6 px of travel before the drag threshold are not applied by the engine.
    expect(cf.moved).toBeGreaterThan(30 / cf.zoom)
    expect(cf.moved).toBeLessThan(40 / cf.zoom)
  })

  it('cf reports a tap with the map point under the finger and does not pan', async () => {
    const rig = await mount('cf')
    rigs.push(rig)
    await closeIn(rig)
    const before = rig.camera()
    await press(rig, pointer('pointerdown', 300, 200), pointer('pointerup', 302, 201))
    expect(rig.taps).toHaveLength(1)
    const tapped = rig.taps[0]
    const where = screenToMap(rig.camera(), { x: tapped.screenX, y: tapped.screenY }, VIEW)
    expect(tapped.worldX).toBeCloseTo(where.x, 6)
    expect(tapped.worldY).toBeCloseTo(where.y, 6)
    close(rig.camera(), before)
  })

  it('cf pinches around the fingers and pans with them; the old map zoomed about its centre', async () => {
    const rig = await mount('cf')
    rigs.push(rig)
    await closeIn(rig)
    const start = rig.camera()
    const anchor = screenToMap(start, { x: 420, y: 250 }, VIEW)
    await press(
      rig,
      pointer('pointerdown', 380, 250, { id: 1, pointerType: 'touch' }),
      pointer('pointerdown', 460, 250, { id: 2, pointerType: 'touch' }),
      pointer('pointermove', 340, 250, { id: 1, pointerType: 'touch' }),
      pointer('pointermove', 500, 250, { id: 2, pointerType: 'touch' }),
      pointer('pointerup', 340, 250, { id: 1, pointerType: 'touch' }),
      pointer('pointerup', 500, 250, { id: 2, pointerType: 'touch' }),
    )
    const after = rig.camera()
    expect(after.zoom).toBeGreaterThan(start.zoom)
    const under = screenToMap(after, { x: 420, y: 250 }, VIEW)
    expect(under.x).toBeCloseTo(anchor.x, 3)
    expect(under.y).toBeCloseTo(anchor.y, 3)
    expect(rig.taps).toHaveLength(0)
  })

  it('cf pan keeps gliding only when inertia is switched on', async () => {
    const glide = async (inertia: boolean) => {
      window.history.replaceState(null, '', inertia ? '/?cf=inertia' : '/')
      const rig = await mount('cf')
      await closeIn(rig)
      const events = [pointer('pointerdown', 600, 250)]
      for (let i = 1; i <= 8; i++) {
        events.push(pointer('pointermove', 600 - i * 20, 250))
        rig.h.advance(0)
      }
      for (const e of events) {
        rig.h.canvas().dispatchEvent(e)
        rig.h.advance(8)
        await rig.h.frame(1)
      }
      rig.h.canvas().dispatchEvent(pointer('pointerup', 440, 250))
      await rig.h.frame(1)
      const atRelease = rig.camera().x
      await rig.h.frame(20)
      const after = rig.camera().x
      await rig.h.unmount()
      window.history.replaceState(null, '', '/')
      return after - atRelease
    }
    expect(await glide(false)).toBe(0)
    expect(await glide(true)).toBeGreaterThan(1)
  })
})

describe('what must stay the same', () => {
  it.each<Kind>(['own', 'cf'])(
    '%s: dragging or zooming takes the camera off a followed person',
    async (kind) => {
      const rig = await mount(kind)
      rigs.push(rig)
      await closeIn(rig)
      useUIStore.setState({ followOrgId: 'a' })
      await rig.setFollow({ x: 1000, y: 800 })
      expect(rig.camera().x).toBeCloseTo(1000, 3)
      await press(rig, wheel(300, 200, -50))
      expect(useUIStore.getState().followOrgId).toBeNull()
      useUIStore.setState({ followOrgId: 'a' })
      await press(
        rig,
        pointer('pointerdown', 300, 200),
        pointer('pointermove', 340, 220),
        pointer('pointerup', 340, 220),
      )
      expect(useUIStore.getState().followOrgId).toBeNull()
    },
  )

  it.each<Kind>(['own', 'cf'])(
    '%s: following zooms to 3.5 once and then keeps the player zoom',
    async (kind) => {
      const rig = await mount(kind)
      rigs.push(rig)
      await rig.setFollow({ x: 1000, y: 800 })
      expect(rig.camera().zoom).toBeCloseTo(3.5, 6)
      await press(rig, wheel(300, 200, -50))
      const zoom = rig.camera().zoom
      await rig.setFollow({ x: 1010, y: 805 })
      expect(rig.camera().zoom).toBeCloseTo(zoom, 6)
    },
  )

  it.each<Kind>(['own', 'cf'])('%s: never zooms out past the whole world or in past 8x', async (kind) => {
    const rig = await mount(kind)
    rigs.push(rig)
    for (let i = 0; i < 6; i++) await press(rig, wheel(400, 250, 160))
    expect(rig.camera().zoom).toBeCloseTo(MIN_ZOOM, 6)
    for (let i = 0; i < 30; i++) await press(rig, wheel(400, 250, -160))
    expect(rig.camera().zoom).toBe(MAX_MAP_ZOOM)
  })

  it.each<Kind>(['own', 'cf'])('%s: keeps the view inside the world on every edge', async (kind) => {
    const rig = await mount(kind)
    rigs.push(rig)
    await rig.command({ kind: 'focus', x: 4790, y: 2390 })
    const { zoom } = rig.camera()
    await press(
      rig,
      pointer('pointerdown', 100, 100),
      pointer('pointermove', -300, -300),
      pointer('pointerup', -300, -300),
    )
    const c = rig.camera()
    expect(c.x).toBeLessThanOrEqual(WORLD.w - VIEW.w / (2 * zoom) + 1e-9)
    expect(c.y).toBeLessThanOrEqual(WORLD.h - VIEW.h / (2 * zoom) + 1e-9)
    await press(
      rig,
      pointer('pointerdown', 100, 100),
      pointer('pointermove', 5000, 5000),
      pointer('pointerup', 5000, 5000),
    )
    const d = rig.camera()
    expect(d.x).toBeGreaterThanOrEqual(VIEW.w / (2 * zoom) - 1e-9)
    expect(d.y).toBeGreaterThanOrEqual(VIEW.h / (2 * zoom) - 1e-9)
  })

  it.each<Kind>(['own', 'cf'])('%s: a lost window focus releases held keys', async (kind) => {
    const rig = await mount(kind)
    rigs.push(rig)
    await rig.command({ kind: 'focus', x: 2400, y: 1200 })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true, cancelable: true }))
    await rig.h.frame(4)
    const moving = rig.camera().x
    expect(moving).toBeGreaterThan(2400)
    window.dispatchEvent(new Event('blur'))
    await rig.h.frame(4)
    const stopped = rig.camera().x
    await rig.h.frame(4)
    expect(rig.camera().x).toBe(stopped)
  })
})
