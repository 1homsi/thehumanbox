import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";
import test from "node:test";
import * as vm from "node:vm";

// The show/hide shortcut is registered at boot. When another app already holds
// it, Electron returns false and pressing it does nothing. The player must be
// told; the tray icon still works.

type Handler = (...args: unknown[]) => unknown

function loadIndex(register: () => boolean) {
  const notifications: Array<{ title: string; body: string }> = []
  const warnings: string[] = []
  class FakeNotification {
    static isSupported() {
      return true
    }
    constructor(options: { title: string; body: string }) {
      notifications.push({ title: options.title, body: options.body })
    }
    on() {}
    show() {}
  }
  class FakeWindow extends EventEmitter {
    destroyed = false
    webContents = {
      send: () => {},
      on: () => {},
      setWindowOpenHandler: () => {},
      openDevTools: () => {},
      session: { setPermissionCheckHandler: () => {}, setPermissionRequestHandler: () => {} },
    }
    loadFile() {
      return Promise.resolve()
    }
    loadURL() {
      return Promise.resolve()
    }
    getBounds() {
      return { x: 0, y: 0, width: 1400, height: 900 }
    }
    getNormalBounds() {
      return { x: 0, y: 0, width: 1400, height: 900 }
    }
    isMaximized() {
      return false
    }
    isFullScreen() {
      return false
    }
    isDestroyed() {
      return this.destroyed
    }
    isAlwaysOnTop() {
      return false
    }
    isVisible() {
      return true
    }
    show() {}
    maximize() {}
  }
  const app = {
    setName() {},
    isPackaged: true,
    getVersion: () => "0.0.0-test",
    getPath: () => "/tmp/thehumanbox-test",
    on() {},
    requestSingleInstanceLock: () => true,
    whenReady: () => new Promise<void>(() => {}),
  }
  const context = vm.createContext({
    exports: {},
    __dirname,
    process,
    console: {
      log() {},
      warn: (...args: unknown[]) => warnings.push(args.map(String).join(" ")),
      error() {},
    },
    setTimeout,
    clearTimeout,
    require: (id: string) => {
      if (id === "electron") {
        return {
          app,
          BrowserWindow: FakeWindow,
          Notification: FakeNotification,
          Menu: { setApplicationMenu() {}, buildFromTemplate: () => ({}) },
          ipcMain: { handle: () => {} },
          globalShortcut: { register, unregisterAll() {} },
          screen: { getAllDisplays: () => [] },
          shell: { openExternal: () => Promise.resolve() },
          session: { defaultSession: {} },
        };
      }
      if (id === "./startup-lifecycle") return { startWhenReady: () => {} };
      if (id === "./settings") return { loadSettings: () => ({ autoLaunch: false, startMinimized: false, saveLocationOverride: null, locale: null }) };
      if (id === "./sim-process") return { startSim: async () => ({ port: 8000, commandToken: "T" }) };
      if (id === "./ipc") return { registerIpc: () => {} };
      if (id === "./updater") return { initUpdater: () => {}, checkForUpdatesNow: async () => ({}), installDownloadedUpdate: () => ({}) };
      if (id === "./main-log") return { teeConsoleToLog: () => ({ write() {}, close() {} }) };
      if (id === "node:fs") return fs;
      if (id === "node:path") return path;
      if (id === "./app-version-arg") return { appVersionArgument: (v: string) => `--thb-app-version=${v}` };
      if (id === "./app-icon") return { appIconPath: () => "/tmp/icon.png" };
      for (const local of ["i18n", "redact-url", "renderer-load", "navigation-guard", "error-dialog", "exclusive-operation", "window-state", "world-safety", "login-launch", "prompt-relevance", "restart-recovery", "renderer-csp", "sim-errors"]) {
        if (id === `./${local}`) return require(path.join(__dirname, local));
      }
      return {};
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "index.js"), "utf8"), context);
  return { context, notifications, warnings };
}

const shortcut = process.platform === "darwin" ? "Cmd+Alt+Shift+H" : "Ctrl+Alt+Shift+H";

test("a show/hide shortcut that another app holds is reported to the player", () => {
  const { context, notifications, warnings } = loadIndex(() => false);
  vm.runInContext("registerToggleShortcut()", context);
  assert.equal(notifications.length, 1, `notifications: ${JSON.stringify(notifications)}`);
  assert.match(notifications[0].title, /shortcut/i);
  assert.ok(notifications[0].body.includes(shortcut), notifications[0].body);
  assert.ok(warnings.some((line) => line.includes(shortcut)));
});

test("a shortcut that Electron rejects is reported to the player too", () => {
  const { context, notifications } = loadIndex(() => {
    throw new Error("Invalid accelerator");
  });
  assert.doesNotThrow(() => vm.runInContext("registerToggleShortcut()", context));
  assert.equal(notifications.length, 1);
});

test("a shortcut that registers quietly says nothing", () => {
  const { context, notifications } = loadIndex(() => true);
  vm.runInContext("registerToggleShortcut()", context);
  assert.deepEqual(notifications, []);
});
