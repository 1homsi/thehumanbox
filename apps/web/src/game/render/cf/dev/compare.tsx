// Development harness (cf-compare.html): mounts the real WorldView on a deterministic
// world so the canvas painter and the cubeforge layers can be compared pixel for pixel
// and timed. Pick the renderer with ?cf=..., the world with ?seed=&ticks= (or a saved
// world with ?blob=/path.bin). The page exposes a small driver on `window`.
import { createRoot } from 'react-dom/client'
import init, { Sim } from '../../../../wasm/sim-core/sim_core'
import { parseWorldFrame } from '../../../../simulation/wire'
import { mergeFrame } from '../../../../simulation/merge'
import type { WorldState } from '../../../../shared/types'
import type { InterpRefs } from '../../../../simulation/useSimulation'
import { WorldView } from '../../WorldView'
import { useCameraFocus } from '../../../../state/camera-focus'
import { useUIStore } from '../../../../state/store'

declare global {
  interface Window {
    __world?: WorldState
    __ready?: boolean
    __focus?: (x: number, y: number) => void
    __advance?: (ticks: number) => WorldState
    __saveBlob?: () => string
    __setWorld?: (w: WorldState) => void
  }
}

function frameOf(sim: Sim): WorldState {
  const parsed = parseWorldFrame(sim.fullFrame(1, 1_700_000_000_000))
  if (parsed.isErr()) throw new Error(String(parsed.error))
  return mergeFrame(parsed.value, { organisms: new Map(), animals: new Map(), grid: null, prevWorld: null })
    .next
}

async function main() {
  const q = new URLSearchParams(location.search)
  const seed = BigInt(q.get('seed') ?? '42')
  const ticks = Number(q.get('ticks') ?? 3000)
  const blobUrl = q.get('blob')
  await init()
  let sim: Sim
  if (blobUrl) {
    const bytes = new Uint8Array(await (await fetch(blobUrl)).arrayBuffer())
    sim = Sim.fromSerialized(seed, bytes)
  } else {
    sim = new Sim(seed)
    for (let done = 0; done < ticks; done += 500) sim.tickN(Math.min(500, ticks - done))
  }
  const advance = Number(q.get('advance') ?? 0)
  if (advance > 0) sim.tickN(advance)

  // A settled interpolation state: the map paints its frames like the live app does.
  const interp = {
    current: { current: null as WorldState | null },
    prev: { current: null as WorldState | null },
    currentServerAt: { current: 100 },
    prevServerAt: { current: 50 },
    currentReceivedAt: { current: -10000 },
  } as InterpRefs
  const root = createRoot(document.getElementById('root')!)
  // ?clean=1 removes people, animals, labels and overlays: buildings and vegetation are
  // then the only moving parts, so two renderers can be compared pixel for pixel.
  const clean = q.get('clean') === '1'
  if (clean) {
    useUIStore.setState((s) => ({
      viewFlags: {
        ...s.viewFlags,
        hideUI: true,
        territory: false,
        names: false,
        thoughts: false,
        animals: false,
        trails: false,
        structures: false,
        grid: false,
        fertility: false,
        hazard: false,
      },
    }))
  }
  const show = (w: WorldState) => {
    if (clean) {
      w.organisms = []
      w.viewport_organisms = []
      w.animals = []
      w.viewport_animals = []
    }
    window.__world = w
    interp.current.current = w
    interp.prev.current = w
    root.render(
      <div style={{ display: 'flex', flex: 1, minWidth: 0 }}>
        <WorldView world={w} interp={interp} />
      </div>,
    )
  }
  window.__focus = (x, y) => useCameraFocus.getState().focusTile(x, y)
  window.__advance = (n) => {
    for (let done = 0; done < n; done += 500) sim.tickN(Math.min(500, n - done))
    return frameOf(sim)
  }
  window.__saveBlob = () => {
    const bytes = sim.serialize()
    let s = ''
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(s)
  }
  window.__setWorld = show
  show(frameOf(sim))
  window.__ready = true
}

main().catch((e) => {
  document.body.textContent = String(e)
})
