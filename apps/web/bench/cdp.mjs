// Minimal Chrome DevTools Protocol client over Node's built-in WebSocket (no dependencies).

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export const CHROME_PATHS = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export class CdpConnection {
  #ws
  #id = 0
  #pending = new Map()
  #listeners = new Map()

  static async open(url) {
    const conn = new CdpConnection()
    conn.#ws = new WebSocket(url)
    await new Promise((resolve, reject) => {
      conn.#ws.addEventListener('open', resolve, { once: true })
      conn.#ws.addEventListener('error', () => reject(new Error(`cannot connect to ${url}`)), { once: true })
    })
    conn.#ws.addEventListener('message', (event) => conn.#onMessage(event.data))
    return conn
  }

  #onMessage(data) {
    const msg = JSON.parse(typeof data === 'string' ? data : Buffer.from(data).toString('utf8'))
    if (msg.id !== undefined) {
      const entry = this.#pending.get(msg.id)
      if (!entry) return
      this.#pending.delete(msg.id)
      if (msg.error) entry.reject(new Error(`${entry.method}: ${msg.error.message}`))
      else entry.resolve(msg.result)
      return
    }
    for (const fn of this.#listeners.get(msg.method) ?? []) fn(msg.params)
  }

  send(method, params = {}, timeoutMs = 60_000) {
    const id = ++this.#id
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error(`${method}: timed out after ${timeoutMs} ms`))
      }, timeoutMs)
      this.#pending.set(id, {
        method,
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })
      this.#ws.send(JSON.stringify({ id, method, params }))
    })
  }

  on(method, fn) {
    const list = this.#listeners.get(method) ?? []
    list.push(fn)
    this.#listeners.set(method, list)
    return () =>
      this.#listeners.set(
        method,
        (this.#listeners.get(method) ?? []).filter((f) => f !== fn),
      )
  }

  /** Runs `expression` in the page and returns its (JSON) value. Awaits promises. */
  async evaluate(expression, timeoutMs = 60_000) {
    const res = await this.send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      timeoutMs,
    )
    if (res.exceptionDetails) {
      throw new Error(
        `page eval failed: ${res.exceptionDetails.exception?.description ?? res.exceptionDetails.text}`,
      )
    }
    return res.result.value
  }

  close() {
    try {
      this.#ws.close()
    } catch {
      /* already closed */
    }
  }
}

/**
 * Starts a headless Google Chrome with its own throw-away profile and GPU acceleration.
 * Returns the browser connection, a page connection and a `kill()` that removes the profile.
 */
export async function launchChrome({ port, width, height, dpr, extraArgs = [], headless = true }) {
  const bin = CHROME_PATHS[0]
  if (!bin) throw new Error('no Chrome found; set CHROME_BIN')
  const profile = mkdtempSync(path.join(tmpdir(), 'thb-bench-chrome-'))
  const args = [
    ...(headless ? ['--headless=new'] : []),
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-sync',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-popup-blocking',
    '--disable-features=Translate,MediaRouter,OptimizationHints,AutofillServerCommunication',
    // The page must run at full speed even when nothing is looking at it.
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    // Real GPU: Metal through ANGLE on macOS.
    '--enable-gpu-rasterization',
    '--ignore-gpu-blocklist',
    '--enable-zero-copy',
    '--enable-precise-memory-info',
    '--js-flags=--expose-gc',
    ...extraArgs,
    'about:blank',
  ]
  const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'ignore'] })
  let exited = false
  child.on('exit', () => {
    exited = true
  })
  let version
  for (let i = 0; i < 100 && !version; i++) {
    await sleep(150)
    if (exited) throw new Error('Chrome exited during startup')
    try {
      version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
    } catch {
      /* not up yet */
    }
  }
  if (!version) throw new Error('Chrome did not open its debugging port')
  const browser = await CdpConnection.open(version.webSocketDebuggerUrl)
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const pageTarget = targets.find((t) => t.type === 'page')
  if (!pageTarget) throw new Error('Chrome has no page target')
  const page = await CdpConnection.open(pageTarget.webSocketDebuggerUrl)
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: dpr,
    mobile: false,
  })
  return {
    browser,
    page,
    version: version.Browser,
    async kill() {
      browser.close()
      page.close()
      child.kill('SIGKILL')
      await sleep(200)
      try {
        rmSync(profile, { recursive: true, force: true })
      } catch {
        /* best effort */
      }
    },
  }
}
