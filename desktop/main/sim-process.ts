import { spawn, ChildProcess, execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as net from 'node:net'
import * as path from 'node:path'
import { app } from 'electron'

import type { Settings } from './settings'
import { effectiveDataRoot } from './settings'
import { buildLocalSimEnv } from './sim-env'

const PID_FILE_NAME = 'sim.pid'
let exitHandlersInstalled = false
let exitInProgress = false
let startInFlight: Promise<RunningSim> | null = null
let stopInFlight: Promise<void> | null = null

export interface RunningSim {
  port: number
  child: ChildProcess
  pidFile: string
}

interface SimPidRecord {
  pid: number
  port?: number
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

function pidFilePath(settings: Settings): string {
  return path.join(effectiveDataRoot(settings), PID_FILE_NAME)
}

function pidBelongsToSimulation(pid: number): boolean {
  try {
    if (process.platform === 'win32') {
      const listing = execFileSync(
        'tasklist',
        ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
        { encoding: 'utf8', windowsHide: true },
      )
      return listing.toLowerCase().includes('simulation-rs.exe')
    }
    const command = execFileSync('ps', ['-p', String(pid), '-o', 'comm='], {
      encoding: 'utf8',
    }).trim()
    return path.basename(command) === platformBinaryName()
  } catch {
    return false
  }
}

async function waitForPidExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0)
    } catch {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return false
}

async function checkpointSim(port: number, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(250, timeoutMs))
  try {
    const response = await fetch(`http://127.0.0.1:${port}/save`, {
      method: 'POST',
      signal: controller.signal,
    })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function killOrphanFromPidFile(settings: Settings): Promise<void> {
  const pidPath = pidFilePath(settings)
  let raw: string
  try {
    raw = fs.readFileSync(pidPath, 'utf8').trim()
  } catch {
    return
  }
  let record: SimPidRecord
  try {
    const parsed = JSON.parse(raw) as Partial<SimPidRecord> | number
    if (typeof parsed !== 'object' || parsed === null) throw new Error('legacy pid record')
    record = {
      pid: Number(parsed.pid),
      port: parsed.port === undefined ? undefined : Number(parsed.port),
    }
  } catch {
    // Backward compatibility with the original pid-only file.
    record = { pid: parseInt(raw, 10) }
  }
  const { pid } = record
  if (!Number.isFinite(pid) || pid <= 1) {
    try { fs.unlinkSync(pidPath) } catch { /* noop */ }
    return
  }
  try {
    process.kill(pid, 0)
    if (!pidBelongsToSimulation(pid)) {
      console.warn(`[sim] stale pid file points to a different process; refusing to kill pid=${pid}`)
      try { fs.unlinkSync(pidPath) } catch { /* noop */ }
      return
    }
    if (record.port && !(await checkpointSim(record.port, 2_000))) {
      console.warn(`[sim] orphan checkpoint was unavailable on port ${record.port}`)
    }
    process.kill(pid, process.platform === 'win32' ? undefined : 'SIGTERM')
    if (!(await waitForPidExit(pid, 3_000))) {
      process.kill(pid, 'SIGKILL')
      console.warn(`[sim] force-killed unresponsive orphan simulation-rs pid=${pid}`)
    } else {
      console.log(`[sim] stopped orphan simulation-rs pid=${pid}`)
    }
  } catch {
    /* not running, fine */
  }
  try { fs.unlinkSync(pidPath) } catch { /* noop */ }
}

function installExitHandlersOnce(): void {
  if (exitHandlersInstalled) return
  exitHandlersInstalled = true
  const signalCurrent = (): void => {
    const c = current
    if (!c) return
    try {
      c.child.kill('SIGTERM')
    } catch {
      /* noop */
    }
  }
  const stopAndExit = (code: number): void => {
    if (exitInProgress) return
    exitInProgress = true
    void stopSim().finally(() => process.exit(code))
  }
  // `exit` itself cannot wait for asynchronous cleanup, but a best-effort
  // SIGTERM still gives the Rust process a chance to flush its final save.
  process.on('exit', signalCurrent)
  process.on('SIGINT', () => stopAndExit(130))
  process.on('SIGTERM', () => stopAndExit(143))
  process.on('uncaughtException', (e) => {
    console.error('[main] uncaughtException', e)
    stopAndExit(1)
  })
}

export async function startSim(settings: Settings): Promise<RunningSim> {
  if (stopInFlight) await stopInFlight
  if (current) return current
  if (startInFlight) return startInFlight

  const attempt = startSimOnce(settings)
  startInFlight = attempt
  try {
    return await attempt
  } finally {
    if (startInFlight === attempt) startInFlight = null
  }
}

async function startSimOnce(settings: Settings): Promise<RunningSim> {
  if (current) return current

  installExitHandlersOnce()
  await killOrphanFromPidFile(settings)

  const bin = locateSimBinary()
  if (!bin) {
    throw new Error(
      `simulation binary not found. Expected at ${packagedBinaryPath()} (packaged) or build it via \`cargo build --release\` in simulation/.`,
    )
  }

  const port = await pickFreePort()
  const workdir = effectiveDataRoot(settings)
  fs.mkdirSync(workdir, { recursive: true })

  const env = buildLocalSimEnv(settings, port)

  const child = spawn(bin, [], {
    cwd: workdir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const pidFile = pidFilePath(settings)
  if (child.pid !== undefined) {
    try {
      fs.writeFileSync(pidFile, JSON.stringify({ pid: child.pid, port }), 'utf8')
    } catch (e) {
      console.warn(`[sim] could not write pid file ${pidFile}:`, e)
    }
  }

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
    try { fs.unlinkSync(pidFile) } catch { /* noop */ }
    if (current && current.child === child) current = null
  })

  try {
    await waitForPort(port, 15000, () => alive)
  } catch (err) {
    try { child.kill('SIGKILL') } catch { /* noop */ }
    try { fs.unlinkSync(pidFile) } catch { /* noop */ }
    current = null
    const lastOutput = tail.join('').trim()
    throw new Error(
      `${(err as Error).message}` +
        (exitCode !== null ? ` (exit code ${exitCode})` : '') +
        (lastOutput ? `\n\nlast output from simulation-rs:\n${lastOutput.slice(-1200)}` : ''),
    )
  }

  current = { port, child, pidFile }
  return current!
}

export async function stopSim(timeoutMs = 5000): Promise<void> {
  if (stopInFlight) return stopInFlight

  const attempt = stopSimOnce(timeoutMs)
  stopInFlight = attempt
  try {
    await attempt
  } finally {
    if (stopInFlight === attempt) stopInFlight = null
  }
}

async function stopSimOnce(timeoutMs: number): Promise<void> {
  if (!current && startInFlight) {
    try {
      await startInFlight
    } catch {
      return
    }
  }
  if (!current) return
  const { child, pidFile } = current
  const port = current.port

  // Checkpoint over loopback before relying on platform signal semantics.
  // Windows does not reliably deliver a Ctrl-C/SIGTERM equivalent to the
  // child, while the local HTTP save path is identical on every platform.
  if (!(await checkpointSim(port, Math.max(500, Math.min(3_000, timeoutMs - 500))))) {
    console.warn('[sim] checkpoint before stop was unavailable')
  }

  if (child.exitCode !== null || child.signalCode !== null) {
    if (current?.child === child) current = null
    try { fs.unlinkSync(pidFile) } catch { /* noop */ }
    return
  }

  return new Promise((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      if (current?.child === child) current = null
      try { fs.unlinkSync(pidFile) } catch { /* noop */ }
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
      try { fs.unlinkSync(pidFile) } catch { /* noop */ }
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
