// Summarizes benchmark results as markdown tables (medians over the runs).
//
//   node bench/report.mjs bench/results/main                 one build
//   node bench/report.mjs bench/results/old bench/results/main   side by side, last one against the first
//
// The conditions a results directory was measured under (viewport, --mobile, --cpu-throttle, --gpu-off) are
// printed in its table heading and, when a directory holds several, in a `conditions` column.
//
// Each argument is a results directory (or a results.json). Output goes to stdout.

import { load, median, summarize } from './summary.mjs'

const inputs = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (!inputs.length) {
  console.error('usage: node bench/report.mjs <results dir> [<results dir> ...]')
  process.exit(1)
}

const f = (v, d = 1) => (v === null || v === undefined ? '-' : Number(v).toFixed(d))
const ORDER = { overview: 0, mid: 1, close: 2, paused: 0, playing: 1, standard: 0, crowd: 1 }
const sorted = (rows) =>
  [...rows].sort(
    (a, b) =>
      ORDER[a.fixture] - ORDER[b.fixture] || ORDER[a.zoom] - ORDER[b.zoom] || ORDER[a.mode] - ORDER[b.mode],
  )

function table(label, summary) {
  const conditions = [...new Set(summary.map((s) => s.condition))]
  const several = conditions.length > 1
  const lines = [`### ${label} (${conditions.join(' | ')})`, '']
  lines.push(
    `| world | zoom | mode |${several ? ' conditions |' : ''} runs | fps | main busy % (min-max) | main CPU % | JS ms/frame | GPU proc busy % | GPU ms/frame | GC ms/s (max pause) | JS heap after GC MB | heap pre-GC MB | engine texture MB | GPU proc MB | renderer MB | draws / instances | uploads/s | first frame ms |`,
  )
  lines.push('|---|---|---|' + (several ? '---|' : '') + '---:|'.repeat(16))
  for (const s of sorted(summary)) {
    const range = s.busyRange ? ` (${f(s.busyRange[0])}-${f(s.busyRange[1])})` : ''
    lines.push(
      `| ${s.fixture} | ${s.zoom} | ${s.mode} |${several ? ` ${s.condition} |` : ''} ${s.runs} | ${f(s.fps, 0)} | ${f(s.busy)}${range} | ${f(s.cpu)} | ${f(s.jsPerFrame, 2)} | ${f(s.gpuProc)} | ${f(s.gpuMs, 2)} | ${f(s.gcPerSec)} (${f(s.gcMax)}) | ${f(s.heapGc, 0)} | ${f(s.heapEnd, 0)} | ${f(s.textureMB, 1)} | ${f(s.gpuMB, 0)} | ${f(s.rendererMB, 0)} | ${s.drawCalls === null ? '-' : `${f(s.drawCalls, 0)} / ${f(s.instances, 0)}`} | ${f(s.uploads, 1)} | ${f(s.firstFrame, 0)} |`,
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
  const key = (s) => `${s.fixture}|${s.zoom}|${s.mode}|${s.condition}`
  const base = new Map(a.summary.map((s) => [key(s), s]))
  const pair = (x, y, d = 1) => `${f(x, d)} → ${f(y, d)}`
  for (const s of sorted(b.summary)) {
    const o = base.get(key(s))
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
