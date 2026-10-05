// Summarizes a Chrome CPU profile (from `bench/run.mjs --profile`) by original source file and function.
//
//   node bench/profile-summary.mjs bench/results/main/crowd-close-playing-run1.cpuprofile --dist dist-prof [--top 40]
//
// Build the profiled page with source maps first (`pnpm exec vite build --sourcemap --outDir dist-prof`);
// the maps are read from --dist, so the numbers point at src/ and node_modules/ files, not at chunks.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const file = args.find(
  (a) => !a.startsWith('--') && (a.endsWith('.cpuprofile') || a.endsWith('.heapprofile')),
)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const dist = flag('dist', null)
const top = Number(flag('top', 40))
if (!file) {
  console.error('usage: node bench/profile-summary.mjs <file.cpuprofile> [--dist dir] [--top n]')
  process.exit(1)
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_INDEX = Object.fromEntries([...B64].map((c, i) => [c, i]))

/** Decodes a source map v3 into per generated line: sorted [col, source, line, col, name] segments. */
function decodeMap(map) {
  const lines = []
  let source = 0
  let srcLine = 0
  let srcCol = 0
  let name = 0
  for (const lineText of map.mappings.split(';')) {
    const segs = []
    let genCol = 0
    for (const seg of lineText.split(',')) {
      if (!seg) continue
      const nums = []
      let shift = 0
      let value = 0
      for (const ch of seg) {
        const digit = B64_INDEX[ch]
        value += (digit & 31) << shift
        if (digit & 32) shift += 5
        else {
          nums.push(value & 1 ? -(value >> 1) : value >> 1)
          value = 0
          shift = 0
        }
      }
      genCol += nums[0]
      if (nums.length >= 4) {
        source += nums[1]
        srcLine += nums[2]
        srcCol += nums[3]
        if (nums.length >= 5) name += nums[4]
        segs.push([genCol, source, srcLine, srcCol, nums.length >= 5 ? name : -1])
      }
    }
    lines.push(segs)
  }
  return { lines, sources: map.sources, names: map.names ?? [] }
}

const maps = new Map()
function mapFor(url) {
  if (!dist || !url) return null
  if (maps.has(url)) return maps.get(url)
  let result = null
  try {
    const name = new URL(url).pathname
    const mapFile = path.join(path.resolve(dist), `${name}.map`)
    if (existsSync(mapFile)) result = decodeMap(JSON.parse(readFileSync(mapFile, 'utf8')))
  } catch {
    /* no map */
  }
  maps.set(url, result)
  return result
}

function original(frame) {
  const m = mapFor(frame.url)
  if (!m)
    return {
      file: frame.url ? new URL(frame.url, 'http://x').pathname : frame.functionName || '(native)',
      fn: frame.functionName || '(anonymous)',
    }
  const segs = m.lines[frame.lineNumber] ?? []
  let lo = 0
  let hi = segs.length - 1
  let found = null
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (segs[mid][0] <= frame.columnNumber) {
      found = segs[mid]
      lo = mid + 1
    } else hi = mid - 1
  }
  if (!found) return { file: frame.url, fn: frame.functionName || '(anonymous)' }
  let src = m.sources[found[1]] ?? frame.url
  src = src.replace(/^(\.\.\/)+/, '').replace(/^.*node_modules\//, 'node_modules/')
  const fn =
    frame.functionName ||
    (found[4] >= 0 ? m.names[found[4]] : '') ||
    `(anonymous ${found[2] + 1}:${found[3]})`
  return { file: src, fn: `${fn} (${src.split('/').pop()}:${found[2] + 1})` }
}

const profile = JSON.parse(readFileSync(file, 'utf8'))
if (profile.head) {
  // A sampling heap profile (`--alloc-profile`): bytes allocated per function in the window.
  const byFnBytes = new Map()
  const byFileBytes = new Map()
  let all = 0
  const walk = (node) => {
    const o = original(node.callFrame)
    byFnBytes.set(o.fn, (byFnBytes.get(o.fn) ?? 0) + node.selfSize)
    byFileBytes.set(o.file, (byFileBytes.get(o.file) ?? 0) + node.selfSize)
    all += node.selfSize
    for (const c of node.children ?? []) walk(c)
  }
  walk(profile.head)
  const mb = (b) => (b / 1048576).toFixed(2).padStart(8)
  console.log(`allocated (sampled, MB): ${(all / 1048576).toFixed(1)}`)
  console.log('\nBy file')
  for (const [k, v] of [...byFileBytes.entries()].sort((a, b) => b[1] - a[1]).slice(0, top))
    console.log(`${mb(v)} MB  ${k}`)
  console.log('\nBy function')
  for (const [k, v] of [...byFnBytes.entries()].sort((a, b) => b[1] - a[1]).slice(0, top))
    console.log(`${mb(v)} MB  ${k}`)
  process.exit(0)
}
const byId = new Map(profile.nodes.map((n) => [n.id, n]))
const self = new Map()
for (let i = 0; i < profile.samples.length; i++) {
  const id = profile.samples[i]
  self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0))
}
const total = [...self.values()].reduce((a, b) => a + b, 0)

const parent = new Map()
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)

const byFile = new Map()
const byFn = new Map()
const inclusive = new Map()
for (const [id, us] of self) {
  const node = byId.get(id)
  const o = original(node.callFrame)
  byFile.set(o.file, (byFile.get(o.file) ?? 0) + us)
  byFn.set(o.fn, (byFn.get(o.fn) ?? 0) + us)
  // Inclusive time of each distinct function on the stack.
  const seen = new Set()
  for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
    const key = original(byId.get(cur).callFrame).fn
    if (seen.has(key)) continue
    seen.add(key)
    inclusive.set(key, (inclusive.get(key) ?? 0) + us)
  }
}
const ms = (us) => (us / 1000).toFixed(0).padStart(7)
const pct = (us) => ((us / total) * 100).toFixed(1).padStart(5)
const rows = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top)
const wallMs = (profile.endTime - profile.startTime) / 1000
const idle = [...byFn.entries()].filter(([k]) => k.startsWith('(idle)')).reduce((a, [, v]) => a + v, 0)
console.log(
  `profile: ${(wallMs / 1000).toFixed(1)} s wall, ${(total / 1e6).toFixed(2)} s sampled, ${(((total - idle) / total) * 100).toFixed(1)}% busy`,
)
console.log(`\nSelf time by file (ms, % of samples)`)
for (const [k, v] of rows(byFile)) console.log(`${ms(v)} ${pct(v)}%  ${k}`)
console.log(`\nSelf time by function`)
for (const [k, v] of rows(byFn)) console.log(`${ms(v)} ${pct(v)}%  ${k}`)
console.log(`\nInclusive time by function (calls included)`)
for (const [k, v] of rows(inclusive)) console.log(`${ms(v)} ${pct(v)}%  ${k}`)
