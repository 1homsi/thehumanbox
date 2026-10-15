// One line per scenario, for pasting into a PR: fps, main-thread busy %, JS ms per frame, heap.
//
//   node bench/score.mjs bench/results/main
//   node bench/score.mjs bench/results/base bench/results/new     one block per directory, in order
//
// Each argument is a results directory (or a results.json). Medians over the runs, from the `metrics` pass
// (fps is the trace pass's delivered frames when it was run, else the engine's own frame count).
// See report.mjs for the full tables.

import { load, summarize } from './summary.mjs'

const inputs = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (!inputs.length) {
  console.error('usage: node bench/score.mjs <results dir> [<results dir> ...]')
  process.exit(1)
}

const ORDER = { overview: 0, mid: 1, close: 2, paused: 0, playing: 1, standard: 0, crowd: 1 }
const f = (v, d = 1) => (v === null || v === undefined ? '-' : Number(v).toFixed(d))

for (const input of inputs) {
  const { label, rows } = load(input)
  const summary = summarize(rows).sort(
    (a, b) =>
      a.condition.localeCompare(b.condition) ||
      ORDER[a.fixture] - ORDER[b.fixture] ||
      ORDER[a.zoom] - ORDER[b.zoom] ||
      ORDER[a.mode] - ORDER[b.mode],
  )
  for (const s of summary) {
    console.log(
      `${label} [${s.condition}] ${s.fixture}/${s.zoom}/${s.mode}: ` +
        `${f(s.fps, 0)} fps, main busy ${f(s.busy)}%, JS ${f(s.jsPerFrame, 2)} ms/frame, ` +
        `heap ${f(s.heapGc, 0)} MB (${s.runs} runs)`,
    )
  }
  const failed = rows.filter((r) => r.error).length
  if (failed) console.log(`${label}: ${failed} scenario(s) failed, see results.json`)
}
