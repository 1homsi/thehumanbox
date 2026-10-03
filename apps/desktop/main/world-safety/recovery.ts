import * as fs from "node:fs";
import * as path from "node:path";
import { atomicWriteNewFile, syncDirectoryBestEffort } from "./atomic-files";
import { validateWorldHash } from "./save-validation";

export function recoverInterruptedFileReplacement(target: string): void {
  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) return;
  const base = path.basename(target);
  const candidates = fs.readdirSync(dir);
  const nextFiles = candidates.filter((name) =>
    name.startsWith(`${base}.next-`),
  );
  const rollbackFiles = candidates.filter((name) =>
    name.startsWith(`${base}.rollback-`),
  );
  const newest = (names: string[]) =>
    names
      .map((name) => {
        const candidate = path.join(dir, name);
        const stat = fs.lstatSync(candidate);
        if (stat.isSymbolicLink() || !stat.isFile()) {
          throw new Error(
            `interrupted file replacement has an unsafe rollback entry: ${candidate}`,
          );
        }
        return { name, mtime: stat.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime)[0]?.name;

  // The caller removes the rollback only after the replacement has been
  // verified. If one survives a crash, the transaction was never committed,
  // even when the prepared file was already renamed over the live marker.
  const rollback = newest(rollbackFiles);
  if (rollback) {
    if (fs.existsSync(target)) fs.unlinkSync(target);
    fs.renameSync(path.join(dir, rollback), target);
  }

  for (const name of [...nextFiles, ...rollbackFiles]) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) {
      try {
        fs.unlinkSync(candidate);
      } catch {
        /* leave it for the next guarded startup */
      }
    }
  }

  recoverInterruptedWorldReset(target);
  syncDirectoryBestEffort(dir);
}

/**
 * Reset is committed only when its parked `_live.reset-*` marker is removed.
 * If the desktop process disappears first, restore that marker before Rust is
 * allowed to inspect `_live`; otherwise the simulator can mint and select a
 * fresh world while the player's previous world is merely parked beside it.
 */
export function recoverInterruptedWorldReset(markerPath: string): void {
  const worldsDir = path.dirname(markerPath);
  if (!fs.existsSync(worldsDir)) return;
  const markerName = path.basename(markerPath);
  const prefix = `${markerName}.reset-`;
  const parked = fs
    .readdirSync(worldsDir)
    .filter((name) => name.startsWith(prefix))
    .map((name) => {
      const candidate = path.join(worldsDir, name);
      const stat = fs.lstatSync(candidate);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new Error(
          `interrupted world reset has an unsafe parked marker: ${candidate}`,
        );
      }
      return { name, mtime: stat.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  const interrupted = parked[0];
  if (!interrupted) return;
  const parkedPath = path.join(worldsDir, interrupted.name);
  const token = interrupted.name.slice(prefix.length);
  if (!token)
    throw new Error("interrupted reset marker has no transaction token");
  const originalHash = fs.readFileSync(parkedPath, "utf8").trim();
  validateWorldHash(originalHash);
  restoreParkedLiveWorld(worldsDir, parkedPath, originalHash, token);

  // Multiple parked markers cannot be produced by the serialized reset flow,
  // but preserve any manually copied/legacy extras without letting a later
  // startup roll the successfully recovered world farther back.
  for (const extra of parked.slice(1)) {
    const source = path.join(worldsDir, extra.name);
    if (!fs.existsSync(source)) continue;
    let destination = path.join(worldsDir, `.${extra.name}.preserved`);
    let suffix = 1;
    while (fs.existsSync(destination)) {
      destination = path.join(
        worldsDir,
        `.${extra.name}.preserved-${suffix++}`,
      );
    }
    fs.renameSync(source, destination);
  }
  syncDirectoryBestEffort(worldsDir);
}

export interface ResetRollbackResult {
  failedHash: string | null;
  quarantinePath: string | null;
}

export function restoreParkedLiveWorld(
  worldsDir: string,
  parkedMarker: string,
  originalHash: string,
  token: string,
): ResetRollbackResult {
  validateWorldHash(originalHash);
  const markerPath = path.join(worldsDir, "_live");
  const parkedHash = fs.readFileSync(parkedMarker, "utf8").trim();
  if (parkedHash !== originalHash) {
    throw new Error(
      `parked live marker changed from ${originalHash} to ${parkedHash}`,
    );
  }

  let failedHash: string | null = null;
  let quarantinePath: string | null = null;
  let failedMarker: string | null = null;
  if (fs.existsSync(markerPath)) {
    const markerContents = fs.readFileSync(markerPath, "utf8");
    const rawFailedHash = markerContents.trim();
    try {
      validateWorldHash(rawFailedHash);
      failedHash = rawFailedHash;
    } catch {
      failedHash = null;
    }
    if (failedHash && failedHash !== originalHash) {
      const failedWorldDir = path.join(worldsDir, failedHash);
      if (fs.existsSync(failedWorldDir)) {
        quarantinePath = path.join(
          worldsDir,
          `.failed-reset-${token}-${failedHash}`,
        );
        let suffix = 1;
        while (fs.existsSync(quarantinePath)) {
          quarantinePath = path.join(
            worldsDir,
            `.failed-reset-${token}-${suffix++}-${failedHash}`,
          );
        }
        try {
          fs.renameSync(failedWorldDir, quarantinePath);
        } catch {
          // Marker restoration is more important than moving the failed world.
          // Leaving it under its unique hash still archives it safely because
          // the restored _live marker will no longer select it.
          quarantinePath = null;
        }
      }
    }
    // Preserve the current marker by *copying* it, not renaming it away.
    // Two separate renames left a window in which `worlds/_live` did not
    // exist at all. This function exists to run after a crash, so being
    // killed in that window is the expected case — and the leftover
    // `_live.failed-reset-<token>` matched none of the recovery scanners
    // (`.next-`, `.rollback-`, `.reset-`), so the next boot found no live
    // world and silently minted a brand-new empty one while the player's
    // real world sat unreferenced on disk.
    failedMarker = `${markerPath}.failed-reset-${token}`;
    atomicWriteNewFile(failedMarker, markerContents, { overwrite: true });
  }

  try {
    fs.renameSync(parkedMarker, markerPath);
  } catch (error) {
    if (
      failedMarker &&
      fs.existsSync(failedMarker) &&
      !fs.existsSync(markerPath)
    ) {
      fs.renameSync(failedMarker, markerPath);
    }
    if (quarantinePath && failedHash && fs.existsSync(quarantinePath)) {
      const failedWorldDir = path.join(worldsDir, failedHash);
      if (!fs.existsSync(failedWorldDir))
        fs.renameSync(quarantinePath, failedWorldDir);
    }
    throw error;
  }

  if (failedMarker && fs.existsSync(failedMarker)) {
    if (quarantinePath && fs.existsSync(quarantinePath)) {
      fs.renameSync(failedMarker, path.join(quarantinePath, "_failed_live"));
    } else {
      // Keep even an invalid/unmatched marker for diagnosis without allowing
      // it to become active again.
      const orphanMarker = path.join(worldsDir, `.failed-reset-${token}.live`);
      fs.renameSync(failedMarker, orphanMarker);
    }
  }
  syncDirectoryBestEffort(worldsDir);
  if (quarantinePath) syncDirectoryBestEffort(quarantinePath);
  return { failedHash, quarantinePath };
}
