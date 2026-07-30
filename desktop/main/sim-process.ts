import { spawn, ChildProcess, execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import { app } from "electron";

import type { Settings } from "./settings";
import { effectiveDataRoot, prepareDataRoot } from "./settings";
import { buildLocalSimEnv } from "./sim-env";
import {
  acquireDataRootLock,
  type DataRootLock,
  removePidRecordIfOwned,
  writePidRecordAtomically,
} from "./data-lock";
import {
  finishCommittedMigrationForActiveRoot,
  pathsReferToSameLocation,
  recoverInterruptedFileReplacement,
} from "./world-safety";
import {
  childTerminationConfirmed,
  resolveOwnedOrphanPid,
  TerminationUnconfirmedError,
  waitForChildTermination,
} from "./process-lifecycle";

const PID_FILE_NAME = "sim.pid";
let exitHandlersInstalled = false;
let exitInProgress = false;
let startInFlight: Promise<RunningSim> | null = null;
let stopInFlight: {
  promise: Promise<void>;
  checkpointRequired: boolean;
} | null = null;

export interface RunningSim {
  port: number;
  child: ChildProcess;
  pidFile: string;
  pidToken: string;
  dataLock: DataRootLock;
}

interface SimPidRecord {
  pid: number;
  port?: number;
  token?: string;
}

let current: RunningSim | null = null;

function platformBinaryName(): string {
  return process.platform === "win32" ? "simulation-rs.exe" : "simulation-rs";
}

function packagedBinaryPath(): string {
  const resourcesDir =
    process.resourcesPath ?? path.join(__dirname, "..", "..");
  return path.join(resourcesDir, "bin", platformBinaryName());
}

function devBinaryPath(): string {
  return path.join(
    __dirname,
    "..",
    "..",
    "..",
    "simulation",
    "target",
    "release",
    platformBinaryName(),
  );
}

export function locateSimBinary(): string | null {
  const candidates = app.isPackaged
    ? [packagedBinaryPath()]
    : [devBinaryPath(), packagedBinaryPath()];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return p;
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        reject(new Error("could not pick a free port"));
      }
    });
  });
}

