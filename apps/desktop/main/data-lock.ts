import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

const LOCK_DIR_NAME = ".thehumanbox-data.lock";

interface LockOwner {
  pid: number;
  token: string;
  acquiredAt: number;
}

interface ChildOwner {
  pid: number;
  token: string;
}

export interface DataRootLock {
  root: string;
  token: string;
  recoveredToken: string | null;
  recoveredChildPid: number | null;
  release(): void;
}

type ProcessSignalProbe = (pid: number, signal: 0) => true;

/**
 * Treat only ESRCH as proof that a process is gone. EPERM and other probe
 * failures mean liveness is unknown, so stealing its data lock would be
 * unsafe.
 */
export function processIsAlive(
  pid: number,
  probe: ProcessSignalProbe = process.kill,
): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 1) return false;
  try {
    probe(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

function syncDirectoryBestEffort(directory: string): void {
  try {
    const fd = fs.openSync(directory, "r");
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Some Windows filesystems do not permit opening a directory handle.
  }
}

function readOwner(lockDir: string): LockOwner | null {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(lockDir, "owner.json"), "utf8"),
    ) as Partial<LockOwner>;
    if (!Number.isSafeInteger(parsed.pid) || typeof parsed.token !== "string")
      return null;
    return {
      pid: parsed.pid!,
      token: parsed.token,
      acquiredAt: Number(parsed.acquiredAt) || 0,
    };
  } catch {
    return null;
  }
}

function readChildOwner(lockDir: string, token: string): ChildOwner | null {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(lockDir, "child.json"), "utf8"),
    ) as Partial<ChildOwner>;
    if (
      !Number.isSafeInteger(parsed.pid) ||
      parsed.pid! <= 1 ||
      parsed.token !== token
    )
      return null;
    return { pid: parsed.pid!, token };
  } catch {
    return null;
  }
}

function liveSimulationPidRecord(root: string): { pid: number; token: string | null } | null {
  try {
    const raw = fs.readFileSync(path.join(root, "sim.pid"), "utf8").trim();
    let pid: number;
    let token: string | null = null;
    try {
      const parsed = JSON.parse(raw) as { pid?: unknown; token?: unknown } | number;
      if (typeof parsed === "object" && parsed !== null) {
        pid = Number(parsed.pid);
        token = typeof parsed.token === "string" ? parsed.token : null;
      } else {
        pid = Number(parsed);
      }
    } catch {
      pid = parseInt(raw, 10);
    }
    return processIsAlive(pid) ? { pid, token } : null;
  } catch {
    return null;
  }
}

export interface ProcessIdentity {
  /** Executable name: no directory, no `.exe`. */
  name: string;
  /** When the process started, epoch ms. */
  startedAt: number;
}

/**
 * Name and start time of a live pid, or null when they cannot be determined.
 * Only called when a stale-looking lock names a live pid, so a normal launch
 * never spawns anything here.
 */
export function describeProcess(pid: number): ProcessIdentity | null {
  try {
    if (process.platform === "win32") {
      const out = execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `$p = Get-Process -Id ${pid} -ErrorAction Stop; $p.ProcessName + '|' + $p.StartTime.ToUniversalTime().ToString('o')`,
        ],
        { encoding: "utf8", windowsHide: true, timeout: 10_000 },
      ).trim();
      const split = out.lastIndexOf("|");
      const startedAt = Date.parse(out.slice(split + 1));
      return split > 0 && Number.isFinite(startedAt)
        ? { name: out.slice(0, split), startedAt }
        : null;
    }
    const run = (column: string): string =>
      execFileSync("ps", ["-p", String(pid), "-o", `${column}=`], {
        encoding: "utf8",
        timeout: 5_000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    const name = path.basename(run("comm"));
    const startedAt = Date.parse(run("lstart"));
    return name !== "" && Number.isFinite(startedAt) ? { name, startedAt } : null;
  } catch {
    return null;
  }
}

// How much later than the lock's own timestamp a process may have started
// before it cannot be the lock owner. The owner necessarily started before it
// wrote the lock; the margin only has to absorb clock adjustments.
const OWNER_START_MARGIN_MS = 2 * 60_000;

function executableKey(name: string): string {
  return path.basename(name).replace(/\.exe$/i, "").toLowerCase();
}

/**
 * Pids are recycled (aggressively on Windows, and after any reboot), so a live
 * pid named by a stale lock is only treated as a recycled stranger when BOTH
 * independent signals agree: it started after the lock was written (the real
 * owner cannot have), and it runs a different executable than this process.
 * If either cannot be established the pid is assumed to be the owner: failing
 * closed never lets two writers open one world.
 */
export function pidWasRecycled(
  pid: number,
  acquiredAt: number,
  describe: (pid: number) => ProcessIdentity | null = describeProcess,
  ownExecutable: string = process.execPath,
): boolean {
  if (!(acquiredAt > 0)) return false;
  const identity = describe(pid);
  if (!identity) return false;
  const startedAfterLock = identity.startedAt > acquiredAt + OWNER_START_MARGIN_MS;
  const own = executableKey(ownExecutable);
  const other = executableKey(identity.name);
  // `ps comm` truncates to 15 characters on Linux.
  const sameProgram = other === own || (other.length >= 15 && own.startsWith(other));
  return startedAfterLock && !sameProgram;
}

