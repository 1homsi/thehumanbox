import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import test from "node:test";
import * as vm from "node:vm";

function loadIndex(options: { singleInstance: boolean; calls: string[] }) {
  const calls = options.calls;
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
    requestSingleInstanceLock: () => {
      calls.push("app:singleInstanceLock");
      return options.singleInstance;
    },
    whenReady: () => new Promise<void>(() => {}),
    getPath: () => "/tmp/thehumanbox-test",
    exit: (code: number) => {
      calls.push("app:exit");
      exitedWith = code;
    },
    quit: () => calls.push("app:quit"),
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
          startSim: async () => {
            calls.push("sim:start");
            return { port: 8000 };
          },
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
      if (id === "./app-icon") return { appIconPath: () => "/tmp/icon.png" };
      if (id === "node:path") return path;
      return {};
    },
  });

  vm.runInContext(readFileSync(path.join(__dirname, "index.js"), "utf8"), context);
  return {
    get boot() {
      return boot;
    },
    get onFailure() {
      return onFailure;
    },
    get simStopped() {
      return simStopped;
    },
    get exitedWith() {
      return exitedWith;
    },
    setStopBehavior(mode: "resolve" | "reject" | "hang") {
      stopBehavior = mode;
    },
  };
}

test("boot registers app IPC before creating the window and stops the sim on fatal failure", async () => {
  const calls: string[] = [];
  const wiring = loadIndex({ singleInstance: true, calls });
  assert.ok(wiring.boot);
  assert.ok(wiring.onFailure);
  await assert.rejects(wiring.boot(), /malformed window state/);

  const windowCreation = calls.indexOf("window:create");
  assert.ok(windowCreation > -1);
  assert.ok(calls.indexOf("ipc:app:notify") < windowCreation);
  assert.ok(calls.indexOf("ipc:app:pickSaveDir") < windowCreation);

  const assertFatalOrder = async (error: Error): Promise<void> => {
    const start = calls.length;
    await wiring.onFailure!(error);
    const events = calls.slice(start);
    assert.ok(events.includes("sim:stop"));
    assert.ok(events.indexOf("sim:stop") < events.indexOf("dialog:error"));
    assert.ok(events.indexOf("dialog:error") < events.indexOf("app:exit"));
  };

  await assertFatalOrder(new Error("malformed window state"));
  assert.equal(wiring.simStopped, true);
  assert.equal(wiring.exitedWith, 1);

  wiring.setStopBehavior("reject");
  await assertFatalOrder(new Error("second startup failure"));
  assert.equal(calls.filter((call) => call === "app:exit").length, 2);

  wiring.setStopBehavior("hang");
  await assertFatalOrder(new Error("third startup failure"));
  assert.equal(calls.filter((call) => call === "app:exit").length, 3);
});

test("a second launch quits before booting, so it never opens a window or starts a sim", async () => {
  const calls: string[] = [];
  const wiring = loadIndex({ singleInstance: false, calls });

  assert.equal(wiring.boot, undefined);
  assert.ok(calls.includes("app:singleInstanceLock"));
  assert.ok(calls.includes("app:quit"));
  assert.equal(calls.some((call) => call === "window:create" || call === "sim:start"), false);
});
