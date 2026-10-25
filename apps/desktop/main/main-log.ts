import { format } from "node:util";

import { openRotatingLog, type SimLog } from "./sim-log";

type ConsoleLike = Pick<Console, "log" | "warn" | "error">;

/**
 * Also write the shell's console output to `file`, in the logs folder that
 * "Open logs folder" shows. Each line still prints where it did before. Logging
 * stays best-effort: a log that cannot be opened goes quiet rather than failing.
 */
export function teeConsoleToLog(target: ConsoleLike, file: string): SimLog {
  const log = openRotatingLog(file);
  for (const level of ["log", "warn", "error"] as const) {
    const original = target[level].bind(target);
    target[level] = (...args: unknown[]) => {
      original(...args);
      log.write(`${new Date().toISOString()} ${level.toUpperCase()} ${format(...args)}\n`);
    };
  }
  return log;
}
