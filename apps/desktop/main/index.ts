import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  screen,
  shell,
  Tray,
} from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  externalHttpUrl,
  isAllowedRendererPermission,
  isRendererNavigation,
  shouldShowLoadError,
} from "./navigation-guard";
import { sanitizeWindowState, type WindowState } from "./window-state";
import { atomicReplaceFile } from "./world-safety";
import { appVersionArgument } from "./app-version-arg";
import { loginItemSettings, shouldStartHidden } from "./login-launch";
import { restartFailurePrompt } from "./restart-recovery";
import {
  deferErrorDialog,
  drainDeferredErrorDialog,
  withErrorDialog,
} from "./error-dialog";
import { registerIpc } from "./ipc";
import { startWhenReady } from "./startup-lifecycle";
import {
  RESTART_SIMULATION_OPERATION,
  runExclusiveDesktopOperation,
  currentDesktopOperation,
} from "./exclusive-operation";
import { startSim, stopSim, activeSim, onUnexpectedSimExit } from "./sim-process";
import { restartFailureStillRelevant, simExitStillRelevant } from "./prompt-relevance";
import { loadSettings, prepareDataRoot, type Settings } from "./settings";
import {
  checkForUpdatesNow,
  initUpdater,
  installDownloadedUpdate,
} from "./updater";

app.setName("The Human Box");

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
// True for the first window only, when the OS launched us at login with
// "start minimized" on: it is created hidden and lives in the tray.
let startHiddenOnce = false;
// A hidden first window that should be maximized when the user first shows it.
let pendingMaximize = false;

function windowStateFile(): string {
  return path.join(app.getPath("userData"), "window-state.json");
}

function loadWindowState(): WindowState {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(windowStateFile(), "utf8"));
    return sanitizeWindowState(
      parsed,
      screen.getAllDisplays().map((d) => d.workArea),
    );
  } catch {
    return { width: 1400, height: 900 };
  }
}

async function openWorldsFolder(): Promise<void> {
  const settings = loadSettings();
  // prepareDataRoot may create the default app-data root, but it deliberately
  // refuses to recreate a missing/unmounted explicit override.
  const root = prepareDataRoot(settings);
  const dir = path.join(root, "worlds");
  fs.mkdirSync(dir, { recursive: true });
  const error = await shell.openPath(dir);
  if (error) throw new Error(error);
}

async function openLogsFolder(): Promise<void> {
  const logDir = app.getPath("logs");
  fs.mkdirSync(logDir, { recursive: true });
  // shell.openPath resolves with an error string rather than rejecting, so a
  // failure has to be rethrown or the caller sees success.
  const error = await shell.openPath(logDir);
  if (error) throw new Error(error);
}

function persistWindowState(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  try {
    const bounds = win.getNormalBounds
      ? win.getNormalBounds()
      : win.getBounds();
    const state: WindowState = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: win.isMaximized(),
    };
    atomicReplaceFile(windowStateFile(), JSON.stringify(state, null, 2));
  } catch (e) {
    console.warn("[main] could not persist window state:", e);
  }
}

