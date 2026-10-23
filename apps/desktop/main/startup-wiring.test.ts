import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import test from "node:test";
import * as vm from "node:vm";

import * as rendererCsp from "./renderer-csp";

function loadIndex(options: {
  singleInstance: boolean;
  calls: string[];
  startSim?: () => Promise<{ port: number }>;
  allowWindow?: boolean;
  failRuntimeLoad?: boolean;
}) {
  const calls = options.calls;
  let activate: (() => Promise<void>) | undefined;
  let boot: (() => Promise<void>) | undefined;
  let onFailure: ((error: unknown) => Promise<void>) | undefined;
  let exitedWith: number | undefined;
  let simStopped = false;
  let stopBehavior: "resolve" | "reject" | "hang" = "resolve";
  let failRuntimeLoad = options.failRuntimeLoad ?? false;

  class FakeWindow {
    static getAllWindows() {
      return [];
    }

    constructor() {
      calls.push("window:create");
      if (!options.allowWindow) throw new Error("malformed window state");
    }

    webContents = {
      on() {},
      send() {},
      setWindowOpenHandler() {},
      openDevTools() {},
      session: {
        setPermissionCheckHandler() {},
        setPermissionRequestHandler() {},
      },
    };
    on() {}
    async loadURL() {
      calls.push("window:error-page");
    }
    show() {
      calls.push("window:show");
    }
    close() {
      calls.push("window:close");
    }
    isVisible() { return true }
    isDestroyed() { return false }
    isMinimized() { return false }
    isAlwaysOnTop() { return false }
    maximize() {}
    focus() {}
    restore() {}
    getBounds() { return { width: 1400, height: 900 } }
    isMaximized() { return false }
  }

  const menu = {
    buildFromTemplate: () => ({}),
    setApplicationMenu() {},
  };
  const startupSettings = {
    mode: "local",
    autoUpdate: false,
    autoLaunch: false,
    startMinimized: false,
  };
  const loadRenderer = async (_win: unknown, _file: string, query: Record<string, string>) => {
    calls.push("renderer:splash");
    if (query.api) {
      calls.push("renderer:runtime");
      if (failRuntimeLoad) throw new Error("runtime renderer failed");
    }
  };

  const app = {
    setName() {},
    isPackaged: true,
    getVersion: () => "0.0.0-test",
    getLocale: () => "en-US",
    setLoginItemSettings() {},
    getLoginItemSettings: () => ({ wasOpenedAtLogin: false }),
    on(event: string, handler: () => Promise<void>) {
      if (event === "activate") activate = handler;
    },
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
  let cspInstalled = false;
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
          Menu: menu,
          dialog: { showErrorBox: () => calls.push("dialog:error") },
          globalShortcut: { unregisterAll() {}, register: () => true },
          ipcMain,
          session: {
            defaultSession: {
              webRequest: {
                onHeadersReceived() {
                  cspInstalled = true;
                  calls.push("csp:install");
                },
              },
            },
          },
        };
      }
      if (id === "./ipc") return { registerIpc() {} };
      if (id === "./renderer-load") return { loadRenderer };
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
          startSim: () => {
            calls.push("sim:start");
            return options.startSim ? options.startSim() : Promise.resolve({ port: 8000 });
          },
          stopSim: async () => {
            calls.push("sim:stop");
            if (stopBehavior === "reject") throw new Error("stop failed");
            if (stopBehavior === "hang") return new Promise<void>(() => {});
            simStopped = true;
          },
          activeSim: () => ({ port: 8000 }),
          onUnexpectedSimExit() {},
          simLifecyclePending: () => false,
        };
      }
      if (id === "./settings") return { loadSettings: () => startupSettings, prepareDataRoot() {} };
      if (id === "./i18n") return require(path.join(__dirname, "i18n"));
      if (id === "./updater") return { initUpdater: () => calls.push("updater:init") };
      if (id === "./app-version-arg") return { appVersionArgument: (v: string) => `--thb-app-version=${v}` };
      if (id === "./app-icon") return { appIconPath: () => "/tmp/icon.png" };
      if (id === "./login-launch") return { loginItemSettings: () => ({}) };
      if (id === "node:fs") return { readFileSync: () => { throw new Error("no saved bounds"); } };
      if (id === "node:path") return path;
      if (id === "./renderer-csp") return rendererCsp;
      return {};
    },
  });

  vm.runInContext(readFileSync(path.join(__dirname, "index.js"), "utf8"), context);
  return {
    get boot() {
      return boot;
    },
    get activate() {
      return activate;
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
    replaceWindow() {
      return vm.runInContext("createWindowReplace()", context) as Promise<void>;
    },
    setFailRuntimeLoad(value: boolean) {
      failRuntimeLoad = value;
    },
    setStopBehavior(mode: "resolve" | "reject" | "hang") {
      stopBehavior = mode;
    },
    get cspInstalled() {
      return cspInstalled;
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

test("boot installs a content security policy for the renderer file", async () => {
  const calls: string[] = [];
  const wiring = loadIndex({ singleInstance: true, calls });
  await assert.rejects(wiring.boot!(), /malformed window state/);
  assert.equal(wiring.cspInstalled, true);
  assert.ok(calls.includes("csp:install"));
});

test("a second launch quits before booting, so it never opens a window or starts a sim", async () => {
  const calls: string[] = [];
  const wiring = loadIndex({ singleInstance: false, calls });

  assert.equal(wiring.boot, undefined);
  assert.ok(calls.includes("app:singleInstanceLock"));
  assert.ok(calls.includes("app:quit"));
  assert.equal(calls.some((call) => call === "window:create" || call === "sim:start"), false);
});

test("the desktop splash is shown before boot waits for the simulation", async () => {
  const calls: string[] = [];
  const pendingSim = new Promise<{ port: number }>(() => {});
  const wiring = loadIndex({
    singleInstance: true,
    calls,
    allowWindow: true,
    startSim: () => pendingSim,
  });
  await wiring.boot!();

  const windowCreated = calls.indexOf("window:create");
  const splashLoaded = calls.indexOf("renderer:splash");
  const windowShown = calls.indexOf("window:show");
  const simStarted = calls.indexOf("sim:start");
  assert.ok(windowCreated > -1);
  assert.ok(splashLoaded > windowCreated);
  assert.ok(windowShown > splashLoaded);
  assert.ok(simStarted > windowShown);
  assert.ok(calls.indexOf("updater:init") < simStarted);
});

test("a failed runtime renderer load stops the simulation behind the error page", async () => {
  const calls: string[] = [];
  const wiring = loadIndex({
    singleInstance: true,
    calls,
    allowWindow: true,
    failRuntimeLoad: true,
    startSim: async () => ({ port: 8000 }),
  });

  await wiring.boot!();
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(calls.includes("renderer:runtime"));
  assert.ok(calls.includes("sim:stop"));
  assert.ok(calls.includes("window:error-page"));
});

test("a failed replacement renderer closes the old window after stopping its sim", async () => {
  const calls: string[] = [];
  const wiring = loadIndex({
    singleInstance: true,
    calls,
    allowWindow: true,
    startSim: async () => ({ port: 8000 }),
  });

  await wiring.boot!();
  await new Promise((resolve) => setImmediate(resolve));
  wiring.setFailRuntimeLoad(true);

  await assert.rejects(wiring.replaceWindow(), /runtime renderer failed/);

  assert.equal(calls.filter((call) => call === "window:create").length, 2);
  assert.ok(calls.includes("sim:stop"));
  assert.ok(calls.includes("window:error-page"));
  assert.equal(calls.filter((call) => call === "window:close").length, 1);
});

test("a window that fails to open from the dock is reported, not left unhandled", async () => {
  const calls: string[] = [];
  const wiring = loadIndex({ singleInstance: true, calls });

  // The window constructor throws. If the activate handler lets that reject,
  // Node routes it to uncaughtException, which quits the app and stops the sim.
  await wiring.activate!();

  assert.ok(calls.includes("window:create"));
  assert.ok(calls.includes("dialog:error"));
});
