import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";
import test from "node:test";
import * as vm from "node:vm";

// When the simulation dies on its own, the player is asked whether to restart
// it. The prompt is attached to the game window. A game kept in the tray has a
// hidden window, and a prompt attached to it may never be seen, so the window is
// brought up before the prompt.

type Listener = (exit: { code: number | null; signal: NodeJS.Signals | null }) => void;

function loadIndex() {
  const exitListeners: Listener[] = [];
  const events: string[] = [];
  let windowRef: FakeWindow | null = null;
  class FakeWindow extends EventEmitter {
    destroyed = false;
    visible = true;
    webContents = {
      send: () => {},
      on: () => {},
      setWindowOpenHandler: () => {},
      openDevTools: () => {},
      session: { setPermissionCheckHandler: () => {}, setPermissionRequestHandler: () => {} },
    };
    constructor() {
      super();
      windowRef = this;
    }
    loadFile() {
      return Promise.resolve();
    }
    loadURL() {
      return Promise.resolve();
    }
    getBounds() {
      return { x: 0, y: 0, width: 1400, height: 900 };
    }
    getNormalBounds() {
      return { x: 0, y: 0, width: 1400, height: 900 };
    }
    isMaximized() {
      return false;
    }
    isFullScreen() {
      return false;
    }
    isDestroyed() {
      return this.destroyed;
    }
    isAlwaysOnTop() {
      return false;
    }
    isVisible() {
      return this.visible;
    }
    show() {
      this.visible = true;
      events.push("window:show");
    }
    focus() {}
    maximize() {}
  }
  const app = {
    setName() {},
    isPackaged: true,
    getVersion: () => "0.0.0-test",
    getPath: () => "/tmp/thehumanbox-test",
    getLocale: () => "en-US",
    getLoginItemSettings: () => ({ wasOpenedAtLogin: false }),
    setLoginItemSettings() {},
    on() {},
    requestSingleInstanceLock: () => true,
    whenReady: () => new Promise<void>(() => {}),
  };
  const context = vm.createContext({
    exports: {},
    __dirname,
    process,
    console: { log() {}, warn() {}, error() {} },
    setTimeout,
    clearTimeout,
    require: (id: string) => {
      if (id === "electron") {
        return {
          app,
          BrowserWindow: FakeWindow,
          Menu: { setApplicationMenu() {}, buildFromTemplate: () => ({}) },
          dialog: {
            showMessageBox: async (...args: unknown[]) => {
              const attached = args.length === 2;
              events.push(attached ? "prompt:attached" : "prompt:detached");
              return { response: 1 };
            },
            showErrorBox() {},
          },
          ipcMain: { handle: () => {} },
          globalShortcut: { register: () => true, unregisterAll() {} },
          screen: { getAllDisplays: () => [] },
          shell: { openExternal: () => Promise.resolve() },
          session: { defaultSession: { webRequest: { onHeadersReceived() {} } } },
        };
      }
      if (id === "./startup-lifecycle") return { startWhenReady: () => {} };
      if (id === "./settings") return { loadSettings: () => ({ autoLaunch: false, startMinimized: false, saveLocationOverride: null, locale: null }) };
      if (id === "./sim-process") {
        return {
          startSim: async () => ({ port: 8000, commandToken: "T" }),
          stopSim: async () => {},
          activeSim: () => null,
          simLifecyclePending: () => false,
          onUnexpectedSimExit: (listener: Listener) => {
            exitListeners.push(listener);
            return () => {};
          },
        };
      }
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
  return { context, exitListeners, events, window: () => windowRef! };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

test("a crash prompt for a game kept in the tray shows the window before it asks", async () => {
  const { context, exitListeners, events, window } = loadIndex();
  await vm.runInContext("boot()", context);
  window().visible = false; // the player hid the game to the tray
  events.length = 0;

  exitListeners[0]({ code: 1, signal: null });
  await tick();

  const shown = events.indexOf("window:show");
  const asked = events.findIndex((event) => event.startsWith("prompt:"));
  assert.ok(shown > -1, `events: ${events.join(", ")}`);
  assert.ok(asked > -1, `events: ${events.join(", ")}`);
  assert.ok(shown < asked, `the window must be up before the prompt: ${events.join(", ")}`);
  assert.equal(events[asked], "prompt:attached", "the prompt stays attached to the game window");
});

test("a crash prompt for a visible game is not preceded by a window show", async () => {
  const { context, exitListeners, events } = loadIndex();
  await vm.runInContext("boot()", context);
  events.length = 0;

  exitListeners[0]({ code: 1, signal: null });
  await tick();

  assert.equal(events.includes("window:show"), false, `events: ${events.join(", ")}`);
  assert.ok(events.includes("prompt:attached"));
});