function renderBootError(
  detail: string,
  heading = "The Human Box couldn't start the local simulation",
  hint = "Check the logs for details, then restart the local simulation from Settings.",
): string {
  const safe = detail.replace(
    /[<>&]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!,
  );
  return `data:text/html;charset=utf-8,${encodeURIComponent(`
<!doctype html><html><head><meta charset="utf-8"><title>The Human Box — startup error</title>
<style>
  html,body{margin:0;background:#0c0a08;color:#f5e9d4;font:14px/1.5 ui-monospace,monospace}
  .wrap{padding:24px;max-width:780px;margin:0 auto}
  h1{font-size:18px;color:#ff9b6b;margin:0 0 12px}
  pre{background:#1a1612;padding:12px;border-radius:6px;white-space:pre-wrap;word-break:break-all}
  kbd{background:#2a241d;padding:2px 6px;border-radius:3px;font-family:inherit}
  p{color:#bfae90}
</style></head><body><div class="wrap">
<h1>${heading}</h1>
<pre>${safe}</pre>
<p>Open DevTools with <kbd>Cmd</kbd>+<kbd>Opt</kbd>+<kbd>I</kbd> (macOS) or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>I</kbd> (Win/Linux) for more.</p>
<p>${hint}</p>
</div></body></html>`)}`;
}

async function createWindow(): Promise<void> {
  let settings: Settings | null = null;
  let apiBase: string | null = null;
  let apiToken: string | null = null;
  let bootErrorUrl: string | null = null;

  // `loadSettings` throws on a corrupt or unreadable settings.json rather
  // than reverting to defaults, which would reset `saveLocationOverride` and
  // could orphan existing worlds. This read therefore has to sit inside the
  // boot error path: it used to run *outside* the try below, so the throw
  // rejected `createWindow` before any BrowserWindow existed, leaving a
  // corrupt settings file without the actionable message intended here.
  try {
    settings = loadSettings();
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    console.error("[main] could not read settings:", err);
    bootErrorUrl = renderBootError(
      msg,
      "The Human Box couldn't read its settings",
      "Repair or remove the file named above, then relaunch. Your existing worlds are untouched.",
    );
  }

  if (settings) {
    try {
      const sim = await startSim(settings);
      apiBase = `127.0.0.1:${sim.port}`;
      apiToken = sim.commandToken;
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      console.error("[main] failed to start local sim:", err);
      bootErrorUrl = renderBootError(msg);
    }
  }

  const winState = loadWindowState();
  const startHidden = startHiddenOnce;
  startHiddenOnce = false;
  const win = new BrowserWindow({
    show: !startHidden,
    x: winState.x,
    y: winState.y,
    width: winState.width,
    height: winState.height,
    minWidth: 1000,
    minHeight: 700,
    title: "The Human Box",
    backgroundColor: "#0c0a08",
    icon: path.join(__dirname, "..", "..", "build", "icon.png"),
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    titleBarOverlay:
      process.platform !== "darwin"
        ? { color: "#0c0a08", symbolColor: "#f5e9d4", height: 32 }
        : undefined,
    trafficLightPosition:
      process.platform === "darwin" ? { x: 14, y: 14 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [appVersionArgument(app.getVersion())],
    },
  });
  mainWindow = win;
  // maximize() would also show a window that is meant to start hidden. A boot
  // failure must never be hidden, so that case shows the window as well.
  pendingMaximize = startHidden && !bootErrorUrl && winState.maximized === true;
  if (!startHidden || bootErrorUrl) {
    if (winState.maximized) win.maximize();
    if (startHidden) win.show();
  }

  const persistDebounced = (() => {
    let t: NodeJS.Timeout | null = null;
    return () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        if (win) persistWindowState(win);
      }, 400);
    };
  })();
  win.on("resize", persistDebounced);
  win.on("move", persistDebounced);
  win.on("maximize", persistDebounced);
  win.on("unmaximize", persistDebounced);

  win.on("minimize", () => {
    win?.webContents.send("app:visibility", "minimized");
  });
  win.on("restore", () => {
    win?.webContents.send("app:visibility", "restored");
  });
  win.on("hide", () => {
    win?.webContents.send("app:visibility", "hidden");
  });
  win.on("show", () => {
    win?.webContents.send("app:visibility", "restored");
  });

  const rendererFile = path.resolve(__dirname, "..", "renderer", "index.html");
  win.webContents.on("will-navigate", (event, url) => {
    if (isRendererNavigation(url, rendererFile)) return;
    event.preventDefault();
    const externalUrl = externalHttpUrl(url);
    if (externalUrl) shell.openExternal(externalUrl).catch(() => {});
  });
  win.webContents.on("will-frame-navigate", (details) => {
    if (isRendererNavigation(details.url, rendererFile)) return;
    details.preventDefault();
    // Electron emits this before `will-navigate`, and cancelling here stops
    // that event, so the main frame hands off to the browser from here too.
    if (details.isMainFrame) {
      const externalUrl = externalHttpUrl(details.url);
      if (externalUrl) shell.openExternal(externalUrl).catch(() => {});
    }
  });
  win.webContents.on(
    "will-redirect",
    (event, url, _isInPlace, isMainFrame) => {
      if (isRendererNavigation(url, rendererFile)) return;
      event.preventDefault();
      if (isMainFrame) {
        const externalUrl = externalHttpUrl(url);
        if (externalUrl) shell.openExternal(externalUrl).catch(() => {});
      }
    },
  );
  win.webContents.session.setPermissionCheckHandler(
    (_webContents, permission, _origin, details) =>
      isAllowedRendererPermission(
        permission,
        details.requestingUrl,
        details.isMainFrame,
        rendererFile,
      ),
  );
  win.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback, details) => {
      callback(
        isAllowedRendererPermission(
          permission,
          details.requestingUrl,
          details.isMainFrame,
          rendererFile,
        ),
      );
    },
  );

  win.webContents.setWindowOpenHandler(({ url }) => {
    const externalUrl = externalHttpUrl(url);
    if (externalUrl) shell.openExternal(externalUrl).catch(() => {});
    return { action: "deny" };
  });

  win.webContents.on("did-fail-load", (_e, code, desc, url, isMainFrame) => {
    if (!shouldShowLoadError(code, url, isMainFrame)) return;
    console.error(`[main] did-fail-load code=${code} desc=${desc} url=${url}`);
    win?.loadURL(
      renderBootError(
        `Renderer failed to load.\nURL: ${url}\nCode: ${code}\n${desc}`,
      ),
    );
  });

  if (bootErrorUrl) {
    await win.loadURL(bootErrorUrl);
  } else {
    const query: Record<string, string> = { desktop: "1" };
    if (apiBase) query.api = apiBase;
    if (apiToken) query.token = apiToken;
    await win.loadFile(rendererFile, { query });
    if (isDev) win.webContents.openDevTools({ mode: "detach" });
  }

  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
}

