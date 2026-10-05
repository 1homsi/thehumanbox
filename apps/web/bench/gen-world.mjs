// Generates the fixed saved worlds the benchmark loads, deterministically, with the wasm simulation.
//
//   standard  seed 42 at tick 9000 (a normal mid-game world)
//   crowd     the same world with 3,000 extra people spawned around its busiest spot
//
// Output (default apps/web/bench/.cache): <name>.bin (the sim's save, the blob the app keeps in
// IndexedDB) and <name>.json ({ seed, tick, people, focus: { x, y } in tiles }).
// Both are cached; pass --force to rebuild. The save does not depend on the renderer, so the same
// files serve every commit.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args[i + 1] ?? true) : fallback
}
export const SEED = 42n
export const STANDARD_TICK = 9000
export const CROWD_EXTRA = 3000

export async function loadSim(wasmDir) {
  const mod = await import(pathToFileURL(path.join(wasmDir, 'sim_core.js')).href)
  mod.initSync({ module: readFileSync(path.join(wasmDir, 'sim_core_bg.wasm')) })
  return mod.Sim
}

function livePeople(sim) {
  const frame = JSON.parse(sim.fullFrame(1, 0))
  return frame.organisms.filter((o) => o.alive)
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[sorted.length >> 1]
}

export async function generate({ cache, wasmDir, force = false, log = console.log }) {
  mkdirSync(cache, { recursive: true })
  const have = (name) =>
    existsSync(path.join(cache, `${name}.bin`)) && existsSync(path.join(cache, `${name}.json`))
  if (!force && have('standard') && have('crowd')) return
  const Sim = await loadSim(wasmDir)
  const sim = new Sim(SEED)
  log(`simulating seed ${SEED} to tick ${STANDARD_TICK} (about two minutes)...`)
  sim.tickN(STANDARD_TICK)
  const people = livePeople(sim)
  const focus = {
    x: Math.round(median(people.map((o) => o.x))),
    y: Math.round(median(people.map((o) => o.y))),
  }
  const write = (name, extra) => {
    const blob = sim.serialize()
    writeFileSync(path.join(cache, `${name}.bin`), blob)
    const meta = {
      name,
      seed: String(SEED),
      tick: Number(sim.tickCount()),
      people: livePeople(sim).length,
      focus,
      bytes: blob.length,
      ...extra,
    }
    writeFileSync(path.join(cache, `${name}.json`), JSON.stringify(meta, null, 2))
    log(
      `${name}: tick ${meta.tick}, ${meta.people} people, focus ${focus.x},${focus.y}, ${blob.length} bytes`,
    )
  }
  write('standard')
  // 60 clusters of 50 around the focus, 10 x 6 spots five tiles apart.
  for (let i = 0; i < 60; i++) {
    const x = focus.x + ((i % 10) - 4.5) * 5
    const y = focus.y + (Math.floor(i / 10) - 2.5) * 5
    sim.command(JSON.stringify({ cmd: 'spawn', x, y, count: CROWD_EXTRA / 60 }))
  }
  // A few ticks (about a second each with this many people) so the newcomers have a state and a thought.
  sim.tickN(4)
  write('crowd')
  sim.free()
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cache = path.resolve(flag('cache', path.join(here, '.cache')))
  const wasmDir = path.resolve(flag('wasm', path.join(here, '..', 'src', 'wasm', 'sim-core')))
  await generate({ cache, wasmDir, force: args.includes('--force') })
}
