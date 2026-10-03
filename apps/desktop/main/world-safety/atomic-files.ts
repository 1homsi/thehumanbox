import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

export function syncDirectoryBestEffort(directory: string): void {
  try {
    const fd = fs.openSync(directory, "r");
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Directory fsync is unavailable on some Windows filesystems.
  }
}

export function syncFile(filePath: string): void {
  const fd = fs.openSync(filePath, "r");
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

export function atomicWriteNewFile(
  filePath: string,
  data: string | Uint8Array,
  options: { overwrite?: boolean } = {},
): void {
  const { overwrite = true } = options;
  if (!overwrite && fs.existsSync(filePath)) {
    throw new Error(`refusing to overwrite existing file: ${filePath}`);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    // `randomUUID` rather than `Date.now()`: two writes in the same
    // millisecond produced the same temp name, and the losing call's
    // `openSync(..., "wx")` threw EEXIST and then unlinked the *winner's*
    // in-flight temp file.
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let fd: number | null = null;
  try {
    fd = fs.openSync(tempPath, "wx", 0o600);
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tempPath, filePath);
    syncDirectoryBestEffort(path.dirname(filePath));
  } catch (error) {
    if (fd !== null) fs.closeSync(fd);
    try {
      fs.unlinkSync(tempPath);
    } catch {
      /* noop */
    }
    throw error;
  }
}

/**
 * Durably replace a small control-plane file. The payload reaches stable
 * storage before the rename, and the parent directory is synced afterwards so
 * a successful return is a usable transaction boundary after power loss.
 */
export function atomicReplaceFile(
  filePath: string,
  data: string | Uint8Array,
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.replace`,
  );
  let fd: number | null = null;
  try {
    fd = fs.openSync(tempPath, "wx", 0o600);
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tempPath, filePath);
    syncDirectoryBestEffort(path.dirname(filePath));
  } catch (error) {
    if (fd !== null) fs.closeSync(fd);
    try {
      fs.unlinkSync(tempPath);
    } catch {
      /* noop */
    }
    throw error;
  }
}

export function isRegularNonemptyFile(filePath: string): boolean {
  try {
    const stat = fs.lstatSync(filePath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

export function pathEntryExists(filePath: string): boolean {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch {
    return false;
  }
}

export function isPlainDirectory(directory: string): boolean {
  try {
    const stat = fs.lstatSync(directory);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}
