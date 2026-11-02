// Checks that the browser wasm sim makes the same world as the native one.
//
// The same seed must give the same save bytes on every platform. This ticks the
// wasm build and compares the hash of its save with the native build's, from the
// same source, so a change to the world's rules needs nothing updated here.
//
//   node scripts/check-wasm-determinism.mjs apps/web/src/wasm/sim-core [--native 0x...]
//
// Without --native it runs the native build itself:
//   cargo run --release -p sim-core --example save_fingerprint -- 42 3000
// CI passes the value the simulation tests printed, so the native sim is not
// compiled twice.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const SEED = 42
const TICKS = 3000

const wasmDir = process.argv[2]
if (!wasmDir) {
  console.error('usage: node scripts/check-wasm-determinism.mjs <wasm dir> [--native <hex>]')
  process.exit(2)
}
const CARGO = ['run', '--release', '--quiet', '-p', 'sim-core', '--example', 'save_fingerprint']
const nativeAt = process.argv.indexOf('--native')
const native =
  nativeAt > 0
    ? process.argv[nativeAt + 1]?.trim()
    : execFileSync('cargo', [...CARGO, '--', `${SEED}`, `${TICKS}`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
      }).trim()
if (!/^0x[0-9a-f]{16}$/.test(native ?? '')) {
  console.error(`not a native fingerprint: ${JSON.stringify(native)}`)
  process.exit(2)
}

// FNV-1a 64, the same function the native example uses.
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
const sim = new mod.Sim(BigInt(SEED))
sim.tickN(TICKS)
const got = fnv1a64(sim.serialize())

if (got !== native) {
  console.error(
    `wasm determinism check failed: seed ${SEED} at tick ${TICKS} gave ${got} in wasm and ${native} natively`,
  )
  process.exit(1)
}
console.log(`wasm determinism check passed: seed ${SEED} tick ${TICKS} ${got} on both`)
