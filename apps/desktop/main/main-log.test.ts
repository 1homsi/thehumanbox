import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";

import { teeConsoleToLog } from "./main-log";

// A packaged app opened from Finder or the Start menu has no terminal, so the
// shell's own warnings and errors (a failed update check, a window whose state
// would not save) were printed nowhere. The logs folder is where the player is
// sent for help, so those lines belong in it.

function fakeConsole() {
  const printed: string[] = [];
  return {
    printed,
    console: {
      log: (...args: unknown[]) => printed.push(`log ${args.join(" ")}`),
      warn: (...args: unknown[]) => printed.push(`warn ${args.join(" ")}`),
      error: (...args: unknown[]) => printed.push(`error ${args.join(" ")}`),
    },
  };
}

test("warnings and errors the shell logs are also written to main.log", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "thb-main-log-"));
  try {
    const file = path.join(dir, "main.log");
    const { console: shell } = fakeConsole();
    teeConsoleToLog(shell, file);

    shell.error("[updater] check failed:", new Error("offline"));
    shell.warn("[main] could not persist window state:", "EPERM");

    const written = readFileSync(file, "utf8");
    assert.match(written, /ERROR \[updater\] check failed: Error: offline/);
    assert.match(written, /WARN \[main\] could not persist window state: EPERM/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the console still prints each line it logs", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "thb-main-log-"));
  try {
    const { console: shell, printed } = fakeConsole();
    teeConsoleToLog(shell, path.join(dir, "main.log"));

    shell.log("[sim] exited code=0");

    assert.deepEqual(printed, ["log [sim] exited code=0"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a log that cannot be written never stops the console from working", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "thb-main-log-"));
  try {
    // The log folder is a regular file, so the log cannot be opened.
    const blocker = path.join(dir, "logs");
    writeFileSync(blocker, "not a folder");
    const { console: shell, printed } = fakeConsole();
    teeConsoleToLog(shell, path.join(blocker, "main.log"));

    assert.doesNotThrow(() => shell.error("still printed"));
    assert.deepEqual(printed, ["error still printed"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
