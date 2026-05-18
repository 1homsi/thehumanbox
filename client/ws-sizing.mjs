import WebSocket from 'ws'
import { decode } from '@msgpack/msgpack'
const ws = new WebSocket('ws://localhost:8000/ws', { perMessageDeflate: false })
const stats = { delta: [], full: [] }
let n = 0
ws.on('open', () => console.error('open'))
ws.on('message', (data) => {
  const sz = data.length
  const d = decode(new Uint8Array(data))
  const k = d.frame_kind
  stats[k]?.push(sz)
  n++
  if (n <= 3 || n % 50 === 0) {
    console.log(`#${n} kind=${k} frame_id=${d.frame_id} size=${sz} (orgs=${d.organisms?.length ?? d.organisms_hot?.ids?.length ?? '?'})`)
  }
  if (n >= 250) {
    const summary = (arr) => arr.length ? {
      n: arr.length,
      min: Math.min(...arr),
      max: Math.max(...arr),
      avg: Math.round(arr.reduce((a,b)=>a+b,0)/arr.length),
      p95: arr.slice().sort((a,b)=>a-b)[Math.floor(arr.length*0.95)],
    } : null
    console.log('\nDELTA frames:', summary(stats.delta))
    console.log('FULL  frames:', summary(stats.full))
    ws.close(); process.exit(0)
  }
})
ws.on('error', e => { console.error('err', e.message); process.exit(1) })
