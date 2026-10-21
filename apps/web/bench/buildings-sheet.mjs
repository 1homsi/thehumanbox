// Contact sheets of every building kind (and every home by era), painted by the map's own code at 3x.
//
//   node apps/web/bench/buildings-sheet.mjs --out /tmp/art-overhaul/buildings --tag after [--night 3] [--tier 4]
//     [--scale 6] [--cols 6] [--only "House by era"]   (--only keeps the sections whose title starts with it)
//
// Bundles bench/buildings-sheet.entry.ts with Vite, opens it in headless Chrome, and screenshots each
// section to <out>/<tag>-sheet-<n>.png. Nothing is served; the page is a file:// URL.

import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const webDir = path.resolve(here, '..')
const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}
const out = path.resolve(opt('out', '/tmp/art-overhaul/buildings'))
const tag = opt('tag', 'sheet')
const night = opt('night', '0')
const tier = opt('tier', '4')
const scale = opt('scale', '3')
const only = opt('only', '')
const cols = opt('cols', '0')
mkdirSync(out, { recursive: true })

const { build } = await import(pathToFileURL(path.join(webDir, 'node_modules/vite/dist/node/index.js')).href)
const work = mkdtempSync(path.join(tmpdir(), 'thb-sheet-'))
await build({
  root: webDir,
  logLevel: 'error',
  configFile: false,
  build: {
    outDir: work,
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: path.join(here, 'buildings-sheet.entry.ts'),
      formats: ['iife'],
      name: 'sheet',
      fileName: () => 'sheet.js',
    },
  },
})
writeFileSync(
  path.join(work, 'index.html'),
  '<!doctype html><meta charset="utf-8"><body><script src="sheet.js"></script>',
)

const { launchChrome, sleep } = await import(pathToFileURL(path.join(here, 'cdp.mjs')).href)
const chrome = await launchChrome({
  port: 9400 + Math.floor(Math.random() * 400),
  width: 1800,
  height: 1000,
  dpr: 1,
})
try {
  const { page } = chrome
  await page.send('Page.enable', {})
  await page.send('Runtime.enable', {})
  await page.send('Page.navigate', {
    url: `file://${work}/index.html?night=${night}&tier=${tier}&scale=${scale}&cols=${cols}&only=${encodeURIComponent(only)}`,
  })
  for (let i = 0; i < 100; i++) {
    await sleep(200)
    if (await page.evaluate('window.__sheetDone === true')) break
  }
  const rects = await page.evaluate(
    'JSON.stringify([...document.querySelectorAll("section")].map(s => { const r = s.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height } }))',
  )
  let n = 0
  for (const r of JSON.parse(rects)) {
    const shot = await page.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { ...r, scale: 1 },
    })
    writeFileSync(
      path.join(out, `${tag}-sheet-${String(n++).padStart(2, '0')}.png`),
      Buffer.from(shot.data, 'base64'),
    )
  }
  console.log(`wrote ${n} sheets to ${out}`)
} finally {
  chrome.killNow()
  rmSync(work, { recursive: true, force: true })
}
