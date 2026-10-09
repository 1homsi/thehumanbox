// Checks the browser wasm sim against the committed determinism fingerprint.
//
// The same seed must give the same save bytes on every platform. The native
// tests check scripts/determinism-fingerprint.json on their target, and this
// script checks the wasm build the game ships. Run after scripts/build-wasm.sh:
//
//   node scripts/check-wasm-determinism.mjs apps/web/src/wasm/sim-core
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const wasmDir = process.argv[2]
if (!wasmDir) {
  console.error('usage: node scripts/check-wasm-determinism.mjs <wasm dir>')
  process.exit(2)
}

const golden = JSON.parse(readFileSync(new URL('./determinism-fingerprint.json', import.meta.url), 'utf8'))

// FNV-1a 64, the same function the Rust test uses.
function fnv1a64(bytes) {
  const mask = 0xffffffffffffffffn
  const prime = 0x100000001b3n
  let h = 0xcbf29ce484222325n
  for (const b of bytes) {
    h ^= BigInt(b)
    h = (h * prime) & mask
  }
  return '0x' + h.toString(16).padStart(16, '0')
}

const mod = await import(pathToFileURL(path.join(wasmDir, 'sim_core.js')).href)
mod.initSync({ module: readFileSync(path.join(wasmDir, 'sim_core_bg.wasm')) })
const sim = new mod.Sim(BigInt(golden.seed))
sim.tickN(golden.tick)
const got = fnv1a64(sim.serialize())

if (got !== golden.save_fnv1a64) {
  console.error(
    `wasm determinism check failed: seed ${golden.seed} at tick ${golden.tick} gave ${got}, expected ${golden.save_fnv1a64}`,
  )
  process.exit(1)
}
console.log(`wasm determinism check passed: seed ${golden.seed} tick ${golden.tick} ${got}`)
