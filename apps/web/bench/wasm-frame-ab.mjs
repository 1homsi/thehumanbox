import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const [baselineDir, updatedDir, savePath, framesArg = '10'] = process.argv.slice(2)
if (!baselineDir || !updatedDir || !savePath) {
  throw new Error(
    'usage: node bench/wasm-frame-ab.mjs <baseline-wasm-dir> <updated-wasm-dir> <save.bin> [frames]',
  )
}
const frameCount = Number(framesArg)
if (!Number.isInteger(frameCount) || frameCount < 1) throw new Error('frames must be a positive integer')

const meta = JSON.parse(readFileSync(savePath.replace(/\.bin$/, '.json'), 'utf8'))
const save = readFileSync(savePath)
async function load(dir, label) {
  const resolved = path.resolve(dir)
  const mod = await import(`${pathToFileURL(path.join(resolved, 'sim_core.js')).href}?${label}`)
  mod.initSync({ module: readFileSync(path.join(resolved, 'sim_core_bg.wasm')) })
  return mod.Sim.fromSerialized(BigInt(meta.seed), save)
}

const baseline = await load(baselineDir, 'baseline')
const updated = await load(updatedDir, 'updated')
const timestamp = 1_700_000_000_000
const baselineFull = baseline.fullFrame(1, timestamp)
const updatedFull = updated.fullFrame(1, timestamp)
assert.equal(updatedFull, baselineFull, 'full frame JSON bytes changed')

let baselineFrameMs = 0
let updatedFrameMs = 0
let baselineParseMs = 0
let updatedParseMs = 0
let totalBytes = 0
for (let i = 0; i < frameCount; i += 1) {
  baseline.tickN(1)
  updated.tickN(1)

  let baselineFrame
  let updatedFrame
  let start
  if (i % 2 === 0) {
    start = performance.now()
    baselineFrame = baseline.deltaFrame(i + 2, timestamp)
    baselineFrameMs += performance.now() - start
    start = performance.now()
    updatedFrame = updated.deltaFrame(i + 2, timestamp)
    updatedFrameMs += performance.now() - start
  } else {
    start = performance.now()
    updatedFrame = updated.deltaFrame(i + 2, timestamp)
    updatedFrameMs += performance.now() - start
    start = performance.now()
    baselineFrame = baseline.deltaFrame(i + 2, timestamp)
    baselineFrameMs += performance.now() - start
  }
  assert.equal(updatedFrame, baselineFrame, `delta frame ${i} JSON bytes changed`)
  totalBytes += Buffer.byteLength(updatedFrame)

  if (i % 2 === 0) {
    start = performance.now()
    JSON.parse(baselineFrame)
    baselineParseMs += performance.now() - start
    start = performance.now()
    JSON.parse(updatedFrame)
    updatedParseMs += performance.now() - start
  } else {
    start = performance.now()
    JSON.parse(updatedFrame)
    updatedParseMs += performance.now() - start
    start = performance.now()
    JSON.parse(baselineFrame)
    baselineParseMs += performance.now() - start
  }
}

console.log(
  JSON.stringify({
    frameCount,
    fullBytes: Buffer.byteLength(updatedFull),
    deltaBytesPerFrame: totalBytes / frameCount,
    baselineDeltaFrameMs: baselineFrameMs / frameCount,
    updatedDeltaFrameMs: updatedFrameMs / frameCount,
    baselineDeltaParseMs: baselineParseMs / frameCount,
    updatedDeltaParseMs: updatedParseMs / frameCount,
  }),
)
