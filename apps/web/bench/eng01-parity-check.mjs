// Scratch: reproduce the ENG-01 pixel parity check for base vs strip engine builds.
// Usage: node bench/eng01-parity-check.mjs <renderJs> <outDir>
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { launchChrome, sleep } from './cdp.mjs'

const [renderJs, outDir] = process.argv.slice(2)
if (!renderJs || !outDir) throw new Error('usage: node eng01-parity-check.mjs <renderJs> <outDir>')
mkdirSync(outDir, { recursive: true })

const PORT = 5199 + Math.floor(Math.random() * 200) // vite
const CDP = 9600 + Math.floor(Math.random() * 200)

const vite = spawn(
  'node_modules/.bin/vite',
  ['--config', '.eng01-parity/vite.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
  { cwd: process.cwd(), env: { ...process.env, XIP_PARITY_RENDER: renderJs }, stdio: ['ignore', 'pipe', 'pipe'], detached: true },
)
vite.stdout.on('data', () => {})
vite.stderr.on('data', (d) => process.stderr.write(d))
const killVite = () => { try { process.kill(-vite.pid, 'SIGKILL') } catch {} }
process.once('exit', killVite)

for (let i = 0; i < 120; i++) {
  await sleep(250)
  try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break } catch {}
}

const chrome = await launchChrome({ port: CDP, width: 1280, height: 720, dpr: 1 })
try {
  for (const scene of ['crowd', 'overview', 'text-heavy']) {
    await chrome.page.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?scene=${scene}` })
    let ready = false
    for (let i = 0; i < 80; i++) {
      await sleep(250)
      try {
        ready = await chrome.page.evaluate("typeof window.__parityCapture === 'function'")
      } catch {}
      if (ready) break
    }
    if (!ready) throw new Error(`${scene}: __parityCapture never appeared`)
    const dataUrl = await chrome.page.evaluate('window.__parityCapture()', 60_000)
    const b64 = String(dataUrl).replace(/^data:image\/png;base64,/, '')
    writeFileSync(`${outDir}/${scene}.png`, Buffer.from(b64, 'base64'))
    console.log(`${scene}: captured ${b64.length} b64 chars`)
  }
} finally {
  await chrome.kill()
  killVite()
}
