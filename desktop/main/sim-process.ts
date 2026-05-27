import { spawn, ChildProcess } from 'node:child_process'
import * as fs from 'node:fs'
import * as net from 'node:net'
import * as path from 'node:path'
import { app } from 'electron'

import type { Settings } from './settings'
import { effectiveDataRoot } from './settings'

export interface RunningSim {
  port: number
  child: ChildProcess
}

let current: RunningSim | null = null

function platformBinaryName(): string {
  return process.platform === 'win32' ? 'simulation-rs.exe' : 'simulation-rs'
}

function packagedBinaryPath(): string {
  const resourcesDir = process.resourcesPath ?? path.join(__dirname, '..', '..')
  return path.join(resourcesDir, 'bin', platformBinaryName())
}

function devBinaryPath(): string {
  return path.join(
    __dirname,
    '..',
    '..',
    '..',
    'simulation',
    'target',
    'release',
    platformBinaryName(),
  )
}

export function locateSimBinary(): string | null {
  const candidates = app.isPackaged ? [packagedBinaryPath()] : [devBinaryPath(), packagedBinaryPath()]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return p
      }
    } catch {
      continue
    }
  }
  return null
}

async function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      if (addr && typeof addr === 'object') {
        const port = addr.port
        srv.close(() => resolve(port))
      } else {
        reject(new Error('could not pick a free port'))
      }
    })
  })
}

async function waitForPort(port: number, timeoutMs: number, isAlive: () => boolean): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isAlive()) throw new Error('simulation-rs exited before binding the port')
    const ok = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ host: '127.0.0.1', port }, () => {
        socket.end()
        resolve(true)
      })
      socket.on('error', () => resolve(false))
      socket.setTimeout(500, () => {
        socket.destroy()
        resolve(false)
      })
    })
    if (ok) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`simulation-rs did not start listening on 127.0.0.1:${port} within ${timeoutMs}ms`)
}

export async function startSim(settings: Settings): Promise<RunningSim> {
  if (current) return current

  const bin = locateSimBinary()
  if (!bin) {
    throw new Error(
      `simulation binary not found. Expected at ${packagedBinaryPath()} (packaged) or build it via \`cargo build --release\` in simulation/.`,
    )
  }

  const port = await pickFreePort()
  const workdir = effectiveDataRoot(settings)
  fs.mkdirSync(workdir, { recursive: true })

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TICK_MS: String(settings.tickMs),
    PORT: String(port),
    BIND_HOST: '127.0.0.1',
    THB_EXTRA_CORS_ORIGINS: 'null',
  }
  if (settings.model.provider !== 'none') {
    env.NARRATION_LLM_URL = settings.model.apiUrl
    env.NARRATION_LLM_KEY = settings.model.apiKey
    env.NARRATION_LLM_MODEL = settings.model.modelName
    env.THINK_LLM_URL = settings.model.apiUrl
    env.THINK_LLM_KEY = settings.model.apiKey
    env.THINK_LLM_MODEL = settings.model.modelName
  }

  const child = spawn(bin, [], {
    cwd: workdir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let alive = true
  let exitCode: number | null = null
  const tail: string[] = []
  const pushTail = (s: string): void => {
    tail.push(s)
    while (tail.length > 40) tail.shift()
  }

  child.stdout?.on('data', (b: Buffer) => {
    const s = b.toString()
    pushTail(s)
    process.stdout.write('[sim] ' + s)
  })
  child.stderr?.on('data', (b: Buffer) => {
    const s = b.toString()
    pushTail(s)
    process.stderr.write('[sim] ' + s)
  })
  child.on('exit', (code, signal) => {
    alive = false
    exitCode = code
    console.log(`[sim] exited code=${code} signal=${signal}`)
    if (current && current.child === child) current = null
  })

  try {
    await waitForPort(port, 15000, () => alive)
  } catch (err) {
    try { child.kill('SIGKILL') } catch { /* noop */ }
    current = null
    const lastOutput = tail.join('').trim()
    throw new Error(
      `${(err as Error).message}` +
        (exitCode !== null ? ` (exit code ${exitCode})` : '') +
        (lastOutput ? `\n\nlast output from simulation-rs:\n${lastOutput.slice(-1200)}` : ''),
    )
  }

  current = { port, child }
  return current!
}

export async function stopSim(timeoutMs = 5000): Promise<void> {
  if (!current) return
  const { child } = current
  const port = current.port
  current = null

  return new Promise((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve()
    }
    child.once('exit', done)
    try {
      if (process.platform === 'win32') {
        child.kill()
      } else {
        child.kill('SIGTERM')
      }
    } catch {
      done()
      return
    }
    setTimeout(() => {
      if (!settled) {
        try {
          child.kill('SIGKILL')
        } catch {
          /* noop */
        }
        done()
      }
    }, timeoutMs)
    void port
  })
}

export function activeSim(): RunningSim | null {
  return current
}