function buildMenu(): void {
  const isMac = process.platform === "darwin";

  const toggleDevTools = (): void => {
    if (!mainWindow) return;
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
    } else {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  };

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: "The Human Box",
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              {
                label: "Settings…",
                accelerator: "Cmd+,",
                click: () => mainWindow?.webContents.send("menu:openSettings"),
              },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Reload",
          accelerator: isMac ? "Cmd+R" : "Ctrl+R",
          click: () => mainWindow?.reload(),
        },
        {
          label: "Restart simulation",
          click: () =>
            void restartSimulationFromMenu().catch((err) =>
              console.error("[main] restart menu failed:", err),
            ),
        },
        isMac ? { role: "close" as const } : { role: "quit" as const },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        {
          label: "Toggle DevTools",
          accelerator: isMac ? "Cmd+Alt+I" : "Ctrl+Shift+I",
          click: toggleDevTools,
        },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { type: "separator" },
        {
          label: "Always on top",
          type: "checkbox",
          checked: mainWindow ? mainWindow.isAlwaysOnTop() : false,
          accelerator: isMac ? "Cmd+Shift+T" : "Ctrl+Shift+T",
          click: (item) => {
            if (!mainWindow) return;
            mainWindow.setAlwaysOnTop(item.checked);
          },
        },
        {
          label: "Screenshot",
          accelerator: isMac ? "Cmd+Shift+S" : "Ctrl+Shift+S",
          click: () => {
            void captureScreenshot().then((fp) => {
              if (fp) {
                notifyMilestone("Screenshot saved", fp);
                shell.showItemInFolder(fp);
              }
            });
          },
        },
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        {
          label: "Open GitHub",
          click: () =>
            void shell.openExternal("https://github.com/1homsi/thehumanbox"),
        },
        {
          label: "Open thehumanbox.com",
          click: () => void shell.openExternal("https://thehumanbox.com"),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindowReplace(): Promise<void> {
  const old = mainWindow;
  await createWindow();
  if (old && !old.isDestroyed()) old.close();
}

function buildTray(): void {
  if (tray) return;
  try {
    const iconPath = path.join(__dirname, "..", "..", "build", "icon.png");
    let img = nativeImage.createFromPath(iconPath);
    if (process.platform === "darwin") {
      img = img.resize({ width: 18, height: 18 });
      img.setTemplateImage(true);
    } else {
      img = img.resize({ width: 22, height: 22 });
    }
    tray = new Tray(img);
    tray.setToolTip("The Human Box");
    const update = (): void => {
      if (!tray) return;
      tray.setContextMenu(
        Menu.buildFromTemplate([
          {
            label:
              mainWindow && mainWindow.isVisible()
                ? "Hide window"
                : "Show window",
            click: () => toggleWindow(),
          },
          { type: "separator" },
          {
            label: "Take screenshot",
            click: () =>
              void captureScreenshot().then((fp) => {
                if (fp) {
                  notifyMilestone("Screenshot saved", fp);
                  shell.showItemInFolder(fp);
                }
              }),
          },
          {
            label: "Open worlds folder",
            click: () => {
              void openWorldsFolder().catch((error) => {
                console.error("[main] could not open worlds folder:", error);
                notifyMilestone(
                  "Worlds folder unavailable",
                  (error as Error).message,
                );
              });
            },
          },
          {
            label: "Open logs folder",
            click: () => {
              void openLogsFolder().catch((error) => {
                console.error("[main] could not open logs folder:", error);
                notifyMilestone(
                  "Logs folder unavailable",
                  (error as Error).message,
                );
              });
            },
          },
          { type: "separator" },
          {
            label: "Always on top",
            type: "checkbox",
            checked: mainWindow ? mainWindow.isAlwaysOnTop() : false,
            click: (item) => {
              if (!mainWindow) return;
              mainWindow.setAlwaysOnTop(item.checked);
            },
          },
          {
            label: "About The Human Box",
            click: () => {
              const ver = app.getVersion();
              notifyMilestone(
                "The Human Box",
                `v${ver}\nA persistent artificial-life simulation.\nthehumanbox.com`,
              );
            },
          },
          { type: "separator" },
          { label: "Quit The Human Box", role: "quit" },
        ]),
      );
    };
    update();
    tray.on("click", () => toggleWindow());
    mainWindow?.on("show", update);
    mainWindow?.on("hide", update);
  } catch (e) {
    console.warn("[main] tray init failed:", e);
  }
}

function revealWindow(win: BrowserWindow): void {
  if (pendingMaximize) {
    pendingMaximize = false;
    win.maximize();
  }
  win.show();
  win.focus();
}

function showExistingWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  revealWindow(mainWindow);
}

