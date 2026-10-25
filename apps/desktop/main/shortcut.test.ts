import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";
import test from "node:test";
import * as vm from "node:vm";

// The show/hide shortcut is registered at boot. When it does not register, the
// player must be told once the window is open: a notification, or, where a
// notification cannot be shown, the tray tooltip. The tray icon still works.

function loadIndex(options: { register: () => boolean; notificationsSupported?: boolean }) {
  const notifications: Array<{ title: string; body: string; instance: EventEmitter }> = [];
  const tooltips: string[] = [];
  const warnings: string[] = [];
  class FakeNotification extends EventEmitter {
    static isSupported() {
      return options.notificationsSupported ?? true;
    }
    constructor(options: { title: string; body: string }) {
      super();
      notifications.push({ title: options.title, body: options.body, instance: this });
    }
    show() {}
  }
  class FakeTray extends EventEmitter {
    setToolTip(text: string) {
      tooltips.push(text);
    }
    setContextMenu() {}
  }
  class FakeWindow extends EventEmitter {
    destroyed = false;
    webContents = {
      send: () => {},
      on: () => {},
      setWindowOpenHandler: () => {},
      openDevTools: () => {},
      session: { setPermissionCheckHandler: () => {}, setPermissionRequestHandler: () => {} },
    };
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
      return true;
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
  };
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
      if (id === './app-menu') return require(path.join(__dirname, 'app-menu'))
      if (id === "electron") {
        return {
          app,
          BrowserWindow: FakeWindow,
          Notification: FakeNotification,
          Tray: FakeTray,
          nativeImage: { createFromPath: () => ({ resize() { return this; }, setTemplateImage() {} }) },
          Menu: { setApplicationMenu() {}, buildFromTemplate: () => ({}) },
          ipcMain: { handle: () => {} },
          globalShortcut: { register: options.register, unregisterAll() {} },
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
  return { context, notifications, tooltips, warnings };
}

const shortcut = process.platform === "darwin" ? "Cmd+Alt+Shift+H" : "Ctrl+Alt+Shift+H";

test("a shortcut that does not register is reported once the window is open, not during boot", () => {
  const { context, notifications, warnings } = loadIndex({ register: () => false });
  const registered = vm.runInContext("registerToggleShortcut()", context);
  assert.equal(registered, false);
  assert.equal(notifications.length, 0, "nothing is raised before the window exists");
  assert.ok(warnings.some((line) => line.includes(shortcut)));

  vm.runInContext("announceShortcutUnavailable()", context);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].title, /shortcut/i);
  assert.ok(notifications[0].body.includes(shortcut), notifications[0].body);
});

test("the message does not blame another app, since registration can fail for other reasons", () => {
  const { context, notifications } = loadIndex({
    register: () => {
      throw new Error("Invalid accelerator");
    },
  });
  assert.equal(vm.runInContext("registerToggleShortcut()", context), false);
  vm.runInContext("announceShortcutUnavailable()", context);
  assert.equal(notifications.length, 1);
  assert.doesNotMatch(notifications[0].body, /another app/i);
});

test("when a notification cannot be shown, the tray tooltip carries the message", () => {
  const unsupported = loadIndex({ register: () => false, notificationsSupported: false });
  vm.runInContext("buildTray()", unsupported.context);
  vm.runInContext("announceShortcutUnavailable()", unsupported.context);
  assert.equal(unsupported.notifications.length, 0);
  assert.ok(unsupported.tooltips.some((text) => text.includes(shortcut)), `tooltips: ${unsupported.tooltips.join(" | ")}`);
});

test("a notification the OS rejects falls back to the tray tooltip", () => {
  const rejected = loadIndex({ register: () => false });
  vm.runInContext("buildTray()", rejected.context);
  vm.runInContext("announceShortcutUnavailable()", rejected.context);
  assert.equal(rejected.notifications.length, 1);
  rejected.notifications[0].instance.emit("failed");
  assert.ok(rejected.tooltips.some((text) => text.includes(shortcut)), `tooltips: ${rejected.tooltips.join(" | ")}`);
});

test("a shortcut that registers quietly says nothing", () => {
  const { context, notifications, warnings } = loadIndex({ register: () => true });
  // boot announces only when registration failed, so a success raises nothing.
  assert.equal(vm.runInContext("registerToggleShortcut()", context), true);
  assert.equal(notifications.length, 0);
  assert.equal(warnings.length, 0);
});

test("the fallback tray tooltip fits Windows' 127-unit limit in every language", () => {
  // Windows truncates a longer tooltip, which would cut off the advice to use
  // the tray icon. The app's own i18n module is shared with the harness, so
  // setLocale here changes the language the app announces in.
  const i18n = require(path.join(__dirname, "i18n")) as {
    LOCALE_CODES: readonly string[];
    setLocale: (preferred: readonly string[]) => string;
  };
  try {
    for (const code of i18n.LOCALE_CODES) {
      i18n.setLocale([code]);
      const { context, tooltips } = loadIndex({ register: () => false, notificationsSupported: false });
      vm.runInContext("buildTray()", context);
      vm.runInContext("announceShortcutUnavailable()", context);
      const tooltip = tooltips[tooltips.length - 1] ?? "";
      assert.ok(tooltip.includes(shortcut), `${code}: ${tooltip}`);
      assert.ok(tooltip.length <= 127, `${code}: ${tooltip.length} units: ${tooltip}`);
    }
  } finally {
    i18n.setLocale(["en"]);
  }
});
