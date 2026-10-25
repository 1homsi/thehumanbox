export interface SecondLaunchOptions {
  platform: NodeJS.Platform;
  isReady: () => boolean;
  whenReady: () => Promise<unknown>;
  showWindow: () => void;
  /** Electron's app.focus. Only Windows is asked to steal focus. */
  focusApp: (options?: { steal: boolean }) => void;
  onError?: (error: unknown) => void;
}

/**
 * What the first instance does when a second launch arrives. The second
 * launch's command line and folder are not used, so nothing from it reaches the
 * renderer or the save folder. Electron can report the launch before the app is
 * ready, and a window cannot be created before then, so the action waits for
 * ready. On Windows a window cannot take focus from another process by itself,
 * so the app is asked to take it.
 */
export function handleSecondLaunch(options: SecondLaunchOptions): void {
  const bring = (): void => {
    options.showWindow();
    if (options.platform === "win32") options.focusApp({ steal: true });
  };
  if (options.isReady()) {
    bring();
    return;
  }
  void options.whenReady().then(bring, (error: unknown) => {
    if (options.onError) options.onError(error);
  });
}
