// Compare the legacy JSON frame API with the worker's MessagePack API on
// identical restored simulations. Also assert both decoders see equal frames.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { decode } from '@msgpack/msgpack'
import { pathToFileURL } from 'node:url'

const [wasmDir, savePath, framesArg = '100'] = process.argv.slice(2)
if (!wasmDir || !savePath) {
  throw new Error('usage: node bench/wasm-binary-frame-ab.mjs <wasm-dir> <save.bin> [frames]')
}
const frameCount = Number(framesArg)
if (!Number.isInteger(frameCount) || frameCount < 1) throw new Error('frames must be positive')
const metaPath = path.join(
  path.dirname(savePath),
  `${path.basename(savePath, path.extname(savePath))}.json`,
)
const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
const save = readFileSync(savePath)
const resolved = path.resolve(wasmDir)
const mod = await import(`${pathToFileURL(path.join(resolved, 'sim_core.js')).href}?binary-ab`)
mod.initSync({ module: readFileSync(path.join(resolved, 'sim_core_bg.wasm')) })
const jsonSim = mod.Sim.fromSerialized(BigInt(meta.seed), save)
const binarySim = mod.Sim.fromSerialized(BigInt(meta.seed), save)
const timestamp = 1_700_000_000_000
const jsonFull = jsonSim.fullFrame(1, timestamp)
const binaryFull = binarySim.fullFrameBytes(1, timestamp)
assert.deepEqual(decode(binaryFull), JSON.parse(jsonFull), 'full frame payloads differ')

const jsonEncodeMs = []
const binaryEncodeMs = []
const jsonDecodeMs = []
const binaryDecodeMs = []
const jsonBytes = []
const binaryBytes = []
const WARMUP = 5
for (let i = 0; i < WARMUP + frameCount; i += 1) {
  jsonSim.tickN(1)
  binarySim.tickN(1)
  let jsonFrame
  let binaryFrame
  let start
  if (i % 2 === 0) {
    start = performance.now()
    jsonFrame = jsonSim.deltaFrame(i + 2, timestamp)
    if (i >= WARMUP) jsonEncodeMs.push(performance.now() - start)
    start = performance.now()
    binaryFrame = binarySim.deltaFrameBytes(i + 2, timestamp)
    if (i >= WARMUP) binaryEncodeMs.push(performance.now() - start)
  } else {
    start = performance.now()
    binaryFrame = binarySim.deltaFrameBytes(i + 2, timestamp)
    if (i >= WARMUP) binaryEncodeMs.push(performance.now() - start)
    start = performance.now()
    jsonFrame = jsonSim.deltaFrame(i + 2, timestamp)
    if (i >= WARMUP) jsonEncodeMs.push(performance.now() - start)
  }
  assert.deepEqual(decode(binaryFrame), JSON.parse(jsonFrame), `delta frame ${i} payloads differ`)
  if (i < WARMUP) continue
  jsonBytes.push(Buffer.byteLength(jsonFrame))
  binaryBytes.push(binaryFrame.byteLength)
  if (i % 2 === 0) {
    start = performance.now()
    JSON.parse(jsonFrame)
    jsonDecodeMs.push(performance.now() - start)
    start = performance.now()
    decode(binaryFrame)
    binaryDecodeMs.push(performance.now() - start)
  } else {
    start = performance.now()
    decode(binaryFrame)
    binaryDecodeMs.push(performance.now() - start)
    start = performance.now()
    JSON.parse(jsonFrame)
    jsonDecodeMs.push(performance.now() - start)
  }
}

function median(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
function mean(samples) {
  return samples.reduce((sum, value) => sum + value, 0) / samples.length
}
console.log(
  JSON.stringify({
    tick: meta.tick,
    frameCount,
    fullJsonBytes: Buffer.byteLength(jsonFull),
    fullMessagePackBytes: binaryFull.byteLength,
    deltaJsonBytesMedian: median(jsonBytes),
    deltaMessagePackBytesMedian: median(binaryBytes),
    jsonEncodeMsMedian: median(jsonEncodeMs),
    messagePackEncodeMsMedian: median(binaryEncodeMs),
    jsonEncodeMsMean: mean(jsonEncodeMs),
    messagePackEncodeMsMean: mean(binaryEncodeMs),
    jsonParseMsMedian: median(jsonDecodeMs),
    messagePackDecodeMsMedian: median(binaryDecodeMs),
    jsonParseMsMean: mean(jsonDecodeMs),
    messagePackDecodeMsMean: mean(binaryDecodeMs),
  }),
)
