export const HIDDEN_ARG = "--hidden";

/**
 * Login-item settings for the OS. A launch marker argument carries "start
 * minimized" on every platform that supports login items (macOS, Windows);
 * Electron 44 dropped macOS's `openAsHidden`, which only macOS 12 and older
 * honoured.
 */
export function loginItemSettings(autoLaunch: boolean, startMinimized: boolean) {
  return {
    openAtLogin: autoLaunch,
    args: autoLaunch && startMinimized ? [HIDDEN_ARG] : [],
  };
}

/**
 * Whether this launch should keep the window hidden (tray only). Requires both
 * settings to still be on and evidence that the OS launched us at login: the
 * marker argument, or on macOS (which may ignore arguments) the login-launch
 * flag. A manual launch always shows the window.
 */
export function shouldStartHidden(options: {
  autoLaunch: boolean;
  startMinimized: boolean;
  argv: readonly string[];
  wasOpenedAtLogin: boolean;
  platform: NodeJS.Platform;
}): boolean {
  if (!options.autoLaunch || !options.startMinimized) return false;
  if (options.argv.includes(HIDDEN_ARG)) return true;
  return options.platform === "darwin" && options.wasOpenedAtLogin;
}
