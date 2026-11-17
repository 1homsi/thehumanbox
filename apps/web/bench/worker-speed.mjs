import { readFileSync } from 'node:fs'
import { launchChrome, sleep } from './cdp.mjs'

const argv = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i < 0 ? fallback : (argv[i + 1] ?? fallback)
}
const origin = opt('url', new URL(`http:localhost:${opt('port', '5205')}`).origin)
const save = opt('save', null)
const saveTick = Number(opt('save-tick', 0))
const speeds = String(opt('speeds', '1,20,100,500,5000')).split(',').map(Number)
const windowMs = Number(opt('window', 30000))
const warmupMs = Number(opt('warmup', 3000))
const BASE_TICK_MS = 120
const CHUNK = 4 * 1024 * 1024

async function seedSave(page, bytes) {
  await page.evaluate(`(() => { window.__seed = new Uint8Array(${bytes.length}); window.__seedAt = 0 })()`)
  for (let at = 0; at < bytes.length; at += CHUNK) {
    const b64 = bytes.subarray(at, at + CHUNK).toString('base64')
    await page.evaluate(
      `(() => { const s = atob('${b64}'); const a = window.__seed; const o = window.__seedAt; for (let i = 0; i < s.length; i++) a[o + i] = s.charCodeAt(i); window.__seedAt = o + s.length })()`,
    )
  }
  await page.evaluate(`(async () => {
    localStorage.setItem('thb-wasm-seed', '1')
    const db = await new Promise((resolve, reject) => {
      const open = indexedDB.open('thb-own-world', 1)
      open.onupgradeneeded = () => open.result.createObjectStore('worlds')
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    await new Promise((resolve, reject) => {
      const tx = db.transaction('worlds', 'readwrite')
      tx.objectStore('worlds').put({ blob: window.__seed, seed: '1', tick: ${saveTick}, savedAt: Date.now() }, 'browser-own')
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    db.close()
    delete window.__seed
  })()`)
}

async function main() {
  const port = 9400 + Math.floor(Math.random() * 400)
  const chrome = await launchChrome({ port, width: 800, height: 600, dpr: 1 })
  const { page } = chrome
  const rows = []
  try {
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    await page.send('Page.navigate', { url: `${origin}/favicon.svg` })
    await sleep(1000)
    if (save) await seedSave(page, readFileSync(save))
    await page.send('Page.navigate', { url: `${origin}/bench/worker-speed.html` })
    let ready = null
    for (let i = 0; i < 1800 && !ready; i++) {
      await sleep(100)
      ready = await page
        .evaluate('window.__bench?.state.tick > 0 ? window.__bench.state.ready : null')
        .catch(() => null)
    }
    if (!ready) throw new Error('the world never sent its first frame')
    const describe = (r) =>
      `restored=${r.restored} tick=${r.tick} engine=${r.startup?.engine} restore_ms=${r.startup?.restore_ms}`
    console.log(`ready: ${describe(ready)}`)
    const snap = () =>
      page.evaluate(
        '(() => { const s = window.__bench.state; return { tick: s.tick, frames: s.frames, full: s.fullFrames, bytes: s.bytes, decodeMs: s.decodeMs, saves: s.saves.length, at: performance.now() } })()',
      )
    for (const speed of speeds) {
      await page.evaluate(`window.__bench.speed(${speed})`)
      await sleep(warmupMs)
      const a = await snap()
      await sleep(windowMs)
      const b = await snap()
      const wall = b.at - a.at
      const frames = b.frames - a.frames
      const row = {
        speed,
        ticks: b.tick - a.tick,
        achieved: +(((b.tick - a.tick) * BASE_TICK_MS) / wall).toFixed(3),
        msPerTick: b.tick > a.tick ? +(wall / (b.tick - a.tick)).toFixed(1) : null,
        framesPerSec: +((frames * 1000) / wall).toFixed(1),
        fullFrames: b.full - a.full,
        frameKB: frames ? Math.round((b.bytes - a.bytes) / frames / 1024) : 0,
        decodeMs: frames ? +((b.decodeMs - a.decodeMs) / frames).toFixed(1) : 0,
        saves: b.saves - a.saves,
      }
      rows.push(row)
      console.log(JSON.stringify(row))
    }
    const saves = await page.evaluate('window.__bench.state.saves')
    if (saves.length) console.log('saves (ms from saving to saved):', saves.map((s) => s.ms).join(', '))
    const stored = await page.evaluate(`(async () => {
      const db = await new Promise((resolve, reject) => {
        const open = indexedDB.open('thb-own-world', 1)
        open.onsuccess = () => resolve(open.result)
        open.onerror = () => reject(open.error)
      })
      const record = await new Promise((resolve, reject) => {
        const get = db.transaction('worlds').objectStore('worlds').get('browser-own')
        get.onsuccess = () => resolve(get.result)
        get.onerror = () => reject(get.error)
      })
      db.close()
      if (!record) return null
      const head = Array.from(record.blob.subarray(0, 4))
      return { bytes: record.blob.byteLength, container: head.join() === '137,84,72,66', tick: record.tick }
    })()`)
    if (stored) {
      const format = stored.container ? 'compressed container' : 'plain'
      console.log(`stored save: ${(stored.bytes / 1048576).toFixed(1)} MB, ${format}, tick ${stored.tick}`)
    }
    if (argv.includes('--reload')) {
      await page.send('Page.navigate', { url: `${origin}/bench/worker-speed.html` })
      let again = null
      for (let i = 0; i < 1800 && !again; i++) {
        await sleep(100)
        again = await page
          .evaluate('window.__bench?.state.tick > 0 ? window.__bench.state.ready : null')
          .catch(() => null)
      }
      if (again) console.log(`reloaded: ${describe(again)}`)
    }
    const errors = await page.evaluate('window.__bench.state.errors')
    if (errors.length) console.log('worker errors:', errors.join(' | '))
  } finally {
    await chrome.kill()
  }
  const cols = [
    'speed',
    'ticks',
    'achieved',
    'msPerTick',
    'framesPerSec',
    'fullFrames',
    'frameKB',
    'decodeMs',
  ]
  console.log(`\n| ${cols.join(' | ')} |\n|${cols.map(() => '---').join('|')}|`)
  for (const r of rows) console.log(`| ${cols.map((c) => r[c]).join(' | ')} |`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
