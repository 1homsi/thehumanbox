import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

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
  release(): void;
}

function processIsAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
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

export function acquireDataRootLock(
  root: string,
  ownerPid = process.pid,
  allowOrphanRecovery = false,
): DataRootLock {
  fs.mkdirSync(root, { recursive: true });
  const lockDir = path.join(root, LOCK_DIR_NAME);
  const token = randomUUID();
  let recoveredToken: string | null = null;

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
      return {
        root,
        token,
        recoveredToken,
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
      if (owner && processIsAlive(owner.pid)) {
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
        if (owner) recoveredToken = owner.token;
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
