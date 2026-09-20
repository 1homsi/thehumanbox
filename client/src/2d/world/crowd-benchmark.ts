import init, { Sim } from '../../wasm/sim-core/sim_core'
import { parseWorldFrame } from '../../simulation/wire'
import { mergeFrame } from '../../simulation/merge'
import { useUIStore } from '../../stores/store'
import { drawWorldOnCanvas } from './WorldView'
const output = document.querySelector<HTMLPreElement>('#results')!
const canvas = document.querySelector<HTMLCanvasElement>('#world')!
const button = document.querySelector<HTMLButtonElement>('#run')!
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
button.onclick = async () => {
  button.disabled = true
  output.textContent = 'Running…'
  try {
    await init()
    const sim = new Sim(42n)
    const parsed = parseWorldFrame(sim.fullFrame(1, Date.now()))
    sim.free()
    if (parsed.isErr()) throw new Error(String(parsed.error))
    const { next: world } = mergeFrame(parsed.value, {
      organisms: new Map(),
      animals: new Map(),
      grid: null,
      prevWorld: null,
    })
    const templates = world.organisms.filter((o) => o.alive)
    const flags = {
      ...useUIStore.getState().viewFlags,
      names: true,
      animals: false,
      territory: false,
      thoughts: false,
    }
    const ctx = canvas.getContext('2d')!
    output.textContent = 'Canvas painting only (CubeForge excluded), warm mean/p95 milliseconds:\n'
    const requestedCount = Number(new URLSearchParams(location.search).get('count'))
    const counts =
      Number.isInteger(requestedCount) && requestedCount > 0 && requestedCount <= 50000
        ? [requestedCount]
        : [1000, 5000, 10000]
    for (const count of counts) {
      for (const zoom of [0.25, 2]) {
        world.organisms = Array.from({ length: count }, (_, i) => ({
          ...templates[i % templates.length],
          id: `crowd-${i}`,
          x: ((i * 17.13) % 64) + 100,
          y: ((i * 7.71) % 48) + 100,
          thought: 'exploring',
          home_x: -1000,
          home_y: -1000,
        }))
        world.viewport_organisms = world.organisms
        const scale = zoom === 0.25 ? 0.25 : 1
        canvas.width = zoom === 0.25 ? world.grid.width * 8 * scale : 64 * 8
        canvas.height = zoom === 0.25 ? world.grid.height * 8 * scale : 48 * 8
        const samples: number[] = []
        for (let frame = 0; frame < 15; frame++) {
          await nextFrame()
          for (const org of world.organisms) org.x += 0.015
          ctx.setTransform(scale, 0, 0, scale, zoom === 2 ? -800 : 0, zoom === 2 ? -800 : 0)
          const start = performance.now()
          drawWorldOnCanvas(
            ctx,
            world,
            null,
            null,
            'all',
            flags,
            zoom === 2 ? { c0: 100, c1: 164, r0: 100, r1: 148 } : undefined,
            zoom,
            scale,
          )
          if (frame >= 5) samples.push(performance.now() - start)
        }
        samples.sort((a, b) => a - b)
        output.textContent += `${count} people, zoom ${zoom}: mean ${(samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(1)}, p95 ${samples[Math.ceil(samples.length * 0.95) - 1].toFixed(1)}\n`
      }
    }
  } catch (error) {
    output.textContent += String(error)
  } finally {
    button.disabled = false
  }
}
