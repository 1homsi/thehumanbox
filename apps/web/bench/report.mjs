// Summarizes benchmark results as markdown tables (medians over the runs).
//
//   node bench/report.mjs bench/results/main                 one build
//   node bench/report.mjs bench/results/old bench/results/main   side by side, last one against the first
//
// Each argument is a results directory (or a results.json). Output goes to stdout.

import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const inputs = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (!inputs.length) {
  console.error('usage: node bench/report.mjs <results dir> [<results dir> ...]')
  process.exit(1)
}

const median = (xs) => {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const mid = v.length >> 1
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}
const spread = (xs) => {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x))
  return v.length > 1 ? [Math.min(...v), Math.max(...v)] : null
}

function load(input) {
  const file = statSync(input).isDirectory() ? path.join(input, 'results.json') : input
  return { label: path.basename(path.dirname(file)), rows: JSON.parse(readFileSync(file, 'utf8')) }
}

/** One row per fixture / zoom / mode: the median of every metric over the runs and passes. */
export function summarize(rows) {
  const groups = new Map()
  for (const r of rows) {
    if (r.error) continue
    const key = `${r.fixture}|${r.zoom}|${r.mode}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }
  const out = []
  for (const [key, list] of groups) {
    const [fixture, zoom, mode] = key.split('|')
    const col = (name, pass) => list.filter((r) => !pass || r.pass === pass).map((r) => r[name])
    const trace = list.filter((r) => r.pass === 'trace')
    const metrics = list.filter((r) => r.pass === 'metrics')
    const fps = median(col('fps', 'trace'))
    const windowSec = (median(col('windowMs', 'metrics')) ?? 8000) / 1000
    const scriptMs = median(col('scriptMs', 'metrics'))
    out.push({
      fixture,
      zoom,
      mode,
      runs: Math.max(trace.length, metrics.length),
      fps,
      busy: median(col('mainBusyPct', 'metrics')),
      busyRange: spread(col('mainBusyPct', 'metrics')),
      cpu: median(col('mainCpuPct', 'metrics')),
      jsPerFrame: fps && scriptMs !== null ? scriptMs / (fps * windowSec) : null,
      gpuProc: median(col('gpuMainBusyPct', 'trace')),
      gpuProcCpu: median(col('gpuProcessCpuPct', 'metrics')),
      rendererCpu: median(col('rendererProcessCpuPct', 'metrics')),
      gcPerSec:
        (median(col('gcPauseMs', 'trace')) ?? 0) / ((median(col('traceWindowMs', 'trace')) ?? 8000) / 1000),
      gcMax: median(col('gcMaxMs', 'trace')),
      longTasks: median(col('longTasks', 'metrics')),
      heapGc: median(col('heapAfterGcMB', 'metrics')),
      heapEnd: median(col('heapUsedEndMB', 'metrics')),
      textureMB: median(col('textureMB', 'metrics')),
      gpuMB: median(col('gpuAngleMB', 'memory')),
      rendererMB: median(col('rendererFootprintMB', 'memory')),
      canvasMB: median(col('rendererCanvasMB', 'memory')),
      drawCalls: median(metrics.map((r) => r.render?.drawCalls)),
      instances: median(metrics.map((r) => r.render?.instances)),
      uploads: median(col('textureUploadsPerSec', 'metrics')),
      firstFrame: median(list.map((r) => r.firstFrameMs)),
      load: median(list.map((r) => r.loadAvg1m)),
    })
  }
  return out
}

const f = (v, d = 1) => (v === null || v === undefined ? '-' : Number(v).toFixed(d))
const ORDER = { overview: 0, mid: 1, close: 2, paused: 0, playing: 1, standard: 0, crowd: 1 }
const sorted = (rows) =>
  [...rows].sort(
    (a, b) =>
      ORDER[a.fixture] - ORDER[b.fixture] || ORDER[a.zoom] - ORDER[b.zoom] || ORDER[a.mode] - ORDER[b.mode],
  )

function table(label, summary) {
  const lines = [`### ${label}`, '']
  lines.push(
    '| world | zoom | mode | runs | fps | main busy % (min-max) | main CPU % | JS ms/frame | GPU proc busy % | GC ms/s (max pause) | JS heap after GC MB | heap pre-GC MB | engine texture MB | GPU proc MB | renderer MB | draws / instances | uploads/s | first frame ms |',
  )
  lines.push('|---|---|---|' + '--:|'.repeat(15))
  for (const s of sorted(summary)) {
    const range = s.busyRange ? ` (${f(s.busyRange[0])}-${f(s.busyRange[1])})` : ''
    lines.push(
      `| ${s.fixture} | ${s.zoom} | ${s.mode} | ${s.runs} | ${f(s.fps, 0)} | ${f(s.busy)}${range} | ${f(s.cpu)} | ${f(s.jsPerFrame, 2)} | ${f(s.gpuProc)} | ${f(s.gcPerSec)} (${f(s.gcMax)}) | ${f(s.heapGc, 0)} | ${f(s.heapEnd, 0)} | ${f(s.textureMB, 1)} | ${f(s.gpuMB, 0)} | ${f(s.rendererMB, 0)} | ${s.drawCalls === null ? '-' : `${f(s.drawCalls, 0)} / ${f(s.instances, 0)}`} | ${f(s.uploads, 1)} | ${f(s.firstFrame, 0)} |`,
    )
  }
  return lines.join('\n')
}

function compare(a, b) {
  const lines = [`### ${b.label} against ${a.label}`, '']
  lines.push(
    '| world | zoom | mode | fps | main busy % | main CPU % | JS ms/frame | GPU proc % | heap after GC MB | texture MB | first frame ms |',
  )
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|')
  const base = new Map(a.summary.map((s) => [`${s.fixture}|${s.zoom}|${s.mode}`, s]))
  const pair = (x, y, d = 1) => `${f(x, d)} → ${f(y, d)}`
  for (const s of sorted(b.summary)) {
    const o = base.get(`${s.fixture}|${s.zoom}|${s.mode}`)
    if (!o) continue
    lines.push(
      `| ${s.fixture} | ${s.zoom} | ${s.mode} | ${pair(o.fps, s.fps, 0)} | ${pair(o.busy, s.busy)} | ${pair(o.cpu, s.cpu)} | ${pair(o.jsPerFrame, s.jsPerFrame, 2)} | ${pair(o.gpuProc, s.gpuProc)} | ${pair(o.heapGc, s.heapGc, 0)} | ${pair(o.textureMB, s.textureMB)} | ${pair(o.firstFrame, s.firstFrame, 0)} |`,
    )
  }
  return lines.join('\n')
}

const sets = inputs.map((input) => {
  const { label, rows } = load(input)
  return { label, rows, summary: summarize(rows) }
})
for (const set of sets) {
  const first = set.rows.find((r) => !r.error)
  console.log(`${table(set.label, set.summary)}\n`)
  console.log(
    `Chrome ${first?.chrome ?? '?'}, viewport ${first?.viewport ?? '?'}, 1-minute load average while running: ${f(median(set.rows.map((r) => r.loadAvg1m)), 0)}\n`,
  )
  const failed = set.rows.filter((r) => r.error)
  if (failed.length)
    console.log(
      `${failed.length} scenario(s) failed: ${failed.map((r) => `${r.fixture}/${r.zoom}/${r.mode}/${r.pass}: ${r.error}`).join('; ')}\n`,
    )
}
if (sets.length > 1) console.log(compare(sets[0], sets[sets.length - 1]))