function toggleWindow(): void {
  if (!mainWindow) {
    void createWindow();
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
    mainWindow.focus();
    return;
  }
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    revealWindow(mainWindow);
  }
}

function notifyMilestone(title: string, body: string): void {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent: false });
  n.on("click", () => toggleWindow());
  n.show();
}

function applyAutoLaunch(): void {
  try {
    const s = loadSettings();
    app.setLoginItemSettings(loginItemSettings(s.autoLaunch, s.startMinimized));
  } catch (e) {
    console.warn("[main] setLoginItemSettings failed:", e);
  }
}

async function captureScreenshot(): Promise<string | null> {
  if (!mainWindow) return null;
  try {
    const img = await mainWindow.webContents.capturePage();
    const root = path.join(app.getPath("pictures"), "TheHumanBox");
    fs.mkdirSync(root, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fp = path.join(root, `thb-${stamp}.png`);
    fs.writeFileSync(fp, img.toPNG());
    return fp;
  } catch (e) {
    console.warn("[main] capturePage failed:", e);
    return null;
  }
}

function registerAppIpcHandlers(): void {
  ipcMain.handle(
    "app:notify",
    (_e, payload: { title: string; body: string }) => {
      notifyMilestone(payload.title, payload.body);
    },
  );

  ipcMain.handle("app:trayToggle", () => toggleWindow());

  ipcMain.handle("app:screenshot", async () => {
    const fp = await captureScreenshot();
    if (fp) {
      notifyMilestone("Screenshot saved", fp);
      shell.showItemInFolder(fp);
    }
    return fp;
  });

  ipcMain.handle("app:openLogs", () => openLogsFolder());

  ipcMain.handle("app:openWorlds", () => openWorldsFolder());

  ipcMain.handle("app:applyAutoLaunch", () => {
    applyAutoLaunch();
  });

  ipcMain.handle("app:checkForUpdates", () => checkForUpdatesNow());

  ipcMain.handle("app:installUpdate", () => installDownloadedUpdate());

  // Native folder picker for the save-location override. The renderer passes
  // the result to the transactional migration IPC; changing settings alone is
  // intentionally rejected so a live world can never be stranded.
  ipcMain.handle("app:pickSaveDir", async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      title: "Choose where The Human Box stores worlds",
      properties: ["openDirectory", "createDirectory"],
      defaultPath:
        loadSettings().saveLocationOverride ?? app.getPath("userData"),
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    return res.filePaths[0];
  });
}

async function restartSimulation(options: { requireCheckpoint?: boolean } = {}): Promise<void> {
  await runExclusiveDesktopOperation(RESTART_SIMULATION_OPERATION, async () => {
    await stopSim(5_000, options.requireCheckpoint ?? true);
    if (mainWindow) {
      await createWindowReplace();
    }
  });
}

// BUG-13: the menu restart used to `catch(console.error)`, so a failed
// checkpoint (a hung or slow sim) did nothing at all and the sim could never be
// killed from the menu. Report the failure and, when the checkpoint is what
// failed, offer a restart that gives it up.
async function restartSimulationFromMenu(): Promise<void> {
  try {
    await restartSimulation();
  } catch (error) {
    if (isQuitting) return;
    await showRestartFailure(error);
  }
}