export function acquireDataRootLock(
  root: string,
  ownerPid = process.pid,
  allowOrphanRecovery = false,
  identify: (pid: number) => ProcessIdentity | null = describeProcess,
): DataRootLock {
  fs.mkdirSync(root, { recursive: true });
  const lockDir = path.join(root, LOCK_DIR_NAME);
  const token = randomUUID();
  let recoveredToken: string | null = null;
  let recoveredChildPid: number | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      fs.mkdirSync(lockDir);
      const owner: LockOwner = { pid: ownerPid, token, acquiredAt: Date.now() };
      const ownerPath = path.join(lockDir, "owner.json");
      const fd = fs.openSync(ownerPath, "wx", 0o600);
      try {
        fs.writeFileSync(fd, JSON.stringify(owner));
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      syncDirectoryBestEffort(lockDir);
      syncDirectoryBestEffort(root);
      if (!allowOrphanRecovery) {
        const orphanPid = liveSimulationPidRecord(root);
        if (orphanPid !== null) {
          throw new Error(
            `this save folder still has a live simulation pid record (${orphanPid.pid}); reopen the app to recover it before changing world data`,
          );
        }
      }
      return {
        root,
        token,
        recoveredToken,
        recoveredChildPid,
        release: () => {
          const current = readOwner(lockDir);
          if (current?.token !== token) return;
          try {
            fs.rmSync(lockDir, { recursive: true, force: true });
            syncDirectoryBestEffort(root);
          } catch {
            /* noop */
          }
        },
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") {
        try {
          fs.rmSync(lockDir, { recursive: true, force: true });
        } catch {
          /* noop */
        }
        throw error;
      }

      const owner = readOwner(lockDir);
      if (
        owner &&
        processIsAlive(owner.pid) &&
        !pidWasRecycled(owner.pid, owner.acquiredAt, identify)
      ) {
        throw new Error(
          `this save folder is already open by another The Human Box process (pid ${owner.pid})`,
        );
      }

      // If Electron disappears in the few instructions between spawning Rust
      // and recording its pid, the child has not yet durably adopted the
      // lock. Keep a fresh lock closed long enough for the child to write its
      // own pid/claim records; it will refuse to touch world data if the token
      // has already changed. Once child.json exists, sim.pid was fsynced first
      // and the guarded orphan-recovery path can safely take over immediately.
      const childOwner = owner ? readChildOwner(lockDir, owner.token) : null;
      if (
        childOwner &&
        processIsAlive(childOwner.pid) &&
        !allowOrphanRecovery
      ) {
        throw new Error(
          `this save folder still has an orphan simulation process (pid ${childOwner.pid}); reopen it before moving or resetting data`,
        );
      }
      // Check the durable pid record before replacing the stale directory.
      // A child may have recorded its pid but not child.json when Electron
      // crashed. Otherwise a data operation can remove the child's live lock,
      // only to reject the pid record after it has already been renamed away.
      const livePid = liveSimulationPidRecord(root);
      if (livePid && !allowOrphanRecovery) {
        throw new Error(
          `this save folder still has a live simulation pid record (${livePid.pid}); reopen the app to recover it before changing world data`,
        );
      }
      if (
        livePid &&
        allowOrphanRecovery &&
        (!owner || livePid.token !== owner.token || (childOwner && childOwner.pid !== livePid.pid))
      ) {
        throw new Error(
          "the live simulation pid does not match the stale save-folder lock; refusing to recover it",
        );
      }
      if (!childOwner) {
        try {
          const acquiredAt = owner?.acquiredAt || fs.statSync(lockDir).mtimeMs;
          const ageMs = Date.now() - acquiredAt;
          if (ageMs < 30_000) {
            throw new Error(
              "the previous desktop process ended while opening this save folder; retry in a few seconds",
            );
          }
        } catch (statError) {
          if (
            statError instanceof Error &&
            statError.message.includes("retry in a few seconds")
          )
            throw statError;
        }
      }

      const staleDir = `${lockDir}.stale-${token}`;
      try {
        if (owner) {
          recoveredToken = owner.token;
          recoveredChildPid = childOwner?.pid ?? null;
        }
        fs.renameSync(lockDir, staleDir);
        fs.rmSync(staleDir, { recursive: true, force: true });
        syncDirectoryBestEffort(root);
      } catch (renameError) {
        if (attempt === 2) throw renameError;
      }
    }
  }
  throw new Error("could not acquire exclusive ownership of the save folder");
}

export function writePidRecordAtomically(
  filePath: string,
  record: { pid: number; port: number; token: string },
): void {
  const tempPath = `${filePath}.${record.token}.tmp`;
  const fd = fs.openSync(tempPath, "wx", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(record));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(tempPath, filePath);
    syncDirectoryBestEffort(path.dirname(filePath));
  } catch (error) {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      /* noop */
    }
    throw error;
  }
}

export function removePidRecordIfOwned(filePath: string, token: string): void {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
      token?: unknown;
    };
    if (parsed.token !== token) return;
    fs.unlinkSync(filePath);
    syncDirectoryBestEffort(path.dirname(filePath));
  } catch {
    /* missing, legacy, or not ours */
  }
}