async function waitForPort(
  port: number,
  timeoutMs: number,
  isAlive: () => boolean,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive())
      throw new Error("simulation-rs exited before binding the port");
    const ok = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ host: "127.0.0.1", port }, () => {
        socket.end();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
      socket.setTimeout(500, () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(
    `simulation-rs did not start listening on 127.0.0.1:${port} within ${timeoutMs}ms`,
  );
}

function pidFilePath(settings: Settings): string {
  return path.join(effectiveDataRoot(settings), PID_FILE_NAME);
}

function pidBelongsToSimulation(pid: number): boolean {
  try {
    if (process.platform === "win32") {
      const listing = execFileSync(
        "tasklist",
        ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
        {
          encoding: "utf8",
          windowsHide: true,
        },
      );
      return listing.toLowerCase().includes("simulation-rs.exe");
    }
    const command = execFileSync("ps", ["-p", String(pid), "-o", "comm="], {
      encoding: "utf8",
    }).trim();
    return path.basename(command) === platformBinaryName();
  } catch {
    return false;
  }
}

async function waitForPidExit(
  pid: number,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function waitForPidExitEventually(pid: number): Promise<void> {
  while (!(await waitForPidExit(pid, 5_000))) {
    // Keep ownership while the process is alive. This promise intentionally
    // remains pending until liveness is actually disproved.
  }
}

async function checkpointSim(
  port: number,
  timeoutMs: number,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(250, timeoutMs));
  try {
    const response = await fetch(`http://127.0.0.1:${port}/save`, {
      method: "POST",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function killOrphanFromPidFile(
  settings: Settings,
  expectedLockToken: string | null,
  expectedChildPid: number | null,
): Promise<void> {
  const pidPath = pidFilePath(settings);
  let raw: string | null = null;
  try {
    raw = fs.readFileSync(pidPath, "utf8").trim();
  } catch {
    // A durable child.json claim can recover an orphan even if sim.pid was
    // separately lost or damaged. Without either record there is no orphan to
    // quiesce.
  }
  let record: SimPidRecord | null = null;
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw) as Partial<SimPidRecord> | number;
      if (typeof parsed !== "object" || parsed === null)
        throw new Error("legacy pid record");
      record = {
        pid: Number(parsed.pid),
        port: parsed.port === undefined ? undefined : Number(parsed.port),
        token: typeof parsed.token === "string" ? parsed.token : undefined,
      };
    } catch {
      // Backward compatibility with the original pid-only file. A malformed
      // record can still fall back to the lock's durable child claim below.
      const legacyPid = parseInt(raw, 10);
      if (Number.isFinite(legacyPid)) record = { pid: legacyPid };
    }
  }
  if (record && (!Number.isSafeInteger(record.pid) || record.pid <= 1)) {
    record = null;
  }

  if (record) {
    try {
      process.kill(record.pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      try {
        fs.unlinkSync(pidPath);
      } catch {
        /* noop */
      }
      return;
    }
    if (!pidBelongsToSimulation(record.pid)) {
      console.warn(
        `[sim] stale pid file points to a different process; refusing to kill pid=${record.pid}`,
      );
      try {
        fs.unlinkSync(pidPath);
      } catch {
        /* noop */
      }
      return;
    }
  }

  record = resolveOwnedOrphanPid(record, expectedLockToken, expectedChildPid);
  if (!record) {
    try {
      fs.unlinkSync(pidPath);
    } catch {
      /* noop */
    }
    return;
  }
  const { pid } = record;
  try {
    process.kill(pid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    try {
      fs.unlinkSync(pidPath);
    } catch {
      /* noop */
    }
    return;
  }
  if (!pidBelongsToSimulation(pid)) {
    console.warn(`[sim] recovered child pid=${pid} is no longer simulation-rs`);
    return;
  }
  if (record.port && !(await checkpointSim(record.port, 2_000))) {
    console.warn(
      `[sim] orphan checkpoint was unavailable on port ${record.port}`,
    );
  }
  try {
    process.kill(pid, process.platform === "win32" ? undefined : "SIGTERM");
  } catch {
    // Verify it actually disappeared instead of treating a signal error as exit.
  }
  if (!(await waitForPidExit(pid, 3_000))) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // The bounded liveness check below remains authoritative.
    }
    if (!(await waitForPidExit(pid, 2_000))) {
      throw new TerminationUnconfirmedError(
        `orphan simulation-rs pid=${pid} did not exit after SIGKILL; pid record and data lock retained`,
        waitForPidExitEventually(pid),
      );
    }
    console.warn(
      `[sim] force-killed unresponsive orphan simulation-rs pid=${pid}`,
    );
  } else {
    console.log(`[sim] stopped orphan simulation-rs pid=${pid}`);
  }
  try {
    fs.unlinkSync(pidPath);
  } catch {
    /* noop */
  }
}

/**
 * A migration journal can outlive Electron while its temporary target
 * simulator remains alive. Once the caller has recovered that exact target
 * lock token, quiesce the matching child before moving or quarantining files.
 */
export async function quiesceRecoveredDataRoot(
  settings: Settings,
  dataLock: DataRootLock,
): Promise<void> {
  if (!dataLock.recoveredToken) return;
  if (!pathsReferToSameLocation(dataLock.root, effectiveDataRoot(settings))) {
    throw new Error(
      "recovered data-root lock does not match the simulation save folder",
    );
  }
  try {
    await killOrphanFromPidFile(
      settings,
      dataLock.recoveredToken,
      dataLock.recoveredChildPid,
    );
  } catch (error) {
    if (!(error instanceof TerminationUnconfirmedError) || !error.confirmation)
      throw error;
    // Never release this newly recovered lock while the old writer may still
    // be alive. Once liveness is disproved, remove only its matching pid record.
    await error.confirmation;
    removePidRecordIfOwned(pidFilePath(settings), dataLock.recoveredToken);
  }
}

function installExitHandlersOnce(): void {
  if (exitHandlersInstalled) return;
  exitHandlersInstalled = true;
  const signalCurrent = (): void => {
    const c = current;
    if (!c) return;
    try {
      c.child.kill("SIGTERM");
    } catch {
      /* noop */
    }
  };
  const stopAndExit = (code: number): void => {
    if (exitInProgress) return;
    exitInProgress = true;
    void stopSim().finally(() => process.exit(code));
  };
  // `exit` itself cannot wait for asynchronous cleanup, but a best-effort
  // SIGTERM still gives the Rust process a chance to flush its final save.
  process.on("exit", signalCurrent);
  process.on("SIGINT", () => stopAndExit(130));
  process.on("SIGTERM", () => stopAndExit(143));
  process.on("uncaughtException", (e) => {
    console.error("[main] uncaughtException", e);
    stopAndExit(1);
  });
}

export async function startSim(settings: Settings): Promise<RunningSim> {
  if (stopInFlight) await stopInFlight.promise;
  if (current) {
    if (
      !pathsReferToSameLocation(
        current.dataLock.root,
        effectiveDataRoot(settings),
      )
    ) {
      throw new Error(
        "the running simulation belongs to a different save folder",
      );
    }
    return current;
  }
  if (startInFlight) return startInFlight;

  const attempt = startSimOnce(settings);
  startInFlight = attempt;
  try {
    return await attempt;
  } finally {
    if (startInFlight === attempt) startInFlight = null;
  }
}

export async function startSimWithDataRootLock(
  settings: Settings,
  dataLock: DataRootLock,
): Promise<RunningSim> {
  if (current || startInFlight || stopInFlight) {
    dataLock.release();
    throw new Error(
      "simulation lifecycle changed during the data-root transaction",
    );
  }
  if (!pathsReferToSameLocation(dataLock.root, effectiveDataRoot(settings))) {
    dataLock.release();
    throw new Error("data-root lock does not match the simulation save folder");
  }
  const attempt = startSimOnce(settings, dataLock);
  startInFlight = attempt;
  try {
    return await attempt;
  } finally {
    if (startInFlight === attempt) startInFlight = null;
  }
}

async function startSimOnce(
  settings: Settings,
  suppliedLock?: DataRootLock,
): Promise<RunningSim> {
  if (current) {
    suppliedLock?.release();
    return current;
  }

  installExitHandlersOnce();

  const bin = locateSimBinary();
  if (!bin) {
    suppliedLock?.release();
    throw new Error(
      `simulation binary not found. Expected at ${packagedBinaryPath()} (packaged) or build it via \`cargo build --release\` in simulation/.`,
    );
  }

  let port: number;
  try {
    port = await pickFreePort();
  } catch (error) {
    suppliedLock?.release();
    throw error;
  }
  const workdir = prepareDataRoot(settings);
  let dataLock: DataRootLock;
  try {
    dataLock = suppliedLock ?? acquireDataRootLock(workdir, process.pid, true);
  } catch (error) {
    suppliedLock?.release();
    throw error;
  }

  try {
    // Once a crashed Electron parent is gone, its Rust child may still be
    // writing the prior world. Stop and confirm that exact orphan before any
    // journal or live-marker recovery mutates the data tree.
    await killOrphanFromPidFile(
      settings,
      dataLock.recoveredToken,
      dataLock.recoveredChildPid,
    );
    // A handed lock belongs to an import/reset/migration that is still being
    // verified by this Electron process. Its journal and rollback markers are
    // deliberate; only an ordinary startup may treat them as crash evidence.
    if (!suppliedLock) {
      finishCommittedMigrationForActiveRoot(workdir);
      recoverInterruptedFileReplacement(path.join(workdir, "worlds", "_live"));
    }
  } catch (error) {
    if (error instanceof TerminationUnconfirmedError) {
      void error.confirmation?.then(() => {
        try {
          fs.unlinkSync(pidFilePath(settings));
        } catch {
          /* noop */
        }
        dataLock.release();
      });
    } else {
      dataLock.release();
    }
    throw error;
  }

  const env = buildLocalSimEnv(settings, port);
  env.THB_DATA_LOCK_TOKEN = dataLock.token;
  env.THB_DESKTOP_PARENT_PID = String(process.pid);

  let alive = true;
  let exitCode: number | null = null;
  const tail: string[] = [];
  const pushTail = (s: string): void => {
    tail.push(s);
    while (tail.length > 40) tail.shift();
  };

  let child: ChildProcess;
  try {
    child = spawn(bin, [], {
      cwd: workdir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    dataLock.release();
    throw error;
  }
  child.on("error", (error) => {
    alive = false;
    pushTail(error.message);
  });

  const pidFile = pidFilePath(settings);
  const pidToken = dataLock.token;
  let ownershipReleased = false;
  const releaseOwnership = () => {
    if (ownershipReleased) return;
    ownershipReleased = true;
    removePidRecordIfOwned(pidFile, pidToken);
    dataLock.release();
    if (current?.child === child) current = null;
  };
  child.once("exit", (code, signal) => {
    alive = false;
    exitCode = code;
    console.log(`[sim] exited code=${code} signal=${signal}`);
    releaseOwnership();
  });
  child.once("close", () => {
    alive = false;
    releaseOwnership();
  });

  if (child.pid !== undefined) {
    try {
      writePidRecordAtomically(pidFile, {
        pid: child.pid,
        port,
        token: pidToken,
      });
    } catch (e) {
      try {
        child.kill("SIGKILL");
      } catch {
        /* noop */
      }
      const confirmed = await waitForChildTermination(child, 3_000);
      throw new Error(
        `could not claim simulation pid record ${pidFile}: ${(e as Error).message}` +
          (confirmed
            ? ""
            : "; child termination was not confirmed, so data ownership is retained"),
      );
    }
  } else {
    try {
      child.kill("SIGKILL");
    } catch {
      /* noop */
    }
    const confirmed = await waitForChildTermination(child, 3_000);
    throw new Error(
      "simulation process started without a process id" +
        (confirmed
          ? ""
          : "; child termination was not confirmed, so data ownership is retained"),
    );
  }

  child.stdout?.on("data", (b: Buffer) => {
    const s = b.toString();
    pushTail(s);
    process.stdout.write("[sim] " + s);
  });
  child.stderr?.on("data", (b: Buffer) => {
    const s = b.toString();
    pushTail(s);
    process.stderr.write("[sim] " + s);
  });
  try {
    await waitForPort(port, 15000, () => alive);
  } catch (err) {
    try {
      child.kill("SIGKILL");
    } catch {
      /* noop */
    }
    const confirmed = await waitForChildTermination(child, 3_000);
    const lastOutput = tail.join("").trim();
    throw new Error(
      `${(err as Error).message}` +
        (exitCode !== null ? ` (exit code ${exitCode})` : "") +
        (confirmed
          ? ""
          : "; SIGKILL termination was not confirmed, so the pid record and data lock are retained") +
        (lastOutput
          ? `\n\nlast output from simulation-rs:\n${lastOutput.slice(-1200)}`
          : ""),
    );
  }

  current = { port, child, pidFile, pidToken, dataLock };
  return current!;
}

export async function stopSim(
  timeoutMs = 5000,
  requireCheckpoint = false,
): Promise<void> {
  if (stopInFlight) {
    if (requireCheckpoint && !stopInFlight.checkpointRequired) {
      throw new Error(
        "simulation is already stopping without a required checkpoint; retry the operation",
      );
    }
    return stopInFlight.promise;
  }

  const attempt = stopSimOnce(timeoutMs, requireCheckpoint);
  const tracked = { promise: attempt, checkpointRequired: requireCheckpoint };
  stopInFlight = tracked;
  try {
    await attempt;
  } finally {
    if (stopInFlight === tracked) stopInFlight = null;
  }
}

async function stopSimOnce(
  timeoutMs: number,
  requireCheckpoint: boolean,
): Promise<void> {
  if (!current && startInFlight) {
    try {
      await startInFlight;
    } catch {
      return;
    }
  }
  if (!current) return;
  const { child } = current;
  const port = current.port;

  // Checkpoint over loopback before relying on platform signal semantics.
  // Windows does not reliably deliver a Ctrl-C/SIGTERM equivalent to the
  // child, while the local HTTP save path is identical on every platform.
  if (
    !(await checkpointSim(
      port,
      Math.max(500, Math.min(3_000, timeoutMs - 500)),
    ))
  ) {
    if (requireCheckpoint) {
      throw new Error(
        "could not checkpoint the active world; it remains open so the operation can be retried",
      );
    }
    console.warn("[sim] checkpoint before stop was unavailable");
  }

  if (childTerminationConfirmed(child)) return;

  try {
    if (process.platform === "win32") child.kill();
    else child.kill("SIGTERM");
  } catch {
    // Confirmation below decides whether ownership can be released.
  }
  if (await waitForChildTermination(child, timeoutMs)) return;

  try {
    child.kill("SIGKILL");
  } catch {
    // Confirmation below remains authoritative.
  }
  if (await waitForChildTermination(child, 3_000)) return;

  throw new Error(
    `simulation-rs did not exit within ${timeoutMs}ms and SIGKILL was not confirmed; ` +
      "pid record and data lock retained to prevent a second writer",
  );
}

export function activeSim(): RunningSim | null {
  return current;
}

export async function checkpointActiveSim(timeoutMs = 3000): Promise<boolean> {
  const sim = current;
  if (!sim) return false;
  return checkpointSim(sim.port, timeoutMs);
}