// Shows the restart-failure prompt, or defers it when another error dialog owns
// the screen (the sim could have died while the user was choosing this menu
// item). Shared by the menu action and its own deferred re-offer.
async function showRestartFailure(error: unknown): Promise<void> {
  const prompt = restartFailurePrompt(error);
  const shown = await withErrorDialog("restart failure", async () => {
    const box: Electron.MessageBoxOptions = {
      type: "error",
      title: "The Human Box",
      ...prompt,
    };
    const { response } =
      mainWindow && !mainWindow.isDestroyed()
        ? await dialog.showMessageBox(mainWindow, box)
        : await dialog.showMessageBox(box);
    if (response !== 0 || !prompt.canRetryWithoutCheckpoint || isQuitting) return;
    try {
      await restartSimulation({ requireCheckpoint: false });
    } catch (retryError) {
      dialog.showErrorBox(
        "Could not restart the simulation",
        (retryError as Error)?.message ?? String(retryError),
      );
    }
  });
  if (shown) return;
  if (prompt.canRetryWithoutCheckpoint) {
    // Actionable: the sim is hung and "restart without checkpoint" is the only
    // escape hatch. Keep it for when the other dialog closes, unless a restart
    // replaced the hung sim in the meantime.
    const failedSim = activeSim();
    deferErrorDialog({
      show: () => {
        showRestartFailure(error).catch((err) =>
          console.error("[main] deferred restart failure prompt failed:", err),
        );
      },
      isStillRelevant: () =>
        restartFailureStillRelevant({ quitting: isQuitting, activeSim: activeSim(), failedSim }),
    });
    // No-op while the other dialog still holds the slot; closes the window if
    // it released between the failed claim and this defer.
    drainDeferredErrorDialog();
  } else {
    // Nothing actionable is lost: the dialog that owns the screen already
    // offers a restart. Log the detail so the swallowed failure is not invisible.
    console.warn(
      `[main] restart failure not shown; another error dialog is open: ${prompt.detail}`,
    );
  }
}

// The sim child died on its own (crash, OOM, or the server ending itself after
// its tick loop panicked). The window would otherwise sit on a frozen map.
async function offerSimRestart(
  code: number | null,
  signal: NodeJS.Signals | null,
): Promise<void> {
  if (isQuitting) return;
  // Shares the single error-dialog slot with the restart-failure prompt: a
  // child that dies while that prompt is open must not stack a second box.
  const shown = await withErrorDialog("unexpected exit", async () => {
    const options: Electron.MessageBoxOptions = {
      type: "error",
      title: "The Human Box",
      message: "The simulation stopped unexpectedly",
      detail:
        `Exit ${signal ?? `code ${code}`}. Your world was last saved at its most ` +
        "recent checkpoint (about a minute of play at most is lost). Restart the " +
        "simulation to continue.",
      buttons: ["Restart simulation", "Not now"],
      defaultId: 0,
      cancelId: 1,
    };
    const { response } =
      mainWindow && !mainWindow.isDestroyed()
        ? await dialog.showMessageBox(mainWindow, options)
        : await dialog.showMessageBox(options);
    if (response === 0 && !isQuitting) {
      await restartSimulation().catch((err) => {
        dialog.showErrorBox(
          "Could not restart the simulation",
          (err as Error)?.message ?? String(err),
        );
      });
    }
  });
  if (shown) return;
  // Offer once the other dialog closes, unless a restart already brought the
  // sim back (for example the restart prompt's "restart without checkpoint"),
  // so a healed sim is not nagged about. A restart merely in flight (no sim
  // installed yet) is also skipped, since that restart is the answer; any other
  // operation still shows the prompt, so a crash is never silently dropped.
  deferErrorDialog({
    show: () => {
      offerSimRestart(code, signal).catch((err) =>
        console.error("[main] deferred sim-exit prompt failed:", err),
      );
    },
    isStillRelevant: () =>
      simExitStillRelevant({
        quitting: isQuitting,
        activeSim: activeSim(),
        operation: currentDesktopOperation(),
      }),
  });
  // No-op while the other dialog still holds the slot; closes the window if it
  // released between the failed claim and this defer.
  drainDeferredErrorDialog();
}

