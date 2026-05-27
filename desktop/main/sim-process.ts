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

  child.stdout?.on('data', (b: Buffer) => process.stdout.write('[sim] ' + b.toString()))
  child.stderr?.on('data', (b: Buffer) => process.stderr.write('[sim] ' + b.toString()))
  child.on('exit', (code, signal) => {
    console.log(`[sim] exited code=${code} signal=${signal}`)
    if (current && current.child === child) current = null
  })

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
