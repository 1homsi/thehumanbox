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
    if (error instanceof Error) {
      error.message = redactUrlsInText(error.message);
      throw error;
    }
    throw new Error(redactUrlsInText(String(error)));
  }
}
