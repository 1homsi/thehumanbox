import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import test from "node:test";
import * as vm from "node:vm";

type MenuItem = { label?: string; checked?: boolean; enabled?: boolean; click?: () => void; submenu?: MenuItem[] };

function findMenuItem(items: MenuItem[], label: string): MenuItem | null {
  for (const item of items) {
    if (item.label === label) return item;
    const found = item.submenu ? findMenuItem(item.submenu, label) : null;
    if (found) return found;
  }
  return null;
}

// The tray menu is rebuilt from scratch on every update, so the label of the
// show/hide item is the observable state.
function trayLabel(tray: { contextMenu: { template: MenuItem[] } | null }): string | null {
  const item = (tray.contextMenu?.template ?? []).find((candidate) =>
    /^(Hide|Show) window$/.test(candidate.label ?? ""),
  );
  return item?.label ?? null;
}

function trayAlwaysOnTopChecked(tray: { contextMenu: { template: MenuItem[] } | null }): boolean | null {
  const item = (tray.contextMenu?.template ?? []).find(
    (candidate) => candidate.label === "Always on top",
  );
  return item ? (item.checked ?? false) : null;
}

// Null when no application menu has been set at all, so a missing menu fails
// the assertion instead of throwing.
function viewAlwaysOnTopChecked(menu: { template: MenuItem[] } | null): boolean | null {
  const item = findMenuItem(menu?.template ?? [], "Always on top");
  return item ? (item.checked ?? false) : null;
}

function harness() {
  const windows: FakeWindow[] = [];
  const trays: FakeTray[] = [];
  let appMenu: FakeMenu | null = null;

  class FakeMenu {
    template: MenuItem[];
    constructor(template: MenuItem[]) {
      this.template = template;
    }
    static buildFromTemplate(template: MenuItem[]) {
      return new FakeMenu(template);
    }
    static setApplicationMenu(menu: FakeMenu) {
      appMenu = menu;
    }
    static getApplicationMenu() {
      return appMenu;
    }
  }
  class FakeTray {
    contextMenu: FakeMenu | null = null;
    constructor() {
      trays.push(this);
    }
    setToolTip() {}
    setContextMenu(menu: FakeMenu) {
      this.contextMenu = menu;
    }
    on() {}
  }
  class FakeWindow extends EventEmitter {
    destroyed = false;
    visible = true;
    minimized = false;
    alwaysOnTop = false;
    webContents = {
      send: () => {},
      setWindowOpenHandler: () => {},
      session: {
        setPermissionCheckHandler: () => {},
        setPermissionRequestHandler: () => {},
      },
      on: () => {},
    };
    constructor() {
      super();
      windows.push(this);
    }
    async loadFile() {}
    close() {
      this.destroyed = true;
      this.emit("closed");
    }
    isDestroyed() {
      return this.destroyed;
    }
    isVisible() {
      return this.visible;
    }
    isMinimized() {
      return this.minimized;
    }
    minimize() {
      this.minimized = true;
      this.emit("minimize");
    }
    isAlwaysOnTop() {
      return this.alwaysOnTop;
    }
    show() {
      this.visible = true;
      this.emit("show");
    }
    hide() {
      this.visible = false;
      this.emit("hide");
    }
    setAlwaysOnTop(value: boolean) {
      this.alwaysOnTop = value;
      this.emit("always-on-top-changed", value);
    }
    focus() {}
    restore() {
      this.minimized = false;
      this.emit("restore");
    }
    maximize() {}
  }

  const app = {
    setName() {},
    isPackaged: true,
    getVersion: () => "0.0.0-test",
    on() {},
    requestSingleInstanceLock: () => true,
    whenReady: () => new Promise<void>(() => {}),
    getPath: () => "/tmp/thehumanbox-test",
  };
  const context = vm.createContext({
    exports: {},
    __dirname,
    process,
    console,
    setTimeout,
    clearTimeout,
    require: (id: string) => {
      if (id === "electron") {
        return {
          app,
          BrowserWindow: FakeWindow,
          Menu: FakeMenu,
          Tray: FakeTray,
          nativeImage: {
            createFromPath: () => ({
              resize: () => ({ setTemplateImage: () => {} }),
            }),
          },
        };
      }
      if (id === "./startup-lifecycle") return { startWhenReady: () => {} };
      if (id === "./settings") return { loadSettings: () => ({}) };
      if (id === "./i18n") return require(path.join(__dirname, "i18n"));
      if (id === "./exclusive-operation") {
        return {
          runExclusiveDesktopOperation: async (
            _name: string,
            run: () => Promise<void>,
          ) => run(),
          currentDesktopOperation: () => null,
        };
      }
      if (id === "./sim-process") {
        return {
          startSim: async () => ({ port: 8000 }),
          stopSim: async () => {},
          activeSim: () => null,
          onUnexpectedSimExit: () => {},
          simLifecyclePending: () => false,
        };
      }
      if (id === "node:fs") {
        return {
          readFileSync: () => {
            throw new Error("no saved bounds");
          },
        };
      }
      if (id === "./app-version-arg") {
        return { appVersionArgument: (v: string) => `--thb-app-version=${v}` };
      }
      if (id === "./app-icon") return { appIconPath: () => "/tmp/icon.png" };
      if (id === "node:path") return path;
      if (id === "./renderer-load") return require(path.join(__dirname, "renderer-load"));
      return {};
    },
  });
  vm.runInContext(readFileSync(path.join(__dirname, "index.js"), "utf8"), context);
  return {
    context,
    windows,
    trays,
    get appMenu() {
      return appMenu;
    },
  };
}

