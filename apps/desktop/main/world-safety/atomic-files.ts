import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import type { FileHandle } from "node:fs/promises";

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

/** syncDirectoryBestEffort for code already on the async path: the sync runs on libuv's thread pool. */
export async function syncDirectoryBestEffortAsync(
  directory: string,
): Promise<void> {
  try {
    const handle = await fs.promises.open(directory, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
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
 * atomicWriteNewFile for large payloads, such as an exported world save. The
 * write and fsync run on libuv's thread pool, so the window stays responsive
 * while tens of megabytes reach the disk. It fails if the name is taken.
 */
export async function atomicWriteNewFileAsync(
  filePath: string,
  data: Uint8Array,
): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let handle: FileHandle | null = null;
  try {
    handle = await fs.promises.open(tempPath, "wx", 0o600);
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.promises.rename(tempPath, filePath);
    await syncDirectoryBestEffortAsync(path.dirname(filePath));
  } catch (error) {
    if (handle !== null) await handle.close().catch(() => {});
    await fs.promises.unlink(tempPath).catch(() => {});
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
