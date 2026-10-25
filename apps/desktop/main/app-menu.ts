import type { MenuItemConstructorOptions } from "electron";
import type { MessageKey } from "./i18n";

export interface AppMenuActions {
  openSettings: () => void;
  reload: () => void;
  restartSimulation: () => void;
  toggleDevTools: () => void;
  setAlwaysOnTop: (on: boolean) => void;
  takeScreenshot: () => void;
  openGitHub: () => void;
  openWebsite: () => void;
}

export interface AppMenuOptions {
  platform: NodeJS.Platform;
  label: (key: MessageKey) => string;
  /** False while no game window is open; the items that act on it are then disabled. */
  hasGameWindow: boolean;
  alwaysOnTop: boolean;
  actions: AppMenuActions;
}

/**
 * The application menu template. Accelerators follow each platform's own
 * modifier: Cmd on macOS, Ctrl on Windows and Linux. Settings sits in the macOS
 * application menu (Cmd+,) and in File on Windows and Linux (Ctrl+,), where
 * there is no application menu to hold it.
 */
export function appMenuTemplate(options: AppMenuOptions): MenuItemConstructorOptions[] {
  const { platform, label, hasGameWindow, alwaysOnTop, actions } = options;
  const isMac = platform === "darwin";
  const mod = isMac ? "Cmd" : "Ctrl";

  const settingsItem: MenuItemConstructorOptions = {
    label: label("menu.settings"),
    accelerator: `${mod}+,`,
    enabled: hasGameWindow,
    click: () => actions.openSettings(),
  };

  return [
    ...(isMac
      ? [
          {
            label: "The Human Box",
            submenu: [
              { role: "about" as const, label: label("menu.about") },
              { type: "separator" as const },
              settingsItem,
              { type: "separator" as const },
              { role: "services" as const, label: label("menu.services") },
              { type: "separator" as const },
              { role: "hide" as const, label: label("menu.hide") },
              { role: "hideOthers" as const, label: label("menu.hideOthers") },
              { role: "unhide" as const, label: label("menu.showAll") },
              { type: "separator" as const },
              { role: "quit" as const, label: label("menu.quitApp") },
            ],
          },
        ]
      : []),
    {
      label: label("menu.file"),
      submenu: [
        {
          label: label("menu.reload"),
          accelerator: `${mod}+R`,
          enabled: hasGameWindow,
          click: () => actions.reload(),
        },
        {
          label: label("menu.restartSimulation"),
          click: () => actions.restartSimulation(),
        },
        ...(isMac ? [] : [{ type: "separator" as const }, settingsItem]),
        isMac
          ? { role: "close" as const, label: label("menu.close") }
          : { role: "quit" as const, label: label("menu.quit") },
      ],
    },
    { role: "editMenu" },
    {
      label: label("menu.view"),
      submenu: [
        {
          label: label("menu.toggleDevTools"),
          accelerator: isMac ? "Cmd+Alt+I" : "Ctrl+Shift+I",
          enabled: hasGameWindow,
          click: () => actions.toggleDevTools(),
        },
        { type: "separator" },
        { role: "resetZoom", label: label("menu.resetZoom") },
        { role: "zoomIn", label: label("menu.zoomIn") },
        { role: "zoomOut", label: label("menu.zoomOut") },
        { type: "separator" },
        { role: "togglefullscreen", label: label("menu.fullScreen") },
        { type: "separator" },
        {
          label: label("menu.alwaysOnTop"),
          type: "checkbox",
          checked: alwaysOnTop,
          enabled: hasGameWindow,
          accelerator: isMac ? "Cmd+Shift+T" : "Ctrl+Shift+T",
          click: (item) => actions.setAlwaysOnTop(item.checked),
        },
        {
          label: label("menu.screenshot"),
          accelerator: isMac ? "Cmd+Shift+S" : "Ctrl+Shift+S",
          click: () => actions.takeScreenshot(),
        },
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      label: label("menu.help"),
      submenu: [
        {
          label: label("menu.openGitHub"),
          click: () => actions.openGitHub(),
        },
        {
          label: label("menu.openWebsite"),
          click: () => actions.openWebsite(),
        },
      ],
    },
  ];
}