test("the tray and the View menu follow the window a restart swaps in", async () => {
  const h = harness();
  const { context, windows, trays } = h;
  await vm.runInContext("createWindow()", context);
  vm.runInContext("buildTray()", context);
  assert.equal(trays.length, 1);
  assert.equal(trayLabel(trays[0]), "Hide window");

  // The user turns "Always on top" on, then the window is hidden (tray toggle).
  windows[0].setAlwaysOnTop(true);
  assert.equal(viewAlwaysOnTopChecked(h.appMenu), true);
  assert.equal(trayAlwaysOnTopChecked(trays[0]), true);
  windows[0].hide();
  assert.equal(trayLabel(trays[0]), "Show window");

  // File > Restart simulation replaces the window. The replacement is visible
  // and not always on top, so both menus have to say that; bound once at boot
  // they kept describing the window that was destroyed.
  await vm.runInContext("restartSimulation()", context);
  assert.equal(windows.length, 2);
  assert.equal(trayLabel(trays[0]), "Hide window");
  assert.equal(viewAlwaysOnTopChecked(h.appMenu), false);

  // Events from the window that was replaced can still arrive; they must not
  // drive the menus of its successor.
  windows[0].emit("show");
  windows[0].emit("always-on-top-changed", true);
  windows[0].emit("hide");
  assert.equal(trayLabel(trays[0]), "Hide window");
  assert.equal(viewAlwaysOnTopChecked(h.appMenu), false);
  assert.equal(trayAlwaysOnTopChecked(trays[0]), false);

  // The replacement is the window that owns the state now.
  windows[1].setAlwaysOnTop(true);
  assert.equal(viewAlwaysOnTopChecked(h.appMenu), true);
  assert.equal(trayAlwaysOnTopChecked(trays[0]), true);
  windows[1].hide();
  assert.equal(trayLabel(trays[0]), "Show window");
});

test("a minimized game window is offered as Show window, and that item restores it", async () => {
  const h = harness();
  const { context, windows, trays } = h;
  await vm.runInContext("createWindow()", context);
  vm.runInContext("buildTray()", context);
  assert.equal(trayLabel(trays[0]), "Hide window");

  // Minimized windows stay visible, so the old label still said "Hide window"
  // while the click below restored the window.
  windows[0].minimize();
  assert.equal(trayLabel(trays[0]), "Show window");

  const show = (trays[0].contextMenu?.template ?? []).find((item) => item.label === "Show window");
  show?.click?.();
  assert.equal(windows[0].isMinimized(), false);
  assert.equal(windows[0].isVisible(), true);
  assert.equal(trayLabel(trays[0]), "Hide window");
});

test("closing the last window clears the tray and View state", async () => {
  const h = harness();
  const { context, trays } = h;
  await vm.runInContext("createWindow()", context);
  vm.runInContext("buildTray()", context);
  const win = vm.runInContext("mainWindow", context) as { close: () => void };
  assert.equal(trayLabel(trays[0]), "Hide window");

  win.close();
  assert.equal(vm.runInContext("mainWindow", context), null);
  assert.equal(trayLabel(trays[0]), "Show window");
  assert.equal(viewAlwaysOnTopChecked(h.appMenu), false);
  assert.equal(trayAlwaysOnTopChecked(trays[0]), false);
});

test("the menu items that act on the game window are disabled while no window is open", async () => {
  // With no window (macOS keeps the app running after its window closes), Reload,
  // DevTools and Always on top did nothing when chosen, and Always on top still
  // showed a tick that it could not apply. They are disabled until a window opens.
  const h = harness();
  const { context, trays } = h;
  const appItem = (label: string): MenuItem | null => findMenuItem(h.appMenu?.template ?? [], label);
  const trayItem = (): MenuItem | null =>
    trays[0].contextMenu?.template.find((item) => item.label === "Always on top") ?? null;
  await vm.runInContext("createWindow()", context);
  vm.runInContext("buildTray()", context);

  assert.notEqual(appItem("Reload")?.enabled, false);
  assert.notEqual(trayItem()?.enabled, false);

  (vm.runInContext("mainWindow", context) as { close: () => void }).close();
  assert.equal(appItem("Reload")?.enabled, false);
  assert.equal(appItem("Toggle DevTools")?.enabled, false);
  assert.equal(appItem("Always on top")?.enabled, false);
  assert.equal(trayItem()?.enabled, false);

  await vm.runInContext("openWindow()", context);
  assert.notEqual(appItem("Reload")?.enabled, false);
  assert.notEqual(appItem("Always on top")?.enabled, false);
  assert.notEqual(trayItem()?.enabled, false);
});
