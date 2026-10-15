export const HIDDEN_ARG = "--hidden";

/**
 * Login-item settings for the OS. `openAsHidden` is macOS-only and ignored by
 * macOS 13+, so a launch marker argument carries "start minimized" on every
 * platform that supports login items (macOS, Windows).
 */
export function loginItemSettings(autoLaunch: boolean, startMinimized: boolean) {
  return {
    openAtLogin: autoLaunch,
    openAsHidden: startMinimized,
    args: autoLaunch && startMinimized ? [HIDDEN_ARG] : [],
  };
}

/**
 * Whether this launch should keep the window hidden (tray only). Requires the
 * setting to still be on and evidence that the OS launched us at login: the
 * marker argument, or on macOS (which may ignore arguments) the login-launch
 * flag. A manual launch always shows the window.
 */
export function shouldStartHidden(options: {
  startMinimized: boolean;
  argv: readonly string[];
  wasOpenedAtLogin: boolean;
  platform: NodeJS.Platform;
}): boolean {
  if (!options.startMinimized) return false;
  if (options.argv.includes(HIDDEN_ARG)) return true;
  return options.platform === "darwin" && options.wasOpenedAtLogin;
}
