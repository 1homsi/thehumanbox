// Writes a saved world for a seed at a tick, from the wasm simulation in this checkout:
//   <cache>/s<seed>-t<tick>.bin         the save the app keeps in IndexedDB
//   <cache>/s<seed>-t<tick>.json        { name, seed, tick, people }
//   <cache>/s<seed>-t<tick>.frame.json  the full frame at that tick (buildings, caravans, boats, farms)
//
// usage: node apps/web/bench/gen-save.mjs --seed 42 --tick 18000 [--cache dir] [--wasm dir]
// Simulating takes minutes for a late tick (the wasm runs synchronously), so capture-feature.mjs runs
// this in a child process with a hard time limit and reuses what is already in the cache.

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export function saveName(seed, tick) {
  return `s${seed}-t${tick}`
}

/** Runs the sim from tick 0 to `tick` and writes the three files. Returns the metadata. */
export async function generateSave({ seed, tick, cache, wasmDir, log = console.log }) {
  const { loadSim } = await import(pathToFileURL(path.join(here, 'gen-world.mjs')).href)
  const Sim = await loadSim(wasmDir)
  mkdirSync(cache, { recursive: true })
  const started = Date.now()
  const sim = new Sim(BigInt(seed))
  try {
    sim.tickN(tick)
    const name = saveName(seed, tick)
    const blob = sim.serialize()
    const frameText = sim.fullFrame(1, 0)
    const frame = JSON.parse(frameText)
    const meta = {
      name,
      seed: String(seed),
      tick: Number(sim.tickCount()),
      people: (frame.organisms ?? []).filter((o) => o.alive).length,
      bytes: blob.length,
    }
    writeFileSync(path.join(cache, `${name}.bin`), blob)
    writeFileSync(path.join(cache, `${name}.json`), JSON.stringify(meta, null, 2))
    writeFileSync(path.join(cache, `${name}.frame.json`), frameText)
    log(`${name}: tick ${meta.tick}, ${meta.people} people, ${blob.length} bytes, ${Date.now() - started} ms`)
    return meta
  } finally {
    sim.free()
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const flag = (name, fallback) => {
    const i = args.indexOf(`--${name}`)
    return i >= 0 ? args[i + 1] : fallback
  }
  const seed = Number(flag('seed', '42'))
  const tick = Number(flag('tick', '9000'))
  const cache = path.resolve(flag('cache', path.join(here, '.cache')))
  const wasmDir = path.resolve(flag('wasm', path.join(here, '..', 'src', 'wasm', 'sim-core')))
  if (!Number.isInteger(seed) || !Number.isInteger(tick) || tick < 0) {
    console.error('usage: gen-save.mjs --seed <int> --tick <int> [--cache dir] [--wasm dir]')
    process.exit(64)
  }
  await generateSave({ seed, tick, cache, wasmDir })
}
