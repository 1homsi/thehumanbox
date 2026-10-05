// Serves a production build (dist/) like the hosting does (single page app fallback), plus the
// benchmark's own routes under /__bench/: the saved worlds and the page that seeds them into
// IndexedDB.

import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json',
  '.bin': 'application/octet-stream',
}

/** The page that stores a saved world where the app's worker looks for it, and skips the first-run UI. */
const SEED_PAGE = `<!doctype html><meta charset="utf-8"><title>seed</title><script>
const params = new URLSearchParams(location.search)
const name = params.get('world')
const flags = {
  'thb-welcome-seen-v1': '1',
  'thb-tour-completed-v1': '1',
  'thb-mobile-banner-dismissed': '1',
  'thb-desktop-toast-dismissed-at': String(Date.now()),
  'thb-prayer-hint-seen-v1': '1',
}
async function seed() {
  for (const [k, v] of Object.entries(flags)) localStorage.setItem(k, v)
  const meta = await (await fetch('/__bench/' + name + '.json')).json()
  localStorage.setItem('thb-wasm-seed', meta.seed)
  const blob = new Uint8Array(await (await fetch('/__bench/' + name + '.bin')).arrayBuffer())
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('thb-own-world', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('worlds')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  await new Promise((resolve, reject) => {
    const tx = db.transaction('worlds', 'readwrite')
    tx.objectStore('worlds').put({ blob, seed: meta.seed, tick: meta.tick, savedAt: Date.now() }, 'browser-own')
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
  db.close()
  window.__seeded = true
}
seed().catch((e) => { window.__seedError = String(e) })
</script>`

export function startStaticServer({ dist, cache, port = 0 }) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const pathname = decodeURIComponent(url.pathname)
    const send = (status, body, type) => {
      res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' })
      res.end(body)
    }
    if (pathname === '/__bench/seed.html') return send(200, SEED_PAGE, MIME['.html'])
    if (pathname.startsWith('/__bench/')) {
      const file = path.join(cache, path.basename(pathname))
      if (!existsSync(file)) return send(404, 'no such fixture', 'text/plain')
      return send(200, readFileSync(file), MIME[path.extname(file)] ?? 'application/octet-stream')
    }
    let file = path.join(dist, pathname)
    if (!file.startsWith(dist)) return send(403, 'forbidden', 'text/plain')
    if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(dist, 'index.html')
    send(200, readFileSync(file), MIME[path.extname(file)] ?? 'application/octet-stream')
  })
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const address = server.address()
      resolve({ origin: `http://127.0.0.1:${address.port}`, close: () => server.close() })
    })
  })
}
