import type { BrowserWindow } from "electron";

import { redactUrlsInText } from "./redact-url";

/**
 * Load the renderer file with a query that carries the per-launch command
 * token. A load error names the full URL it failed on (`... loading
 * 'file://...?token=...'`), and that text reaches dialogs, IPC results and
 * logs, so redact every file URL before the error leaves this process.
 */
export async function loadRenderer(
  win: BrowserWindow,
  file: string,
  query: Record<string, string>,
): Promise<void> {
  try {
    await win.loadFile(file, { query });
  } catch (error) {
    throw redactedLoadError(error);
  }
}

/**
 * Redact a load failure while keeping its identity, so `code`/`errno` and the
 * stack still say what failed. The redaction happens before the message is
 * read anywhere else, which is also when V8 builds the stack header.
 */
function redactedLoadError(error: unknown): Error {
  const message = redactUrlsInText(errorMessage(error));
  if (error instanceof Error) {
    try {
      error.message = message;
      return error;
    } catch {
      // A frozen message must not replace the failure with a TypeError.
      return Object.assign(new Error(message), { cause: error });
    }
  }
  return new Error(message);
}

function errorMessage(error: unknown): string {
  const message = (error as { message?: unknown } | null | undefined)?.message;
  return typeof message === "string" ? message : String(error);
}
