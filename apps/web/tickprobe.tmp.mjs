import { readFileSync } from 'node:fs'

const [dir, savePath, label = ''] = process.argv.slice(2)
const meta = JSON.parse(readFileSync(savePath.replace(/\.bin$/, '.json'), 'utf8'))
const save = readFileSync(savePath)
const mod = await import(new URL(`file://${dir}/sim_core.js`).href)
mod.initSync({ module: readFileSync(`${dir}/sim_core_bg.wasm`) })
const sim = mod.Sim.fromSerialized(BigInt(meta.seed), save)

function median(xs) {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// warm up
sim.tickN(50)
const perTick = []
const batch = 10
for (let i = 0; i < 20; i += 1) {
  const t = performance.now()
  sim.tickN(batch)
  perTick.push((performance.now() - t) / batch)
}
console.log(JSON.stringify({ label, msPerTickMedian: median(perTick), msPerTickMean: perTick.reduce((a, b) => a + b, 0) / perTick.length }))
