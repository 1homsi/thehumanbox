import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import test from "node:test";
import * as vm from "node:vm";

test("boot registers app IPC before creating the window and stops the sim on fatal failure", async () => {
  const calls: string[] = [];
  let boot: (() => Promise<void>) | undefined;
  let onFailure: ((error: unknown) => Promise<void>) | undefined;
  let exitedWith: number | undefined;
  let simStopped = false;
  let stopBehavior: "resolve" | "reject" | "hang" = "resolve";

  class FakeWindow {
    constructor() {
      calls.push("window:create");
      throw new Error("malformed window state");
    }
  }

  const app = {
    setName() {},
    isPackaged: true,
    getVersion: () => "0.0.0-test",
    on() {},
    whenReady: () => new Promise<void>(() => {}),
    getPath: () => "/tmp/thehumanbox-test",
    exit: (code: number) => {
      calls.push("app:exit");
      exitedWith = code;
    },
  };
  const ipcMain = {
    handle: (channel: string) => calls.push(`ipc:${channel}`),
  };
  const context = vm.createContext({
    exports: {},
    __dirname,
    process,
    console: { error() {}, warn() {} },
    setTimeout: (callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) =>
      setTimeout(callback, delay === 6000 ? 0 : delay, ...args),
    clearTimeout,
    require: (id: string) => {
      if (id === "electron") {
        return {
          app,
          BrowserWindow: FakeWindow,
          dialog: { showErrorBox: () => calls.push("dialog:error") },
          globalShortcut: { unregisterAll() {} },
          ipcMain,
        };
      }
      if (id === "./ipc") return { registerIpc() {} };
      if (id === "./startup-lifecycle") {
        return {
          startWhenReady: (_ready: Promise<void>, start: () => Promise<void>, fail: (error: unknown) => Promise<void>) => {
            boot = start;
            onFailure = fail;
          },
        };
      }
      if (id === "./exclusive-operation") return { runExclusiveDesktopOperation: async (fn: () => Promise<void>) => fn() };
      if (id === "./sim-process") {
        return {
          startSim: async () => ({ port: 8000 }),
          stopSim: async () => {
            calls.push("sim:stop");
            if (stopBehavior === "reject") throw new Error("stop failed");
            if (stopBehavior === "hang") return new Promise<void>(() => {});
            simStopped = true;
          },
          activeSim: () => null,
        };
      }
      if (id === "./settings") return { loadSettings: () => ({}), prepareDataRoot() {} };
      if (id === "./updater") return {};
      if (id === "node:fs") return { readFileSync: () => { throw new Error("no saved bounds"); } };
      if (id === "./app-version-arg") return { appVersionArgument: (v: string) => `--thb-app-version=${v}` };
      if (id === "node:path") return path;
      return {};
    },
  });

  vm.runInContext(readFileSync(path.join(__dirname, "index.js"), "utf8"), context);
  assert.ok(boot);
  assert.ok(onFailure);
  await assert.rejects(boot(), /malformed window state/);

  const windowCreation = calls.indexOf("window:create");
  assert.ok(windowCreation > -1);
  assert.ok(calls.indexOf("ipc:app:notify") < windowCreation);
  assert.ok(calls.indexOf("ipc:app:pickSaveDir") < windowCreation);

  const assertFatalOrder = async (error: Error): Promise<void> => {
    const start = calls.length;
    await onFailure!(error);
    const events = calls.slice(start);
    assert.ok(events.includes("sim:stop"));
    assert.ok(events.indexOf("sim:stop") < events.indexOf("dialog:error"));
    assert.ok(events.indexOf("dialog:error") < events.indexOf("app:exit"));
  };

  await assertFatalOrder(new Error("malformed window state"));
  assert.equal(simStopped, true);
  assert.equal(exitedWith, 1);

  stopBehavior = "reject";
  await assertFatalOrder(new Error("second startup failure"));
  assert.equal(calls.filter((call) => call === "app:exit").length, 2);

  stopBehavior = "hang";
  await assertFatalOrder(new Error("third startup failure"));
  assert.equal(calls.filter((call) => call === "app:exit").length, 3);
});
