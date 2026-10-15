import * as fs from "node:fs";
import * as path from "node:path";

export interface SimLog {
  write(chunk: string | Buffer): void;
  close(): void;
}

/**
 * Append-only log file with one rotated generation (`<file>.1`). Logging must
 * never take the app down: every failure is swallowed and the log goes quiet.
 */
export function openRotatingLog(file: string, maxBytes = 5 * 1024 * 1024): SimLog {
  let fd: number | null = null;
  let written = 0;

  const open = (): void => {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      try {
        written = fs.statSync(file).size;
      } catch {
        written = 0;
      }
      if (written >= maxBytes) rotate();
      fd = fs.openSync(file, "a");
    } catch {
      fd = null;
    }
  };

  const close = (): void => {
    if (fd === null) return;
    try {
      fs.closeSync(fd);
    } catch {
      /* noop */
    }
    fd = null;
  };

  const rotate = (): void => {
    try {
      fs.renameSync(file, `${file}.1`);
    } catch {
      // Cannot keep the old generation (e.g. held open on Windows); drop it so
      // the log still stays bounded.
      try {
        fs.truncateSync(file, 0);
      } catch {
        /* the next write retries */
      }
    }
    written = 0;
  };

  open();

  return {
    write(chunk: string | Buffer): void {
      if (fd === null) return;
      const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      try {
        if (written > 0 && written + bytes.length > maxBytes) {
          close();
          rotate();
          open();
          if (fd === null) return;
        }
        fs.writeSync(fd, bytes);
        written += bytes.length;
      } catch {
        // Disk full, handle gone, ...: stop logging rather than fail the app.
        close();
      }
    },
    close,
  };
}
