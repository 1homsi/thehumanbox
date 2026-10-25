export interface SecondLaunchOptions {
  isReady: () => boolean;
  whenReady: () => Promise<unknown>;
  /** Restores and focuses the running window. */
  showWindow: () => void;
  onError?: (error: unknown) => void;
}

/**
 * What the first instance does when a second launch arrives. The second
 * launch's command line and folder are not used, so nothing from it reaches the
 * renderer or the save folder. Electron can report the launch before the app is
 * ready, and a window cannot be created before then, so the action waits for
 * ready. The window's own focus brings it forward. app.focus is not used: on
 * Windows it focuses the application's first window, which can be the one a
 * window replacement is about to close.
 */
export function handleSecondLaunch(options: SecondLaunchOptions): void {
  if (options.isReady()) {
    options.showWindow();
    return;
  }
  void options.whenReady().then(() => options.showWindow(), (error: unknown) => {
    if (options.onError) options.onError(error);
  });
}
