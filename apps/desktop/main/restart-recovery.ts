// BUG-13: the File-menu "Restart simulation" failed silently when the sim was
// hung or slow, because the checkpoint before a stop is required and its
// failure only produced a rejected promise that the menu click swallowed. The
// decision logic lives here so the menu action can offer a no-checkpoint retry
// and a test can pin the messages.

// Matches stopSimOnce() in sim-process.ts. Kept here (rather than imported from
// that module) so this pure helper has no process-wide side effects.
const CHECKPOINT_FAILED_MARKER = "could not checkpoint the active world";

/** The button that restarts without waiting for a checkpoint. */
export const NO_CHECKPOINT_BUTTON = "Restart without checkpoint";

export interface RestartFailurePrompt {
  message: string;
  detail: string;
  buttons: string[];
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isCheckpointFailure(error: unknown): boolean {
  return errorText(error).includes(CHECKPOINT_FAILED_MARKER);
}

/**
 * The dialog to show when a menu restart fails. A checkpoint failure (a hung or
 * slow sim) offers the no-checkpoint retry; anything else (for example another
 * control-plane operation in progress) just reports the error.
 */
export function restartFailurePrompt(error: unknown): RestartFailurePrompt {
  const detail = errorText(error);
  if (isCheckpointFailure(error)) {
    return {
      message: "Could not restart the simulation",
      detail:
        `${detail}\n\nThe simulation may be hung. Restarting without a checkpoint ` +
        "loses up to about a minute of play.",
      buttons: [NO_CHECKPOINT_BUTTON, "Cancel"],
    };
  }
  return { message: "Could not restart the simulation", detail, buttons: ["OK"] };
}