async function boot(): Promise<void> {
  registerIpc(ipcMain, () => mainWindow);
  registerAppIpcHandlers();
  try {
    const s = loadSettings();
    startHiddenOnce = shouldStartHidden({
      autoLaunch: s.autoLaunch,
      startMinimized: s.startMinimized,
      argv: process.argv,
      wasOpenedAtLogin: app.getLoginItemSettings().wasOpenedAtLogin,
      platform: process.platform,
    });
  } catch {
    startHiddenOnce = false;
  }
  await createWindow();
  buildMenu();
  buildTray();
  // Hidden start needs the tray as the way back in; without it show the window.
  if (!tray && mainWindow && !mainWindow.isVisible()) revealWindow(mainWindow);
  applyAutoLaunch();
  initUpdater(() => mainWindow);
  onUnexpectedSimExit(({ code, signal }) => void offerSimRestart(code, signal));

  // System-wide, so keep it to a combo other apps do not use. DevTools and
  // screenshot are menu accelerators only: registering them globally stole
  // Ctrl+Shift+I / Ctrl+Shift+S from every other application.
  const toggleKey =
    process.platform === "darwin" ? "Cmd+Alt+Shift+H" : "Ctrl+Alt+Shift+H";
  if (!globalShortcut.register(toggleKey, toggleWindow)) {
    console.warn(`[main] could not register global shortcut ${toggleKey}`);
  }
}

// Backstop for any boot step that rejects. Without this the boot chain's
// rejection was unhandled: the app stayed running with no window, no tray,
// no shortcuts, and no IPC handlers, which reads as a silent hang rather than
// a startup failure. `dialog` is used because by this point every step above
// it may not have run.
async function fatalStartupFailure(err: unknown): Promise<void> {
  const msg = (err as Error)?.message ?? String(err);
  console.error("[main] startup failed:", err);
  let stopTimeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      stopSim(1500, false),
      new Promise<never>((_, reject) => {
        stopTimeout = setTimeout(
          () => reject(new Error("simulation shutdown exceeded 6 seconds")),
          6000,
        );
      }),
    ]);
  } catch (stopError) {
    console.error("[main] could not stop simulation after startup failure:", stopError);
  } finally {
    if (stopTimeout) clearTimeout(stopTimeout);
  }
  try {
    dialog.showErrorBox("The Human Box couldn't start", msg);
  } catch {
    // No GUI available (e.g. headless CI); the log line above is all we have.
  }
  app.exit(1);
}

function reportStartupFailure(err: unknown): Promise<void> {
  return fatalStartupFailure(err);
}

// One app per save folder. A second launch must not boot: it would fail on
// the data-root lock and show a startup error. Quit it and focus the running
// window instead.
if (app.requestSingleInstanceLock()) {
  app.on("second-instance", showExistingWindow);
  startWhenReady(app.whenReady(), boot, reportStartupFailure);
} else {
  app.quit();
}

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

// Latch for the quit sequence.
//
// `app.quit()` re-fires `before-quit`, and `stopSim` deliberately *retains*
// `current` when it cannot confirm the child exited (to prevent a second
// writer). Together those meant `before-quit` re-entered `shutdownThenQuit`
// forever: each pass preventDefault'd the quit, retried a doomed
// SIGTERM/SIGKILL sequence, and called `app.quit()` again. Cmd+Q hung the app
// indefinitely with no diagnostic. Once shutdown has been attempted, let every
// subsequent `before-quit` through so the quit completes.
let isQuitting = false;

// Electron discards the promise returned by an `app.on` listener, so a
// rejection inside an `async` handler is unobservable. `stopSimOnce`
// rejects on purpose when SIGKILL cannot be confirmed, which left
// `e.preventDefault()` already called and `app.quit()` never reached —
// so the app ignored Cmd+Q for the rest of the session. Quit regardless,
// and log the failure.
function shutdownThenQuit(): void {
  if (isQuitting) return;
  isQuitting = true;
  void stopSim()
    .catch((err) => {
      console.error("[main] stopSim failed during quit:", err);
    })
    .finally(() => app.quit());
}

app.on("window-all-closed", () => {
  void stopSim()
    .catch((err) => {
      console.error("[main] stopSim failed on window-all-closed:", err);
    })
    .finally(() => {
      if (process.platform !== "darwin") app.quit();
    });
});

app.on("before-quit", (e) => {
  // Second and later passes belong to the `app.quit()` that
  // `shutdownThenQuit` issued. Do not preventDefault them, or the quit can
  // never complete.
  if (isQuitting) return;
  if (activeSim()) {
    e.preventDefault();
    shutdownThenQuit();
  }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  } else if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
    // A dock click on an app that started hidden (tray only).
    toggleWindow();
  }
});
